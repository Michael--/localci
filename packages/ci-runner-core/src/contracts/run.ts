import type { CommandExecutor } from './executor.js'
import type { StepParserResolver } from './parser.js'
import type { PipelineReporter } from './reporter.js'
import type { PipelineStep, StepResult } from './step.js'

/**
 * Summary counts for one pipeline run.
 */
export interface PipelineSummary {
  /** Total number of executed steps. */
  readonly total: number
  /** Number of passed steps. */
  readonly passed: number
  /** Number of failed steps. */
  readonly failed: number
  /** Number of skipped steps. */
  readonly skipped: number
  /** Number of timed out steps. */
  readonly timedOut: number
  /** Total pipeline runtime in milliseconds. */
  readonly durationMs: number
}

/**
 * Final pipeline run data.
 */
export interface PipelineRunResult {
  /** Ordered list of step results. */
  readonly steps: readonly StepResult[]
  /** Aggregated status summary. */
  readonly summary: PipelineSummary
  /** Process-style exit code derived from result state. */
  readonly exitCode: 0 | 1
  /** Run start timestamp in Unix milliseconds. */
  readonly startedAt: number
  /** Run finish timestamp in Unix milliseconds. */
  readonly finishedAt: number
}

/**
 * Runtime options used by the pipeline runner.
 */
export interface PipelineRunOptions {
  /** Steps to execute in order. */
  readonly steps: readonly PipelineStep[]
  /** Command executor implementation. */
  readonly executor: CommandExecutor
  /** Optional reporters for lifecycle hooks. */
  readonly reporters?: readonly PipelineReporter[]
  /** Optional parser resolver for tool-specific metrics. */
  readonly parserResolver?: StepParserResolver
  /** Default working directory when steps do not provide one. */
  readonly cwd?: string
  /** Base environment merged into each step execution. */
  readonly env?: NodeJS.ProcessEnv
  /** Continue after non-optional failures when true. */
  readonly continueOnError?: boolean
  /** Time source injection for deterministic tests. */
  readonly now?: () => number
  /** Sleep function injection for deterministic retry tests. */
  readonly sleep?: (durationMs: number) => Promise<void>
}
