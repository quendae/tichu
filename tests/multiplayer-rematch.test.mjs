import assert from 'node:assert/strict';
import test from 'node:test';
import {MultiplayerClient} from '../src/multiplayer.js';

test('multiplayer rematch errors remain visible after the lobby closes',()=>{
  const classes=new Set(['hidden']);
  const toast={
    textContent:'',
    classList:{
      add:value=>classes.add(value),
      remove:value=>classes.delete(value),
      toggle(value,force){if(force)classes.add(value);else classes.delete(value)},
    },
  };
  globalThis.window={addEventListener(){}};
  globalThis.document={getElementById(id){return id==='toast'?toast:null}};
  const client=new MultiplayerClient({});
  client.status(client.friendly('rematch_players_not_connected'),true);
  assert.equal(toast.textContent,'Wszyscy gracze muszą być online, aby rozpocząć rewanż.');
  assert.equal(classes.has('hidden'),false);
  clearTimeout(client.gameStatusTimer);
});
