import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import { formatPipelineResultAsJson } from '@localci/ci-runner-core'

import { runSmokePipeline } from './smokePipeline.js'

const writeLine = (line: string): void => {
  process.stdout.write(`${line}\n`)
}

const writeError = (line: string): void => {
  process.stderr.write(`${line}\n`)
}

const runCli = async (): Promise<void> => {
  const argv = new Set(process.argv.slice(2))
  const packageRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')

  const result = await runSmokePipeline({
    cwd: packageRoot,
    includeTimeoutDemo: argv.has('--timeout-demo'),
  })

  if (argv.has('--json')) {
    writeLine(formatPipelineResultAsJson(result))
  } else {
    writeLine(`Smoke pipeline finished with exit code ${result.exitCode}`)
    writeLine(
      `Summary: total=${result.summary.total}, passed=${result.summary.passed}, skipped=${result.summary.skipped}, failed=${result.summary.failed}, timedOut=${result.summary.timedOut}`
    )
  }

  process.exitCode = result.exitCode
}

void runCli().catch((error: unknown) => {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  writeError(message)
  process.exitCode = 1
})
