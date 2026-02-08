import { describe, expect, it } from 'vitest'

import { createWatchIgnoreMatcher, normalizeWatchPath } from '../src/watch/watchIgnoreMatcher.js'

describe('createWatchIgnoreMatcher', () => {
  it('ignores generated build artifacts from nested dist folders', () => {
    const shouldIgnore = createWatchIgnoreMatcher()

    expect(shouldIgnore('packages/ci-runner-cli/dist/cli.js')).toBe(true)
    expect(shouldIgnore('packages/ci-runner-cli/dist/config/loadConfig.d.ts')).toBe(true)
  })

  it('ignores nested node_modules and vite temp paths', () => {
    const shouldIgnore = createWatchIgnoreMatcher()

    expect(shouldIgnore('packages/ci-runner-cli/node_modules/.vite-temp/config.mjs')).toBe(true)
    expect(shouldIgnore('apps/web/node_modules/react/index.js')).toBe(true)
  })

  it('ignores ts build info files outside ignored directories', () => {
    const shouldIgnore = createWatchIgnoreMatcher()

    expect(shouldIgnore('packages/ci-runner-cli/.tsbuildinfo')).toBe(true)
    expect(shouldIgnore('packages/ci-runner-cli/.tsbuildinfo.build')).toBe(true)
  })

  it('does not ignore regular source file changes', () => {
    const shouldIgnore = createWatchIgnoreMatcher()

    expect(shouldIgnore('packages/ci-runner-cli/src/runPipeline.ts')).toBe(false)
  })

  it('supports custom excludes for path prefixes', () => {
    const shouldIgnore = createWatchIgnoreMatcher(['packages/ci-runner-cli/generated'])

    expect(shouldIgnore('packages/ci-runner-cli/generated/file.txt')).toBe(true)
    expect(shouldIgnore('packages/ci-runner-cli/src/generated-helper.ts')).toBe(false)
  })

  it('supports custom excludes for segment names', () => {
    const shouldIgnore = createWatchIgnoreMatcher(['fixtures'])

    expect(shouldIgnore('packages/ci-runner-cli/test/fixtures/sample.json')).toBe(true)
    expect(shouldIgnore('packages/ci-runner-cli/test/smoke/sample.json')).toBe(false)
  })

  it('supports custom excludes using glob syntax', () => {
    const shouldIgnore = createWatchIgnoreMatcher(['**/*.log', 'packages/*/tmp/**'])

    expect(shouldIgnore('packages/ci-runner-cli/tmp/output.txt')).toBe(true)
    expect(shouldIgnore('packages/ci-runner-cli/logs/dev.log')).toBe(true)
    expect(shouldIgnore('packages/ci-runner-cli/src/output.txt')).toBe(false)
  })
})

describe('normalizeWatchPath', () => {
  it('normalizes windows separators for matching', () => {
    expect(normalizeWatchPath('packages\\ci-runner-cli\\dist\\cli.js')).toBe(
      'packages/ci-runner-cli/dist/cli.js'
    )
  })
})
