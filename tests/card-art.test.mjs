import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDeck } from '../src/rules.js';
import { cardArt } from '../src/card-art.js';

const deck=makeDeck();

test('every Tichu card has readable deterministic vector art metadata',()=>{
  for(const card of deck){
    const art=cardArt(card);
    assert.ok(art.ariaLabel.length>0,card.id);
    assert.ok(art.label.length>0,card.id);
    assert.match(art.svg,/^<svg[\s\S]*<\/svg>$/,card.id);
    assert.doesNotMatch(art.svg,/<script|onload=|javascript:/i,card.id);
    assert.ok(art.className.length>0,card.id);
    assert.match(art.accent,/^#[0-9a-f]{6}$/i,card.id);
  }
});

test('normal suits use distinct illustrated motifs',()=>{
  const motifs=new Map();
  for(const suit of ['jade','sword','pagoda','star']){
    const art=cardArt(deck.find(card=>card.id===`${suit}-8`));
    motifs.set(suit,art.artKey);
  }
  assert.equal(new Set(motifs.values()).size,4);
});

test('four special cards each have unique full-card illustration keys',()=>{
  const keys=['mahjong','dog','phoenix','dragon'].map(id=>cardArt(deck.find(card=>card.id===id)).artKey);
  assert.equal(new Set(keys).size,4);
  assert.ok(keys.every(key=>key.startsWith('special-')));
});
