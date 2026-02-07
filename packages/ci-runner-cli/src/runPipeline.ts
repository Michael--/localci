import { watch } from 'node:fs'
import { relative } from 'node:path'

import {
  createNodeCommandExecutor,
  createPipelineRunner,
  formatPipelineResultAsJson,
  StepParserRegistry,
  type PipelineRunResult,
} from './internal/core/index.js'

import { mapConfigToRun } from './config/mapConfigToRun.js'
import { loadCiRunnerConfig } from './config/loadConfig.js'
import type { CliOutputFormat } from './config/types.js'
import { createDefaultStepParsers } from './parsers/defaultStepParsers.js'
import { PrettyReporter } from './reporters/prettyReporter.js'

/**
 * Runtime options for a CLI execution.
 */
export interface RunCliPipelineOptions {
  /** Base working directory. */
  readonly cwd: string
  /** Optional explicit config path. */
  readonly configPath?: string
  /** Output format selection. */
  readonly format: CliOutputFormat
  /** Verbose output mode. */
  readonly verbose: boolean
  /** Enables fail-fast behavior. */
  readonly failFast: boolean
  /** Enables watch mode. */
  readonly watch: boolean
}

/**
 * Executes the pipeline according to CLI options.
 *
 * @param options CLI runtime options.
 * @returns Final exit code.
 */
export const runCliPipeline = async (options: RunCliPipelineOptions): Promise<number> => {
  const loadedConfig = await loadCiRunnerConfig(options.cwd, options.configPath)
  const effectiveFormat = loadedConfig.config.output?.format ?? options.format
  const effectiveVerbose = loadedConfig.config.output?.verbose ?? options.verbose

  const execute = async (): Promise<PipelineRunResult> => {
    const mappedRun = mapConfigToRun(loadedConfig.config, options.cwd, options.failFast)
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

  return await runWatchLoop(options.cwd, loadedConfig.configFilePath, effectiveFormat, execute)
}

const runWatchLoop = async (
  cwd: string,
  configFilePath: string,
  format: CliOutputFormat,
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

  const watcher = createWatcher(cwd, configFilePath, () => {
    if (debounceHandle) {
      clearTimeout(debounceHandle)
    }

    debounceHandle = setTimeout(() => {
      void runWithLock()
    }, 250)
  })

  await new Promise<void>((resolve) => {
    const stop = (): void => {
      watcher.close()
      if (debounceHandle) {
        clearTimeout(debounceHandle)
      }
      resolve()
    }

    process.on('SIGINT', stop)
    process.on('SIGTERM', stop)
  })

  return lastExitCode
}

const createWatcher = (
  cwd: string,
  configFilePath: string,
  onRelevantChange: () => void
): { close: () => void } => {
  const ignorePrefixes = ['node_modules', '.git', 'dist', 'coverage', 'out', 'build', '.tmp']

  try {
    const watcher = watch(cwd, { recursive: true }, (_, fileName) => {
      if (!fileName) {
        return
      }

      const relativePath = fileName.toString()
      if (shouldIgnore(relativePath, ignorePrefixes)) {
        return
      }

      const normalizedConfigPath = relative(cwd, configFilePath)
      const messagePath =
        relativePath === normalizedConfigPath ? `${relativePath} (config)` : relativePath
      process.stdout.write(`\nChange detected: ${messagePath}\n`)
      onRelevantChange()
    })

    return {
      close: (): void => watcher.close(),
    }
  } catch {
    process.stdout.write(
      'Watch mode is not supported recursively on this platform. Running once without watch.\n'
    )

    return {
      close: (): void => undefined,
    }
  }
}

const shouldIgnore = (filePath: string, prefixes: readonly string[]): boolean => {
  return prefixes.some((prefix) => filePath === prefix || filePath.startsWith(`${prefix}/`))
}
