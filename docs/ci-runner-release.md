# CI Runner Release Workflow

## Versioning Policy

- Use Semantic Versioning per publishable package.
- Keep `@localci/ci-runner-core` and `@localci/ci-runner-cli` versions aligned for v1.
- Create release commits with Conventional Commits.
- Publishable packages in this repository:
  - `@localci/ci-runner-core`
  - `@localci/ci-runner-cli`

## Local Release Dry-Run

1. Run full validation:
   - `pnpm run check:release`
2. Build pack artifacts for publishable packages (no publish):
   - `pnpm run release:dry-run`
3. Inspect generated tarballs:
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
