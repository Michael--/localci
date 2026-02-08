# @number10/ci-runner-vscode

VS Code extension for running `ci-runner` targets directly from the Explorer sidebar.

## Features

- Detects `ci.config.json` and `ci.config.ts` in workspace folders.
- Lists configured targets and exposes run actions (`standard`, `watch`, `fail-fast`).
- Streams run output to the `CI Runner` output channel.
- Supports stop actions per target and for all active runs.

## Development

From repository root:

```bash
pnpm --filter @number10/ci-runner-cli run build
pnpm --filter @number10/ci-runner-vscode run build
pnpm --filter @number10/ci-runner-vscode run test
```

Open extension host preview:

```bash
pnpm run vscode:preview
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
