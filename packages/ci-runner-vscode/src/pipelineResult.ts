/**
 * Aggregated summary values for one pipeline run.
 */
export interface PipelineSummary {
  /** Total executed steps. */
  readonly total: number
  /** Number of passed steps. */
  readonly passed: number
  /** Number of failed steps. */
  readonly failed: number
  /** Number of skipped steps. */
  readonly skipped: number
  /** Number of timed out steps. */
  readonly timedOut: number
  /** Total run duration in milliseconds. */
  readonly durationMs: number
}

/**
 * Result details for one executed pipeline step.
 */
export interface PipelineStepResult {
  /** Display label of the step. */
  readonly name: string
  /** Final status of the step execution. */
  readonly status: 'passed' | 'failed' | 'skipped' | 'timed_out'
  /** Optional non-success reason. */
  readonly reason?: string
  /** Duration in milliseconds for the final step attempt. */
  readonly durationMs: number
}

/**
 * Subset of pipeline run data required by the extension UI.
 */
export interface PipelineRunResult {
  /** Aggregated summary values. */
  readonly summary: PipelineSummary
  /** Ordered list of step outcomes. */
  readonly steps: readonly PipelineStepResult[]
  /** Process-style run exit code. */
  readonly exitCode: 0 | 1
  /** Unix timestamp for run completion. */
  readonly finishedAt: number
}

/**
 * Safely parses unknown JSON data into a pipeline run result.
 *
 * @param value Unknown parsed JSON value.
 * @returns Valid pipeline run result, or null when shape is invalid.
 */
export const parsePipelineRunResult = (value: unknown): PipelineRunResult | null => {
  if (!isRecord(value)) {
    return null
  }

  const summaryValue = value.summary
  if (!isRecord(summaryValue)) {
    return null
  }

  const summary = parseSummary(summaryValue)
  if (!summary) {
    return null
  }

  const stepsValue = value.steps
  if (!Array.isArray(stepsValue)) {
    return null
  }

  const steps = stepsValue.map((entry) => parseStep(entry))
  if (steps.some((entry) => entry === null)) {
    return null
  }

  const exitCodeValue = value.exitCode
  if (exitCodeValue !== 0 && exitCodeValue !== 1) {
    return null
  }

  const finishedAtValue = value.finishedAt
  if (typeof finishedAtValue !== 'number' || Number.isNaN(finishedAtValue)) {
    return null
  }

  return {
    summary,
    steps: steps.filter((entry): entry is PipelineStepResult => entry !== null),
    exitCode: exitCodeValue,
    finishedAt: finishedAtValue,
  }
}

const parseStep = (value: unknown): PipelineStepResult | null => {
  if (!isRecord(value)) {
    return null
  }

  const name = value.name
  if (typeof name !== 'string' || name.length === 0) {
    return null
  }

  const status = value.status
  if (
    status !== 'passed' &&
    status !== 'failed' &&
    status !== 'skipped' &&
    status !== 'timed_out'
  ) {
    return null
  }

  const durationMs = parseNumber(value.durationMs)
  if (durationMs === null) {
    return null
  }

  const reason = value.reason
  if (reason !== undefined && typeof reason !== 'string') {
    return null
  }

  return {
    name,
    status,
    reason,
    durationMs,
  }
}

const parseSummary = (value: Readonly<Record<string, unknown>>): PipelineSummary | null => {
  const total = parseNumber(value.total)
  const passed = parseNumber(value.passed)
  const failed = parseNumber(value.failed)
  const skipped = parseNumber(value.skipped)
  const timedOut = parseNumber(value.timedOut)
  const durationMs = parseNumber(value.durationMs)

  if (
    total === null ||
    passed === null ||
    failed === null ||
    skipped === null ||
    timedOut === null ||
    durationMs === null
  ) {
    return null
  }

  return {
    total,
    passed,
    failed,
    skipped,
    timedOut,
    durationMs,
  }
}

const parseNumber = (value: unknown): number | null => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null
  }

  return value
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => {
  return typeof value === 'object' && value !== null
}
