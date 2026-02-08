declare module 'vscode' {
  type Thenable<T> = PromiseLike<T>

  export interface Disposable {
    dispose(): void
  }

  export interface Event<T> {
    (listener: (event: T) => unknown): Disposable
  }

  export class EventEmitter<T> implements Disposable {
    public readonly event: Event<T>
    public fire(data: T): void
    public dispose(): void
  }

  export interface Command {
    readonly command: string
    readonly title: string
    readonly arguments?: readonly unknown[]
  }

  export class Uri {
    public readonly fsPath: string
    public toString(): string
    public static joinPath(base: Uri, ...pathSegments: readonly string[]): Uri
  }

  export interface WorkspaceFolder {
    readonly uri: Uri
    readonly name: string
    readonly index: number
  }

  export class RelativePattern {
    public constructor(base: WorkspaceFolder | Uri | string, pattern: string)
  }

  export interface WorkspaceConfiguration {
    get<T>(section: string, defaultValue: T): T
  }

  export interface FileSystemWatcher extends Disposable {
    onDidCreate(listener: (uri: Uri) => unknown): Disposable
    onDidChange(listener: (uri: Uri) => unknown): Disposable
    onDidDelete(listener: (uri: Uri) => unknown): Disposable
  }

  export interface WorkspaceFoldersChangeEvent {
    readonly added: readonly WorkspaceFolder[]
    readonly removed: readonly WorkspaceFolder[]
  }

  export interface TextDocument {
    readonly uri: Uri
  }

  export interface ConfigurationChangeEvent {
    affectsConfiguration(section: string, scope?: Uri | WorkspaceFolder): boolean
  }

  export interface OutputChannel extends Disposable {
    append(value: string): void
    appendLine(value: string): void
    show(preserveFocus?: boolean): void
    clear(): void
  }

  export const enum TreeItemCollapsibleState {
    None = 0,
    Collapsed = 1,
    Expanded = 2,
  }

  export class ThemeIcon {
    public constructor(id: string)
  }

  export class TreeItem {
    public constructor(label: string, collapsibleState?: TreeItemCollapsibleState)
    public description?: string
    public tooltip?: string
    public command?: Command
    public contextValue?: string
    public iconPath?: ThemeIcon
  }

  export interface TreeDataProvider<T> {
    onDidChangeTreeData?: Event<T | undefined | null | void>
    getTreeItem(element: T): TreeItem
    getChildren(element?: T): readonly T[] | Thenable<readonly T[]>
  }

  export interface ExtensionContext {
    readonly subscriptions: Disposable[]
  }

  export namespace workspace {
    const workspaceFolders: readonly WorkspaceFolder[] | undefined
    function createFileSystemWatcher(globPattern: string | RelativePattern): FileSystemWatcher
    function onDidChangeWorkspaceFolders(
      listener: (event: WorkspaceFoldersChangeEvent) => unknown
    ): Disposable
    function onDidSaveTextDocument(listener: (document: TextDocument) => unknown): Disposable
    function onDidChangeConfiguration(
      listener: (event: ConfigurationChangeEvent) => unknown
    ): Disposable
    function getWorkspaceFolder(uri: Uri): WorkspaceFolder | undefined
    function findFiles(
      include: string | RelativePattern,
      exclude?: string | RelativePattern,
      maxResults?: number,
      token?: unknown
    ): Thenable<readonly Uri[]>
    function getConfiguration(
      section?: string,
      scope?: Uri | WorkspaceFolder
    ): WorkspaceConfiguration
  }

  export namespace window {
    function createOutputChannel(name: string): OutputChannel
    function showErrorMessage(message: string): Thenable<string | undefined>
    function registerTreeDataProvider(
      viewId: string,
      provider: TreeDataProvider<unknown>
    ): Disposable
  }

  export namespace commands {
    function registerCommand<TArgs extends readonly unknown[]>(
      command: string,
      callback: (...args: TArgs) => unknown
    ): Disposable
  }
}
