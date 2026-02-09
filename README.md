# LocalCI

TypeScript monorepo for local CI workflows.

LocalCI provides a typed, config-driven runner to execute linting, tests, and build steps with deterministic output in local development and CI environments.

## Packages

- `@number10/ci-runner-cli`: Public CLI package (`ci-runner`) with typed config support.
- `@number10/ci-runner-smoke`: Internal smoke and integration validation package.
- `ci-runner-vscode`: VS Code extension for running targets from the sidebar.

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
- `pnpm run ci:self`
- `pnpm run ci:self:watch`

## CLI Package

For CLI usage and full config examples, see:

- `packages/ci-runner-cli/README.md`

## VS Code Extension

For extension usage and Marketplace publishing notes, see:

- `packages/ci-runner-vscode/README.md`

## Release Notes

Release history is documented in:

- `CHANGELOG.md`

## License

MIT. See `LICENSE`.
