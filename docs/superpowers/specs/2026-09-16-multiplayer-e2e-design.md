# Tichu multiplayer E2E design

Date: 2026-09-16

## Goal

Add real end-to-end multiplayer coverage for Tichu against the deployed QQND Game Server at `wss://api.qqnd.fyi/api/v1/ws`.

The default CI path will exercise two independent human browser sessions plus two server-side bots. A separate heavier smoke path will exercise four independent human browser sessions without bots.

The purpose is to verify the complete path from browser UI through `MultiplayerClient`, WebSocket protocol, QQND room/session/runtime handling, the server-authoritative Tichu engine, viewer-specific state redaction, reconnect behavior, and back into rendered browser state.

## Repositories in scope

### `quendae/tichu`

Primary branch: `feature/multiplayer-e2e`.

Responsibilities:

- Playwright orchestration of multiple browser contexts.
- Test-only multiplayer bridge activated only for E2E.
- Production API room lifecycle tests.
- Reconnect and state-redaction assertions.
- CI wiring for bounded live-server coverage.
- Manual four-human smoke command.

### `quendae/qqnd-game-server`

Primary branch: `feature/tichu-multiplayer-e2e-support`.

Responsibilities:

- Bring server-side Tichu Dog handling in line with the corrected client engine.
- Add regression coverage for Dog card conservation.
- Keep server-authoritative state views compatible with the client, including the non-scoring `discarded` pile.

No unrelated server refactor is part of this work.

## Chosen environment strategy

The CI integration target is the deployed `api.qqnd.fyi` service rather than an ephemeral local QQND server.

Reasons:

- the service is effectively private in current use;
- the user explicitly prefers testing the real deployment;
- this catches deployment/proxy/WebSocket/CORS differences that a local server cannot;
- the existing client already targets this endpoint in production.

The test suite must therefore be conservative about shared state and cleanup.

## Safety and isolation on the production API

Every E2E run uses unique identities generated from the CI run/process plus random suffix, for example:

- `E2E-<run>-H1-<suffix>`
- `E2E-<run>-H2-<suffix>`

Rooms are always created as `private`.

Tests must not depend on public room listings, existing sessions, or room ordering.

Normal cleanup:

1. each connected browser sends `room.leave` through the normal client path;
2. browser contexts are closed;
3. stored test sessions are allowed to expire naturally if the connection died before cleanup.

Cleanup failure must not hide the original test failure.

The suite must never delete or mutate rooms that it did not create.

## Server-side prerequisite: Dog conservation

The deployed server engine currently removes Dog from the player's hand and then clears the table, which loses the card from the server-authoritative round state.

The server model will receive an explicit `discarded: TichuCard[]` field, matching the client-side model added in the deterministic-simulation work.

Round start resets `discarded` to an empty array.

When Dog is legally led:

1. Dog is removed from the hand as today;
2. Dog is appended to `discarded`;
3. the temporary table entry is cleared;
4. lead passes to the partner according to existing rules.

`discarded` is non-scoring and is preserved in seat-specific state views. It contains no hidden information because any card in it has already been publicly played.

A focused server regression test must prove that a Dog play preserves all 56 card identities across hands, table, captured, remaining deck, and discarded state.

The production E2E suite that relies on this behavior should only be enabled after the server fix is deployed to `api.qqnd.fyi`.

## Client test bridge

Full-game E2E should not be coupled to animation timing, hand fan geometry, or CSS hit targets. Existing UI Playwright tests already cover those surfaces.

A small test-only bridge will be exposed only when the page is opened with `?e2e=1`.

Example surface:

```js
window.__tichuE2E = {
  getState(),
  getMultiplayerStatus(),
  action(type, payload),
  closeSocket(),
  waitForRevision(minRevision),
};
```

The bridge must:

- use the existing `MultiplayerClient.action()` path for game actions;
- expose only the viewer's already-redacted client state;
- never expose server-side hidden hands, resume tokens, or other players' private state;
- not exist during normal production navigation without `?e2e=1`.

Lobby creation, joining, room code entry, bot-fill selection, game start, and visible reconnect status are still exercised through the real UI.

Gameplay progression may use the bridge so the test can choose legal actions without depending on visual coordinates.

## Default CI scenario: 2 humans + 2 bots

The main live-server scenario uses two isolated Playwright browser contexts.

### Setup

1. H1 opens Tichu with `?e2e=1`.
2. H1 opens multiplayer UI, enters a unique nickname, creates a private room.
3. Test reads the room code from visible lobby UI.
4. H2 opens a separate context with independent storage.
5. H2 opens multiplayer UI and joins by room code.
6. H1 leaves "Fill empty seats with bots" enabled.
7. H1 starts the game, producing two human seats and two server bot seats.

### Assertions before gameplay

Both clients must agree on:

- room id;
- in-game status;
- authoritative multiplayer mode;
- score and round metadata;
- current phase and revision progression.

Each browser may see its own hand in full.

Every opponent hand in that browser's state must consist only of hidden placeholders. No test assertion may inspect another human's real hand through the client.

### Gameplay driver

The driver repeatedly reads each human's local redacted state and acts only when that human has a legal decision.

Human decisions covered:

- Grand Tichu response;
- card exchange;
- optional normal Tichu declaration when available;
- legal play or pass;
- Mahjong wish when applicable;
- Dragon recipient choice when the human wins a Dragon trick;
- next round when the protocol requires a human-triggered transition.

Server bots remain controlled entirely by the QQND server runtime.

The driver should prefer deterministic, simple legal actions rather than strategic strength.

The default CI scenario does not need to play an entire 1000-point match on every push. It must reliably cross the lobby, Grand, exchange, and real play phases, execute multiple synchronized turns, and reach at least one completed trick. A bounded turn/clock limit prevents runaway live-service tests.

## Reconnect coverage

The default CI scenario includes a transient disconnect/resume check for H2:

1. record current room id and revision;
2. force-close only H2's WebSocket;
3. wait for the existing client reconnect/resume path;
4. verify H2 returns to the same room and receives a revision at least as new as the recorded one;
5. verify H1 remains in the same match and the authoritative state still agrees on public fields.

This test uses the existing persisted session/resume token internally but never exposes the token through test assertions.

## Bot takeover coverage

Bot takeover is slower because it depends on the server reconnect grace interval.

It will be a separate live E2E test, still suitable for CI if measured runtime is acceptable:

1. start a 2-human + 2-bot match;
2. close H2's browser context rather than allowing immediate reconnect;
3. wait for H1 to observe the corresponding server presence/bot-takeover state;
4. verify play can continue under server control;
5. optionally reopen H2 using the stored session in the same persisted profile only if the current QQND takeover contract supports reclamation.

If production grace makes this test materially slow or flaky, it moves to the manual smoke suite rather than weakening assertions.

## Four-human smoke

A separate command creates four independent browser contexts and fills all four seats with humans.

No server bots are used.

The smoke test verifies:

- four unique sessions can join one private Tichu room;
- host starts with `botCount=0`;
- all four Grand responses are accepted;
- all four exchanges resolve;
- viewer-specific hand redaction works for all four seats;
- several legal play/pass transitions synchronize to all four clients.

This path is intended for explicit pre-release/manual use rather than every push.

Suggested script name:

```text
npm run test:e2e:multiplayer:full
```

## CI organization

Existing offline/unit/visual Playwright coverage remains unchanged.

Add a dedicated live multiplayer script, for example:

```text
npm run test:e2e:multiplayer
```

The main GitHub Actions workflow runs this after the ordinary offline Playwright suite.

The live suite should use serial execution because it talks to shared production infrastructure and creates real sessions/rooms.

Retries should stay low: a retry may distinguish a transient network failure, but repeated retries must not hide deterministic protocol failures.

Failure output should include:

- test-generated nicknames;
- room id if creation succeeded;
- last observed revision per client;
- last public phase/current-player/score summary;
- browser console and WebSocket error summary.

It must not print resume tokens or hidden card data.

## Error handling

The E2E harness treats these classes separately:

- connection/setup failure;
- room/session lifecycle failure;
- protocol/action rejection;
- state synchronization timeout;
- hidden-information leak;
- reconnect failure;
- cleanup failure.

The first substantive failure remains primary. Cleanup errors are appended as diagnostics only.

## Non-goals

This work does not:

- improve bot strategy;
- redesign the multiplayer lobby;
- replace existing visual Playwright tests;
- make the production server deterministic;
- expose replay/debug hidden state in multiplayer;
- run destructive cleanup against arbitrary production rooms;
- test every possible Tichu rule through the network layer.

Rule exhaustiveness remains the responsibility of engine/unit and deterministic simulation tests.

## Acceptance criteria

1. Server-side Dog play no longer loses a card and has a focused regression test.
2. Normal Tichu production navigation does not expose the E2E bridge.
3. `?e2e=1` exposes only local redacted state and safe multiplayer actions.
4. Two isolated browser contexts can create/join a private room on `api.qqnd.fyi`.
5. A 2-human + 2-bot game starts through the real production WebSocket endpoint.
6. Grand and exchange phases complete with authoritative revisions visible to both humans.
7. Multiple real play/pass transitions synchronize between both browsers.
8. Each browser sees only its own real hand; every other hand remains hidden.
9. A transient WebSocket disconnect resumes the same session/room and catches up state.
10. Bot takeover is covered either in normal CI or, if production grace is too expensive, in the explicit live smoke suite with that choice documented by measured runtime.
11. A four-human no-bot smoke can run on demand.
12. Live tests use unique private rooms and never interfere with existing rooms.
13. Offline unit, deterministic simulation, and existing Playwright suites remain green.

## Delivery order

Because the client E2E will hit the deployed server, implementation order matters:

1. patch and regression-test `qqnd-game-server` Dog conservation;
2. merge/deploy that server change to `api.qqnd.fyi`;
3. verify the deployed service behavior;
4. implement the Tichu test bridge and 2-human + 2-bot live E2E;
5. add reconnect/takeover coverage;
6. add the manual four-human smoke;
7. wire bounded live coverage into Tichu CI and document commands.

If server deployment is not automatic, the client PR may be prepared in parallel but its live Dog-dependent assertions must wait until deployment is confirmed.
