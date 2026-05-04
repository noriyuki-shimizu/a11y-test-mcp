# a11y test MCP

An MCP (Model Context Protocol) server for performing a11y test on webpages using playwright axe-core. The results are then used in an agent loop with your favorite AI assistant (Cline/Cursor/GH Copilot) to find problems with a11y and suggest improvements.

## Features

- Perform detailed accessibility testing on any web pages
- Get an overview of accessibility issues
  - Violations
    - Provides information on which DOM was at fault
  - Passes
  - Incomplete
  - Inapplicable
- Can specify specific WCAG criteria（Default WCAG 2.0 level A, WCAG 2.0 level AA, WCAG 2.1 level A, WCAG 2.1 level AA）

## Installation

```
# Global install
pnpm add -g a11y-test-mcp

# With pnpm dlx command
pnpm dlx a11y-test-mcp
```

## Configuration

Add the following to the mcpServers object:

```json
{
  "servers": {
    "a11y-test": {
      "type": "stdio",
      "command": "npx",
      "args": ["a11y-test-mcp"]
    }
  }
}
```

## Example prompt

```
Please perform accessibility testing on the following sites.
Tests should be performed at WCAG Level A.
If there are problems, please indicate which HTML elements are at fault.

* https://example.com
* https://example.com/home
```

## Release Operations (for maintainers)

This project uses a **two-stage publish workflow** on GitHub Actions:

1. `verify` job — runs lint / typecheck / build, executes `pnpm publish --dry-run` against npmjs, then performs a **real publish to a local Verdaccio registry** in CI and runs a **CLI smoke test** by installing the published tarball.
2. `publish` job — runs only after `verify` succeeds. Performs the actual `pnpm publish` to npmjs.

This guarantees that a release tag never produces a broken/half-published package on the public registry.

### Release procedure

1. Make sure `main` is green (lint workflow passes).
2. Update the version in [package.json](package.json) following SemVer:
   - `PATCH` (1.2.0 → 1.2.1): bug fixes / internal changes / docs only
   - `MINOR` (1.2.x → 1.3.0): backward-compatible feature additions
   - `MAJOR` (1.x.y → 2.0.0): breaking changes to the CLI or MCP tool API
3. Run the local pre-flight check:
   ```bash
   pnpm run release:check
   ```
   This executes: `frozen-lockfile install` → `lint` → `typecheck` → `build` → `pnpm pack --dry-run` → `pnpm publish --dry-run`.
4. Commit the version bump and push to `main`.
5. Create a Git tag matching the version **prefixed with `v`** and push it:
   ```bash
   git tag v1.2.1
   git push origin v1.2.1
   ```
6. Open the GitHub Releases page and **publish a new Release** pointing to the tag created above.
   This triggers the publish workflow.
7. Wait for the `verify` job to finish (5–10 min). If it goes green, `publish` runs automatically and the package is released to npmjs.

### Mandatory rules for contributors

- **Tag and `package.json` version must match.** The `verify` job fails on mismatch (`v1.2.1` ↔ `"version": "1.2.1"`).
- **Always commit `pnpm-lock.yaml`.** CI uses `pnpm install --frozen-lockfile`; outdated lockfile = build failure.
- **Do not run `npm publish` / `pnpm publish` manually against npmjs.** All releases must go through the GitHub Actions workflow.
- **Keep the `files` field in [package.json](package.json) accurate.** Anything not listed will not be published. Verify with `pnpm pack --dry-run`.
- **When changing `postinstall` or `bin`, expect the smoke test to catch regressions.** Test locally with the Verdaccio procedure below before pushing.
- **New runtime build dependencies that need scripts must be added to `pnpm.onlyBuiltDependencies`** (pnpm 10 disables build scripts by default).

### Recovering from a failed release

If `verify` fails, **the package is NOT published to npmjs**. To recover:

1. Delete the GitHub Release (or change it back to draft).
2. Delete the failing tag locally and remotely:
   ```bash
   git tag -d v1.2.1
   git push --delete origin v1.2.1
   ```
3. Fix the issue, bump the version again if needed, and restart the release procedure.

If `publish` fails after `verify` passed (very rare — typically a transient npm registry error), simply re-run the failed job from the Actions UI. Re-publishing the same version is impossible on npm, so a new bump is required only if the tarball was actually accepted.

### Local end-to-end publish rehearsal (optional but recommended)

To reproduce the CI verification locally — including a real publish + install — use Verdaccio:

```bash
# Terminal A: start Verdaccio
npx verdaccio

# Terminal B: in this repo
pnpm run release:check
pnpm pack
# Create a dummy user on Verdaccio
npx npm-cli-login -u dev -p dev -e dev@example.com -r http://localhost:4873

# Publish to local registry
pnpm publish --registry http://localhost:4873 --no-git-checks

# Install as an end user
mkdir /tmp/a11y-install-test && cd /tmp/a11y-install-test
npm init -y
npm install a11y-test-mcp --registry http://localhost:4873
npx a11y-test-mcp   # Should start the MCP server (Ctrl+C to exit)
```

### Versioning policy summary

| Change type                                                | SemVer | Example       |
| ---------------------------------------------------------- | ------ | ------------- |
| Internal refactor, CI changes, lockfile updates            | PATCH  | 1.2.0 → 1.2.1 |
| README / docs only                                         | PATCH  | 1.2.0 → 1.2.1 |
| New optional MCP tool / new CLI flag (backward compatible) | MINOR  | 1.2.0 → 1.3.0 |
| Removing/renaming a CLI flag, MCP tool signature change    | MAJOR  | 1.x.y → 2.0.0 |

```
```
