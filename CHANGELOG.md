# Changelog

## 0.0.6 - 2026-05-07

- Bump `@quonfig/node` to `0.0.26` (`IS_PRESENT` / `IS_NOT_PRESENT` operator support — qfg-7jnb.3).
  Both peer floor (`>=0.0.24` -> `>=0.0.26`) and dev pin (`^0.0.24` -> `^0.0.26`) are bumped because
  npm interprets `^0.0.x` as `>=0.0.x <0.0.(x+1)` on `0.0.x` semver, so the old caret would not have
  picked up `0.0.26`. The new operators are passthrough through this provider — no provider code
  changes (qfg-7jnb.11).
