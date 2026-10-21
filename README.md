# @quonfig/openfeature-node

OpenFeature provider for [Quonfig](https://quonfig.com) -- Node.js server-side SDK.

This package wraps the `@quonfig/node` native SDK and implements the
[OpenFeature](https://openfeature.dev) server-side `Provider` interface.

## Install

```bash
npm install @quonfig/openfeature-node @quonfig/node @openfeature/server-sdk
```

## Usage

```typescript
import { QuonfigProvider } from "@quonfig/openfeature-node";
import { OpenFeature } from "@openfeature/server-sdk";

const provider = new QuonfigProvider({
  sdkKey: "qf_sk_production_...",
  // targetingKeyMapping: "user.id", // default
});

await OpenFeature.setProviderAndWait(provider);

const client = OpenFeature.getClient();

// Boolean flag
const enabled = await client.getBooleanValue("my-feature", false);

// String config
const welcomeMsg = await client.getStringValue("welcome-message", "Hello!");

// Number config
const timeout = await client.getNumberValue("request-timeout-ms", 5000);

// Object config (JSON or string_list)
const allowedPlans = await client.getObjectValue("allowed-plans", []);

// With evaluation context (per-request)
const isProFeatureEnabled = await client.getBooleanValue("pro-feature", false, {
  targetingKey: "user-123", // maps to user.id by default
  "user.plan": "pro",
  "org.tier": "enterprise",
});
```

## Context mapping

OpenFeature context is flat; Quonfig context is nested by namespace. This provider maps between them
using dot-notation:

| OpenFeature context key | Quonfig namespace | Quonfig property                              |
| ----------------------- | ----------------- | --------------------------------------------- |
| `targetingKey`          | `user`            | `id` (configurable via `targetingKeyMapping`) |
| `"user.email"`          | `user`            | `email`                                       |
| `"org.tier"`            | `org`             | `tier`                                        |
| `"country"` (no dot)    | `""` (default)    | `country`                                     |
| `"user.ip.address"`     | `user`            | `ip.address` (first dot only)                 |

### Customizing targetingKey mapping

```typescript
const provider = new QuonfigProvider({
  sdkKey: "qf_sk_...",
  targetingKeyMapping: "account.id", // maps targetingKey to { account: { id: ... } }
});
```

## Accessing native SDK features

The `getClient()` escape hatch returns the underlying `@quonfig/node` client for features not
available in OpenFeature:

```typescript
const native = provider.getClient();

// Log level integration
const shouldLog = native.shouldLog({
  configKey: "log-level.auth",
  desiredLevel: "DEBUG",
  contexts: { user: { id: "user-123" } },
});

// List all config keys
const keys = native.keys();

// Access raw config
const rawConfig = native.rawConfig("my-flag");
```

## What you lose vs. the native SDK

OpenFeature is designed for feature flags, not general configuration. Some Quonfig features require
the native `@quonfig/node` SDK:

1. **Log levels** -- `shouldLog()` and `logger()` are native-only.
2. **`string_list` configs** -- must be accessed via `getObjectValue()` and cast to `string[]`.
3. **`duration` configs** -- return the raw millisecond number via `getNumberValue()`.
4. **`bytes` configs** -- not accessible via OpenFeature (no binary type in OF).
5. **`keys()` and `rawConfig()`** -- native-only via `getClient()`.
6. **Context keys use dot-notation** -- `"user.email"`, not nested objects.
7. **`targetingKey` maps to `user.id` by default** -- configure `targetingKeyMapping` if different.

## Configuration changed events

The provider emits `ProviderEvents.ConfigurationChanged` when Quonfig pushes a live config update
via SSE. Register a handler on the OpenFeature API or client:

```typescript
OpenFeature.addHandler(ProviderEvents.ConfigurationChanged, () => {
  console.log("Configs updated!");
});
```

## Init failure and provider status

Pass `onInitFailure` (`"fail"` | `"wait"` | `"continue"`, default `"fail"`) and `initTimeout` (ms,
default 10000) in the provider options; they go straight to the wrapped `@quonfig/node` client. When
no config has loaded by `initTimeout`, the provider status follows the mode:

| `onInitFailure`  | `setProviderAndWait`                        | Provider status | When the client heals |
| ---------------- | ------------------------------------------- | --------------- | --------------------- |
| `fail` (default) | rejects with the SDK's `QuonfigInitError`   | `ERROR`         | `PROVIDER_READY`      |
| `wait`           | blocks until config loads                   | `NOT_READY`     | resolves, `READY`     |
| `continue`       | resolves, then `PROVIDER_ERROR` (non-fatal) | `ERROR`         | `PROVIDER_READY`      |

In every mode the client keeps retrying in the background, so a caught `fail` does not leave a dead
provider. While the provider is `ERROR`, evaluations still run and return your default with
`errorCode: PROVIDER_NOT_READY`.

```typescript
const provider = new QuonfigProvider({ sdkKey, onInitFailure: "continue", initTimeout: 5000 });
await OpenFeature.setProviderAndWait(provider);
OpenFeature.addHandler(ProviderEvents.Ready, () => console.log("Quonfig config loaded"));
```
