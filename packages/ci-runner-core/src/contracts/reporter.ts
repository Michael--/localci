import type { PipelineRunResult } from './run.js'
import type { PipelineStep, StepResult } from './step.js'

/**
 * Event hooks for pipeline run reporting.
 */
export interface PipelineReporter {
  /**
   * Called once before any step execution starts.
   *
   * @param steps Steps scheduled for execution.
   */
  onPipelineStart?(steps: readonly PipelineStep[]): Promise<void> | void

  /**
   * Called before a single step starts.
   *
   * @param step Step definition.
   * @param index Zero-based step index.
   */
  onStepStart?(step: PipelineStep, index: number): Promise<void> | void

  /**
   * Called after a step completes.
   *
   * @param result Step execution result.
   * @param index Zero-based step index.
   */
  onStepComplete?(result: StepResult, index: number): Promise<void> | void

  /**
   * Called once after the pipeline completes.
   *
   * @param result Pipeline run result.
   */
  onPipelineComplete?(result: PipelineRunResult): Promise<void> | void
}
