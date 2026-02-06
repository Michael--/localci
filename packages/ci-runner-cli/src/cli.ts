#!/usr/bin/env node

import { getCliHelpText, parseCliOptions } from './cliOptions.js'
import { runCliPipeline } from './runPipeline.js'

const run = async (): Promise<void> => {
  const options = parseCliOptions(process.argv.slice(2), process.cwd())

  if (options.help) {
    process.stdout.write(`${getCliHelpText()}\n`)
    process.exitCode = 0
    return
  }

  const exitCode = await runCliPipeline(options)
  process.exitCode = exitCode
}

void run().catch((error: unknown) => {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
})
