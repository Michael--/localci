# CI Runner Recipes

Short, copy-pasteable pipeline templates for common setups.

## Recipe 1: Lint Only

`ci.config.json`

```json
{
  "steps": [{ "id": "lint", "name": "Lint", "command": "pnpm run lint" }]
}
```

Run:

```bash
ci-runner --format pretty
```

## Recipe 2: Lint + Test

`ci.config.json`

```json
{
  "steps": [
    { "id": "lint", "name": "Lint", "command": "pnpm run lint" },
    { "id": "test", "name": "Unit Tests", "command": "pnpm run test" }
  ]
}
```

Run:

```bash
ci-runner --format pretty --fail-fast
```

## Recipe 3: Lint + Test + Build

`ci.config.json`

```json
{
  "steps": [
    { "id": "lint", "name": "Lint", "command": "pnpm run lint" },
    { "id": "test", "name": "Unit Tests", "command": "pnpm run test" },
    { "id": "build", "name": "Build", "command": "pnpm run build" }
  ]
}
```

Run:

```bash
ci-runner --format json --fail-fast
```

## Recipe 4: Lint + Test + Build + E2E

`ci.config.json`

```json
{
  "steps": [
    { "id": "lint", "name": "Lint", "command": "pnpm run lint" },
    { "id": "test", "name": "Unit Tests", "command": "pnpm run test" },
    { "id": "build", "name": "Build", "command": "pnpm run build" },
    {
      "id": "e2e",
      "name": "E2E",
      "command": "pnpm run test:e2e",
      "timeoutMs": 120000,
      "retry": {
        "maxAttempts": 2,
        "delayMs": 500
      }
    }
  ]
}
```

Run:

```bash
ci-runner --format json --fail-fast
```

Optional gate for E2E (for example nightly pipelines):

```json
{
  "id": "e2e",
  "name": "E2E",
  "command": "pnpm run test:e2e",
  "when": {
    "env": {
      "RUN_E2E": "true"
    }
  }
}
```
