import type { ParsedStepMetrics, StepOutputParser } from '../internal/core/index.js'

/**
 * Creates default parsers for common test outputs.
 *
 * @returns Parser list.
 */
export const createDefaultStepParsers = (): readonly StepOutputParser[] => {
  return [
    {
      id: 'vitest-summary-parser',
      matches: (step): boolean => {
        return stepContainsKeyword(step, 'vitest')
      },
      parse: (output): ParsedStepMetrics | null => {
        const cleanOutput = stripAnsi(`${output.stdout}\n${output.stderr}`)
        const vitestMatch = cleanOutput.match(/\bTests?\s+(\d+)\s+passed\b/i)
        if (!vitestMatch) {
          return null
        }

        return {
          label: 'tests_passed',
          value: Number(vitestMatch[1]),
        }
      },
    },
    {
      id: 'playwright-summary-parser',
      matches: (step): boolean => {
        return stepContainsKeyword(step, 'playwright') || stepContainsKeyword(step, 'e2e')
      },
      parse: (output): ParsedStepMetrics | null => {
        const cleanOutput = stripAnsi(`${output.stdout}\n${output.stderr}`)
        const playwrightMatch = cleanOutput.match(/^\s*(\d+)\s+passed(?:\s|\()/im)
        if (!playwrightMatch) {
          return null
        }

        return {
          label: 'tests_passed',
          value: Number(playwrightMatch[1]),
        }
      },
    },
    {
      id: 'generic-tests-parser',
      matches: (step): boolean => {
        return stepContainsKeyword(step, 'test')
      },
      parse: (output): ParsedStepMetrics | null => {
        const cleanOutput = stripAnsi(`${output.stdout}\n${output.stderr}`)
        const genericMatch = cleanOutput.match(/(^|\s)(\d+)\s+passed(\s|$)/i)
        if (!genericMatch) {
          return null
        }

        return {
          label: 'tests_passed',
          value: Number(genericMatch[2]),
        }
      },
    },
  ]
}

const stepContainsKeyword = (
  step: {
    readonly id: string
    readonly name: string
    readonly command: string
  },
  keyword: string
): boolean => {
  const source = `${step.id} ${step.name} ${step.command}`.toLowerCase()
  return source.includes(keyword)
}

const stripAnsi = (text: string): string => {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '')
}
