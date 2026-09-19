# Tichu Bot AI v2 — Design Direction

**Date:** 2026-09-19  
**Client repo:** `quendae/tichu`  
**Branch:** `feature/bot-ai-v2`  
**Baseline:** accepted Bot AI v1 `strategic`

## Goal

Bot AI v2 improves decision quality beyond the accepted deterministic v1 policy without weakening its legality, no-cheat boundary, determinism, client/server parity, or benchmark discipline.

The comparison target for v2 is the accepted v1 `strategic` policy, not the legacy `baseline`.

## First milestone: bounded lookahead

Introduce a bounded deterministic lookahead layer for ambiguous play decisions. It must operate only on `BotView` information and legal plays supplied by the rules engine.

The first implementation should:

- keep v1 heuristics as the fast prior/fallback;
- identify close decisions rather than search every turn;
- evaluate short candidate continuations using public state and the bot's own hand;
- never inspect exact hidden hands;
- use deterministic tie-breaking;
- remain within the existing strategy timing guardrails.

Hidden cards may later be sampled through deterministic information-set determinizations, but v2 must not start by leaking authoritative hidden state into strategy.

## Team play improvements

Add explicit scoring for:

- preserving a partner's winning trick;
- transferring initiative to a partner when useful;
- helping a declared partner finish;
- preventing opponent double victories;
- creating/protecting own-team double-victory opportunities;
- endgame ordering when one or more seats have already finished.

These features must be measured separately in benchmark telemetry so improvements are attributable rather than inferred from final score alone.

## Autonomous bomb interrupts

Bot-initiated out-of-turn bombs are a v2 feature, but require a timing/arbitration design before implementation.

Requirements:

- bots must not pre-empt a human reaction window unfairly;
- simultaneous eligible bomb opportunities need deterministic arbitration;
- local and authoritative multiplayer behavior must remain equivalent;
- replay/simulation must record interrupt decisions explicitly.

Implement this only after the interrupt contract has dedicated tests.

## Exchange and wish inference

Improve exchange and Mah Jong wish decisions using only legal knowledge:

- preserve recipient identity for cards the bot itself sent;
- distinguish cards sent to partner from cards sent to opponents;
- use public played/discarded history;
- avoid treating all sent cards as equivalent evidence;
- retain no-cheat permutation tests.

## Benchmarking

Keep paired seeded comparisons and add v2-vs-v1 mode.

Development uses known diagnostic seed blocks. Acceptance uses a fresh untouched block after tuning.

Report at least:

- match and pair wins;
- score differential;
- declaration net;
- double victories;
- finish positions;
- partner-support/overtake decisions;
- endgame outcomes;
- bomb interrupt opportunities/uses once implemented;
- decision timing;
- rejected decisions.

A v2 change is accepted only when it improves aggregate play quality without regressing legality, no-cheat behavior, parity, or timing.

## Development order

1. Freeze the accepted v1 `strategic` policy as a comparison profile/fixture target.
2. Extend benchmark telemetry for team/endgame decision categories.
3. Add TDD scenarios for team coordination and close play choices.
4. Implement bounded lookahead for scheduled-turn play.
5. Re-run v2-vs-v1 diagnostics and tune from category evidence.
6. Improve exchange/wish knowledge representation.
7. Design and test autonomous bomb interrupt arbitration.
8. Port accepted behavior to `qqnd-game-server` and run parity.
9. Run a fresh full acceptance block and production multiplayer smoke.

## Non-goals for the first v2 milestone

- neural models or external LLM calls;
- persistent learning/player profiling;
- perfect-information search;
- access to hidden authoritative hands;
- changing Tichu rules.
