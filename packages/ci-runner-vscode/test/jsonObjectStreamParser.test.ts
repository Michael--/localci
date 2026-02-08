import { describe, expect, it } from 'vitest'

import { JsonObjectStreamParser } from '../src/jsonObjectStreamParser.js'
import { parsePipelineRunResult } from '../src/pipelineResult.js'

describe('JsonObjectStreamParser', () => {
  it('extracts one complete object across multiple chunks', () => {
    const parser = new JsonObjectStreamParser()

    expect(
      parser.feed(
        '{"steps":[{"name":"Lint","status":"passed","durationMs":1}],"summary":{"total":1,"passed":1,'
      )
    ).toEqual([])
    const parsed = parser.feed(
      '"failed":0,"skipped":0,"timedOut":0,"durationMs":1},"exitCode":0,"finishedAt":123}'
    )

    expect(parsed).toHaveLength(1)
    expect(parsePipelineRunResult(parsed[0])?.exitCode).toBe(0)
  })

  it('extracts multiple objects from mixed text stream', () => {
    const parser = new JsonObjectStreamParser()
    const chunk =
      'Watch mode enabled\n{"steps":[{"name":"Lint","status":"passed","durationMs":10}],"summary":{"total":1,"passed":1,"failed":0,"skipped":0,"timedOut":0,"durationMs":10},"exitCode":0,"finishedAt":11}\n' +
      'Change detected\n{"steps":[{"name":"Test","status":"failed","reason":"command_failed","durationMs":15}],"summary":{"total":2,"passed":1,"failed":1,"skipped":0,"timedOut":0,"durationMs":15},"exitCode":1,"finishedAt":12}\n'

    const parsed = parser.feed(chunk)

    expect(parsed).toHaveLength(2)
    const first = parsePipelineRunResult(parsed[0])
    const second = parsePipelineRunResult(parsed[1])

    expect(first).not.toBeNull()
    expect(first?.exitCode).toBe(0)
    expect(second).not.toBeNull()
    expect(second?.summary.failed).toBe(1)
  })

  it('ignores malformed braces in text output', () => {
    const parser = new JsonObjectStreamParser()

    const parsed = parser.feed('plain {not-json} text')

    expect(parsed).toEqual([])
  })
})

describe('parsePipelineRunResult', () => {
  it('parses a valid pipeline result', () => {
    const result = parsePipelineRunResult({
      steps: [
        {
          name: 'Lint',
          status: 'passed',
          durationMs: 120,
        },
      ],
      summary: {
        total: 3,
        passed: 2,
        failed: 1,
        skipped: 0,
        timedOut: 0,
        durationMs: 200,
      },
      exitCode: 1,
      finishedAt: 99,
    })

    expect(result).not.toBeNull()
    expect(result?.summary.total).toBe(3)
  })

  it('returns null for invalid payloads', () => {
    expect(parsePipelineRunResult({})).toBeNull()
    expect(
      parsePipelineRunResult({ steps: [], summary: {}, exitCode: 0, finishedAt: 1 })
    ).toBeNull()
    expect(
      parsePipelineRunResult({ steps: [], summary: { total: 1 }, exitCode: 0, finishedAt: 1 })
    ).toBeNull()
  })
})
