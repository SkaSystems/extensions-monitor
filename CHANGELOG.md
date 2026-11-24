# Change Log

All notable changes to the "extensions-monitor" extension are documented in this file.

This project follows [Keep a Changelog](http://keepachangelog.com/) conventions.

## [1.15.0] - 2026-11-24

### Added
- Self-update. About 30 seconds after VSCode starts, and then every hour, the
  monitor asks the VS Code Marketplace for its latest published version. If a
  newer one exists, it installs it with VSCode's own
  `workbench.extensions.installExtension` command. This works even when the
  student has turned extension auto-update off. The new version runs after
  the window reloads; a notification offers to reload. Each update, and any
  failure, is written to the activity log. The check is skipped in
  development and test runs.

## [1.14.0] - 2026-11-24

### Added
- Built-in AI features are now switched off in EXAM MODE. Recent VSCode
  versions ship GitHub Copilot Chat (`GitHub.copilot-chat`) and
  `TypeScriptTeam.jsts-chat-features` as built-in extensions, which cannot be
  uninstalled. The monitor sets the user setting `chat.disableAIFeatures` to
  `true`, which turns off Copilot Chat, inline suggestions and the related
  built-in AI features.
- Banned extensions are now disabled by VSCode itself, not only flagged. In
  EXAM MODE the monitor writes the user setting `extensions.allowed` from the
  remote `blacklist` sheet, the `monitoredExtensions.blockedList` setting and
  any installed extension the keyword matcher flags. Ids on the `whitelist`
  sheet, the user whitelist and the monitor itself are never blocked. VSCode
  disables the listed extensions and refuses to install them. Built-in
  extensions are not affected by this setting (see above).
- If a student changes either setting during EXAM MODE, the change is reverted
  immediately and written to the activity log.
- When a banned extension is already running, a warning offers to reload the
  window, which is needed for VSCode to stop it.
- The student's own values for both settings are saved and restored when the
  sheet switches to LECTURE MODE.

### Changed
- The password prompt for a built-in extension now asks the student to
  disable it (Extensions view > Built-in > Disable), since it cannot be
  removed.
- A correct instructor password now only dismisses the prompt. Banned
  extensions stay disabled through `extensions.allowed` until LECTURE MODE.

### Fixed
- After the maximum number of failed password attempts (pressing Escape
  counts), the monitor stopped checking for the rest of the session because
  the `isCurrentlyBlocked` flag was never cleared. The flag is now cleared,
  the failure is logged, and the prompt returns on the next check.

### Removed
- The unused `typescriptteam.jsts-chat-features` entry in `config.js`. Since
  1.13.0 the matcher does not read that file; use the `blacklist` sheet.

## [1.13.0] - 2026-05-12

### Added
- Remote-managed blocklist and allowlist. The Google Apps Script now reads two
  new sheets (`blacklist` and `whitelist`) in the source spreadsheet and
  returns the contents in the same `doGet` response as the activation flag.
  Instructors can edit either sheet at any time without redeploying or
  republishing the VSCode extension.
- Hourly refresh of the remote configuration. The extension fetches the
  activation flag and both lists at startup and again every 60 minutes, so
  changes propagate to running VSCode instances without requiring a restart.
- Offline cache. The most recent successful response (lists only) is stored in
  the extension's `globalState`. If the next fetch fails, the cached lists are
  used and the extension defaults to EXAM MODE as a fail-safe.

### Changed
- **Breaking** for the matching logic: `isExtensionBanned` now takes two
  additional optional parameters, `remoteBlacklist` and `remoteWhitelist`. The
  previous hardcoded `BANNED_EXTENSIONS` and `WHITE_LIST_EXTENSIONS` arrays in
  `config.js` are no longer consulted by the matcher; the remote sheets are the
  sole authoritative source for explicit-id allow and deny lists. The matcher's
  built-in protections that remain in code: `vscode.*` and `ms-vscode.*`
  exemption, description-keyword detection, and id-keyword detection.
- Apps Script `doGet` response shape now includes `blacklist` and `whitelist`
  alongside `isActive`. Older deployments that return only `isActive` remain
  compatible (the extension treats missing arrays as empty).
- The `extension.listInstalledExtensions` quick-pick now reports the
  ALLOWED / NEUTRAL badge using the remote whitelist plus the user setting.

### Spreadsheet setup
Two new sheets in the existing Google Spreadsheet:
- `blacklist`: column A, row 1 header "extensionId", rows 2+ one extension id
  per row.
- `whitelist`: same format. Empty cells are skipped.

## [1.12.1] - 2026-05-12

### Fixed
- The matcher no longer flags the `extensions-monitor` extension itself. Its
  package description contains the phrase "AI-assisted coding extensions",
  which matched the `ai-assist` description keyword and caused the matcher to
  block the monitor before its own activation could complete.
- The matcher now consults the hardcoded `WHITE_LIST_EXTENSIONS` list and the
  user's `monitoredExtensions.whiteList` setting before running any of the
  banning checks. Previously the whitelist was advertised in the README and
  the default settings but was never honored by the blocking logic.
- `vscode.*` and `ms-vscode.*` built-in extensions are now exempt from the
  matcher, preventing false positives on bundled language features whose
  descriptions happen to mention AI-adjacent terms.

## [1.12.0] - 2026-05-11

### Added
- `typescriptteam.jsts-chat-features` (the "JS/TS Chat Features" extension bundled with recent VSCode versions) added to the hardcoded banned list.
- New configuration keys under the `extensionsMonitor.*` namespace:
  - `extensionsMonitor.pollIntervalSeconds` — control how often installed extensions are re-checked.
  - `extensionsMonitor.unlockGraceSeconds` — control the grace period after a successful unlock.
  - `extensionsMonitor.logFilePath` — override the default log file location (no longer hardcoded to `~/Desktop/log`).
  - `extensionsMonitor.maxPasswordAttempts` — cap consecutive password retries.
- `extension.listInstalledExtensions` command (Ctrl+Shift+L / Cmd+Shift+L) — now functional; opens a quick-pick showing every installed extension with a BANNED / ALLOWED / NEUTRAL badge.
- Unit tests for the extension-matching logic (`test/matcher.test.js`).
- Smoke test verifying extension activation and command registration (`test/extension.test.js`).

### Changed
- Raised minimum VSCode engine from `^1.73.0` to `^1.85.0`.
- Bumped dev dependencies: `@vscode/test-cli` → `^0.0.12`, `@vscode/test-electron` → `^2.5.2`, `eslint` → `^9.39.0`, `@types/mocha` → `^10.0.10`, `@types/vscode` → `^1.85.0`.
- Password prompt is now iterative with a configurable max-attempts cap instead of recursive — no risk of stack growth on repeated wrong inputs.
- Polling cadence and unlock-grace duration are now separate, named, and configurable (previously both reused the same hardcoded constant).
- Webview HTML for EXAM/LECTURE modes extracted from `extension.js` into `media/views/exam.html` and `media/views/lecture.html`.
- Extracted the banned-extension matching logic into `lib/matcher.js` as a pure function for testability.
- ESLint rules tightened: `no-const-assign`, `no-undef`, `no-empty`, `constructor-super`, `valid-typeof`, `no-this-before-super` are now errors (previously all warnings).

### Fixed
- `writeToLogFile` referenced an out-of-scope `err` identifier in its catch block, throwing `ReferenceError` if the outer try failed.
- `checkBlockedExtensions` had an empty `catch (e) {}` that silently swallowed every error.
- Removed unused `checkCopilotSettings` helper that called `config.update('github.copilot.enable', …)` on a configuration already scoped to `github` (the key was double-prefixed).
- Default whitelist had a duplicate `ritwickdey.liveserver` entry and a bogus `ms-vscode.live-serve` identifier — both removed.
- Whitelist setting description used to read "List of extensions to block." (copy-pasted from blocklist) — now reads "List of extensions to allow (bypasses blocking).".
- Hardcoded `WHITE_LIST_EXTENSIONS` in `config.js` contained several duplicate entries — deduped.

### Removed
- `encryption.js` — the module was broken (ES `import` syntax in a CommonJS project, referenced an undefined `key` variable, imported Node's `crypto` while the dependency was `crypto-js`) and unused anywhere in the codebase.
- `crypto-js` dependency — only consumer was the removed `encryption.js`.
- Large block of commented-out `checkWhitelistOnlyExtensions` code in `extension.js`.
- Informational `console.log` calls left over from debugging (in `extension.js` and `password.js`). `console.error` paths retained.
- `process.context` / `process.logFilePath` global stashing — replaced with module-scoped variables.

## [1.11.0]

- Fixed credential validation to handle numeric responses (1/0) from Google Apps Script.
- Added support for both boolean and numeric authentication responses.

## [1.10.0]

- Fixed webview panel not displaying content.
- Added webview type declaration in package.json.
- Added proper HTML DOCTYPE and meta tags.
- Enabled scripts in webview options.

## [1.9.0]

- Enhanced sidebar panel with detailed status information.
- Added SVG icons for EXAM/LECTURE modes.
- Added feature list with icons explaining current restrictions.
- Improved visual styling with status badges.

## [1.8.0]

- Updated Google Apps Script deployment URL.

## [1.7.0]

- Added remote activation control via Google Sheets.
- New EXAM MODE / LECTURE MODE toggle.
- Status checked at VSCode startup.
- Updated UI: red sidebar for exam mode, blue for lecture mode.
- Improved README with setup instructions.

## [1.6.0]

- Improved README documentation.

## [1.5.0]

- Added dual status bar indicators (left yellow, right red).
- Added activity bar badge indicator.
- Added green sidebar panel.
- Expanded AI extension blocklist to 100+ extensions.
- Added keyword detection for Claude, Anthropic, Codeium, Tabnine, etc.
- Fixed Google Apps Script authentication.
- Added 15-second grace period after unlock.
- Updated minimum VSCode version to 1.73.0.

## [1.0.0]

- Initial release with basic extension monitoring.
- GitHub Copilot and ChatGPT blocking.
- Password-protected unlock feature.
