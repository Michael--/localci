import type { ParsedStepMetrics } from './parser.js'

/**
 * Terminal status of a pipeline step.
 */
export type StepStatus = 'passed' | 'failed' | 'skipped' | 'timed_out'

/**
 * Failure or skip reason assigned to a step result.
 */
export type StepResultReason = 'command_failed' | 'command_timeout' | 'optional_step_failed'

/**
 * Retry behavior for a step.
 */
export interface StepRetryPolicy {
  /** Maximum execution attempts including the first run. */
  readonly maxAttempts: number
  /** Delay between retry attempts in milliseconds. */
  readonly delayMs?: number
  /** When true, retries are also allowed after timeout failures. */
  readonly retryOnTimeout?: boolean
}

/**
 * Immutable definition of one runnable CI step.
 */
export interface PipelineStep {
  /** Stable machine identifier for programmatic usage. */
  readonly id: string
  /** Human readable label used in logs and summaries. */
  readonly name: string
  /** Shell command executed for this step. */
  readonly command: string
  /** Optional working directory override. */
  readonly cwd?: string
  /** Optional environment override merged with process env. */
  readonly env?: Readonly<Record<string, string>>
  /** Optional steps become skipped when execution fails. */
  readonly optional?: boolean
  /** Optional timeout in milliseconds for one attempt. */
  readonly timeoutMs?: number
  /** Retry policy for transient failures. */
  readonly retry?: StepRetryPolicy
}

/**
 * Captured process output data for one execution attempt.
 */
export interface StepExecutionOutput {
  /** Exit code returned by the process, or null when unavailable. */
  readonly exitCode: number | null
  /** Termination signal if process ended by signal. */
  readonly signal: NodeJS.Signals | null
  /** Captured stdout content. */
  readonly stdout: string
  /** Captured stderr content. */
  readonly stderr: string
}

/**
 * Result object returned for each completed pipeline step.
 */
export interface StepResult {
  /** Step identifier copied from the step definition. */
  readonly id: string
  /** Step display name copied from the step definition. */
  readonly name: string
  /** Final status after retries and optional handling. */
  readonly status: StepStatus
  /** Final reason for non-success outcomes. */
  readonly reason?: StepResultReason
  /** Number of attempts executed for this step. */
  readonly attempts: number
  /** Indicates whether at least one retry happened. */
  readonly retried: boolean
  /** Step start timestamp in Unix milliseconds. */
  readonly startedAt: number
  /** Step finish timestamp in Unix milliseconds. */
  readonly finishedAt: number
  /** Total step duration in milliseconds. */
  readonly durationMs: number
  /** Captured process output from the last execution attempt. */
  readonly output: StepExecutionOutput
  /** Optional structured metrics parsed from process output. */
  readonly metrics: ParsedStepMetrics | null
}
