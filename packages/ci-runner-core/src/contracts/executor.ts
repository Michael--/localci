import type { StepExecutionOutput } from './step.js'

/**
 * Input contract for command execution.
 */
export interface CommandExecutionRequest {
  /** Shell command to execute. */
  readonly command: string
  /** Working directory used for this process. */
  readonly cwd: string
  /** Environment variables merged for this process. */
  readonly env: NodeJS.ProcessEnv
  /** Optional process timeout in milliseconds. */
  readonly timeoutMs?: number
}

/**
 * Output contract from one command execution.
 */
export interface CommandExecutionResult extends StepExecutionOutput {
  /** True when command reached timeout handling path. */
  readonly timedOut: boolean
  /** Total command duration in milliseconds. */
  readonly durationMs: number
  /** True when command completed successfully. */
  readonly successful: boolean
  /** Original error object for spawn-level failures. */
  readonly error?: unknown
}

/**
 * Asynchronous abstraction for command execution.
 *
 * @param request Execution input data.
 * @returns Command execution result.
 */
export type CommandExecutor = (request: CommandExecutionRequest) => Promise<CommandExecutionResult>
