# Migration Guide: Blueprint Script to CI Runner

## Goal

Replace the old single-file CI script with a typed CLI package:

- `@number10/ci-runner-cli`

## What Stays the Same

- Short, readable output for successful runs.
- Detailed command output when failures happen.
- Optional steps can fail without failing the whole pipeline.

## What Changes

1. Configuration moves from inline JavaScript to `ci.config.json` or `ci.config.ts`.
2. Step behavior is explicit (`optional`, `timeoutMs`, `retry`).
3. Output format is selectable (`pretty` or `json`).
4. Parser logic is extensible through parser presets and registry API.

## Migration Steps

1. Create `ci.config.json` at project root.
2. Map old hardcoded steps to `steps[]` entries.
3. For non-blocking steps, set `"optional": true`.
4. For long-running steps, add `"timeoutMs"` and optional `"retry"`.
5. Use CLI:
   - `ci-runner --format pretty`
   - `ci-runner --format json`

## Example

Before:

```js
// old blueprint style
await runStep('lint', 'pnpm run lint')
await runStep('test', 'pnpm run test', { optional: true })
```

After:

```json
{
  "steps": [
    { "id": "lint", "name": "Lint", "command": "pnpm run lint" },
    { "id": "test", "name": "Test", "command": "pnpm run test", "optional": true }
  ]
}
```

Typed TS config (recommended for editor type safety):

```ts
import type { CiRunnerConfig } from '@number10/ci-runner-cli/types'

const config = {
  steps: [
    { id: 'lint', name: 'Lint', command: 'pnpm run lint' },
    { id: 'test', name: 'Test', command: 'pnpm run test', optional: true },
  ],
} satisfies CiRunnerConfig

export default config
```

## Validation Checklist

- `pnpm run check`
- `pnpm run test:integration`
- `pnpm run smoke`
