/**
 * Supported output formats for the CLI.
 */
export type CliOutputFormat = 'pretty' | 'json'

/**
 * Retry behavior for a config step.
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
 * Environment-based condition map for one step.
 */
export interface CliStepCondition {
  /**
   * Exact environment variable matches required to execute a step.
   */
  readonly env?: Readonly<Record<string, string>>
}

/**
 * Watch behavior configuration for file-change reruns.
 */
export interface CiRunnerWatchConfig {
  /**
   * Optional exclusion patterns evaluated against changed paths relative to `cwd`.
   *
   * Supports:
   * - segment names (`dist`, `node_modules`)
   * - path prefixes (`packages/ci-runner-cli/generated`)
   * - glob patterns (for example `star-star-slash-star-dot-log`)
   */
  readonly exclude?: readonly string[]
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
  /** Enables execution for this step when true. */
  readonly enabled?: boolean
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
 * Named target that selects a subset of steps for execution.
 */
export interface CiRunnerTarget {
  /** Stable target id used by CLI flags and integrations. */
  readonly id: string
  /** Display name shown in integrations. */
  readonly name: string
  /** Optional short details for UI rendering. */
  readonly description?: string
  /** Optional step id allow-list. */
  readonly includeStepIds?: readonly string[]
  /** Optional step id deny-list applied after include filtering. */
  readonly excludeStepIds?: readonly string[]
}

/**
 * Top-level CLI config model.
 */
export interface CiRunnerConfig {
  /** Ordered step list. */
  readonly steps: readonly CliConfigStep[]
  /** Optional named subsets that can be selected via CLI/UI. */
  readonly targets?: readonly CiRunnerTarget[]
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
  /** Watch-mode options for rerun filtering. */
  readonly watch?: CiRunnerWatchConfig
}
