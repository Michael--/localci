import { describe, expect, it } from 'vitest'

import { getCliHelpText, parseCliOptions } from '../src/cliOptions.js'

describe('parseCliOptions', () => {
  it('parses explicit options', () => {
    const options = parseCliOptions(
      ['--config', 'ci.config.ts', '--format', 'json', '--verbose', '--watch', '--fail-fast'],
      '/repo'
    )

    expect(options).toEqual({
      cwd: '/repo',
      configPath: 'ci.config.ts',
      format: 'json',
      verbose: true,
      watch: true,
      failFast: true,
      help: false,
    })
  })

  it('supports equals syntax for config, format and cwd', () => {
    const options = parseCliOptions(
      ['--config=ci.config.json', '--format=pretty', '--cwd=apps/api'],
      '/repo'
    )

    expect(options.cwd).toBe('/repo/apps/api')
    expect(options.configPath).toBe('ci.config.json')
    expect(options.format).toBe('pretty')
  })

  it('returns help mode', () => {
    const options = parseCliOptions(['--help'], '/repo')

    expect(options.help).toBe(true)
    expect(getCliHelpText()).toContain('Usage: ci-runner')
  })

  it('throws for unknown options', () => {
    expect(() => parseCliOptions(['--unknown'], '/repo')).toThrow('Unknown argument: --unknown')
  })
})
