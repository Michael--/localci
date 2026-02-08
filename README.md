# LocalCI

TypeScript monorepo for local CI workflows.

LocalCI provides a typed, config-driven runner to execute linting, tests, and build steps with deterministic output in local development and CI environments.

## Packages

- `@number10/ci-runner-cli`: Public CLI package (`ci-runner`) with typed config support.
- `@number10/ci-runner-smoke`: Internal smoke and integration validation package.

## Requirements

- Node.js `>=20.19.0`
- pnpm `>=10.28.1`

## Getting Started

```bash
pnpm install
pnpm run build
pnpm run test
```

## Common Commands

- `pnpm run lint`
- `pnpm run typecheck`
- `pnpm run test`
- `pnpm run build`
- `pnpm run check`
- `pnpm run smoke`

## CLI Package

For CLI usage and full config examples, see:

- `packages/ci-runner-cli/README.md`

## License

MIT. See `LICENSE`.
