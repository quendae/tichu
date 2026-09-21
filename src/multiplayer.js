const WS_URL='wss://api.qqnd.fyi/api/v1/ws';
const GAME_ID='tichu';
const SESSION_KEY='tichu.qqnd.session.v1';
const TIMEOUT=12000;

const html=value=>String(value??'').replace(/[&<>"']/g,char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
}[char]));

export class MultiplayerClient {
  constructor(game){
    this.game=game;this.socket=null;this.socketPromise=null;this.waiters=[];
    this.session=null;this.resumeToken='';this.room=null;this.seat=null;this.hostId='';
    this.active=false;this.authoritative=false;this.isHost=false;this.rooms=[];this.fillBots=true;this.queued=false;
    this.stateSeq=0;this.reconnectTimer=null;this.botSeats=[];this.presence=[];
    this.rebaseNextState=true;this.pendingVisualState=null;
    this.connectionState='connected';this.presenceTick=null;this.returnNotices=new Map();this.returnNoticeTimers=new Map();
    window.addEventListener('online',()=>this.scheduleReconnect());
  }

  el(id){return document.getElementById(id)}
  normalizeNick(v){return String(v||'').normalize('NFKC').replace(/\s+/g,' ').trim().slice(0,20)}
  stored(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
  store(){if(this.session?.id&&this.resumeToken)localStorage.setItem(SESSION_KEY,JSON.stringify({sessionId:this.session.id,resumeToken:this.resumeToken,nickname:this.session.nickname}))}
  clearStored(){localStorage.removeItem(SESSION_KEY)}
  send(msg){if(this.socket?.readyState!==WebSocket.OPEN)throw new Error('server_not_connected');this.socket.send(JSON.stringify(msg))}
  waiter(types,pred=()=>true){types=new Set(Array.isArray(types)?types:[types]);return new Promise((resolve,reject)=>{const w={types,pred,resolve,reject};w.timer=setTimeout(()=>{this.waiters=this.waiters.filter(x=>x!==w);reject(new Error('timeout'))},TIMEOUT);this.waiters.push(w)})}
  settle(m){for(const w of [...this.waiters]){if(m.type==='error'){clearTimeout(w.timer);this.waiters=this.waiters.filter(x=>x!==w);w.reject(new Error(m.code||'server_error'));continue}if(w.types.has(m.type)&&w.pred(m)){clearTimeout(w.timer);this.waiters=this.waiters.filter(x=>x!==w);w.resolve(m)}}}
  async request(msg,types,pred){await this.ensureSocket();const p=this.waiter(types,pred);this.send(msg);return p}

  ensureSocket(){
    if(this.socket?.readyState===WebSocket.OPEN)return Promise.resolve(this.socket);
    if(this.socketPromise)return this.socketPromise;
    this.socketPromise=new Promise((resolve,reject)=>{
      const ws=new WebSocket(WS_URL);this.socket=ws;let opened=false;
      const timer=setTimeout(()=>{if(!opened){try{ws.close()}catch{}reject(new Error('timeout'))}},TIMEOUT);
      ws.onopen=()=>{opened=true};
      ws.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch{return}if(m.type==='hello'){clearTimeout(timer);resolve(ws)}this.settle(m);this.handle(m)};
      ws.onerror=()=>{if(!opened)reject(new Error('websocket_error'))};
      ws.onclose=()=>this.onSocketClosed();
    }).finally(()=>this.socketPromise=null);
    return this.socketPromise;
  }

  onSocketClosed(){
    this.socket=null;this.socketPromise=null;this.session=null;
    if(!this.active){this.renderGameConnection();return}
    this.rebaseNextState=true;this.connectionState='reconnecting';this.renderGameConnection();this.scheduleReconnect();
  }

  scheduleReconnect(){if(this.reconnectTimer)return;this.reconnectTimer=setTimeout(async()=>{this.reconnectTimer=null;try{await this.ensureSocket();await this.resume(true);if(this.room?.status==='in_game')this.send({type:'game.state.get',roomId:this.room.id})}catch{this.scheduleReconnect()}},1300)}

  async resume(silent=false){
    if(this.session)return this.session;
    const st=this.stored();if(!st)return null;
    try{
      const m=await this.request({type:'session.resume',sessionId:st.sessionId,resumeToken:st.resumeToken},'session.resumed');
      this.session=m.session;this.resumeToken=st.resumeToken;
      const room=(m.rooms||[]).find(r=>r.game===GAME_ID);
      if(room){this.syncRoom(room);if(room.status==='in_game'){this.active=true;this.send({type:'game.state.get',roomId:room.id})}}
      if(!silent)this.renderLobby();
      return this.session;
    }catch(e){
      if(/invalid_session|expired/.test(String(e.message))){this.clearStored();return null}
      throw e;
    }
  }

  async ensureSession(nick){
    nick=this.normalizeNick(nick);
    if(nick.length<3)throw new Error('Nickname needs at least 3 characters.');
    await this.ensureSocket();
    if(!this.session)await this.resume(true);
    if(this.session?.nickname===nick)return this.session;
    if(this.session&&this.room)throw new Error('Leave current room before changing nickname.');
    const m=await this.request({type:'session.create',nickname:nick},'session.created');
    this.session=m.session;this.resumeToken=m.resumeToken;this.store();return this.session;
  }

  seatFor(id){return this.room?.players?.findIndex(p=>p.id===id)??-1}
  viewerSeat(){const own=Number.isInteger(this.seat)&&this.seat>=0?this.seat:this.seatFor(this.session?.id);return own>=0?own:0}
  relativeSeatRole(actual){const diff=(actual-this.viewerSeat()+4)%4;return diff===0?'TY':diff===2?'PARTNER':'RYWAL'}
  localSeat(serverSeat){const own=Number.isInteger(this.seat)?this.seat:0;return (Number(serverSeat)-own+4)%4}

  syncRoom(room){
    if(!room||room.game!==GAME_ID)return;
    if(this.room?.id!==room.id){this.stateSeq=0;this.rebaseNextState=true}
    this.room=room;this.hostId=room.ownerSessionId;this.seat=this.session?this.seatFor(this.session.id):null;this.isHost=this.session?.id===this.hostId;
    if(room.status==='in_game')this.active=true;
    this.renderLobby();
  }

  async openLobby(){this.renderShell();try{await this.ensureSocket();await this.resume(true);await this.refreshRooms();this.renderLobby()}catch(e){this.status(this.friendly(e),true)}}

  renderShell(){
    const root=this.el('modal-root');if(!root)return;
    root.innerHTML=`
      <div class="modal-backdrop">
        <section class="modal mp-modal" id="mp-modal" aria-label="Tichu online">
          <header class="mp-heading">
            <div>
              <small>QQND MULTIPLAYER</small>
              <h2>Tichu online</h2>
              <p>Znajdź stół albo zagraj ze znajomymi.</p>
            </div>
          </header>

          <div id="mp-setup" class="mp-setup">
            <section class="mp-quick-card">
              <label for="mp-nick">Twój nick</label>
              <input id="mp-nick" placeholder="Twój nick" maxlength="20" autocomplete="nickname">
              <button id="mp-quick" class="mp-primary-action">Szybka gra</button>
              <div id="mp-queue-state" class="mp-queue-state" aria-live="polite"></div>
            </section>

            <div class="mp-secondary-grid">
              <section class="choice-card">
                <h3>Dołącz kodem</h3>
                <label class="mp-field-label" for="mp-code">Kod pokoju</label>
                <input id="mp-code" placeholder="ABCD-EFGH" maxlength="9" autocomplete="off">
                <button id="mp-join" class="secondary">Dołącz</button>
              </section>
              <section class="choice-card">
                <h3>Utwórz pokój</h3>
                <label class="mp-field-label" for="mp-vis">Widoczność</label>
                <select id="mp-vis"><option value="public">Publiczny</option><option value="private">Prywatny</option></select>
                <button id="mp-create" class="secondary">Utwórz</button>
              </section>
            </div>

            <section class="mp-public">
              <div class="mp-section-head">
                <div><small>PUBLICZNE</small><h3>Otwarte stoły</h3></div>
                <button id="mp-refresh" class="ghost">Odśwież</button>
              </div>
              <div id="mp-rooms" class="mp-room-list"></div>
            </section>
          </div>

          <div id="mp-room" class="mp-lobby hidden">
            <div class="mp-room-head">
              <div>
                <small>POKÓJ</small>
                <div class="mp-room-code-row"><strong id="mp-room-code"></strong><button id="mp-copy-code" class="ghost">Kopiuj kod</button></div>
              </div>
              <p id="mp-lobby-state" class="mp-lobby-state"></p>
            </div>
            <div id="mp-seats" class="mp-seats"></div>
            <label class="mp-bots-option"><input type="checkbox" id="mp-bots" checked> Wypełnij wolne miejsca botami</label>
            <div class="mp-lobby-actions"><button id="mp-leave" class="secondary">Opuść</button><button id="mp-start" class="primary">Rozpocznij</button></div>
          </div>

          <p id="mp-status" class="mp-status" aria-live="polite"></p>
          <div class="modal-actions"><button id="mp-close" class="ghost">Zamknij</button></div>
        </section>
      </div>`;

    const st=this.stored();if(st?.nickname)this.el('mp-nick').value=st.nickname;
    this.el('mp-create').onclick=()=>this.createRoom();
    this.el('mp-join').onclick=()=>this.joinRoom();
    this.el('mp-quick').onclick=()=>this.toggleQuickPlay();
    this.el('mp-refresh').onclick=()=>this.refreshRooms();
    this.el('mp-close').onclick=()=>this.closeLobby();
    this.el('mp-copy-code').onclick=()=>this.copyRoomCode();
    this.el('mp-leave').onclick=()=>this.leave();
    this.el('mp-start').onclick=()=>this.start();
    this.el('mp-bots').onchange=e=>{this.fillBots=e.target.checked;this.renderLobby()};
    root.onclick=e=>{const b=e.target.closest('[data-room]');if(b&&!b.disabled)this.joinRoom(b.dataset.room)};
    this.renderLobby();
  }

  closeLobby(){
    if(this.queued){try{this.send({type:'queue.leave',game:GAME_ID})}catch{}this.queued=false}
    const root=this.el('modal-root');if(root)root.innerHTML='';
  }

  async copyRoomCode(){
    const code=this.room?.id;if(!code)return;
    try{await navigator.clipboard?.writeText(code);this.status('Kod pokoju skopiowany.')}catch{this.status(`Kod pokoju: ${code}`)}
  }

  status(text,error=false){
    const n=this.el('mp-status');if(!n)return;
    n.textContent=text||'';n.classList.toggle('error',!!error);
  }

  renderLobby(){
    if(!this.el('mp-modal'))return;
    const inRoom=!!this.room;
    this.el('mp-setup')?.classList.toggle('hidden',inRoom);
    this.el('mp-room')?.classList.toggle('hidden',!inRoom);

    const quick=this.el('mp-quick');
    if(quick){quick.textContent=this.queued?'Anuluj wyszukiwanie':'Szybka gra';quick.classList.toggle('searching',this.queued)}
    const queueState=this.el('mp-queue-state');
    if(queueState){
      queueState.textContent=this.queued?'Szukam stołu… Gdy zbiorą się 4 osoby, gra rozpocznie się automatycznie.':'Najprostszy sposób, by zacząć mecz.';
      queueState.classList.toggle('active',this.queued);
    }

    if(!inRoom){this.renderRooms();return}

    this.el('mp-room-code').textContent=this.room.id;
    const players=this.room.players||[];
    const hostId=this.room.ownerSessionId||this.hostId;
    this.el('mp-seats').innerHTML=[0,1,2,3].map(i=>{
      const p=players[i];
      const bot=!p&&this.fillBots;
      const role=this.relativeSeatRole(i);
      const name=p?.nickname||(bot?'Bot':'Wolne miejsce');
      const baseStatus=p?(p.connected?'ONLINE':'OFFLINE'):(bot?'BOT':'WOLNE');
      const status=p?.id===hostId?`${baseStatus} · HOST`:baseStatus;
      const stateClass=p?.connected?'connected':p?'offline':bot?'bot':'open';
      return `<div class="mp-seat ${stateClass}" data-seat="${i}"><div class="mp-seat-head"><span class="mp-seat-role">${role}</span><span class="mp-seat-status">${status}</span></div><b class="mp-seat-name">${html(name)}</b></div>`;
    }).join('');

    const start=this.el('mp-start');
    start.classList.toggle('hidden',!this.isHost||this.room.status==='in_game');
    const bots=this.el('mp-bots');
    bots.disabled=!this.isHost||this.room.status==='in_game';bots.checked=this.fillBots;
    const connected=[0,1,2,3].filter(i=>players[i]?.connected).length;
    const empty=[0,1,2,3].filter(i=>!players[i]).length;
    const ready=connected+(this.fillBots?empty:0)===4;
    start.disabled=!ready;

    const lobbyState=this.el('mp-lobby-state');
    if(lobbyState)lobbyState.textContent=this.room.status==='in_game'?'Gra trwa.':this.isHost?(ready?'Stół gotowy · możesz rozpocząć.':'Czekamy na graczy.'):'Czekamy na hosta.';
  }

  renderRooms(){
    const n=this.el('mp-rooms');if(!n)return;
    const rooms=this.rooms.filter(r=>r.game===GAME_ID&&r.visibility==='public');
    n.innerHTML=rooms.length?rooms.map(r=>{
      const playing=r.status==='in_game';
      const count=Math.min(4,r.players?.length||0);
      return `<article class="mp-room-card"><div class="mp-room-copy"><b>${html(r.name||'Tichu')}</b><div class="mp-room-meta"><span>${html(r.id)}</span><span>${count}/4</span><span class="mp-room-state ${playing?'playing':'open'}">${playing?'W GRZE':'OCZEKUJE'}</span></div></div><button class="ghost" data-room="${html(r.id)}" ${playing?'disabled':''}>Dołącz</button></article>`;
    }).join(''):`<p class="mp-empty">Brak publicznych stołów. Utwórz własny albo wybierz Szybką grę.</p>`;
  }

  renderGameConnection(){
    let banner=this.el('mp-connection-banner');
    if(!this.active||this.connectionState==='connected'){
      if(banner)banner.remove();
      return;
    }
    if(!banner){
      banner=document.createElement('div');banner.id='mp-connection-banner';banner.className='mp-connection-banner';banner.setAttribute('role','status');banner.setAttribute('aria-live','polite');
      (this.el('app')||document.body).appendChild(banner);
    }
    banner.textContent='Utracono połączenie · ponowne łączenie…';
  }

  deadlineMs(value){const direct=Number(value);if(Number.isFinite(direct))return direct;const parsed=Date.parse(String(value||''));return Number.isFinite(parsed)?parsed:0}

  presenceLabel(entry){
    const returnedUntil=this.returnNotices.get(entry.sessionId)||0;
    if(returnedUntil>Date.now())return {text:'GRACZ WRÓCIŁ',kind:'returned'};
    if(entry.botActive)return {text:'BOT GRA ZA GRACZA',kind:'takeover'};
    if(entry.connected!==false)return null;
    const deadline=this.deadlineMs(entry.graceDeadline);
    const seconds=deadline?Math.max(0,Math.ceil((deadline-Date.now())/1000)):null;
    return {text:seconds===null?'ROZŁĄCZONY':`ROZŁĄCZONY · bot za ${seconds} s`,kind:'offline'};
  }

  renderGamePresence(){
    document.querySelectorAll('.mp-presence-chip').forEach(node=>node.remove());
    if(!this.active){if(this.presenceTick){clearInterval(this.presenceTick);this.presenceTick=null}return}
    let needsTick=false;
    for(const entry of this.presence||[]){
      const local=this.localSeat(entry.seat);if(local===0)continue;
      const badge=document.querySelector(`.seat[data-seat="${local}"] .player-badge`);if(!badge)continue;
      const label=this.presenceLabel(entry);if(!label)continue;
      const chip=document.createElement('span');chip.className=`mp-presence-chip ${label.kind}`;chip.textContent=label.text;badge.appendChild(chip);
      const deadline=this.deadlineMs(entry.graceDeadline);if(entry.connected===false&&!entry.botActive&&deadline>Date.now())needsTick=true;
    }
    if(needsTick&&!this.presenceTick)this.presenceTick=setInterval(()=>this.renderGamePresence(),1000);
    if(!needsTick&&this.presenceTick){clearInterval(this.presenceTick);this.presenceTick=null}
  }

  markReturned(sessionId){
    if(!sessionId)return;
    this.returnNotices.set(sessionId,Date.now()+2800);
    const previous=this.returnNoticeTimers.get(sessionId);if(previous)clearTimeout(previous);
    const timer=setTimeout(()=>{this.returnNotices.delete(sessionId);this.returnNoticeTimers.delete(sessionId);this.renderGamePresence()},2800);
    this.returnNoticeTimers.set(sessionId,timer);
  }

  updatePresenceFromConnection(m){
    const index=this.presence.findIndex(entry=>entry.sessionId===m.sessionId||entry.seat===m.seat);
    const current=index>=0?this.presence[index]:{sessionId:m.sessionId,seat:m.seat,nickname:m.nickname};
    const updated={...current,sessionId:m.sessionId??current.sessionId,seat:Number.isInteger(m.seat)?m.seat:current.seat,nickname:m.nickname??current.nickname,connected:!!m.connected,graceDeadline:m.connected?null:(m.graceDeadline??current.graceDeadline),botActive:m.connected?false:!!(m.botActive??current.botActive)};
    if(index>=0)this.presence.splice(index,1,updated);else this.presence.push(updated);
    if(m.connected&&this.localSeat(updated.seat)!==0)this.markReturned(updated.sessionId);
  }

  async refreshRooms(){try{await this.ensureSocket();this.send({type:'rooms.list',game:GAME_ID})}catch(e){this.status(this.friendly(e),true)}}

  async createRoom(){
    try{
      const nick=this.el('mp-nick').value;await this.ensureSession(nick);
      const vis=this.el('mp-vis').value==='private'?'private':'public';
      const m=await this.request({type:'room.create',game:GAME_ID,name:`${this.session.nickname} · Tichu`,visibility:vis},'room.created');
      this.syncRoom(m.room);
    }catch(e){this.status(this.friendly(e),true)}
  }

  normalizeCode(v){const x=String(v||'').toUpperCase().replace(/[^A-Z2-9]/g,'');return x.length===8?`${x.slice(0,4)}-${x.slice(4)}`:String(v||'').toUpperCase()}

  async joinRoom(id=null){
    try{
      const nick=this.el('mp-nick').value||this.stored()?.nickname||'Player';await this.ensureSession(nick);
      const code=this.normalizeCode(id||this.el('mp-code').value);
      const m=await this.request({type:'room.join',roomId:code},'room.joined',x=>x.room?.id===code);this.syncRoom(m.room);
    }catch(e){this.status(this.friendly(e),true)}
  }

  async toggleQuickPlay(){
    try{
      await this.ensureSocket();
      if(this.queued){this.send({type:'queue.leave',game:GAME_ID});this.queued=false;this.renderLobby();this.status('Wyszukiwanie anulowane.');return}
      const nick=this.el('mp-nick')?.value||this.stored()?.nickname||'Player';
      await this.ensureSession(nick);this.send({type:'queue.join',game:GAME_ID});this.queued=true;this.renderLobby();this.status('Szukam stołu…');
    }catch(e){this.status(this.friendly(e),true)}
  }

  async leave(){
    try{if(this.queued)this.send({type:'queue.leave',game:GAME_ID});if(this.room)this.send({type:'room.leave',roomId:this.room.id})}catch{}
    this.active=false;this.authoritative=false;this.queued=false;this.room=null;this.seat=null;this.isHost=false;this.stateSeq=0;this.rebaseNextState=true;this.connectionState='connected';this.presence=[];this.botSeats=[];
    if(this.presenceTick){clearInterval(this.presenceTick);this.presenceTick=null}for(const timer of this.returnNoticeTimers.values())clearTimeout(timer);this.returnNoticeTimers.clear();this.returnNotices.clear();this.renderGameConnection();this.renderGamePresence();
    this.game.state.multiplayer=false;this.game.configurePlayers(['You','Mei','Lin','Wei'],[1,2,3]);this.renderLobby();this.refreshRooms();
  }

  async start(){
    if(!this.isHost||!this.room)return;
    const humans=this.room.players||[],botCount=this.fillBots?Math.max(0,4-humans.length):0;
    if(humans.filter(p=>p.connected).length+botCount!==4)return;
    try{await this.request({type:'game.start',roomId:this.room.id,botCount,settings:{}},'game.started',m=>m.room?.id===this.room.id)}catch(e){this.status(this.friendly(e),true)}
  }

  rematch(){
    if(!this.active||!this.room||!this.isHost)return false;
    try{this.send({type:'game.rematch',roomId:this.room.id});return true}catch(e){this.status(this.friendly(e),true);return false}
  }

  async action(type,payload={}){
    if(!this.active||!this.room)return false;
    const actualSeat=Number.isInteger(this.seat)?this.seat:0;let outgoing={...payload};
    if(type==='exchange'&&outgoing.map){const mapped={};for(const [localTarget,id] of Object.entries(outgoing.map))mapped[(actualSeat+Number(localTarget))%4]=id;outgoing.map=mapped}
    if(type==='dragon'&&Number.isInteger(outgoing.seat))outgoing.seat=(actualSeat+outgoing.seat)%4;
    try{this.send({type:'game.action',roomId:this.room.id,action:type,payload:outgoing,actionId:`${Date.now()}-${Math.random().toString(36).slice(2)}`});return true}catch(e){this.status(this.friendly(e),true);return false}
  }

  handle(m){
    if(m.type==='session.created'){this.session=m.session;this.resumeToken=m.resumeToken;this.store();return}
    if(m.type==='session.resumed'){this.rebaseNextState=true;this.session=m.session;this.connectionState='connected';this.renderGameConnection();const r=(m.rooms||[]).find(x=>x.game===GAME_ID);if(r)this.syncRoom(r);return}
    if(['room.created','room.joined','room.updated'].includes(m.type)&&m.room?.game===GAME_ID){this.syncRoom(m.room);return}
    if(m.type==='room.left'&&this.room?.id===m.roomId){if(!this.active){this.room=null;this.renderLobby()}return}
    if(m.type==='rooms.list'){this.rooms=m.rooms||[];this.renderRooms();return}
    if(m.type==='queue.joined'){this.queued=true;this.renderLobby();this.status(Number.isInteger(m.position)?`Szukam stołu · pozycja ${m.position}.`:'Szukam stołu…');return}
    if(m.type==='queue.left'){this.queued=false;this.renderLobby();return}
    if(m.type==='match.found'&&m.game===GAME_ID){this.queued=false;this.syncRoom(m.room);this.status('Znaleziono stół.');return}
    if(m.type==='game.started'&&m.room?.game===GAME_ID){this.stateSeq=0;this.rebaseNextState=true;this.active=true;this.connectionState='connected';this.authoritative=!!m.authoritative;this.seat=m.seat;this.hostId=m.hostSessionId||this.hostId;this.isHost=this.session?.id===this.hostId;this.botSeats=this.localBotSeats(m.botSeats||[]);this.presence=m.presence||[];this.syncRoom(m.room);document.getElementById('modal-root').innerHTML='';this.renderGameConnection();this.send({type:'game.state.get',roomId:m.room.id});return}
    if(m.type==='game.state'&&this.room?.id===m.roomId){if(Number.isInteger(m.viewerSeat))this.seat=m.viewerSeat;this.hostId=m.hostSessionId||this.hostId;this.isHost=this.session?.id===this.hostId;this.connectionState='connected';this.authoritative=!!m.authoritative;this.botSeats=this.localBotSeats(m.botSeats||[]);this.presence=m.presence||this.presence;this.applyState(m.state,m.revision);return}
    if(m.type==='game.presence'&&this.room?.id===m.roomId){this.botSeats=this.localBotSeats(m.botSeats||[]);this.presence=m.presence||[];this.hostId=m.hostSessionId||this.hostId;this.isHost=this.session?.id===this.hostId;this.renderGamePresence();return}
    if(m.type==='game.player.connection'&&this.room?.id===m.roomId){this.botSeats=this.localBotSeats(m.botSeats||[]);this.updatePresenceFromConnection(m);this.renderGamePresence();return}
    if(m.type==='game.player.bot_takeover'&&this.room?.id===m.roomId){this.botSeats=this.localBotSeats(m.botSeats||[]);const index=this.presence.findIndex(entry=>entry.sessionId===m.sessionId||entry.seat===m.seat);if(index>=0)this.presence[index]={...this.presence[index],connected:false,graceDeadline:null,botActive:true};this.renderGamePresence();return}
    if(m.type==='game.host.changed'&&this.room?.id===m.roomId){this.hostId=m.hostSessionId;this.isHost=this.session?.id===this.hostId;this.botSeats=this.localBotSeats(m.botSeats||[]);return}
    if(m.type==='error')this.status(this.friendly(m.code),true);
  }

  localBotSeats(serverSeats){const own=Number.isInteger(this.seat)?this.seat:0;return serverSeats.map(s=>(s-own+4)%4)}

  applyState(snapshot,seq){
    if(!snapshot||!Number.isFinite(seq)||seq<=this.stateSeq)return;
    this.stateSeq=seq;clearTimeout(this.game.botTimer);const localSettings=this.game.state.settings;
    Object.assign(this.game.state,snapshot,{selected:new Set(),multiplayer:true,multiplayerIsHost:this.isHost,botSeats:[...this.botSeats],settings:localSettings});
    this.pendingVisualState={streamId:this.room?.id||'',revision:seq,rebase:this.rebaseNextState};this.rebaseNextState=false;
    try{this.game.emit()}finally{this.pendingVisualState=null}
    this.renderGameConnection();this.renderGamePresence();
  }

  friendly(e){
    const m=String(e?.message||e||'');
    const map={
      'Nickname needs at least 3 characters.':'Nick musi mieć co najmniej 3 znaki.',
      'Leave current room before changing nickname.':'Opuść obecny pokój, zanim zmienisz nick.',
      unknown_game:'Tichu nie jest jeszcze dostępne na serwerze QQND.',
      room_full:'Ten pokój jest pełny.',room_not_found:'Nie znaleziono pokoju.',
      invalid_player_count:'Do rozpoczęcia potrzebne są cztery miejsca (gracze lub boty).',
      bots_not_supported:'Ta wersja serwera nie obsługuje jeszcze botów Tichu.',
      timeout:'Serwer nie odpowiedział na czas.',websocket_error:'Nie udało się połączyć z serwerem QQND.',server_not_connected:'Utracono połączenie z serwerem.',
      invalid_play:'Tej kombinacji nie można teraz zagrać.',wish_must_be_fulfilled:'Możesz spełnić życzenie Mah Jonga, więc musisz to zrobić.',not_your_turn:'To nie jest Twój ruch.',seat_controlled_by_bot:'To miejsce jest tymczasowo kontrolowane przez bota.',
      rematch_not_available:'Rewanż jest dostępny dopiero po zakończeniu meczu.',only_room_owner_can_rematch:'Tylko host może rozpocząć rewanż.',rematch_roster_changed:'Skład stołu zmienił się — rozpocznij nowy pokój.',rematch_players_not_connected:'Wszyscy gracze muszą być online, aby rozpocząć rewanż.',
    };
    return map[m]||m||'Błąd multiplayera';
  }
}
