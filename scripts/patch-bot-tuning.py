from pathlib import Path

path = Path('src/bot-strategy.js')
text = path.read_text()

text = text.replace('  tichuThreshold:32,', '  tichuThreshold:45,')

old = """  const declarationActive=seat=>['tichu','grand'].includes(view.declarations?.[seat]);
  const urgentOpponents=opponents.filter(seat=>(view.handCounts?.[seat]??99)<=2||declarationActive(seat));

  if(view.lastPlay&&winningSeat===view.partner&&!urgentOpponents.length&&!mustFulfillWish)return{type:'pass'};
"""
new = """  const declarationActive=seat=>['tichu','grand'].includes(view.declarations?.[seat]);
  const ownDeclaration=declarationActive(view.seat);
  const urgentOpponents=opponents.filter(seat=>{
    const count=view.handCounts?.[seat]??99;
    return count<=2||(declarationActive(seat)&&count<=3);
  });
  const canEmptyHand=legal.some(option=>(option.cards?.length||0)===(view.hand?.length||0));

  if(view.lastPlay&&winningSeat===view.partner&&!urgentOpponents.length&&!mustFulfillWish&&!canEmptyHand&&!ownDeclaration)return{type:'pass'};
"""

if old not in text:
    raise SystemExit('strategicPlay target block not found')

text = text.replace(old, new, 1)
path.write_text(text)
