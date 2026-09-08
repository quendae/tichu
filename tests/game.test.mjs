import test from 'node:test';
import assert from 'node:assert/strict';
import { TichuGame } from '../src/game.js';

const waitFor = async (predicate, timeout = 200) => {
  const deadline = Date.now() + timeout;
  while (!predicate() && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
};

test('local exchange continues through bot choices after the human confirms', async t => {
  const game = new TichuGame({ botDelay: 60_000 });
  t.after(() => clearTimeout(game.botTimer));
  game.resetMatch();
  clearTimeout(game.botTimer);

  for (let seat = 0; seat < 4; seat++) game.declareGrand(seat, false);
  clearTimeout(game.botTimer);
  game.botDelay = 0;

  const humanCards = game.state.hands[0].slice(0, 3);
  assert.equal(game.submitExchange(0, {
    1: humanCards[0].id,
    2: humanCards[1].id,
    3: humanCards[2].id,
  }), true);

  await waitFor(() => game.state.phase === 'play');
  assert.equal(game.state.phase, 'play');
  assert.deepEqual(game.state.exchangeDone, [true, true, true, true]);
});
