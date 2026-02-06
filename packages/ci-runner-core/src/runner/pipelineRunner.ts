import type { CommandExecutionResult } from '../contracts/executor.js'
import type { PipelineRunOptions, PipelineRunResult, PipelineSummary } from '../contracts/run.js'
import type { PipelineStep, StepResult, StepResultReason, StepStatus } from '../contracts/step.js'

/**
 * Pipeline execution engine for sequential CI step orchestration.
 */
export class PipelineRunner {
  private readonly options: Required<
    Pick<PipelineRunOptions, 'continueOnError' | 'now' | 'sleep'>
  > &
    Omit<PipelineRunOptions, 'continueOnError' | 'now' | 'sleep'>

  /**
   * Creates a pipeline runner.
   *
   * @param options Runtime options.
   */
  public constructor(options: PipelineRunOptions) {
    this.options = {
      ...options,
      continueOnError: options.continueOnError ?? true,
      now: options.now ?? Date.now,
      sleep:
        options.sleep ??
        ((durationMs: number): Promise<void> => {
          return new Promise((resolve) => {
            setTimeout(resolve, durationMs)
          })
        }),
    }
  }

  /**
   * Executes all configured pipeline steps.
   *
   * @returns Final pipeline result.
   */
  public async run(): Promise<PipelineRunResult> {
    const runStartedAt = this.options.now()
    const stepResults: StepResult[] = []

    await this.emitPipelineStart()

    for (const [index, step] of this.options.steps.entries()) {
      await this.emitStepStart(step, index)

      const stepResult = await this.executeStep(step)
      stepResults.push(stepResult)

      await this.emitStepComplete(stepResult, index)

      const isHardFailure = stepResult.status === 'failed' || stepResult.status === 'timed_out'
      if (!this.options.continueOnError && isHardFailure) {
        break
      }
    }

    const runFinishedAt = this.options.now()
    const summary = buildSummary(stepResults, runFinishedAt - runStartedAt)
    const exitCode: 0 | 1 = summary.failed > 0 || summary.timedOut > 0 ? 1 : 0

    const result: PipelineRunResult = {
      steps: stepResults,
      summary,
      exitCode,
      startedAt: runStartedAt,
      finishedAt: runFinishedAt,
    }

    await this.emitPipelineComplete(result)

    return result
  }

  private async executeStep(step: PipelineStep): Promise<StepResult> {
    const startedAt = this.options.now()
    const retryPolicy = normalizeRetryPolicy(step)
    const mergedEnv: NodeJS.ProcessEnv = { ...this.options.env, ...step.env }

    let attempts = 0
    let lastExecution: CommandExecutionResult | null = null

    while (attempts < retryPolicy.maxAttempts) {
      attempts += 1

      const execution = await this.options.executor({
        command: step.command,
        cwd: step.cwd ?? this.options.cwd ?? process.cwd(),
        env: mergedEnv,
        timeoutMs: step.timeoutMs,
      })

      lastExecution = execution

      if (execution.successful) {
        return this.buildStepResult({
          step,
          status: 'passed',
          reason: undefined,
          attempts,
          startedAt,
          output: execution,
        })
      }

      const timedOut = execution.timedOut
      const canRetryTimeout = retryPolicy.retryOnTimeout && timedOut
      const canRetryFailure = !timedOut
      const canRetry =
        attempts < retryPolicy.maxAttempts &&
        (canRetryFailure || canRetryTimeout) &&
        retryPolicy.maxAttempts > 1

      if (canRetry) {
        if (retryPolicy.delayMs > 0) {
          await this.options.sleep(retryPolicy.delayMs)
        }
        continue
      }

      return this.buildFailedResult(step, attempts, startedAt, execution)
    }

    const fallbackOutput = createFallbackExecutionResult()

    return this.buildStepResult({
      step,
      status: 'failed',
      reason: 'command_failed',
      attempts,
      startedAt,
      output: lastExecution ?? fallbackOutput,
    })
  }

  private buildFailedResult(
    step: PipelineStep,
    attempts: number,
    startedAt: number,
    output: CommandExecutionResult
  ): StepResult {
    if (step.optional) {
      return this.buildStepResult({
        step,
        status: 'skipped',
        reason: 'optional_step_failed',
        attempts,
        startedAt,
        output,
      })
    }

    if (output.timedOut) {
      return this.buildStepResult({
        step,
        status: 'timed_out',
        reason: 'command_timeout',
        attempts,
        startedAt,
        output,
      })
    }

    return this.buildStepResult({
      step,
      status: 'failed',
      reason: 'command_failed',
      attempts,
      startedAt,
      output,
    })
  }

  private buildStepResult(input: {
    step: PipelineStep
    status: StepStatus
    reason: StepResultReason | undefined
    attempts: number
    startedAt: number
    output: CommandExecutionResult
  }): StepResult {
    const finishedAt = this.options.now()
    const metrics = this.options.parserResolver?.parse(input.step, input.output) ?? null

    return {
      id: input.step.id,
      name: input.step.name,
      status: input.status,
      reason: input.reason,
      attempts: input.attempts,
      retried: input.attempts > 1,
      startedAt: input.startedAt,
      finishedAt,
      durationMs: finishedAt - input.startedAt,
      output: {
        exitCode: input.output.exitCode,
        signal: input.output.signal,
        stdout: input.output.stdout,
        stderr: input.output.stderr,
      },
      metrics,
    }
  }

  private async emitPipelineStart(): Promise<void> {
    const reporters = this.options.reporters ?? []
    for (const reporter of reporters) {
      await reporter.onPipelineStart?.(this.options.steps)
    }
  }

  private async emitStepStart(step: PipelineStep, index: number): Promise<void> {
    const reporters = this.options.reporters ?? []
    for (const reporter of reporters) {
      await reporter.onStepStart?.(step, index)
    }
  }

  private async emitStepComplete(result: StepResult, index: number): Promise<void> {
    const reporters = this.options.reporters ?? []
    for (const reporter of reporters) {
      await reporter.onStepComplete?.(result, index)
    }
  }

  private async emitPipelineComplete(result: PipelineRunResult): Promise<void> {
    const reporters = this.options.reporters ?? []
    for (const reporter of reporters) {
      await reporter.onPipelineComplete?.(result)
    }
  }
}

/**
 * Creates a pipeline runner instance.
 *
 * @param options Runtime options.
 * @returns Pipeline runner.
 */
export const createPipelineRunner = (options: PipelineRunOptions): PipelineRunner => {
  return new PipelineRunner(options)
}

const normalizeRetryPolicy = (
  step: PipelineStep
): {
  maxAttempts: number
  delayMs: number
  retryOnTimeout: boolean
} => {
  const maxAttempts = Math.max(1, step.retry?.maxAttempts ?? 1)
  const delayMs = Math.max(0, step.retry?.delayMs ?? 0)
  const retryOnTimeout = step.retry?.retryOnTimeout ?? false

  return {
    maxAttempts,
    delayMs,
    retryOnTimeout,
  }
}

const buildSummary = (stepResults: readonly StepResult[], durationMs: number): PipelineSummary => {
  const passed = stepResults.filter((result) => result.status === 'passed').length
  const failed = stepResults.filter((result) => result.status === 'failed').length
  const skipped = stepResults.filter((result) => result.status === 'skipped').length
  const timedOut = stepResults.filter((result) => result.status === 'timed_out').length

  return {
    total: stepResults.length,
    passed,
    failed,
    skipped,
    timedOut,
    durationMs,
  }
}

const createFallbackExecutionResult = (): CommandExecutionResult => {
  return {
    successful: false,
    timedOut: false,
    durationMs: 0,
    exitCode: null,
    signal: null,
    stdout: '',
    stderr: '',
  }
}
