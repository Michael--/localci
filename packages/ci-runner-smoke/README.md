# ci-runner Smoke Project

This workspace package validates `@number10/ci-runner-cli` as an external consumer would use it.

## Coverage

It validates realistic behavior with stubbed commands and integration fixtures:

- passed steps
- optional failures
- retry flow
- parser extraction from command output
- timeout behavior
- typed config loading (`ci.config.ts`)
- target listing and selection
- pretty and JSON output modes

## Why It Exists

- Protects the public CLI contract before publish.
- Verifies built artifacts (`dist/cli.js`) outside the CLI package internals.
- Catches regressions in argument parsing, output formatting, and watcher behavior.

## Commands

- `pnpm --filter @number10/ci-runner-smoke test`: unit tests for smoke helpers and fixtures.
- `pnpm --filter @number10/ci-runner-smoke test:integration`: integration tests running the built CLI.
- `pnpm --filter @number10/ci-runner-smoke smoke`: default smoke entry (JSON mode).
- `pnpm --filter @number10/ci-runner-smoke smoke:json`: machine-readable smoke run.
- `pnpm --filter @number10/ci-runner-smoke smoke:timeout`: timeout handling fixture.
- `pnpm --filter @number10/ci-runner-smoke smoke:cli:pretty`: human-readable fixture.
- `pnpm --filter @number10/ci-runner-smoke smoke:cli:pretty:optional`: optional-step behavior fixture.
- `pnpm --filter @number10/ci-runner-smoke smoke:cli:pretty:typed`: typed TypeScript config fixture.
