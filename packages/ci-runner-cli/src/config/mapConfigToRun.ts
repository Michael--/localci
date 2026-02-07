import { resolve } from 'node:path'

import type { CiRunnerConfig, CliConfigStep } from './types.js'

/**
 * Runtime step contract passed into the pipeline engine.
 */
export interface MappedPipelineStep {
  /** Stable step id. */
  readonly id: string
  /** Display name shown in output. */
  readonly name: string
  /** Shell command to execute. */
  readonly command: string
  /** Working directory override for this step. */
  readonly cwd?: string
  /** Environment additions for this step. */
  readonly env?: Readonly<Record<string, string>>
  /** Optional failure policy. */
  readonly optional?: boolean
  /** Step timeout in milliseconds. */
  readonly timeoutMs?: number
  /** Retry policy for this step. */
  readonly retry?: CliConfigStep['retry']
}

/**
 * Runtime options subset consumed by the pipeline engine.
 */
export interface MappedPipelineRunOptions {
  /** Ordered runtime steps. */
  readonly steps: readonly MappedPipelineStep[]
  /** Base working directory for step execution. */
  readonly cwd: string
  /** Base environment for step execution. */
  readonly env: NodeJS.ProcessEnv
  /** Continue after hard failures when true. */
  readonly continueOnError: boolean
}

/**
 * Maps loaded config to core run options.
 *
 * @param config Parsed CLI config.
 * @param cwd Base working directory.
 * @param failFast CLI fail-fast override.
 * @returns Core run options subset.
 */
export const mapConfigToRun = (
  config: CiRunnerConfig,
  cwd: string,
  failFast: boolean
): MappedPipelineRunOptions => {
  const runCwd = config.cwd ? resolve(cwd, config.cwd) : cwd
  const env = { ...process.env, ...config.env }

  const steps = config.steps
    .filter((step) => shouldIncludeStep(step, env))
    .map((step) => mapStep(step, runCwd))

  const continueOnError = failFast ? false : (config.continueOnError ?? true)

  return {
    steps,
    cwd: runCwd,
    env,
    continueOnError,
  }
}

const mapStep = (step: CliConfigStep, runCwd: string): MappedPipelineStep => {
  return {
    id: step.id,
    name: step.name,
    command: step.command,
    cwd: step.cwd ? resolve(runCwd, step.cwd) : runCwd,
    env: step.env,
    optional: step.optional,
    timeoutMs: step.timeoutMs,
    retry: step.retry,
  }
}

const shouldIncludeStep = (step: CliConfigStep, env: NodeJS.ProcessEnv): boolean => {
  const envConditions = step.when?.env
  if (!envConditions) {
    return true
  }

  for (const [key, expectedValue] of Object.entries(envConditions)) {
    if (env[key] !== expectedValue) {
      return false
    }
  }

  return true
}
