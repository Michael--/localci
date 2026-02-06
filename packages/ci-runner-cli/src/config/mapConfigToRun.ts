import { resolve } from 'node:path'

import type { PipelineRunOptions, PipelineStep } from '@localci/ci-runner-core'

import type { CiRunnerConfig, CliConfigStep } from './types.js'

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
): Pick<PipelineRunOptions, 'steps' | 'cwd' | 'env' | 'continueOnError'> => {
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

const mapStep = (step: CliConfigStep, runCwd: string): PipelineStep => {
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
