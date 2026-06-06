# Changelog

## 1.0.0 - 2026-06-06

- **Stable 1.0.0 release.** The Quonfig OpenFeature provider for Node.js is now declared stable and
  tracks `@quonfig/node` >= 1.0.0. No API or behavior changes from 0.0.10 — this is a coordinated
  1.0.0 version stamp across the entire Quonfig SDK family.

## 0.0.10 - 2026-06-02

- Bump the `@quonfig/node` peer and dev dependency floor from `0.0.34` to `0.0.36` to inherit
  dev-context injection default-on (qfg-bw7g.9, via qfg-bw7g.2). No change to this provider's
  behavior — dev-context lives below the OpenFeature layer, so OpenFeature users now get
  `quonfig-user.email` injection by default in local dev (gated on the `qfg login` token file; inert
  in production).

## 0.0.9 - 2026-05-28

- Bump `@quonfig/node` to `0.0.34` (sdk-1.0-unification). Both the peer floor (`>=0.0.33` ->
  `>=0.0.34`) and the dev pin (`^0.0.33` -> `^0.0.34`) are bumped because npm interprets `^0.0.x` as
  `>=0.0.x <0.0.(x+1)` on `0.0.x` semver, so the old caret would not have picked up `0.0.34`. No
  provider code changes.

## 0.0.8 - 2026-05-21

- Bump `@quonfig/node` to `0.0.33`. Both the peer floor (`>=0.0.28` -> `>=0.0.33`) and the dev pin
  (`^0.0.28` -> `^0.0.33`) are bumped because npm interprets `^0.0.x` as `>=0.0.x <0.0.(x+1)` on
  `0.0.x` semver, so the old caret would not have picked up `0.0.33`. No provider code changes.

## 0.0.7 - 2026-05-14

- Forward `variant`, `flagMetadata`, and `errorMessage` from the native SDK's `EvaluationDetails`
  through to the OpenFeature `ResolutionDetails` on every resolution reason (STATIC /
  TARGETING_MATCH / SPLIT / DEFAULT / ERROR). Note that the OpenFeature server-sdk strips `variant`
  on the error path, so it is only visible to direct provider callers there (qfg-9dbl).
- Bump `@quonfig/node` to `0.0.28`. Both the peer floor (`>=0.0.26` -> `>=0.0.28`) and the dev pin
  (`^0.0.26` -> `^0.0.28`) are bumped because npm interprets `^0.0.x` as `>=0.0.x <0.0.(x+1)` on
  `0.0.x` semver.
- CI: pass `secrets: inherit` to the reusable `ci.yml` workflow call from the release pipeline,
  matching the fix applied across the other Quonfig SDK repos.

## 0.0.6 - 2026-05-07

- Bump `@quonfig/node` to `0.0.26` (`IS_PRESENT` / `IS_NOT_PRESENT` operator support — qfg-7jnb.3).
  Both peer floor (`>=0.0.24` -> `>=0.0.26`) and dev pin (`^0.0.24` -> `^0.0.26`) are bumped because
  npm interprets `^0.0.x` as `>=0.0.x <0.0.(x+1)` on `0.0.x` semver, so the old caret would not have
  picked up `0.0.26`. The new operators are passthrough through this provider — no provider code
  changes (qfg-7jnb.11).
