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
  /** Steps excluded from execution with reason metadata. */
  readonly excludedSteps: readonly ExcludedPipelineStep[]
  /** Base working directory for step execution. */
  readonly cwd: string
  /** Base environment for step execution. */
  readonly env: NodeJS.ProcessEnv
  /** Continue after hard failures when true. */
  readonly continueOnError: boolean
}

/**
 * Exclusion metadata for one configured step.
 */
export interface ExcludedPipelineStep {
  /** Stable step id. */
  readonly id: string
  /** Display name shown in output. */
  readonly name: string
  /** Machine-readable exclusion reason. */
  readonly reason: 'disabled' | 'env_mismatch'
  /** Required environment values when excluded by env mismatch. */
  readonly requiredEnv?: Readonly<Record<string, string>>
}

interface StepExclusion {
  readonly reason: ExcludedPipelineStep['reason']
  readonly requiredEnv?: Readonly<Record<string, string>>
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

  const steps: MappedPipelineStep[] = []
  const excludedSteps: ExcludedPipelineStep[] = []

  for (const step of config.steps) {
    const exclusion = getExclusion(step, env)
    if (exclusion) {
      excludedSteps.push({
        id: step.id,
        name: step.name,
        reason: exclusion.reason,
        requiredEnv: exclusion.requiredEnv,
      })
      continue
    }

    steps.push(mapStep(step, runCwd))
  }

  const continueOnError = failFast ? false : (config.continueOnError ?? true)

  return {
    steps,
    excludedSteps,
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

const getExclusion = (step: CliConfigStep, env: NodeJS.ProcessEnv): StepExclusion | null => {
  if (step.enabled === false) {
    return { reason: 'disabled' }
  }

  const envConditions = step.when?.env
  if (!envConditions) {
    return null
  }

  const missingConditions: Record<string, string> = {}

  for (const [key, expectedValue] of Object.entries(envConditions)) {
    if (env[key] !== expectedValue) {
      missingConditions[key] = expectedValue
    }
  }

  if (Object.keys(missingConditions).length > 0) {
    return {
      reason: 'env_mismatch',
      requiredEnv: missingConditions,
    }
  }

  return null
}
