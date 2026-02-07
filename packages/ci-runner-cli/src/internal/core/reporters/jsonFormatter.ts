import type { PipelineRunResult } from '../contracts/run.js'

/**
 * Formats pipeline result data as JSON output.
 *
 * @param result Pipeline run result.
 * @param indentation Number of spaces used for indentation.
 * @returns JSON representation.
 */
export const formatPipelineResultAsJson = (result: PipelineRunResult, indentation = 2): string => {
  return JSON.stringify(result, null, indentation)
}
