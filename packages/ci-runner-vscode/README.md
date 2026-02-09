# ci-runner-vscode

VS Code extension for running `ci-runner` targets directly from the Explorer sidebar.

## Features

- Detects `ci.config.json` and `ci.config.ts` in workspace folders.
- Lists configured targets and exposes run actions (`standard`, `watch`, `fail-fast`).
- Streams run output to the `CI Runner` output channel.
- Supports stop actions per target and for all active runs.

## Quickstart

1. Install `@number10/ci-runner-cli` in your workspace.
2. Open the workspace in VS Code.
3. Open the Explorer and find the `CI Runner` view.
4. Run `Refresh` from the view title if configs are not listed yet.
5. Use the inline run icon on a target or config node.

The extension executes `ci-runner` from your workspace context and forwards output to the `CI Runner` output panel.

## Commands

- `CI Runner: Refresh`
- `CI Runner: Run Config`
- `CI Runner: Run Config (Watch)`
- `CI Runner: Run Config (Fail Fast)`
- `CI Runner: Run Config (Default Profile)`
- `CI Runner: Stop Config Run`
- `CI Runner: Stop All Runs`
- `CI Runner: Open Output`

## Settings

- `ciRunner.defaultConfigPath`: preferred relative config path shown first in the view.
- `ciRunner.defaultRunProfile`: default profile for direct node execution (`standard`, `watch`, `fail-fast`).

## Development

From repository root:

```bash
pnpm --filter @number10/ci-runner-cli run build
pnpm --filter ci-runner-vscode run build
pnpm --filter ci-runner-vscode run test
```

Open extension host preview:

```bash
pnpm run vscode:preview
```

Build a local extension package (`.vsix`) without publishing:

```bash
pnpm --filter ci-runner-vscode run package
```

## Publish to Visual Studio Marketplace

1. Create a publisher in the [Visual Studio Marketplace Management Portal](https://marketplace.visualstudio.com/manage).
2. Create an Azure DevOps Personal Access Token with `Marketplace (Manage)` scope.
3. Login with `vsce`:

```bash
cd packages/ci-runner-vscode
pnpm dlx @vscode/vsce login number10
```

4. Build and publish:

```bash
pnpm run build
pnpm dlx @vscode/vsce publish
```

5. For follow-up releases, bump and publish in one command:

```bash
pnpm dlx @vscode/vsce publish patch
# or: minor / major
```

Notes:

- The extension icon must be a PNG file for Marketplace publishing.
- Keep `CHANGELOG.md` updated for each published version.

## Known Limitations

- The extension requires a workspace folder; single loose files are not supported.
- Target discovery depends on `ci-runner --list-targets`; invalid configs are shown as errors.
- Watch mode behavior follows the CLI watcher capabilities of the current platform.

## README for Marketplace Listing

The Marketplace uses this package-level `README.md` as listing content.

Recommended sections:

- Purpose and value proposition
- Feature overview
- Quickstart
- Commands and settings
- Known issues and limitations

Official references:

- [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [Extension Manifest](https://code.visualstudio.com/api/references/extension-manifest)
- [Marketplace Presentation](https://code.visualstudio.com/api/ux-guidelines/marketplace-presentation)
