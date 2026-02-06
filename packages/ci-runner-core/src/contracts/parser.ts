import type { PipelineStep, StepExecutionOutput } from './step.js'

/**
 * Structured metric extracted from raw command output.
 */
export interface ParsedStepMetrics {
  /** Human-readable metric label. */
  readonly label: string
  /** Numeric or textual metric value. */
  readonly value: number | string
}

/**
 * Parser contract for tool-specific output extraction.
 */
export interface StepOutputParser {
  /** Stable parser identifier. */
  readonly id: string

  /**
   * Checks whether this parser supports a step.
   *
   * @param step Step definition.
   * @returns True when parser can parse this step output.
   */
  matches(step: PipelineStep): boolean

  /**
   * Parses structured metrics from command output.
   *
   * @param output Captured process output.
   * @returns Parsed metric or null when no metric could be extracted.
   */
  parse(output: StepExecutionOutput): ParsedStepMetrics | null
}

/**
 * Resolution interface for parser lookup and execution.
 */
export interface StepParserResolver {
  /**
   * Parses output for a step using the first matching parser.
   *
   * @param step Step definition.
   * @param output Captured process output.
   * @returns Parsed metric or null.
   */
  parse(step: PipelineStep, output: StepExecutionOutput): ParsedStepMetrics | null
}
