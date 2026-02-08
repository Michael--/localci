import { watch } from 'node:fs'
import { relative } from 'node:path'

import {
  createNodeCommandExecutor,
  createPipelineRunner,
  formatPipelineResultAsJson,
  StepParserRegistry,
  type PipelineRunResult,
} from './internal/core/index.js'

import { mapConfigToRun, type ExcludedPipelineStep } from './config/mapConfigToRun.js'
import { loadCiRunnerConfig } from './config/loadConfig.js'
import type { CiRunnerTarget, CliOutputFormat } from './config/types.js'
import { createDefaultStepParsers } from './parsers/defaultStepParsers.js'
import { PrettyReporter } from './reporters/prettyReporter.js'
import { createWatchIgnoreMatcher, normalizeWatchPath } from './watch/watchIgnoreMatcher.js'

/**
 * Runtime options for a CLI execution.
 */
export interface RunCliPipelineOptions {
  /** Base working directory. */
  readonly cwd: string
  /** Optional explicit config path. */
  readonly configPath?: string
  /** Optional selected target id from config. */
  readonly target?: string
  /** Prints configured targets and exits when true. */
  readonly listTargets: boolean
  /** Output format selection. */
  readonly format: CliOutputFormat
  /** Verbose output mode. */
  readonly verbose: boolean
  /** Enables fail-fast behavior. */
  readonly failFast: boolean
  /** Enables watch mode. */
  readonly watch: boolean
}

interface WatchController {
  readonly supported: boolean
  close: () => void
  onError: (listener: (error: Error) => void) => void
}

/**
 * Executes the pipeline according to CLI options.
 *
 * @param options CLI runtime options.
 * @returns Final exit code.
 */
export const runCliPipeline = async (options: RunCliPipelineOptions): Promise<number> => {
  const loadedConfig = await loadCiRunnerConfig(options.cwd, options.configPath)
  if (options.listTargets) {
    printConfiguredTargets(loadedConfig.config.targets ?? [], options.format)
    return 0
  }

  const effectiveFormat = loadedConfig.config.output?.format ?? options.format
  const effectiveVerbose = loadedConfig.config.output?.verbose ?? options.verbose

  const execute = async (): Promise<PipelineRunResult> => {
    const mappedRun = mapConfigToRun(
      loadedConfig.config,
      options.cwd,
      options.failFast,
      options.target
    )
    printExcludedStepHints(mappedRun.excludedSteps, effectiveFormat)
    const parserRegistry = new StepParserRegistry(createDefaultStepParsers())

    const runner = createPipelineRunner({
      ...mappedRun,
      executor: createNodeCommandExecutor(),
      parserResolver: parserRegistry,
      reporters:
        effectiveFormat === 'pretty' ? [new PrettyReporter({ verbose: effectiveVerbose })] : [],
    })

    return await runner.run()
  }

  if (!options.watch) {
    const result = await execute()
    if (effectiveFormat === 'json') {
      process.stdout.write(`${formatPipelineResultAsJson(result)}\n`)
    }
    return result.exitCode
  }

  return await runWatchLoop(
    options.cwd,
    loadedConfig.configFilePath,
    effectiveFormat,
    loadedConfig.config.watch?.exclude,
    execute
  )
}

const printExcludedStepHints = (
  excludedSteps: readonly ExcludedPipelineStep[],
  format: CliOutputFormat
): void => {
  if (format !== 'pretty' || excludedSteps.length === 0) {
    return
  }

  for (const step of excludedSteps) {
    if (step.reason === 'disabled') {
      process.stdout.write(`ℹ️  Skipping ${step.name} (enabled=false)\n`)
      continue
    }

    if (step.reason === 'env_mismatch' && step.requiredEnv) {
      process.stdout.write(
        `ℹ️  Skipping ${step.name} (set ${formatRequiredEnv(step.requiredEnv)} to enable)\n`
      )
      continue
    }

    process.stdout.write(`ℹ️  Skipping ${step.name}\n`)
  }
}

const printConfiguredTargets = (
  targets: readonly CiRunnerTarget[],
  format: CliOutputFormat
): void => {
  if (format === 'json') {
    const payload = {
      targets: targets.map((target) => ({
        id: target.id,
        name: target.name,
        description: target.description,
      })),
    }
    process.stdout.write(`${JSON.stringify(payload)}\n`)
    return
  }

  if (targets.length === 0) {
    process.stdout.write('No targets configured.\n')
    return
  }

  process.stdout.write('Configured targets:\n')
  for (const target of targets) {
    const suffix = target.description ? ` - ${target.description}` : ''
    process.stdout.write(`- ${target.id}: ${target.name}${suffix}\n`)
  }
}

const formatRequiredEnv = (requiredEnv: Readonly<Record<string, string>>): string => {
  return Object.entries(requiredEnv)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${value}`)
    .join(' ')
}

const runWatchLoop = async (
  cwd: string,
  configFilePath: string,
  format: CliOutputFormat,
  watchExcludes: readonly string[] | undefined,
  execute: () => Promise<PipelineRunResult>
): Promise<number> => {
  const initialResult = await execute()
  if (format === 'json') {
    process.stdout.write(`${formatPipelineResultAsJson(initialResult)}\n`)
  }

  process.stdout.write('Watch mode enabled. Waiting for file changes...\n')

  let lastExitCode = initialResult.exitCode
  let running = false
  let rerunPending = false
  let debounceHandle: NodeJS.Timeout | null = null
  const shouldIgnorePath = createWatchIgnoreMatcher(watchExcludes)

  const runWithLock = async (): Promise<void> => {
    if (running) {
      rerunPending = true
      return
    }

    running = true
    try {
      do {
        rerunPending = false
        const result = await execute()
        lastExitCode = result.exitCode
        if (format === 'json') {
          process.stdout.write(`${formatPipelineResultAsJson(result)}\n`)
        }
      } while (rerunPending)
    } finally {
      running = false
    }
  }

  const watcher = createWatcher(cwd, configFilePath, shouldIgnorePath, () => {
    if (debounceHandle) {
      clearTimeout(debounceHandle)
    }

    debounceHandle = setTimeout(() => {
      void runWithLock()
    }, 250)
  })
  if (!watcher.supported) {
    return initialResult.exitCode
  }

  await new Promise<void>((resolve) => {
    let finished = false

    const stop = (): void => {
      if (finished) {
        return
      }
      finished = true

      process.off('SIGINT', stop)
      process.off('SIGTERM', stop)
      watcher.close()
      if (debounceHandle) {
        clearTimeout(debounceHandle)
      }
      resolve()
    }

    watcher.onError((watchError: Error) => {
      process.stderr.write(
        `Watch mode stopped (${formatWatchErrorMessage(watchError)}). Running once without watch.\n`
      )
      stop()
    })

    process.on('SIGINT', stop)
    process.on('SIGTERM', stop)
  })

  return lastExitCode
}

const createWatcher = (
  cwd: string,
  configFilePath: string,
  shouldIgnorePath: (filePath: string) => boolean,
  onRelevantChange: () => void
): WatchController => {
  try {
    const watcher = watch(cwd, { recursive: true }, (_, fileName) => {
      if (!fileName) {
        return
      }

      const relativePath = fileName.toString()
      if (shouldIgnorePath(relativePath)) {
        return
      }

      const normalizedConfigPath = normalizeWatchPath(relative(cwd, configFilePath))
      const normalizedRelativePath = normalizeWatchPath(relativePath)
      const messagePath =
        normalizedRelativePath === normalizedConfigPath ? `${relativePath} (config)` : relativePath
      process.stdout.write(`\nChange detected: ${messagePath}\n`)
      onRelevantChange()
    })

    return {
      close: (): void => watcher.close(),
      supported: true,
      onError: (listener: (error: Error) => void): void => {
        watcher.on('error', listener)
      },
    }
  } catch {
    process.stdout.write(
      'Watch mode is not supported recursively on this platform. Running once without watch.\n'
    )

    return {
      close: (): void => undefined,
      supported: false,
      onError: (): void => undefined,
    }
  }
}

const formatWatchErrorMessage = (error: Error): string => {
  const withCode = error as NodeJS.ErrnoException
  return typeof withCode.code === 'string' ? `${withCode.code}: ${error.message}` : error.message
}
