import { spawn } from 'node:child_process'

import type {
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
      const child = spawn(request.command, {
        cwd: request.cwd,
        env,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''
      let timedOut = false
      let error: unknown
      let closed = false

      const timeoutHandle =
        typeof request.timeoutMs === 'number' && request.timeoutMs > 0
          ? setTimeout(() => {
              timedOut = true
              child.kill('SIGTERM')
            }, request.timeoutMs)
          : null

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8')
      })

      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8')
      })

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

        const durationMs = Date.now() - startedAt
        const successful = !timedOut && exitCode === 0 && error === undefined

        resolve({
          successful,
          timedOut,
          durationMs,
          exitCode,
          signal,
          stdout,
          stderr,
          error,
        })
      })
    })
  }
}
