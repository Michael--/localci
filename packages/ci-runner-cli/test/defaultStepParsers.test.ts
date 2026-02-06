import {
  StepParserRegistry,
  type PipelineStep,
  type StepExecutionOutput,
} from '@localci/ci-runner-core'
import { describe, expect, it } from 'vitest'

import { createDefaultStepParsers } from '../src/parsers/defaultStepParsers.js'

const createOutput = (stdout: string): StepExecutionOutput => {
  return {
    exitCode: 0,
    signal: null,
    stdout,
    stderr: '',
  }
}

describe('createDefaultStepParsers', () => {
  it('extracts vitest summary metrics', () => {
    const registry = new StepParserRegistry(createDefaultStepParsers())
    const step: PipelineStep = {
      id: 'vitest',
      name: 'Vitest Unit Tests',
      command: 'pnpm vitest run',
    }

    const output = createOutput('Tests  9 passed (9)')
    const parsed = registry.parse(step, output)

    expect(parsed).toEqual({
      label: 'tests_passed',
      value: 9,
    })
  })

  it('extracts playwright summary metrics', () => {
    const registry = new StepParserRegistry(createDefaultStepParsers())
    const step: PipelineStep = {
      id: 'playwright-e2e',
      name: 'Playwright E2E',
      command: 'pnpm playwright test',
    }

    const output = createOutput('Running 3 tests using 1 worker\n  3 passed (1.2s)')
    const parsed = registry.parse(step, output)

    expect(parsed).toEqual({
      label: 'tests_passed',
      value: 3,
    })
  })

  it('extracts generic summary metrics for test steps', () => {
    const registry = new StepParserRegistry(createDefaultStepParsers())
    const step: PipelineStep = {
      id: 'unit-tests',
      name: 'Unit Tests',
      command: 'pnpm run test',
    }

    const output = createOutput('All done: 5 passed')
    const parsed = registry.parse(step, output)

    expect(parsed).toEqual({
      label: 'tests_passed',
      value: 5,
    })
  })
})
