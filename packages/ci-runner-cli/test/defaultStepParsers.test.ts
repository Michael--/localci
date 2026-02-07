import {
  StepParserRegistry,
  type PipelineStep,
  type StepExecutionOutput,
} from '../src/internal/core/index.js'
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

  it('extracts workspace task count from pnpm recursive output', () => {
    const registry = new StepParserRegistry(createDefaultStepParsers())
    const step: PipelineStep = {
      id: 'build',
      name: 'Build',
      command: 'pnpm run build',
    }

    const output = createOutput('Scope: 12 of 37 workspace projects')
    const parsed = registry.parse(step, output)

    expect(parsed).toEqual({
      label: 'tasks',
      value: 12,
    })
  })

  it('extracts workspace task count from pnpm scope output with all prefix', () => {
    const registry = new StepParserRegistry(createDefaultStepParsers())
    const step: PipelineStep = {
      id: 'lint',
      name: 'Lint',
      command: 'pnpm -r --if-present run lint',
    }

    const output = createOutput('Scope: all 25 workspace projects')
    const parsed = registry.parse(step, output)

    expect(parsed).toEqual({
      label: 'tasks',
      value: 25,
    })
  })

  it('extracts workspace task count from turbo output', () => {
    const registry = new StepParserRegistry(createDefaultStepParsers())
    const step: PipelineStep = {
      id: 'build',
      name: 'Build',
      command: 'turbo run build',
    }

    const output = createOutput('Tasks:    5 successful, 5 total')
    const parsed = registry.parse(step, output)

    expect(parsed).toEqual({
      label: 'tasks',
      value: 5,
    })
  })

  it('falls back to counting unique pnpm task headers when scope line is missing', () => {
    const registry = new StepParserRegistry(createDefaultStepParsers())
    const step: PipelineStep = {
      id: 'gen',
      name: 'Generate',
      command: 'pnpm -r --if-present run gen',
    }

    const output = createOutput(
      [
        'apps/service-a gen$ pnpm -C ../../packages/proto gen',
        '│ generating...',
        'apps/service-b gen$ pnpm -C ../../packages/proto gen',
        '│ generating...',
        'apps/service-a gen$ pnpm -C ../../packages/proto gen',
      ].join('\n')
    )
    const parsed = registry.parse(step, output)

    expect(parsed).toEqual({
      label: 'tasks',
      value: 2,
    })
  })

  it('extracts pnpm scope metric from a real-world multiline workspace output', () => {
    const registry = new StepParserRegistry(createDefaultStepParsers())
    const step: PipelineStep = {
      id: 'generate',
      name: 'Generate',
      command: 'pnpm run gen',
    }

    const output = createOutput(
      [
        '> modular-runtime@0.0.1 gen /repo/modular-runtime',
        '> pnpm -r --if-present run gen',
        '',
        'Scope: 25 of 26 workspace projects',
        'apps/calculator-client-cpp gen$ pnpm -C ../../packages/proto gen',
        'apps/calculator-client-rust gen$ pnpm -C ../../packages/proto gen',
        'apps/calculator-server-rust gen$ pnpm -C ../../packages/proto gen',
      ].join('\n')
    )
    const parsed = registry.parse(step, output)

    expect(parsed).toEqual({
      label: 'tasks',
      value: 25,
    })
  })
})
