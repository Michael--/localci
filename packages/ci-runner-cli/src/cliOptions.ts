import { resolve } from 'node:path'

import type { CliOutputFormat } from './config/types.js'

/**
 * Parsed CLI runtime options.
 */
export interface CliOptions {
  /** Absolute working directory for config and execution. */
  readonly cwd: string
  /** Optional explicit config file path. */
  readonly configPath?: string
  /** Optional target id selecting a subset of configured steps. */
  readonly target?: string
  /** Prints configured targets and exits when true. */
  readonly listTargets: boolean
  /** Selected output format. */
  readonly format: CliOutputFormat
  /** Indicates whether output format was explicitly set via CLI flag. */
  readonly formatProvided?: true
  /** Emits full output for successful steps when true. */
  readonly verbose: boolean
  /** Enables rerun mode on file changes when true. */
  readonly watch: boolean
  /** Stops on first hard failure when true. */
  readonly failFast: boolean
  /** Prints usage and exits when true. */
  readonly help: boolean
}

/**
 * Parses process arguments for the ci-runner CLI.
 *
 * @param argv Raw argument list excluding node and script path.
 * @param baseCwd Base working directory.
 * @returns Parsed CLI options.
 * @throws Error when an argument is invalid.
 */
export const parseCliOptions = (argv: readonly string[], baseCwd: string): CliOptions => {
  let configPath: string | undefined
  let target: string | undefined
  let listTargets = false
  let format: CliOutputFormat = 'pretty'
  let formatProvided = false
  let verbose = false
  let watch = false
  let failFast = false
  let help = false
  let cwd = baseCwd

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!argument) {
      continue
    }

    if (argument === '--help' || argument === '-h') {
      help = true
      continue
    }

    if (argument === '--verbose') {
      verbose = true
      continue
    }

    if (argument === '--watch') {
      watch = true
      continue
    }

    if (argument === '--fail-fast') {
      failFast = true
      continue
    }

    if (argument === '--list-targets') {
      listTargets = true
      continue
    }

    if (argument === '--format') {
      const nextValue = argv[index + 1]
      if (!nextValue) {
        throw new Error('--format requires a value')
      }
      if (nextValue !== 'pretty' && nextValue !== 'json') {
        throw new Error('--format must be "pretty" or "json"')
      }
      format = nextValue
      formatProvided = true
      index += 1
      continue
    }

    if (argument.startsWith('--format=')) {
      const value = argument.slice('--format='.length)
      if (value !== 'pretty' && value !== 'json') {
        throw new Error('--format must be "pretty" or "json"')
      }
      format = value
      formatProvided = true
      continue
    }

    if (argument === '--config') {
      const nextValue = argv[index + 1]
      if (!nextValue) {
        throw new Error('--config requires a value')
      }
      configPath = nextValue
      index += 1
      continue
    }

    if (argument.startsWith('--config=')) {
      configPath = argument.slice('--config='.length)
      continue
    }

    if (argument === '--target') {
      const nextValue = argv[index + 1]
      if (!nextValue) {
        throw new Error('--target requires a value')
      }
      target = nextValue
      index += 1
      continue
    }

    if (argument.startsWith('--target=')) {
      target = argument.slice('--target='.length)
      continue
    }

    if (argument === '--cwd') {
      const nextValue = argv[index + 1]
      if (!nextValue) {
        throw new Error('--cwd requires a value')
      }
      cwd = resolve(baseCwd, nextValue)
      index += 1
      continue
    }

    if (argument.startsWith('--cwd=')) {
      cwd = resolve(baseCwd, argument.slice('--cwd='.length))
      continue
    }

    throw new Error(`Unknown argument: ${argument}`)
  }

  return {
    cwd,
    configPath,
    target,
    listTargets,
    format,
    ...(formatProvided ? { formatProvided: true as const } : {}),
    verbose,
    watch,
    failFast,
    help,
  }
}

/**
 * Returns help text for the ci-runner CLI.
 *
 * @returns Human-readable usage text.
 */
export const getCliHelpText = (): string => {
  return [
    'Usage: ci-runner [options]',
    '',
    'Options:',
    '  --config <path>     Config file path (default: ci.config.ts or ci.config.json)',
    '  --target <id>       Run only the selected target id from config',
    '  --list-targets      Print configured targets and exit',
    '  --format <type>     Output format: pretty | json (default: pretty)',
    '  --verbose           Show stdout/stderr for successful steps',
    '  --watch             Re-run on file changes',
    '  --fail-fast         Stop after first non-optional failure',
    '  --cwd <path>        Base working directory',
    '  -h, --help          Show this help',
  ].join('\n')
}
