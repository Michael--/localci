import type { StepExecutionOutput } from './step.js'

/**
 * Machine-readable reason why a command execution ended.
 */
export type CommandTerminationKind =
  | 'succeeded'
  | 'exited_nonzero'
  | 'terminated_by_signal'
  | 'timed_out'
  | 'spawn_failed'

/**
 * Text-independent command termination details.
 */
export interface CommandTermination {
  /** Classification of the command completion. */
  readonly kind: CommandTerminationKind
  /** Process exit code when the process exited normally. */
  readonly exitCode: number | null
  /** Signal that ended the process, if any. */
  readonly signal: NodeJS.Signals | null
  /** Operating-system error code when process creation failed. */
  readonly errorCode?: string
}

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
  /** Disables stdout and stderr capture when false. */
  readonly captureOutput?: boolean
  /** Maximum captured stdout and stderr bytes per stream. */
  readonly maxOutputBytes?: number
}

/**
 * Output contract from one command execution.
 */
export interface CommandExecutionResult extends StepExecutionOutput {
  /** Canonical, text-independent completion details. */
  readonly termination?: CommandTermination
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
