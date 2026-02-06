# ci-runner Smoke Project

This workspace package is a local consumer of `@localci/ci-runner-core`.

It validates realistic behavior with stubbed commands:

- passed steps (`prepare`, `unit-tests`)
- optional failure (`optional-docs` => `skipped`)
- retry flow (`flaky-step`)
- parser extraction (`TESTS_PASSED=7`)
- timeout behavior (`--timeout-demo`)

## Commands

- `pnpm --filter @localci/ci-runner-smoke build`
- `pnpm --filter @localci/ci-runner-smoke test`
- `pnpm --filter @localci/ci-runner-smoke test:integration`
- `pnpm --filter @localci/ci-runner-smoke smoke`
- `pnpm --filter @localci/ci-runner-smoke smoke:json`
- `pnpm --filter @localci/ci-runner-smoke smoke:timeout`
- `pnpm --filter @localci/ci-runner-smoke smoke:cli:pretty`
- `pnpm --filter @localci/ci-runner-smoke smoke:cli:pretty:optional`
