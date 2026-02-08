import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { access, constants } from 'node:fs/promises'
import { join, relative } from 'node:path'

import * as vscode from 'vscode'

import { JsonObjectStreamParser } from './jsonObjectStreamParser.js'
import { parsePipelineRunResult, type PipelineRunResult } from './pipelineResult.js'

type RunProfile = 'standard' | 'watch' | 'fail-fast'
type RunStatus = 'idle' | 'running' | 'passed' | 'failed' | 'error'

interface ConfigEntry {
  readonly uri: vscode.Uri
  readonly workspaceFolder: vscode.WorkspaceFolder
  readonly relativePath: string
  readonly preferred: boolean
}

interface ConfigState {
  readonly status: RunStatus
  readonly profile?: RunProfile
  readonly lastResult?: PipelineRunResult
  readonly errorMessage?: string
}

interface RunningProcess {
  readonly child: ChildProcessWithoutNullStreams
  readonly profile: RunProfile
  readonly parser: JsonObjectStreamParser
  readonly runId: number
}

interface LaunchCommand {
  readonly command: string
  readonly baseArgs: readonly string[]
}

interface ConfigNode {
  readonly type: 'config'
  readonly entry: ConfigEntry
}

interface ActionNode {
  readonly type: 'action'
  readonly entry: ConfigEntry
  readonly action: 'run' | 'watch' | 'fail-fast' | 'stop-watch'
}

type TreeNode = ConfigNode | ActionNode

const CONFIG_SECTION = 'ciRunner'
const DEFAULT_CONFIG_PATH = 'defaultConfigPath'
const DEFAULT_RUN_PROFILE = 'defaultRunProfile'

class CiRunnerViewModel implements vscode.TreeDataProvider<TreeNode>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<TreeNode | undefined | null | void>()
  private readonly outputChannel = vscode.window.createOutputChannel('CI Runner')
  private readonly stateByConfig = new Map<string, ConfigState>()
  private readonly runningByConfig = new Map<string, RunningProcess>()
  private readonly terminatedRunIds = new Set<number>()
  private readonly disposables: vscode.Disposable[] = []
  private runCounter = 0

  private configs: readonly ConfigEntry[] = []

  public readonly onDidChangeTreeData = this.emitter.event

  public constructor() {
    const configWatcher = vscode.workspace.createFileSystemWatcher('**/ci.config.{json,ts}')
    this.disposables.push(
      configWatcher,
      configWatcher.onDidCreate(() => {
        void this.refresh()
      }),
      configWatcher.onDidDelete(() => {
        void this.refresh()
      }),
      configWatcher.onDidChange(() => {
        void this.refresh()
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        void this.refresh()
      }),
      vscode.workspace.onDidSaveTextDocument(() => {
        void this.refresh()
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (
          event.affectsConfiguration(`${CONFIG_SECTION}.${DEFAULT_CONFIG_PATH}`) ||
          event.affectsConfiguration(`${CONFIG_SECTION}.${DEFAULT_RUN_PROFILE}`)
        ) {
          void this.refresh()
        }
      }),
      this.outputChannel
    )
  }

  public dispose(): void {
    for (const [configKey, running] of this.runningByConfig.entries()) {
      running.child.kill('SIGTERM')
      this.runningByConfig.delete(configKey)
    }

    for (const disposable of this.disposables) {
      disposable.dispose()
    }

    this.emitter.dispose()
  }

  public async refresh(): Promise<void> {
    const detectedConfigs = await detectConfigs()
    this.configs = detectedConfigs

    const detectedKeys = new Set(detectedConfigs.map((entry) => entry.uri.toString()))
    for (const existingKey of this.stateByConfig.keys()) {
      if (!detectedKeys.has(existingKey)) {
        this.stateByConfig.delete(existingKey)
      }
    }

    this.emitter.fire(undefined)
  }

  public getTreeItem(element: TreeNode): vscode.TreeItem {
    if (element.type === 'config') {
      return this.createConfigTreeItem(element.entry)
    }

    return this.createActionTreeItem(element)
  }

  public getChildren(element?: TreeNode): readonly TreeNode[] {
    if (!element) {
      return this.configs.map((entry) => ({ type: 'config', entry }))
    }

    if (element.type === 'action') {
      return []
    }

    const actions: ActionNode[] = [
      { type: 'action', entry: element.entry, action: 'run' },
      { type: 'action', entry: element.entry, action: 'watch' },
      { type: 'action', entry: element.entry, action: 'fail-fast' },
    ]

    const state = this.stateByConfig.get(element.entry.uri.toString())
    if (state?.status === 'running' && state.profile === 'watch') {
      actions.push({ type: 'action', entry: element.entry, action: 'stop-watch' })
    }

    return actions
  }

  public async runDefaultProfile(configUri: vscode.Uri): Promise<void> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(configUri)
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('CI Runner config must be inside a workspace folder.')
      return
    }

    const profile = getDefaultRunProfile(workspaceFolder)
    await this.runConfig(configUri, profile)
  }

  public async runConfig(configUri: vscode.Uri, profile: RunProfile): Promise<void> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(configUri)
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('CI Runner config must be inside a workspace folder.')
      return
    }

    const configKey = configUri.toString()
    const relativeConfigPath = relative(workspaceFolder.uri.fsPath, configUri.fsPath)
    const launch = await resolveCliLaunch(workspaceFolder)
    const baseArgs = [
      ...launch.baseArgs,
      '--config',
      relativeConfigPath,
      '--cwd',
      workspaceFolder.uri.fsPath,
      '--format',
      'json',
    ]
    const profileArgs =
      profile === 'watch' ? ['--watch'] : profile === 'fail-fast' ? ['--fail-fast'] : []
    const args = [...baseArgs, ...profileArgs]

    if (this.runningByConfig.has(configKey)) {
      this.stopConfigInternal(configKey, 'Restarting existing run.')
    }

    this.outputChannel.show(true)
    this.outputChannel.appendLine(
      `\n[${new Date().toISOString()}] ${workspaceFolder.name}: ${relativeConfigPath} (${profile})`
    )
    this.outputChannel.appendLine(`$ ${formatShellCommand(launch.command, args)}`)

    const childProcess = spawn(launch.command, args, {
      cwd: workspaceFolder.uri.fsPath,
      env: processEnv(),
      stdio: 'pipe',
    })

    const parser = new JsonObjectStreamParser()
    const runId = this.runCounter + 1
    this.runCounter = runId
    this.runningByConfig.set(configKey, { child: childProcess, profile, parser, runId })
    this.setState(configKey, {
      status: 'running',
      profile,
      lastResult: this.stateByConfig.get(configKey)?.lastResult,
    })

    childProcess.stdout.on('data', (chunk: Buffer) => {
      if (this.runningByConfig.get(configKey)?.runId !== runId) {
        return
      }

      const text = chunk.toString()
      this.outputChannel.append(text)

      const parsedObjects = parser.feed(text)
      for (const parsedObject of parsedObjects) {
        const result = parsePipelineRunResult(parsedObject)
        if (!result) {
          continue
        }

        this.setState(configKey, {
          status: 'running',
          profile,
          lastResult: result,
        })
      }
    })

    childProcess.stderr.on('data', (chunk: Buffer) => {
      if (this.runningByConfig.get(configKey)?.runId !== runId) {
        return
      }

      this.outputChannel.append(chunk.toString())
    })

    childProcess.on('error', (error: Error) => {
      if (this.runningByConfig.get(configKey)?.runId !== runId) {
        return
      }

      this.runningByConfig.delete(configKey)
      this.setState(configKey, {
        status: 'error',
        profile,
        lastResult: this.stateByConfig.get(configKey)?.lastResult,
        errorMessage: error.message,
      })
      vscode.window.showErrorMessage(`CI Runner failed to start: ${error.message}`)
    })

    childProcess.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      if (this.runningByConfig.get(configKey)?.runId !== runId) {
        return
      }

      this.runningByConfig.delete(configKey)

      const previousState = this.stateByConfig.get(configKey)
      const previousResult = previousState?.lastResult
      if (this.terminatedRunIds.has(runId)) {
        this.terminatedRunIds.delete(runId)
        this.setState(configKey, {
          status: previousResult ? (previousResult.exitCode === 0 ? 'passed' : 'failed') : 'idle',
          profile,
          lastResult: previousResult,
        })
        return
      }

      if (previousResult) {
        this.setState(configKey, {
          status: previousResult.exitCode === 0 ? 'passed' : 'failed',
          profile,
          lastResult: previousResult,
        })
        return
      }

      if (code === 0 || code === 1) {
        this.setState(configKey, {
          status: code === 0 ? 'passed' : 'failed',
          profile,
          lastResult: undefined,
        })
        return
      }

      const signalSuffix = signal ? ` (signal: ${signal})` : ''
      this.setState(configKey, {
        status: 'error',
        profile,
        lastResult: undefined,
        errorMessage: `Process exited unexpectedly${signalSuffix}`,
      })
    })
  }

  public stopWatch(configUri: vscode.Uri): void {
    this.stopConfigInternal(configUri.toString(), 'Watch stopped by user.')
  }

  public openOutput(): void {
    this.outputChannel.show(true)
  }

  private stopConfigInternal(configKey: string, reason: string): void {
    const running = this.runningByConfig.get(configKey)
    if (!running) {
      return
    }

    this.terminatedRunIds.add(running.runId)
    this.outputChannel.appendLine(reason)
    running.child.kill('SIGTERM')
  }

  private setState(configKey: string, state: ConfigState): void {
    this.stateByConfig.set(configKey, state)
    this.emitter.fire(undefined)
  }

  private createConfigTreeItem(entry: ConfigEntry): vscode.TreeItem {
    const configKey = entry.uri.toString()
    const state = this.stateByConfig.get(configKey)
    const treeItem = new vscode.TreeItem(
      entry.relativePath,
      vscode.TreeItemCollapsibleState.Collapsed
    )

    treeItem.description = formatConfigDescription(state, entry.preferred)
    treeItem.tooltip = `${entry.workspaceFolder.name}: ${entry.relativePath}`
    treeItem.command = {
      command: 'ciRunner.runConfigDefault',
      title: 'Run Config',
      arguments: [entry.uri],
    }
    treeItem.contextValue = 'ciRunner.config'
    treeItem.iconPath = selectConfigIcon(state)

    return treeItem
  }

  private createActionTreeItem(node: ActionNode): vscode.TreeItem {
    const labels: Record<ActionNode['action'], string> = {
      run: 'Run',
      watch: 'Run (Watch)',
      'fail-fast': 'Run (Fail Fast)',
      'stop-watch': 'Stop Watch',
    }

    const commandByAction: Record<ActionNode['action'], string> = {
      run: 'ciRunner.runConfig',
      watch: 'ciRunner.runConfigWatch',
      'fail-fast': 'ciRunner.runConfigFailFast',
      'stop-watch': 'ciRunner.stopWatch',
    }

    const iconByAction: Record<ActionNode['action'], vscode.ThemeIcon> = {
      run: new vscode.ThemeIcon('play'),
      watch: new vscode.ThemeIcon('watch'),
      'fail-fast': new vscode.ThemeIcon('warning'),
      'stop-watch': new vscode.ThemeIcon('stop-circle'),
    }

    const treeItem = new vscode.TreeItem(labels[node.action], vscode.TreeItemCollapsibleState.None)
    treeItem.iconPath = iconByAction[node.action]
    treeItem.command = {
      command: commandByAction[node.action],
      title: labels[node.action],
      arguments: [node.entry.uri],
    }
    treeItem.contextValue = `ciRunner.action.${node.action}`

    return treeItem
  }
}

const detectConfigs = async (): Promise<readonly ConfigEntry[]> => {
  const workspaceFolders = vscode.workspace.workspaceFolders
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return []
  }

  const entries: ConfigEntry[] = []

  for (const workspaceFolder of workspaceFolders) {
    const includedByPathKey = new Set<string>()
    const preferredRelativePath = getDefaultConfigPath(workspaceFolder)

    if (preferredRelativePath) {
      const preferredUri = vscode.Uri.joinPath(workspaceFolder.uri, preferredRelativePath)
      if (await fileExists(preferredUri.fsPath)) {
        const key = normalizePathKey(preferredUri.fsPath)
        includedByPathKey.add(key)
        entries.push({
          uri: preferredUri,
          workspaceFolder,
          relativePath: preferredRelativePath,
          preferred: true,
        })
      }
    }

    const discoveredUris = await vscode.workspace.findFiles(
      new vscode.RelativePattern(workspaceFolder, '**/ci.config.{json,ts}'),
      new vscode.RelativePattern(
        workspaceFolder,
        '**/{node_modules,dist,out,build,coverage,.git}/**'
      )
    )

    for (const discoveredUri of discoveredUris) {
      const normalizedKey = normalizePathKey(discoveredUri.fsPath)
      if (includedByPathKey.has(normalizedKey)) {
        continue
      }

      includedByPathKey.add(normalizedKey)
      entries.push({
        uri: discoveredUri,
        workspaceFolder,
        relativePath: relative(workspaceFolder.uri.fsPath, discoveredUri.fsPath),
        preferred: false,
      })
    }
  }

  entries.sort((left, right) => {
    if (left.workspaceFolder.index !== right.workspaceFolder.index) {
      return left.workspaceFolder.index - right.workspaceFolder.index
    }

    if (left.preferred !== right.preferred) {
      return left.preferred ? -1 : 1
    }

    return left.relativePath.localeCompare(right.relativePath)
  })

  return entries
}

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

const getDefaultConfigPath = (workspaceFolder: vscode.WorkspaceFolder): string => {
  const configuredPath = vscode.workspace
    .getConfiguration(CONFIG_SECTION, workspaceFolder.uri)
    .get<string>(DEFAULT_CONFIG_PATH, '')
    .trim()

  return configuredPath
}

const getDefaultRunProfile = (workspaceFolder: vscode.WorkspaceFolder): RunProfile => {
  const configuredProfile = vscode.workspace
    .getConfiguration(CONFIG_SECTION, workspaceFolder.uri)
    .get<string>(DEFAULT_RUN_PROFILE, 'standard')

  return configuredProfile === 'watch' || configuredProfile === 'fail-fast'
    ? configuredProfile
    : 'standard'
}

const resolveCliLaunch = async (
  workspaceFolder: vscode.WorkspaceFolder
): Promise<LaunchCommand> => {
  const localCliScriptPath = join(
    workspaceFolder.uri.fsPath,
    'packages',
    'ci-runner-cli',
    'dist',
    'cli.js'
  )
  if (await fileExists(localCliScriptPath)) {
    return {
      command: process.execPath,
      baseArgs: [localCliScriptPath],
    }
  }

  const localBinaryPath = join(
    workspaceFolder.uri.fsPath,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'ci-runner.cmd' : 'ci-runner'
  )

  if (await fileExists(localBinaryPath)) {
    return {
      command: localBinaryPath,
      baseArgs: [],
    }
  }

  return {
    command: process.platform === 'win32' ? 'ci-runner.cmd' : 'ci-runner',
    baseArgs: [],
  }
}

const processEnv = (): NodeJS.ProcessEnv => {
  return { ...process.env }
}

const formatConfigDescription = (state: ConfigState | undefined, preferred: boolean): string => {
  const preferredPrefix = preferred ? 'default' : ''
  if (!state) {
    return preferredPrefix
  }

  const summaryDescription = state.lastResult ? formatSummary(state.lastResult.summary) : ''

  if (state.status === 'running') {
    const runningSuffix = state.profile === 'watch' ? 'watching' : 'running'
    return joinDescription(preferredPrefix, runningSuffix, summaryDescription)
  }

  if (state.status === 'error') {
    return joinDescription(preferredPrefix, 'error', state.errorMessage ?? '')
  }

  if (state.status === 'passed' || state.status === 'failed') {
    return joinDescription(preferredPrefix, state.status, summaryDescription)
  }

  return preferredPrefix
}

const joinDescription = (...parts: readonly string[]): string => {
  return parts.filter((part) => part.length > 0).join(' | ')
}

const formatSummary = (summary: PipelineRunResult['summary']): string => {
  return `P:${summary.passed} F:${summary.failed} S:${summary.skipped} T:${summary.timedOut} (${summary.durationMs}ms)`
}

const selectConfigIcon = (state: ConfigState | undefined): vscode.ThemeIcon => {
  if (!state) {
    return new vscode.ThemeIcon('circle-large-outline')
  }

  if (state.status === 'running') {
    return new vscode.ThemeIcon('sync~spin')
  }

  if (state.status === 'passed') {
    return new vscode.ThemeIcon('check')
  }

  if (state.status === 'failed' || state.status === 'error') {
    return new vscode.ThemeIcon('error')
  }

  return new vscode.ThemeIcon('circle-large-outline')
}

const normalizePathKey = (filePath: string): string => {
  return process.platform === 'win32' ? filePath.toLowerCase() : filePath
}

const formatShellCommand = (command: string, args: readonly string[]): string => {
  const renderedArgs = args.map((argument) => {
    if (!argument.includes(' ') && !argument.includes('"')) {
      return argument
    }

    return `"${argument.replaceAll('"', '\\"')}"`
  })

  return [command, ...renderedArgs].join(' ')
}

/**
 * Activates the CI Runner VS Code extension.
 *
 * @param context Extension runtime context.
 * @returns Promise resolved after command and view registration.
 */
export const activate = async (context: vscode.ExtensionContext): Promise<void> => {
  const model = new CiRunnerViewModel()
  context.subscriptions.push(
    model,
    vscode.window.registerTreeDataProvider('ciRunner.sidebar', model),
    vscode.commands.registerCommand('ciRunner.refresh', async () => {
      await model.refresh()
    }),
    vscode.commands.registerCommand('ciRunner.runConfig', async (configUri: vscode.Uri) => {
      await model.runConfig(configUri, 'standard')
    }),
    vscode.commands.registerCommand('ciRunner.runConfigWatch', async (configUri: vscode.Uri) => {
      await model.runConfig(configUri, 'watch')
    }),
    vscode.commands.registerCommand('ciRunner.runConfigFailFast', async (configUri: vscode.Uri) => {
      await model.runConfig(configUri, 'fail-fast')
    }),
    vscode.commands.registerCommand('ciRunner.runConfigDefault', async (configUri: vscode.Uri) => {
      await model.runDefaultProfile(configUri)
    }),
    vscode.commands.registerCommand('ciRunner.stopWatch', (configUri: vscode.Uri) => {
      model.stopWatch(configUri)
    }),
    vscode.commands.registerCommand('ciRunner.openOutput', () => {
      model.openOutput()
    })
  )

  await model.refresh()
}

/**
 * Deactivates the CI Runner extension.
 */
export const deactivate = (): void => {
  // VS Code disposes registered subscriptions automatically.
}
