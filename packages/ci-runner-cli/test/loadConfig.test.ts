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
})
