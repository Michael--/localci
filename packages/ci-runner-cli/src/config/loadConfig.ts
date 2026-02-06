import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import ts from 'typescript'

import type { CiRunnerConfig, CliConfigStep } from './types.js'

/**
 * Loads and validates a ci-runner config file.
 *
 * @param cwd Base working directory.
 * @param configPath Optional explicit config file path.
 * @returns Parsed config with resolved metadata.
 * @throws Error when config cannot be loaded or is invalid.
 */
export const loadCiRunnerConfig = async (
  cwd: string,
  configPath?: string
): Promise<{ config: CiRunnerConfig; configFilePath: string }> => {
  const resolvedConfigPath = await resolveConfigPath(cwd, configPath)
  if (!resolvedConfigPath) {
    throw new Error('No config file found. Expected ci.config.ts or ci.config.json')
  }

  const loadedConfig = await loadConfigByExtension(resolvedConfigPath)
  const config = parseCiRunnerConfig(loadedConfig)

  return {
    config,
    configFilePath: resolvedConfigPath,
  }
}

const resolveConfigPath = async (cwd: string, configPath?: string): Promise<string | null> => {
  if (configPath) {
    return resolve(cwd, configPath)
  }

  const candidates = [resolve(cwd, 'ci.config.ts'), resolve(cwd, 'ci.config.json')]

  for (const candidate of candidates) {
    try {
      await readFile(candidate, 'utf8')
      return candidate
    } catch {
      continue
    }
  }

  return null
}

const loadConfigByExtension = async (configFilePath: string): Promise<unknown> => {
  if (configFilePath.endsWith('.json')) {
    const content = await readFile(configFilePath, 'utf8')
    return JSON.parse(content) as unknown
  }

  if (configFilePath.endsWith('.ts')) {
    return await loadTypeScriptConfig(configFilePath)
  }

  throw new Error(`Unsupported config extension: ${configFilePath}`)
}

const loadTypeScriptConfig = async (configFilePath: string): Promise<unknown> => {
  const source = await readFile(configFilePath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: configFilePath,
    reportDiagnostics: true,
  })

  if (transpiled.diagnostics && transpiled.diagnostics.length > 0) {
    const message = ts.formatDiagnosticsWithColorAndContext(transpiled.diagnostics, {
      getCurrentDirectory: (): string => dirname(configFilePath),
      getCanonicalFileName: (fileName: string): string => fileName,
      getNewLine: (): string => '\n',
    })
    throw new Error(`Failed to transpile ${configFilePath}\n${message}`)
  }

  const tempDirectory = await mkdtemp(resolve(tmpdir(), 'ci-runner-config-'))
  const tempFilePath = resolve(tempDirectory, 'config.mjs')

  try {
    await writeFile(tempFilePath, transpiled.outputText, 'utf8')
    const moduleUrl = `${pathToFileURL(tempFilePath).href}?v=${Date.now()}`
    const loadedModule = (await import(moduleUrl)) as {
      readonly default?: unknown
      readonly config?: unknown
    }

    if (loadedModule.default !== undefined) {
      return unwrapNestedDefault(loadedModule.default)
    }

    if (loadedModule.config !== undefined) {
      return loadedModule.config
    }

    throw new Error(`Config module ${configFilePath} must export default or named "config"`)
  } finally {
    await rm(tempDirectory, { recursive: true, force: true })
  }
}

const unwrapNestedDefault = (value: unknown): unknown => {
  if (!isRecord(value)) {
    return value
  }

  if ('default' in value) {
    return value.default
  }

  return value
}

const parseCiRunnerConfig = (value: unknown): CiRunnerConfig => {
  if (!isRecord(value)) {
    throw new Error('Config must be an object')
  }

  const stepsValue = value.steps
  if (!Array.isArray(stepsValue)) {
    throw new Error('Config must provide a steps array')
  }

  const steps = stepsValue.map(parseConfigStep)

  const continueOnError = parseOptionalBoolean(value.continueOnError, 'continueOnError')
  const env = parseOptionalStringRecord(value.env, 'env')
  const cwd = parseOptionalString(value.cwd, 'cwd')

  const output = parseOutputConfig(value.output)

  return {
    steps,
    continueOnError,
    env,
    cwd,
    output,
  }
}

const parseConfigStep = (value: unknown, index: number): CliConfigStep => {
  if (!isRecord(value)) {
    throw new Error(`steps[${index}] must be an object`)
  }

  const id = parseRequiredString(value.id, `steps[${index}].id`)
  const name = parseRequiredString(value.name, `steps[${index}].name`)
  const command = parseRequiredString(value.command, `steps[${index}].command`)
  const cwd = parseOptionalString(value.cwd, `steps[${index}].cwd`)
  const env = parseOptionalStringRecord(value.env, `steps[${index}].env`)
  const optional = parseOptionalBoolean(value.optional, `steps[${index}].optional`)
  const timeoutMs = parseOptionalNumber(value.timeoutMs, `steps[${index}].timeoutMs`)
  const retry = parseOptionalRetry(value.retry, `steps[${index}].retry`)
  const when = parseOptionalCondition(value.when, `steps[${index}].when`)

  return {
    id,
    name,
    command,
    cwd,
    env,
    optional,
    timeoutMs,
    retry,
    when,
  }
}

const parseOutputConfig = (value: unknown): CiRunnerConfig['output'] | undefined => {
  if (value === undefined) {
    return undefined
  }

  if (!isRecord(value)) {
    throw new Error('output must be an object')
  }

  const format = value.format
  if (format !== undefined && format !== 'pretty' && format !== 'json') {
    throw new Error('output.format must be "pretty" or "json"')
  }

  const verbose = parseOptionalBoolean(value.verbose, 'output.verbose')

  return {
    format,
    verbose,
  }
}

const parseOptionalRetry = (value: unknown, path: string): CliConfigStep['retry'] | undefined => {
  if (value === undefined) {
    return undefined
  }

  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`)
  }

  const maxAttempts = parseRequiredNumber(value.maxAttempts, `${path}.maxAttempts`)
  const delayMs = parseOptionalNumber(value.delayMs, `${path}.delayMs`)
  const retryOnTimeout = parseOptionalBoolean(value.retryOnTimeout, `${path}.retryOnTimeout`)

  return {
    maxAttempts,
    delayMs,
    retryOnTimeout,
  }
}

const parseOptionalCondition = (
  value: unknown,
  path: string
): CliConfigStep['when'] | undefined => {
  if (value === undefined) {
    return undefined
  }

  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`)
  }

  const env = parseOptionalStringRecord(value.env, `${path}.env`)

  return {
    env,
  }
}

const parseRequiredString = (value: unknown, path: string): string => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${path} must be a non-empty string`)
  }

  return value
}

const parseRequiredNumber = (value: unknown, path: string): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`${path} must be a valid number`)
  }

  return value
}

const parseOptionalString = (value: unknown, path: string): string | undefined => {
  if (value === undefined) {
    return undefined
  }

  if (typeof value !== 'string') {
    throw new Error(`${path} must be a string`)
  }

  return value
}

const parseOptionalNumber = (value: unknown, path: string): number | undefined => {
  if (value === undefined) {
    return undefined
  }

  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`${path} must be a valid number`)
  }

  return value
}

const parseOptionalBoolean = (value: unknown, path: string): boolean | undefined => {
  if (value === undefined) {
    return undefined
  }

  if (typeof value !== 'boolean') {
    throw new Error(`${path} must be a boolean`)
  }

  return value
}

const parseOptionalStringRecord = (
  value: unknown,
  path: string
): Readonly<Record<string, string>> | undefined => {
  if (value === undefined) {
    return undefined
  }

  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`)
  }

  const entries = Object.entries(value)
  const parsed: Record<string, string> = {}

  for (const [key, entryValue] of entries) {
    if (typeof entryValue !== 'string') {
      throw new Error(`${path}.${key} must be a string`)
    }
    parsed[key] = entryValue
  }

  return parsed
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
