import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { access, constants } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'

import * as vscode from 'vscode'

type RunProfile = 'standard' | 'watch' | 'fail-fast'
type RunStatus = 'idle' | 'running' | 'passed' | 'failed' | 'stopped' | 'error'

interface ConfigEntry {
  readonly uri: vscode.Uri
  readonly workspaceFolder: vscode.WorkspaceFolder
  readonly relativePath: string
  readonly preferred: boolean
}

interface TargetEntry {
  readonly key: string
  readonly config: ConfigEntry
  readonly targetId?: string
  readonly label: string
  readonly description?: string
}

interface ConfigState {
  readonly status: RunStatus
  readonly profile?: RunProfile
  readonly lastExitCode?: 0 | 1
  readonly errorMessage?: string
  readonly watchRunActive?: boolean
}

interface RunningProcess {
  readonly child: ChildProcessWithoutNullStreams
  readonly profile: RunProfile
  readonly runId: number
}

interface ListedTarget {
  readonly id: string
  readonly name: string
  readonly description?: string
}

interface LaunchCommand {
  readonly command: string
  readonly baseArgs: readonly string[]
}

interface TargetNode {
  readonly type: 'target'
  readonly entry: TargetEntry
}

interface ActionNode {
  readonly type: 'action'
  readonly entry: TargetEntry
  readonly action: 'run' | 'watch' | 'fail-fast' | 'stop'
}

interface MessageNode {
  readonly type: 'message'
  readonly label: string
  readonly description?: string
  readonly command?: vscode.Command
}

type TreeNode = TargetNode | ActionNode | MessageNode

const CONFIG_SECTION = 'ciRunner'
const DEFAULT_CONFIG_PATH = 'defaultConfigPath'
const DEFAULT_RUN_PROFILE = 'defaultRunProfile'
const ANSI_ESCAPE_PATTERN = new RegExp(String.raw`\u001B\[[0-?]*[ -/]*[@-~]`, 'gu')
const FULL_PIPELINE_LABEL = 'Full CI'

class CiRunnerViewModel implements vscode.TreeDataProvider<TreeNode>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<TreeNode | undefined | null | void>()
  private readonly outputChannel = vscode.window.createOutputChannel('CI Runner')
  private readonly stateByEntry = new Map<string, ConfigState>()
  private readonly runningByEntry = new Map<string, RunningProcess>()
  private readonly terminatedRunIds = new Set<number>()
  private readonly disposables: vscode.Disposable[] = []
  private runCounter = 0

  private entries: readonly TargetEntry[] = []

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
    for (const [entryKey, running] of this.runningByEntry.entries()) {
      running.child.kill('SIGTERM')
      this.runningByEntry.delete(entryKey)
    }

    for (const disposable of this.disposables) {
      disposable.dispose()
    }

    this.emitter.dispose()
  }

  public async refresh(): Promise<void> {
    const detectedEntries = await detectTargetEntries()
    this.entries = detectedEntries

    const detectedKeys = new Set(detectedEntries.map((entry) => entry.key))
    for (const existingKey of this.stateByEntry.keys()) {
      if (!detectedKeys.has(existingKey)) {
        this.stateByEntry.delete(existingKey)
      }
    }

    this.emitter.fire(undefined)
  }

  public getTreeItem(element: TreeNode): vscode.TreeItem {
    if (element.type === 'target') {
      return this.createTargetTreeItem(element.entry)
    }

    if (element.type === 'message') {
      return this.createMessageTreeItem(element)
    }

    return this.createActionTreeItem(element)
  }

  public getChildren(element?: TreeNode): readonly TreeNode[] {
    if (!element) {
      if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        return [
          {
            type: 'message',
            label: 'No workspace folder is open.',
            description: 'Open a folder to detect CI Runner configs.',
          },
        ]
      }

      if (this.entries.length === 0) {
        return [
          {
            type: 'message',
            label: 'No ci.config.json or ci.config.ts found.',
            description: 'Rename your config or set ciRunner.defaultConfigPath.',
          },
          {
            type: 'message',
            label: 'Open CI Runner settings',
            command: {
              command: 'workbench.action.openSettings',
              title: 'Open Settings',
              arguments: ['ciRunner.defaultConfigPath'],
            },
          },
        ]
      }

      return this.entries.map((entry) => ({ type: 'target', entry }))
    }

    if (element.type === 'action' || element.type === 'message') {
      return []
    }

    const actions: ActionNode[] = [
      { type: 'action', entry: element.entry, action: 'run' },
      { type: 'action', entry: element.entry, action: 'watch' },
      { type: 'action', entry: element.entry, action: 'fail-fast' },
    ]

    const state = this.stateByEntry.get(element.entry.key)
    if (state?.status === 'running') {
      actions.push({ type: 'action', entry: element.entry, action: 'stop' })
    }

    return actions
  }

  public async runDefaultProfile(entry: TargetEntry): Promise<void> {
    const profile = getDefaultRunProfile(entry.config.workspaceFolder)
    await this.runEntry(entry, profile)
  }

  public async runEntry(entry: TargetEntry, profile: RunProfile): Promise<void> {
    const workspaceFolder = entry.config.workspaceFolder
    const launch = await resolveCliLaunch(workspaceFolder)
    const outputFormat = 'pretty'
    const baseArgs = [
      ...launch.baseArgs,
      '--config',
      entry.config.relativePath,
      '--cwd',
      workspaceFolder.uri.fsPath,
      '--format',
      outputFormat,
    ]
    if (entry.targetId) {
      baseArgs.push('--target', entry.targetId)
    }

    const profileArgs =
      profile === 'watch' ? ['--watch'] : profile === 'fail-fast' ? ['--fail-fast'] : []
    const args = [...baseArgs, ...profileArgs]

    if (this.runningByEntry.has(entry.key)) {
      this.stopEntryInternal(entry.key, 'Restarting existing run.')
    }
    this.stopSiblingRunsForConfig(entry)

    this.outputChannel.show(true)
    this.outputChannel.appendLine(
      `\n[${new Date().toISOString()}] ${workspaceFolder.name}: ${entry.config.relativePath} / ${entry.label} (${profile}, format=${outputFormat})`
    )
    this.outputChannel.appendLine(`$ ${formatShellCommand(launch.command, args)}`)

    const childProcess = spawn(launch.command, args, {
      cwd: workspaceFolder.uri.fsPath,
      env: processEnv(),
      shell: requiresShellExecution(launch.command),
      stdio: 'pipe',
    })

    const runId = this.runCounter + 1
    this.runCounter = runId
    let stdoutBuffer = ''
    let stderrBuffer = ''
    this.runningByEntry.set(entry.key, { child: childProcess, profile, runId })
    this.setState(entry.key, {
      status: 'running',
      profile,
      lastExitCode: this.stateByEntry.get(entry.key)?.lastExitCode,
      watchRunActive: profile === 'watch',
    })

    childProcess.stdout.on('data', (chunk: Buffer) => {
      if (this.runningByEntry.get(entry.key)?.runId !== runId) {
        return
      }

      stdoutBuffer += chunk.toString()
      const drained = drainCompleteLines(stdoutBuffer)
      stdoutBuffer = drained.remainder

      for (const line of drained.lines) {
        const cleanLine = stripAnsi(line)
        appendEnhancedOutputLine(
          this.outputChannel,
          cleanLine,
          entry.config.workspaceFolder.uri.fsPath
        )

        if (profile !== 'watch') {
          continue
        }

        if (isWatchRunStartLine(cleanLine)) {
          const currentState = this.stateByEntry.get(entry.key)
          this.setState(entry.key, {
            status: 'running',
            profile,
            lastExitCode: currentState?.lastExitCode,
            errorMessage: currentState?.errorMessage,
            watchRunActive: true,
          })
          continue
        }

        const runExitCode = parseWatchRunExitCodeFromLine(cleanLine)
        if (runExitCode === null) {
          continue
        }

        const currentState = this.stateByEntry.get(entry.key)
        this.setState(entry.key, {
          status: 'running',
          profile,
          lastExitCode: runExitCode,
          errorMessage: currentState?.errorMessage,
          watchRunActive: false,
        })
      }
    })

    childProcess.stderr.on('data', (chunk: Buffer) => {
      if (this.runningByEntry.get(entry.key)?.runId !== runId) {
        return
      }

      stderrBuffer += chunk.toString()
      const drained = drainCompleteLines(stderrBuffer)
      stderrBuffer = drained.remainder
      for (const line of drained.lines) {
        appendEnhancedOutputLine(
          this.outputChannel,
          stripAnsi(line),
          entry.config.workspaceFolder.uri.fsPath
        )
      }
    })

    childProcess.on('error', (error: Error) => {
      if (this.runningByEntry.get(entry.key)?.runId !== runId) {
        return
      }

      this.runningByEntry.delete(entry.key)
      const previousState = this.stateByEntry.get(entry.key)
      this.setState(entry.key, {
        status: 'error',
        profile,
        lastExitCode: previousState?.lastExitCode,
        errorMessage: error.message,
      })
      vscode.window.showErrorMessage(`CI Runner failed to start: ${error.message}`)
    })

    childProcess.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      if (this.runningByEntry.get(entry.key)?.runId !== runId) {
        return
      }

      flushRemainingOutputBuffer(
        this.outputChannel,
        stdoutBuffer,
        entry.config.workspaceFolder.uri.fsPath
      )
      flushRemainingOutputBuffer(
        this.outputChannel,
        stderrBuffer,
        entry.config.workspaceFolder.uri.fsPath
      )
      stdoutBuffer = ''
      stderrBuffer = ''

      this.runningByEntry.delete(entry.key)

      const previousState = this.stateByEntry.get(entry.key)
      if (this.terminatedRunIds.has(runId)) {
        this.terminatedRunIds.delete(runId)
        this.setState(entry.key, {
          status: 'stopped',
          profile,
          lastExitCode: previousState?.lastExitCode,
        })
        return
      }

      if (code === 0 || code === 1) {
        this.setState(entry.key, {
          status: code === 0 ? 'passed' : 'failed',
          profile,
          lastExitCode: code,
        })
        return
      }

      const signalSuffix = signal ? ` (signal: ${signal})` : ''
      this.setState(entry.key, {
        status: 'error',
        profile,
        lastExitCode: previousState?.lastExitCode,
        errorMessage: `Process exited unexpectedly${signalSuffix}`,
      })
    })
  }

  public stopEntry(entry: TargetEntry): void {
    this.stopEntryInternal(entry.key, 'Run stopped by user.')
  }

  public stopAllRuns(): void {
    const runningEntryKeys = [...this.runningByEntry.keys()]
    for (const entryKey of runningEntryKeys) {
      this.stopEntryInternal(entryKey, 'Run stopped by user (Stop All).')
    }
  }

  public openOutput(): void {
    this.outputChannel.show(true)
  }

  private stopEntryInternal(entryKey: string, reason: string): void {
    const running = this.runningByEntry.get(entryKey)
    if (!running) {
      return
    }

    this.terminatedRunIds.add(running.runId)
    this.outputChannel.appendLine(reason)
    running.child.kill('SIGTERM')
  }

  private stopSiblingRunsForConfig(entry: TargetEntry): void {
    const configPrefix = `${entry.config.uri.toString()}::`

    for (const runningEntryKey of this.runningByEntry.keys()) {
      if (runningEntryKey === entry.key || !runningEntryKey.startsWith(configPrefix)) {
        continue
      }

      this.stopEntryInternal(
        runningEntryKey,
        `Stopped because another target from ${entry.config.relativePath} started.`
      )
    }
  }

  private setState(configKey: string, state: ConfigState): void {
    this.stateByEntry.set(configKey, state)
    this.emitter.fire(undefined)
  }

  private createTargetTreeItem(entry: TargetEntry): vscode.TreeItem {
    const state = this.stateByEntry.get(entry.key)
    const treeItem = new vscode.TreeItem(
      `${selectStatusEmoji(state)} ${entry.label}`,
      vscode.TreeItemCollapsibleState.Collapsed
    )

    treeItem.description = formatTargetDescription(state, entry)
    const tooltipParts = [`${entry.config.workspaceFolder.name}: ${entry.config.relativePath}`]
    if (entry.description) {
      tooltipParts.push(entry.description)
    }
    treeItem.tooltip = tooltipParts.join('\n')
    treeItem.command = {
      command: state?.status === 'running' ? 'ciRunner.stopConfig' : 'ciRunner.runConfigDefault',
      title: state?.status === 'running' ? 'Stop' : 'Run',
      arguments: [entry],
    }
    treeItem.contextValue =
      state?.status === 'running' ? 'ciRunnerTargetRunning' : 'ciRunnerTargetIdle'
    treeItem.iconPath = selectConfigIcon(state)

    return treeItem
  }

  private createMessageTreeItem(node: MessageNode): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None)
    treeItem.description = node.description
    treeItem.command = node.command
    treeItem.iconPath = new vscode.ThemeIcon('info')
    treeItem.contextValue = 'ciRunner.message'

    return treeItem
  }

  private createActionTreeItem(node: ActionNode): vscode.TreeItem {
    const labels: Record<ActionNode['action'], string> = {
      run: 'Run',
      watch: 'Run (Watch)',
      'fail-fast': 'Run (Fail Fast)',
      stop: 'Stop',
    }

    const commandByAction: Record<ActionNode['action'], string> = {
      run: 'ciRunner.runConfig',
      watch: 'ciRunner.runConfigWatch',
      'fail-fast': 'ciRunner.runConfigFailFast',
      stop: 'ciRunner.stopConfig',
    }

    const iconByAction: Record<ActionNode['action'], vscode.ThemeIcon> = {
      run: new vscode.ThemeIcon('play'),
      watch: new vscode.ThemeIcon('watch'),
      'fail-fast': new vscode.ThemeIcon('warning'),
      stop: new vscode.ThemeIcon('stop-circle'),
    }

    const treeItem = new vscode.TreeItem(labels[node.action], vscode.TreeItemCollapsibleState.None)
    treeItem.iconPath = iconByAction[node.action]
    treeItem.command = {
      command: commandByAction[node.action],
      title: labels[node.action],
      arguments: [node.entry],
    }
    treeItem.contextValue = `ciRunner.action.${node.action}`

    return treeItem
  }
}

const detectTargetEntries = async (): Promise<readonly TargetEntry[]> => {
  const configEntries = await detectConfigs()
  const targetGroups = await Promise.all(
    configEntries.map((entry) => detectTargetsForConfig(entry))
  )
  return targetGroups.flat()
}

const detectTargetsForConfig = async (
  configEntry: ConfigEntry
): Promise<readonly TargetEntry[]> => {
  let listedTargets: readonly ListedTarget[] = []
  try {
    listedTargets = await listTargetsForConfig(configEntry)
  } catch {
    return [toTargetEntry(configEntry, undefined, configEntry.relativePath, undefined)]
  }

  if (listedTargets.length === 0) {
    return [toTargetEntry(configEntry, undefined, configEntry.relativePath, undefined)]
  }

  const entries: TargetEntry[] = [
    toTargetEntry(configEntry, undefined, FULL_PIPELINE_LABEL, 'Run all configured steps'),
  ]

  for (const target of listedTargets) {
    entries.push(toTargetEntry(configEntry, target.id, target.name, target.description))
  }

  return entries
}

const toTargetEntry = (
  config: ConfigEntry,
  targetId: string | undefined,
  label: string,
  description: string | undefined
): TargetEntry => {
  const targetSuffix = targetId === undefined ? 'target:__implicit_full__' : `target:${targetId}`
  return {
    key: `${config.uri.toString()}::${targetSuffix}`,
    config,
    targetId,
    label,
    description,
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

const listTargetsForConfig = async (entry: ConfigEntry): Promise<readonly ListedTarget[]> => {
  const launch = await resolveCliLaunch(entry.workspaceFolder)
  const args = [
    ...launch.baseArgs,
    '--config',
    entry.relativePath,
    '--cwd',
    entry.workspaceFolder.uri.fsPath,
    '--list-targets',
    '--format',
    'json',
  ]

  const payload = await runCliJsonCommand(launch.command, args, entry.workspaceFolder.uri.fsPath)
  return parseListedTargetsPayload(payload)
}

const runCliJsonCommand = async (
  command: string,
  args: readonly string[],
  cwd: string
): Promise<unknown> => {
  return await new Promise<unknown>((resolvePromise, rejectPromise) => {
    const childProcess = spawn(command, [...args], {
      cwd,
      env: processEnv(),
      shell: requiresShellExecution(command),
      stdio: 'pipe',
    })

    let stdout = ''
    let stderr = ''

    childProcess.stdout.on('data', (chunk: Buffer) => {
      stdout += stripAnsi(chunk.toString())
    })

    childProcess.stderr.on('data', (chunk: Buffer) => {
      stderr += stripAnsi(chunk.toString())
    })

    childProcess.on('error', (error: Error) => {
      rejectPromise(error)
    })

    childProcess.on('close', (code: number | null) => {
      if (code !== 0) {
        const errorText = stderr.trim()
        rejectPromise(
          new Error(errorText.length > 0 ? errorText : `Command exited with code ${code}`)
        )
        return
      }

      const trimmedStdout = stdout.trim()
      if (trimmedStdout.length === 0) {
        rejectPromise(new Error('Command returned empty output'))
        return
      }

      try {
        resolvePromise(JSON.parse(trimmedStdout) as unknown)
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        rejectPromise(new Error(`Failed to parse JSON output: ${message}`))
      }
    })
  })
}

const parseListedTargetsPayload = (value: unknown): readonly ListedTarget[] => {
  if (!isRecord(value)) {
    throw new Error('Target list response must be an object')
  }

  const targetsValue = value.targets
  if (!Array.isArray(targetsValue)) {
    throw new Error('Target list response must include a targets array')
  }

  const targets: ListedTarget[] = []
  for (const [index, targetValue] of targetsValue.entries()) {
    if (!isRecord(targetValue)) {
      throw new Error(`targets[${index}] must be an object`)
    }

    const id = targetValue.id
    const name = targetValue.name
    const description = targetValue.description

    if (typeof id !== 'string' || id.length === 0) {
      throw new Error(`targets[${index}].id must be a non-empty string`)
    }

    if (typeof name !== 'string' || name.length === 0) {
      throw new Error(`targets[${index}].name must be a non-empty string`)
    }

    if (description !== undefined && typeof description !== 'string') {
      throw new Error(`targets[${index}].description must be a string`)
    }

    targets.push({
      id,
      name,
      description,
    })
  }

  return targets
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

  const localCliScriptPath = join(
    workspaceFolder.uri.fsPath,
    'packages',
    'ci-runner-cli',
    'dist',
    'cli.js'
  )
  if (await fileExists(localCliScriptPath)) {
    return {
      command: resolveNodeCommand(),
      baseArgs: [localCliScriptPath],
    }
  }

  return {
    command: process.platform === 'win32' ? 'ci-runner.cmd' : 'ci-runner',
    baseArgs: [],
  }
}

const resolveNodeCommand = (): string => {
  const vscodeNodePath = process.env.VSCODE_NODE_PATH
  if (typeof vscodeNodePath === 'string' && vscodeNodePath.length > 0) {
    return vscodeNodePath
  }

  const normalizedExecPath = process.execPath.toLowerCase()
  const usesNodeExecutable =
    normalizedExecPath.endsWith('/node') || normalizedExecPath.endsWith('\\node.exe')
  if (usesNodeExecutable) {
    return process.execPath
  }

  return process.platform === 'win32' ? 'node.exe' : 'node'
}

const processEnv = (): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  env.NO_COLOR = '1'
  env.FORCE_COLOR = '0'
  return env
}

const requiresShellExecution = (command: string): boolean => {
  return process.platform === 'win32' && command.toLowerCase().endsWith('.cmd')
}

const formatTargetDescription = (state: ConfigState | undefined, entry: TargetEntry): string => {
  const preferredPrefix = entry.config.preferred ? 'default' : ''
  const configPathPart = entry.label === entry.config.relativePath ? '' : entry.config.relativePath

  if (!state) {
    return joinDescription(preferredPrefix, 'no run yet', configPathPart)
  }

  if (state.status === 'running') {
    const runningSuffix = state.profile === 'watch' ? 'watching' : 'running'
    return joinDescription(
      preferredPrefix,
      runningSuffix,
      formatLastRunDescription(state.lastExitCode),
      configPathPart
    )
  }

  if (state.status === 'passed') {
    return joinDescription(preferredPrefix, 'passed', configPathPart)
  }

  if (state.status === 'failed') {
    return joinDescription(preferredPrefix, 'failed', configPathPart)
  }

  if (state.status === 'stopped') {
    return joinDescription(preferredPrefix, 'stopped', configPathPart)
  }

  if (state.status === 'error') {
    return joinDescription(preferredPrefix, 'error', configPathPart, state.errorMessage ?? '')
  }

  return joinDescription(preferredPrefix, configPathPart)
}

const joinDescription = (...parts: readonly string[]): string => {
  return parts.filter((part) => part.length > 0).join(' | ')
}

const selectConfigIcon = (state: ConfigState | undefined): vscode.ThemeIcon => {
  if (!state) {
    return new vscode.ThemeIcon('circle-large-outline')
  }

  if (state.status === 'running') {
    if (state.profile === 'watch' && state.watchRunActive === false) {
      return new vscode.ThemeIcon('circle-large-outline')
    }

    return new vscode.ThemeIcon('sync~spin')
  }

  if (state.status === 'passed') {
    return new vscode.ThemeIcon('check')
  }

  if (state.status === 'stopped') {
    return new vscode.ThemeIcon('warning')
  }

  if (state.status === 'failed' || state.status === 'error') {
    return new vscode.ThemeIcon('error')
  }

  return new vscode.ThemeIcon('circle-large-outline')
}

const selectStatusEmoji = (state: ConfigState | undefined): string => {
  if (!state || state.status === 'idle') {
    return '🤷'
  }

  if (state.status === 'running') {
    if (state.lastExitCode === 0) {
      return '✅'
    }

    if (state.lastExitCode === 1) {
      return '❌'
    }

    return '🤷'
  }

  if (state.status === 'passed') {
    return '✅'
  }

  if (state.status === 'failed') {
    return '❌'
  }

  if (state.status === 'stopped') {
    return '⚠️'
  }

  return '❗'
}

const formatLastRunDescription = (lastExitCode?: 0 | 1): string => {
  if (lastExitCode === 0) {
    return 'last passed'
  }

  if (lastExitCode === 1) {
    return 'last failed'
  }

  return ''
}

const parseWatchRunExitCodeFromLine = (line: string): 0 | 1 | null => {
  const normalizedLine = line.trim()
  if (!normalizedLine.startsWith('Result:')) {
    return null
  }

  if (normalizedLine.includes('PASS')) {
    return 0
  }

  if (normalizedLine.includes('FAIL')) {
    return 1
  }

  return null
}

const isWatchRunStartLine = (line: string): boolean => {
  return line.trim().startsWith('ci-runner: executing ')
}

const drainCompleteLines = (
  buffer: string
): { readonly lines: readonly string[]; readonly remainder: string } => {
  const normalized = buffer.replaceAll('\r\n', '\n')
  const parts = normalized.split('\n')
  if (parts.length === 0) {
    return {
      lines: [],
      remainder: normalized,
    }
  }

  const remainder = parts.pop() ?? ''
  return {
    lines: parts,
    remainder,
  }
}

const flushRemainingOutputBuffer = (
  outputChannel: vscode.OutputChannel,
  buffer: string,
  workspaceRootPath: string
): void => {
  const clean = stripAnsi(buffer)
  if (clean.trim().length === 0) {
    return
  }

  appendEnhancedOutputLine(outputChannel, clean, workspaceRootPath)
}

const appendEnhancedOutputLine = (
  outputChannel: vscode.OutputChannel,
  line: string,
  workspaceRootPath: string
): void => {
  if (shouldSuppressOutputLine(line)) {
    return
  }

  outputChannel.appendLine(line)

  const clickableDiagnostic = toClickableTypeScriptDiagnostic(line, workspaceRootPath)
  if (!clickableDiagnostic) {
    return
  }

  outputChannel.appendLine(clickableDiagnostic)
}

const shouldSuppressOutputLine = (line: string): boolean => {
  const normalized = line.trim()
  if (
    normalized.startsWith('(node:') &&
    normalized.includes("The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.")
  ) {
    return true
  }

  if (normalized.startsWith('(Use `node --trace-warnings')) {
    return true
  }

  if (isRecursiveProgressNoiseLine(normalized)) {
    return true
  }

  return false
}

const isRecursiveProgressNoiseLine = (line: string): boolean => {
  if (line.length === 0) {
    return false
  }

  // pnpm -r progress noise lines:
  // - "<project> <script>$ <command>"
  // - "<project> <script>: Done"
  const startsScriptMatch = /^\S+\s+[a-z0-9:_-]+\$\s+.+$/iu.test(line)
  if (startsScriptMatch) {
    return true
  }

  return /^\S+\s+[a-z0-9:_-]+:\s+Done$/iu.test(line)
}

const toClickableTypeScriptDiagnostic = (
  line: string,
  workspaceRootPath: string
): string | null => {
  const normalizedLine = line.trimStart()
  const recursiveMatch = normalizedLine.match(
    /^(?<packagePath>\S+)\s+(?<scriptPrefix>.+):\s+(?<filePath>.+)\((?<line>\d+),(?<column>\d+)\):\s+(?<message>error TS\d+:.*)$/u
  )
  if (recursiveMatch?.groups) {
    const relativeFilePath = recursiveMatch.groups.filePath.trim()
    const filePath = resolve(workspaceRootPath, recursiveMatch.groups.packagePath, relativeFilePath)
    const lineNumber = Number.parseInt(recursiveMatch.groups.line, 10)
    const columnNumber = Number.parseInt(recursiveMatch.groups.column, 10)
    const message = recursiveMatch.groups.message
    if (Number.isNaN(lineNumber) || Number.isNaN(columnNumber)) {
      return null
    }

    return `${filePath}:${lineNumber}:${columnNumber} - ${message}`
  }

  const directMatch = normalizedLine.match(
    /^(?<filePath>.+)\((?<line>\d+),(?<column>\d+)\):\s+(?<message>error TS\d+:.*)$/u
  )
  if (!directMatch?.groups) {
    return null
  }

  const filePath = workspaceRootPath
    ? resolve(workspaceRootPath, directMatch.groups.filePath)
    : directMatch.groups.filePath
  const lineNumber = Number.parseInt(directMatch.groups.line, 10)
  const columnNumber = Number.parseInt(directMatch.groups.column, 10)
  const message = directMatch.groups.message
  if (Number.isNaN(lineNumber) || Number.isNaN(columnNumber)) {
    return null
  }

  return `${filePath}:${lineNumber}:${columnNumber} - ${message}`
}

const stripAnsi = (text: string): string => {
  return text.replaceAll(ANSI_ESCAPE_PATTERN, '')
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
    vscode.commands.registerCommand('ciRunner.runConfig', async (entry: TargetEntry) => {
      await model.runEntry(entry, 'standard')
    }),
    vscode.commands.registerCommand('ciRunner.runConfigWatch', async (entry: TargetEntry) => {
      await model.runEntry(entry, 'watch')
    }),
    vscode.commands.registerCommand('ciRunner.runConfigFailFast', async (entry: TargetEntry) => {
      await model.runEntry(entry, 'fail-fast')
    }),
    vscode.commands.registerCommand('ciRunner.runConfigDefault', async (entry: TargetEntry) => {
      await model.runDefaultProfile(entry)
    }),
    vscode.commands.registerCommand('ciRunner.stopConfig', (entry: TargetEntry) => {
      model.stopEntry(entry)
    }),
    vscode.commands.registerCommand('ciRunner.stopAll', () => {
      model.stopAllRuns()
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
