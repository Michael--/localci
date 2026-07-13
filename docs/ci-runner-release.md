# CI Runner Release Workflow

## Versioning Policy

- Use Semantic Versioning per publishable package.
- Create release commits with Conventional Commits.
- Publishable packages in this repository:
  - `@number10/ci-runner-cli`

## Local Release Dry-Run

1. Bump the version in `packages/ci-runner-cli/package.json` and add release notes to `CHANGELOG.md`.
2. Run full validation:
   - `pnpm run check:release`
3. Build pack artifacts for publishable packages (no publish):
   - `pnpm run release:dry-run`
4. Inspect generated tarballs:
   - `.artifacts/packs/*.tgz`

## CI Release Dry-Run

- Workflow file: `.github/workflows/release-dry-run.yml`
- Trigger: manual (`workflow_dispatch`)
- Behavior:
  - install dependencies
  - run `pnpm run check:release`
  - run `pnpm run release:pack`
  - upload pack artifacts

## Publish Step (Deferred)

Publish is intentionally deferred until manual validation is complete.
