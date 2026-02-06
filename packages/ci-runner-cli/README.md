# @localci/ci-runner-cli

CLI package for running typed CI pipelines based on config files.

## Install

```bash
pnpm add -D @localci/ci-runner-cli
```

## Usage

```bash
ci-runner --format pretty
```

Supported flags:

- `--config <path>`
- `--format <pretty|json>`
- `--verbose`
- `--watch`
- `--fail-fast`
- `--cwd <path>`

## Config File

The CLI loads `ci.config.ts` or `ci.config.json`.

Example:

```json
{
  "continueOnError": true,
  "output": {
    "format": "pretty",
    "verbose": false
  },
  "steps": [
    {
      "id": "lint",
      "name": "Lint",
      "command": "pnpm run lint"
    },
    {
      "id": "test",
      "name": "Unit Tests",
      "command": "pnpm run test",
      "timeoutMs": 60000,
      "retry": {
        "maxAttempts": 2,
        "delayMs": 250
      }
    }
  ]
}
```

## Output Modes

- `pretty`: compact success output, detailed error output
- `json`: full machine-readable run payload
