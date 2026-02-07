# ci-runner Smoke Project

This workspace package validates `@number10/ci-runner-cli` as an external consumer would use it.

It validates realistic behavior with stubbed commands:

- passed steps
- optional failures
- retry flow
- parser extraction from command output
- timeout behavior

## Commands

- `pnpm --filter @number10/ci-runner-smoke test`
- `pnpm --filter @number10/ci-runner-smoke test:integration`
- `pnpm --filter @number10/ci-runner-smoke smoke`
- `pnpm --filter @number10/ci-runner-smoke smoke:json`
- `pnpm --filter @number10/ci-runner-smoke smoke:timeout`
- `pnpm --filter @number10/ci-runner-smoke smoke:cli:pretty`
- `pnpm --filter @number10/ci-runner-smoke smoke:cli:pretty:optional`
- `pnpm --filter @number10/ci-runner-smoke smoke:cli:pretty:typed`
