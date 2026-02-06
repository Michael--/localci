import type { ParsedStepMetrics, StepOutputParser } from '@localci/ci-runner-core'

/**
 * Creates default parsers for common test outputs.
 *
 * @returns Parser list.
 */
export const createDefaultStepParsers = (): readonly StepOutputParser[] => {
  return [
    {
      id: 'default-tests-parser',
      matches: (step): boolean => {
        const name = `${step.id} ${step.name}`.toLowerCase()
        return name.includes('test')
      },
      parse: (output): ParsedStepMetrics | null => {
        const cleanOutput = stripAnsi(`${output.stdout}\n${output.stderr}`)
        const vitestMatch = cleanOutput.match(/Tests\s+(\d+)\s+passed/i)
        if (vitestMatch) {
          return {
            label: 'tests_passed',
            value: Number(vitestMatch[1]),
          }
        }

        const genericMatch = cleanOutput.match(/(^|\s)(\d+)\s+passed(\s|$)/i)
        if (genericMatch) {
          return {
            label: 'tests_passed',
            value: Number(genericMatch[2]),
          }
        }

        return null
      },
    },
  ]
}

const stripAnsi = (text: string): string => {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, '')
}
