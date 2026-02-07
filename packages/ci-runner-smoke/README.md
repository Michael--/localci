# ci-runner Smoke Project

This workspace package validates `@localci/ci-runner-cli` as an external consumer would use it.

It validates realistic behavior with stubbed commands:

- passed steps
- optional failures
- retry flow
- parser extraction from command output
- timeout behavior

## Commands

- `pnpm --filter @localci/ci-runner-smoke test`
- `pnpm --filter @localci/ci-runner-smoke test:integration`
- `pnpm --filter @localci/ci-runner-smoke smoke`
- `pnpm --filter @localci/ci-runner-smoke smoke:json`
- `pnpm --filter @localci/ci-runner-smoke smoke:timeout`
- `pnpm --filter @localci/ci-runner-smoke smoke:cli:pretty`
- `pnpm --filter @localci/ci-runner-smoke smoke:cli:pretty:optional`
- `pnpm --filter @localci/ci-runner-smoke smoke:cli:pretty:typed`
