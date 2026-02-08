import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { loadCiRunnerConfig } from '../src/config/loadConfig.js'

const createdDirectories: string[] = []

afterEach(async () => {
  for (const directory of createdDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true })
  }
})

describe('loadCiRunnerConfig', () => {
  it('loads ci.config.json', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'ci-runner-cli-json-'))
    createdDirectories.push(directory)

    await writeFile(
      resolve(directory, 'ci.config.json'),
      JSON.stringify({
        steps: [
          {
            id: 'build',
            name: 'Build',
            command: 'pnpm run build',
            enabled: false,
          },
        ],
      }),
      'utf8'
    )

    const loaded = await loadCiRunnerConfig(directory)

    expect(loaded.config.steps).toHaveLength(1)
    expect(loaded.config.steps[0]?.id).toBe('build')
    expect(loaded.config.steps[0]?.enabled).toBe(false)
  })

  it('loads ci.config.ts default export', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'ci-runner-cli-ts-'))
    createdDirectories.push(directory)

    await writeFile(
      resolve(directory, 'ci.config.ts'),
      [
        'export default {',
        '  steps: [',
        '    { id: "lint", name: "Lint", command: "pnpm run lint" }',
        '  ]',
        '}',
      ].join('\n'),
      'utf8'
    )

    const loaded = await loadCiRunnerConfig(directory)

    expect(loaded.config.steps).toHaveLength(1)
    expect(loaded.config.steps[0]?.id).toBe('lint')
  })

  it('loads watch exclude rules from config', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'ci-runner-cli-watch-'))
    createdDirectories.push(directory)

    await writeFile(
      resolve(directory, 'ci.config.json'),
      JSON.stringify({
        watch: {
          exclude: ['dist', '**/*.log'],
        },
        steps: [
          {
            id: 'typecheck',
            name: 'Typecheck',
            command: 'pnpm run typecheck',
          },
        ],
      }),
      'utf8'
    )

    const loaded = await loadCiRunnerConfig(directory)

    expect(loaded.config.watch?.exclude).toEqual(['dist', '**/*.log'])
  })

  it('loads named targets from config', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'ci-runner-cli-targets-'))
    createdDirectories.push(directory)

    await writeFile(
      resolve(directory, 'ci.config.json'),
      JSON.stringify({
        steps: [
          {
            id: 'lint',
            name: 'Lint',
            command: 'pnpm run lint',
          },
          {
            id: 'test',
            name: 'Test',
            command: 'pnpm run test',
          },
          {
            id: 'build',
            name: 'Build',
            command: 'pnpm run build',
          },
        ],
        targets: [
          {
            id: 'quick',
            name: 'Quick Checks',
            includeStepIds: ['lint', 'test'],
          },
          {
            id: 'no-build',
            name: 'Everything Without Build',
            excludeStepIds: ['build'],
          },
        ],
      }),
      'utf8'
    )

    const loaded = await loadCiRunnerConfig(directory)

    expect(loaded.config.targets).toEqual([
      {
        id: 'quick',
        name: 'Quick Checks',
        description: undefined,
        includeStepIds: ['lint', 'test'],
        excludeStepIds: undefined,
      },
      {
        id: 'no-build',
        name: 'Everything Without Build',
        description: undefined,
        includeStepIds: undefined,
        excludeStepIds: ['build'],
      },
    ])
  })

  it('throws when target ids are duplicated', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'ci-runner-cli-targets-duplicate-'))
    createdDirectories.push(directory)

    await writeFile(
      resolve(directory, 'ci.config.json'),
      JSON.stringify({
        steps: [{ id: 'lint', name: 'Lint', command: 'pnpm run lint' }],
        targets: [
          { id: 'quick', name: 'Quick' },
          { id: 'quick', name: 'Quick Again' },
        ],
      }),
      'utf8'
    )

    await expect(loadCiRunnerConfig(directory)).rejects.toThrow(
      'targets must use unique ids (duplicate: quick)'
    )
  })

  it('throws when targets reference unknown steps', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'ci-runner-cli-targets-unknown-'))
    createdDirectories.push(directory)

    await writeFile(
      resolve(directory, 'ci.config.json'),
      JSON.stringify({
        steps: [{ id: 'lint', name: 'Lint', command: 'pnpm run lint' }],
        targets: [
          {
            id: 'quick',
            name: 'Quick',
            includeStepIds: ['lint', 'missing-step'],
          },
        ],
      }),
      'utf8'
    )

    await expect(loadCiRunnerConfig(directory)).rejects.toThrow(
      'targets[0].includeStepIds[1] references unknown step id: missing-step'
    )
  })

  it('throws for invalid watch exclude entries', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'ci-runner-cli-watch-invalid-'))
    createdDirectories.push(directory)

    await writeFile(
      resolve(directory, 'ci.config.json'),
      JSON.stringify({
        watch: {
          exclude: ['dist', 12],
        },
        steps: [
          {
            id: 'typecheck',
            name: 'Typecheck',
            command: 'pnpm run typecheck',
          },
        ],
      }),
      'utf8'
    )

    await expect(loadCiRunnerConfig(directory)).rejects.toThrow(
      'watch.exclude[1] must be a non-empty string'
    )
  })
})
