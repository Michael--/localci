import { spawn, type ChildProcess } from 'node:child_process'

import type {
  CommandTermination,
  CommandExecutionRequest,
  CommandExecutionResult,
  CommandExecutor,
} from '../contracts/executor.js'

/**
 * Creates a Node.js shell command executor.
 *
 * @returns Command executor implementation.
 */
export const createNodeCommandExecutor = (): CommandExecutor => {
  return async (request: CommandExecutionRequest): Promise<CommandExecutionResult> => {
    const startedAt = Date.now()

    return await new Promise<CommandExecutionResult>((resolve) => {
      const env: NodeJS.ProcessEnv = { ...process.env, ...request.env }
      const child = createChildProcess(request.command, request.pipefail, request.cwd, env)

      let stdout = ''
      let stderr = ''
      let outputTruncated = false
      let timedOut = false
      let error: unknown
      let closed = false
      let forceKillHandle: NodeJS.Timeout | null = null

      const timeoutHandle =
        typeof request.timeoutMs === 'number' && request.timeoutMs > 0
          ? setTimeout(() => {
              timedOut = true
              terminateProcessTree(child, 'SIGTERM')
              forceKillHandle = setTimeout(() => {
                terminateProcessTree(child, 'SIGKILL')
              }, 5000)
            }, request.timeoutMs)
          : null

      if (child.stdout) {
        child.stdout.on('data', (chunk: Buffer) => {
          const captured = captureChunk(
            stdout,
            chunk,
            request.captureOutput,
            request.maxOutputBytes
          )
          stdout = captured.output
          outputTruncated ||= captured.truncated
        })
      }

      if (child.stderr) {
        child.stderr.on('data', (chunk: Buffer) => {
          const captured = captureChunk(
            stderr,
            chunk,
            request.captureOutput,
            request.maxOutputBytes
          )
          stderr = captured.output
          outputTruncated ||= captured.truncated
        })
      }

      child.on('error', (spawnError: Error) => {
        error = spawnError
      })

      child.on('close', (exitCode: number | null, signal: NodeJS.Signals | null) => {
        if (closed) {
          return
        }

        closed = true
        if (timeoutHandle) {
          clearTimeout(timeoutHandle)
        }
        if (forceKillHandle) {
          clearTimeout(forceKillHandle)
        }

        const durationMs = Date.now() - startedAt
        const termination = createTermination(timedOut, exitCode, signal, error)
        const successful = termination.kind === 'succeeded'

        resolve({
          successful,
          timedOut,
          durationMs,
          exitCode,
          signal,
          termination,
          stdout,
          stderr,
          outputTruncated,
          error,
        })
      })
    })
  }
}

const createChildProcess = (
  command: string,
  pipefail: boolean | undefined,
  cwd: string,
  env: NodeJS.ProcessEnv
): ChildProcess => {
  const options = {
    cwd,
    env,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'] as ['ignore', 'pipe', 'pipe'],
  }

  if (pipefail) {
    return spawn('bash', ['-o', 'pipefail', '-c', command], options)
  }

  return spawn(command, { ...options, shell: true })
}

const terminateProcessTree = (child: ChildProcess, signal: NodeJS.Signals): void => {
  if (process.platform !== 'win32' && child.pid !== undefined) {
    try {
      process.kill(-child.pid, signal)
      return
    } catch {
      // Fall back to signalling the shell process when its group is unavailable.
    }
  }

  child.kill(signal)
}

const captureChunk = (
  output: string,
  chunk: Buffer,
  captureOutput: boolean | undefined,
  maxOutputBytes: number | undefined
): { readonly output: string; readonly truncated: boolean } => {
  if (captureOutput === false) {
    return { output, truncated: false }
  }

  if (typeof maxOutputBytes !== 'number' || maxOutputBytes < 0) {
    return { output: output + chunk.toString('utf8'), truncated: false }
  }

  const remainingBytes = maxOutputBytes - Buffer.byteLength(output)
  if (remainingBytes <= 0) {
    return { output, truncated: true }
  }

  if (chunk.byteLength <= remainingBytes) {
    return { output: output + chunk.toString('utf8'), truncated: false }
  }

  return {
    output: output + chunk.subarray(0, remainingBytes).toString('utf8'),
    truncated: true,
  }
}

const createTermination = (
  timedOut: boolean,
  exitCode: number | null,
  signal: NodeJS.Signals | null,
  error: unknown
): CommandTermination => {
  if (timedOut) {
    return { kind: 'timed_out', exitCode, signal }
  }

  if (error !== undefined) {
    return {
      kind: 'spawn_failed',
      exitCode,
      signal,
      errorCode: getErrorCode(error),
    }
  }

  if (signal) {
    return { kind: 'terminated_by_signal', exitCode, signal }
  }

  if (exitCode === 0) {
    return { kind: 'succeeded', exitCode, signal }
  }

  return { kind: 'exited_nonzero', exitCode, signal }
}

const getErrorCode = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined
  }

  const code = error.code
  return typeof code === 'string' ? code : undefined
}
