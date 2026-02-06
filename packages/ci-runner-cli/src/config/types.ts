import type { StepRetryPolicy } from '@localci/ci-runner-core'

/**
 * Supported output formats for the CLI.
 */
export type CliOutputFormat = 'pretty' | 'json'

/**
 * Environment-based condition map for one step.
 */
export interface CliStepCondition {
  /**
   * Exact environment variable matches required to execute a step.
   */
  readonly env?: Readonly<Record<string, string>>
}

/**
 * User-facing step definition loaded from config.
 */
export interface CliConfigStep {
  /** Stable step id. */
  readonly id: string
  /** Display name shown in output. */
  readonly name: string
  /** Shell command to execute. */
  readonly command: string
  /** Relative or absolute working directory for this step. */
  readonly cwd?: string
  /** Environment additions for this step. */
  readonly env?: Readonly<Record<string, string>>
  /** Optional failure policy. */
  readonly optional?: boolean
  /** Step timeout in milliseconds. */
  readonly timeoutMs?: number
  /** Retry policy for this step. */
  readonly retry?: StepRetryPolicy
  /** Optional execution condition. */
  readonly when?: CliStepCondition
}

/**
 * Top-level CLI config model.
 */
export interface CiRunnerConfig {
  /** Ordered step list. */
  readonly steps: readonly CliConfigStep[]
  /** Continue running after hard failures when true. */
  readonly continueOnError?: boolean
  /** Base environment merged into all steps. */
  readonly env?: Readonly<Record<string, string>>
  /** Relative or absolute working directory for the whole pipeline. */
  readonly cwd?: string
  /** Default output behavior from config. */
  readonly output?: {
    /** Preferred output format. */
    readonly format?: CliOutputFormat
    /** Emits all step output on success when true. */
    readonly verbose?: boolean
  }
}
