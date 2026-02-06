import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  createNodeCommandExecutor,
  createPipelineRunner,
  StepParserRegistry,
  type ParsedStepMetrics,
  type PipelineRunResult,
  type PipelineStep,
  type StepOutputParser,
} from '@localci/ci-runner-core'

/**
 * Runtime options for the smoke pipeline run.
 */
export interface SmokePipelineRunOptions {
  /** Absolute path to the smoke project root. */
  readonly cwd: string
  /** Includes an intentionally failing timeout step when true. */
  readonly includeTimeoutDemo?: boolean
}

/**
 * Creates the ordered smoke pipeline step definitions.
 *
 * @param options Runtime options.
 * @returns Immutable list of pipeline steps.
 */
export const createSmokeSteps = (options: SmokePipelineRunOptions): readonly PipelineStep[] => {
  const stubsDirectory = resolve(options.cwd, 'stubs')

  const steps: PipelineStep[] = [
    {
      id: 'prepare',
      name: 'Prepare',
      command: 'node prepare-step.cjs',
      cwd: stubsDirectory,
    },
    {
      id: 'unit-tests',
      name: 'Unit Tests',
      command: 'node unit-tests-step.cjs',
      cwd: stubsDirectory,
    },
    {
      id: 'optional-docs',
      name: 'Optional Docs',
      command: 'node optional-fail-step.cjs',
      cwd: stubsDirectory,
      optional: true,
    },
    {
      id: 'flaky-step',
      name: 'Flaky Step',
      command: 'node flaky-step.cjs ../.tmp/flaky-attempt.txt',
      cwd: stubsDirectory,
      retry: {
        maxAttempts: 2,
        delayMs: 0,
      },
    },
  ]

  if (options.includeTimeoutDemo) {
    steps.push({
      id: 'timeout-demo',
      name: 'Timeout Demo',
      command: 'node slow-step.cjs 400',
      cwd: stubsDirectory,
      timeoutMs: 100,
    })
  }

  return steps
}

/**
 * Runs the smoke pipeline against local stub commands.
 *
 * @param options Runtime options.
 * @returns Pipeline run result.
 */
export const runSmokePipeline = async (
  options: SmokePipelineRunOptions
): Promise<PipelineRunResult> => {
  await rm(resolve(options.cwd, '.tmp'), { recursive: true, force: true })

  const parserRegistry = new StepParserRegistry([createUnitTestParser()])

  const runner = createPipelineRunner({
    steps: createSmokeSteps(options),
    cwd: options.cwd,
    executor: createNodeCommandExecutor(),
    parserResolver: parserRegistry,
    continueOnError: true,
  })

  return await runner.run()
}

const createUnitTestParser = (): StepOutputParser => {
  return {
    id: 'stub-unit-test-parser',
    matches: (step): boolean => step.id === 'unit-tests',
    parse: (output): ParsedStepMetrics | null => {
      const combinedOutput = `${output.stdout}\n${output.stderr}`
      const testCountMatch = combinedOutput.match(/TESTS_PASSED=(\d+)/)
      if (!testCountMatch) {
        return null
      }

      return {
        label: 'tests_passed',
        value: Number(testCountMatch[1]),
      }
    },
  }
}
