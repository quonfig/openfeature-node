# Changelog

## 3.2.0 - 2026-10-29

`getStringValue()` on a `duration` config returns its stored ISO 8601 text again (reason `STATIC`),
as in openfeature-go and -web and the shared OpenFeature cases. 3.x returned your default with
`TYPE_MISMATCH`. `getNumberValue()` on a duration still returns your default.

## 3.1.0 - 2026-10-28

A value whose type matches the read but which cannot be parsed now returns your default with reason
`ERROR` and `errorCode: PARSE_ERROR`. In 3.0.0 it reported `TYPE_MISMATCH` (qfg-9xsl, matching
integration-test-data `tests/openfeature/openfeature.yaml` Case 6 and openfeature-go). This covers:

- A malformed stored int or double, for example `"twelve"` read with `getNumberValue()`.
- An ENV_VAR-provided value that does not parse as the config's type, for example an int config
  whose env var holds `"twelve"`.

Reading a config with the method for another type, for example `getBooleanValue()` on an int config,
still reports `TYPE_MISMATCH`. An unset ENV_VAR or a decryption failure still reports `GENERAL`.

## 3.0.0 - 2026-10-26

Requires `@quonfig/node` 2.0.0: the cross-SDK typed-getter contract (qfg-zvyy). Raise the peer floor
from `>=1.10.0` to `>=2.0.0` and the dev pin from `^1.10.0` to `^2.0.0`. No change to this
provider's code: it passes through the `*Details` results of sdk-node 2.0.0, so provider users
inherit the contract below.

**BREAKING:**

- Requires `@quonfig/node` >= 2.0.0 (peer floor raised from `>=1.10.0`).
- UPGRADE: a value the getter cannot read as its type returns your default with reason `ERROR` and
  `errorCode: TYPE_MISMATCH`. Strings are never coerced: a stored `"false"` or `"true"` is not a
  bool, and a stored `"3"` is not a number. The only conversions are int and double configs to
  `getNumberValue()`. Flags already resolved this way in 2.x for most type mismatches; what changes
  for provider users:
  - A malformed stored int or double (for example `"twelve"`) returns your default with
    `TYPE_MISMATCH`. 2.x returned `NaN` with a success reason.
  - A malformed ENV_VAR value reports `TYPE_MISMATCH`. 2.x reported `GENERAL`. An unset ENV_VAR or a
    decryption failure still reports `GENERAL`, and returns your default.
  - `getNumberValue()` on a `duration` config returns your default with `TYPE_MISMATCH`. 2.x
    returned the duration in milliseconds. Durations are now native-only: use
    `getClient().getDuration()`.
- UPGRADE: sdk-node logs one WARN per key per client when a read returns your default because of a
  type mismatch, a malformed value, an unset ENV_VAR or a decryption failure. The line names the
  key, never the value.
- UPGRADE: a wrong decryption key now degrades to your defaults (with one WARN per key) instead of
  failing reads. If you call the native client via `getClient()`, see the sdk-node CHANGELOG
  "UPGRADE to 2.0": typed getters take a default, `isEnabled` never throws, and `getInt` is new.

**Tests:**

- New `test/integration/typed-getter-contract.test.ts` drives the real provider through the
  OpenFeature client against the integration-test-data `getter.contract.*` fixtures: wrong-type,
  malformed and duration reads map to OpenFeature `TYPE_MISMATCH` with the caller default; matching
  and int/double reads resolve; an unset ENV_VAR returns the default with `GENERAL`.

## 2.1.0 - 2026-10-23

- Requires `@quonfig/node` 1.10.0: raise the peer floor from `>=1.9.0` to `>=1.10.0` and the dev pin
  from `^1.9.0` to `^1.10.0`, so the provider is built and tested against sdk-node 1.10.0 and
  provider users get its size caps and `callback_errors_total` counter. No change to this provider's
  code or its OpenFeature behavior. Provider users inherit from sdk-node 1.10.0:
  - UPGRADE: size caps (qfg-6vno.20.3). One SSE event is capped at 4 MiB and a `/api/v2/configs` 200
    body at 16 MiB. An over-cap event or body counts as a failed attempt (nothing installs; the
    fallback poller or backoff takes over) and logs one WARN per oversized episode.
  - UPGRADE: a throw or rejection from `onConfigUpdate` or `onSSEConnectionStateChange` is counted
    in the new internal `quonfig_sdk_callback_errors_total{callback}` counter and no longer counts
    as a worker restart (qfg-6vno.27).
  - Client construction no longer throws when `os.homedir()` fails (qfg-za5s).
  - See the sdk-node CHANGELOG for the full list.

## 2.0.0 - 2026-10-22

**BREAKING:**

- Requires `@quonfig/node` >= 1.9.0 (peer floor raised from `>=1.6.0`).
- Evaluations before the client has config report `errorCode: PROVIDER_NOT_READY` instead of
  `GENERAL`. Code that branches on `GENERAL` for this case must check `PROVIDER_NOT_READY`.
- With `onInitFailure: "continue"` and no config, the provider status is `ERROR` (not `READY`) until
  the client heals.

**Changes:**

- Raise the `@quonfig/node` peer floor from `>=1.6.0` to `>=1.9.0` (dev pin `^1.9.0`): the provider
  now uses the sdk-node 1.9.0 readiness API (`isReady()`, `waitForReady()`).
- Map init failure to OpenFeature provider status (qfg-9p4i.12, design B.5). `onInitFailure` and
  `initTimeout` pass through the provider options to the wrapped client.
  - `"fail"` (default): `initialize` throws, so the provider is `ERROR`, as before. New: the client
    is kept alive and retries in the background, and the provider emits `PROVIDER_READY` when it
    heals, so the status becomes `READY` without re-registering the provider.
  - `"wait"`: `initialize` blocks until the first config, so the provider stays `NOT_READY`.
  - `"continue"`: `initialize` resolves on code defaults, then the provider emits a non-fatal
    `PROVIDER_ERROR` (status `ERROR`; evaluations still run). It emits `PROVIDER_READY` on heal.
- UPGRADE: evaluations before the client has config report `errorCode: PROVIDER_NOT_READY` (was
  `GENERAL`). Value and reason are unchanged (your default, `ERROR`); only the code is more
  specific. This passes through the code sdk-node 1.9.0 (a minor) already returns, and matches the
  OpenFeature meaning of `PROVIDER_NOT_READY` (design B.5: one outage code across providers).
- Provider users inherit sdk-node 1.9.0: `init()` retries through blips until `initTimeout` (default
  10 s) instead of rejecting on the first failed attempt, and rejects with `QuonfigInitError`
  (`.reason`: `timeout` | `unavailable` | `unauthorized`). See the sdk-node CHANGELOG.

## 1.0.3 - 2026-10-20

- Raise the `@quonfig/node` dev pin from `^1.7.0` to `^1.8.0` so this provider is built and tested
  against sdk-node 1.8.0. The peer floor stays `>=1.6.0`: the provider calls only `init()`,
  `close()` and the `get*Details()` methods, all present in 1.6.0, so 1.8.0 is not required. No
  change to this provider's code or behavior. Provider users who install or upgrade to
  `@quonfig/node` 1.8.0 inherit (qfg-goi1):
  - UPGRADE: the SSE stream counts as connected at its first valid frame (a config envelope or a
    keepalive), not at the 200 response headers (qfg-goi1.10.9, qfg-goi1.10.40). Against Quonfig's
    servers both arrive together, so you should see no difference. Behind a proxy that sends 200
    headers early, the native client's `connectionState()` and `onSSEConnectionStateChange` report
    `connected` up to one keepalive interval (30 s) later. A stream that closes before any frame is
    now a failed attempt: the reconnect delay grows and the fallback poller takes over, instead of
    reconnecting in a tight loop on stale config. This provider does not map connection state to
    OpenFeature events, so `Ready` and `ConfigurationChanged` fire as before.
  - Evaluation-summary telemetry no longer serializes the selected value on every evaluation. A
    large JSON or string flag resolved through `getObjectValue` / `getStringValue` paid a full
    `JSON.stringify` per call (about 50us per read for a 60KB JSON config); a repeat read is now a
    counter increment. Telemetry payloads are unchanged (qfg-23uf).

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
