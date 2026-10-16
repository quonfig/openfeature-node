# Changelog

## 1.0.2 - 2026-10-16

- Raise the `@quonfig/node` dev pin from `^1.6.0` to `^1.7.0` so this provider is built and tested
  against sdk-node 1.7.0. The peer floor stays `>=1.6.0`: the provider calls only `init()`,
  `close()` and the `get*Details()` methods, all present in 1.6.0, so 1.7.0 is not required. No
  change to this provider's code or behavior. Provider users who install or upgrade to
  `@quonfig/node` 1.7.0 inherit (qfg-goi1):
  - A rejected SDK key (401/403/404/410 on the primary leg of a failed poll cycle) slows to one
    probe every 150-300s and logs one ERROR naming the status and host, instead of retrying at the
    normal cadence (qfg-goi1.10.24).
  - `PROP_BEFORE` / `PROP_AFTER` accept only epoch ms (number or all-digit string) or RFC3339 with
    `Z` or an offset. UPGRADE: pass dates as epoch ms or ISO 8601 with Z/offset; a context date such
    as `"2024-11-01"` or `"2024-11-01T00:00:00"` no longer matches (qfg-goi1.5.6).
  - `PROP_SEMVER_*` reads abbreviated versions (`"2"`, `"2.0"`) as `2.0.0`. UPGRADE: changes who
    matches; a context such as `appVersion: "4.1"` can now match semver rules (qfg-goi1.5.6).
  - Object resolutions backed by a json config return a fresh copy on every call, so mutating the
    resolved value no longer rewrites the config for later reads (qfg-goi1.10.1).
  - One malformed config entry in a payload is skipped with a WARN instead of rejecting the whole
    payload; the skipped key resolves as `FLAG_NOT_FOUND` (qfg-goi1.10.1).
  - An int/double ENV_VAR coercion error no longer echoes the env var's contents into
    `errorMessage`, which this provider forwards to OpenFeature (qfg-goi1.2.31).

## 1.0.1 - 2026-10-09

- Raise the `@quonfig/node` peer floor from `>=1.0.0` to `>=1.6.0` (dev pin `^1.6.0`) so provider
  users inherit sdk-node 1.6.0: `isEnabled()` on a missing key returns false, confidential
  ENV_VAR-provided values are redacted in telemetry, init/telemetry/decrypt hardening (qfg-goi1.3,
  qfg-goi1.2.47, qfg-goi1.2.5, qfg-goi1.1.2, qfg-goi1.2.20). No change to this provider's behavior.

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
