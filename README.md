# a11y test MCP

An MCP (Model Context Protocol) server for performing a11y test on webpages using playwright axe-core. The results are then used in an agent loop with your favorite AI assistant (Cline/Cursor/GH Copilot) to find problems with a11y and suggest improvements.

## Features

- Perform detailed accessibility testing on any web pages
- Get an overview of accessibility issues
  - Violations
    - Provides information on which DOM was at fault
  - Passes
  - Incomplete (with full per-node details, not just a count)
  - Inapplicable
- Can specify specific WCAG criteria（Default WCAG 2.0 level A, WCAG 2.0 level AA, WCAG 2.1 level A, WCAG 2.1 level AA）
- WCAG levels are **expanded cumulatively**: e.g. requesting `wcag22aa` automatically also evaluates `wcag2a` / `wcag2aa` / `wcag21a` / `wcag21aa` / `wcag22a`, matching the conventional meaning of “WCAG 2.2 AA”. (axe-core tags themselves act as filters, so passing only `wcag22aa` would otherwise evaluate just the rules new to WCAG 2.2.)
- Audits warn when too few rules were evaluated (a common symptom of running axe before the SPA has finished rendering)

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

## Scenario mode (multi-step audits)

In addition to the single-URL `exec-a11y-test` tool, this server exposes
`exec-a11y-test-scenario` for **multi-step browser scenarios**. It lets you
test pages that require login, modal/menu open states, SPA route transitions,
or any UI state not reachable from a plain URL.

The scenario engine is built on top of Playwright and runs against the rendered
DOM, so it works with **any framework** (Vue / React / Svelte / Angular / Lit /
plain HTML / Web Components / SSR / SSG / CSR — all the same).

### Tool input shape

```jsonc
{
  "name": "Login then audit dashboard",
  "defaultWcagStandards": ["wcag2aa"],
  "globalTimeoutMs": 60000,
  "steps": [
    { "type": "goto", "url": "https://example.com/login" },
    { "type": "fill", "selector": "#email", "value": "${env:TEST_USER}" },
    { "type": "fill", "selector": "#password", "value": "${env:TEST_PASSWORD}" },
    { "type": "click", "selector": "button[type=submit]" },
    { "type": "waitForUrl", "url": "**/dashboard" },
    { "type": "audit", "name": "dashboard-initial" },
    { "type": "click", "selector": "button[aria-label='Open menu']" },
    { "type": "waitFor", "selector": "[role=dialog]" },
    { "type": "audit", "name": "dashboard-menu-open", "wcagStandards": ["wcag2aa", "wcag22aa"] }
  ]
}
```

### Supported steps

| Step `type`          | Required fields     | Notes                                                                                                                                                                                                                                                                                                           |
| -------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `goto`               | `url`               | Navigates to URL. Optional `waitUntil` (`load` / `domcontentloaded` / `networkidle` / `commit`).                                                                                                                                                                                                                |
| `click`              | `selector`          | Playwright selectors (CSS, `role=`, `text=`, `data-testid` etc.)                                                                                                                                                                                                                                                |
| `fill`               | `selector`, `value` | `value` supports `${env:VAR_NAME}` placeholder for secrets.                                                                                                                                                                                                                                                     |
| `select`             | `selector`, `value` | `value` may be a string or array of strings.                                                                                                                                                                                                                                                                    |
| `press`              | `key`               | Optional `selector` to focus first; otherwise sent on `page.keyboard`.                                                                                                                                                                                                                                          |
| `hover`              | `selector`          |                                                                                                                                                                                                                                                                                                                 |
| `waitFor`            | (none)              | Optional `selector` + `state` (`attached` / `detached` / `visible` / `hidden`). **Default state is `attached`** so SPA elements rendered off-screen or behind overlays don't time out; pass `state: "visible"` explicitly when strict visibility is required. Without a selector, waits for `domcontentloaded`. |
| `waitForUrl`         | `url`               | Glob / regex / string supported by Playwright.                                                                                                                                                                                                                                                                  |
| `waitForNetworkIdle` | (none)              | `page.waitForLoadState('networkidle')`                                                                                                                                                                                                                                                                          |
| `audit`              | (none)              | Runs axe-core on the current page state. Optional `name` and `wcagStandards`.                                                                                                                                                                                                                                   |

Every step also accepts:

- `label`: human-readable label shown in step log.
- `timeout`: per-step timeout in ms (default 30 000, max 120 000).
- `frame`: `{ selector?: "iframe[name=foo]", url?: "https://..." }` to scope the action inside an iframe.

### Security guards

- **No script eval**: there is no `eval` step. The DSL only exposes a fixed set of browser actions.
- **Secret placeholders only**: values are templated via `${env:VAR_NAME}` and read from `process.env`. Arbitrary expressions are not evaluated.
- **URL allowlist (optional)**: set the `A11Y_ALLOWED_ORIGINS` environment variable to a comma-separated list of URL prefixes (e.g. `https://example.com,https://*.staging.example.com`). When set, `goto` URLs not matching any prefix are rejected. Unset = no restriction.
- **Hard caps**: maximum 100 steps per scenario, 600 000 ms global timeout, 120 000 ms per-step timeout.
- **No filesystem / network side-effects**: the scenario runner does not write files or intercept requests.

### Example: passing username & password as secrets

Both username and password can be injected via environment variables — neither
needs to appear in your scenario JSON or in chat history.

#### 1. Configure the MCP server with env vars

In `.vscode/mcp.json`, declare the env vars and (optionally) prompt the user
for them at server startup using VS Code `inputs`:

```jsonc
{
  "servers": {
    "a11y-test": {
      "type": "stdio",
      "command": "npx",
      "args": ["a11y-test-mcp"],
      "env": {
        "TEST_USER": "${input:testUser}",
        "TEST_PASSWORD": "${input:testPassword}",
        "A11Y_ALLOWED_ORIGINS": "https://staging.example.com"
      }
    }
  },
  "inputs": [
    { "id": "testUser", "type": "promptString", "description": "Test user email" },
    { "id": "testPassword", "type": "promptString", "password": true, "description": "Test user password" }
  ]
}
```

Alternatively, export them in your shell before launching VS Code:

```bash
export TEST_USER='qa@example.com'
export TEST_PASSWORD='...'
```

> ⚠️ Do **not** commit raw credentials into `.vscode/mcp.json`. Use `${input:...}`
> or read from your shell environment (`"TEST_USER": "${env:TEST_USER}"`).

#### 2. Reference them in scenario steps

```jsonc
{
  "name": "Login then audit dashboard",
  "defaultWcagStandards": ["wcag2aa"],
  "steps": [
    { "type": "goto", "url": "https://staging.example.com/login" },
    { "type": "fill", "selector": "#email", "value": "${env:TEST_USER}" },
    { "type": "fill", "selector": "#password", "value": "${env:TEST_PASSWORD}" },
    { "type": "click", "selector": "button[type=submit]" },
    { "type": "waitForUrl", "url": "**/dashboard" },
    { "type": "audit", "name": "dashboard-initial" }
  ]
}
```

The scenario runner replaces `${env:VAR_NAME}` with `process.env.VAR_NAME` at
execution time. Only the literal placeholder syntax `${env:[A-Z0-9_]+}` is
resolved — arbitrary expressions are never evaluated. Step logs do **not**
record the resolved value.

### Example prompt for scenario mode

```
Please log in to https://staging.example.com and audit the dashboard at
WCAG 2.2 AA. Use the credentials stored in the environment variables
TEST_USER and TEST_PASSWORD — refer to them as ${env:TEST_USER} and
${env:TEST_PASSWORD} in the scenario steps; do not embed the raw values
directly. After the initial dashboard audit, open the user menu and run a
separate audit on that state.
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
