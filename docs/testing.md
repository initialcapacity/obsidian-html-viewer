# Testing record

This document records observed results rather than inferred support. A passing
TypeScript build does not count as a desktop or mobile Obsidian test.

## Evidence matrix

| Date | Commit | Plugin version | Obsidian version | Platform | Fixture or check | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-09-01 | Uncommitted scaffold (Git metadata unavailable) | 0.0.1788286701 | N/A | Node.js 26.7.0 on macOS 26.6.2 | Clean `npm ci`, `npm run typecheck`, `npm run check` | Pass | Lint: 0 findings. Vitest: 4 files, 18 tests passed. Strict type-check and minified production build passed. npm audit reported 0 vulnerabilities. |
| 2026-09-01 | Uncommitted scaffold (Git metadata unavailable) | 0.0.1788286701 | N/A | macOS 26.6.2 | Installed runtime artifact audit | Pass | Plugin directory contains exactly `main.js`, `manifest.json`, and `styles.css`; SHA-256 hashes match the repository build artifacts. |
| 2026-09-01 | Uncommitted scaffold (Git metadata unavailable) | 0.0.1788286701 | 1.13.7 (installer 1.13.6) | macOS 26.6.2 desktop | `self-contained.html` | Pass | Opened in the `html-document-view` iframe. Full-pane white canvas, blue bordered layout, headings, inline CSS, green embedded PNG, and fragment link rendered correctly. |
| 2026-09-01 | Uncommitted scaffold (Git metadata unavailable) | 0.0.1788286701 | 1.13.7 (installer 1.13.6) | macOS 26.6.2 desktop | `self-contained.htm` | Pass | `.htm` registered to the same custom view. Orange bordered layout, headings, inline CSS, and green embedded PNG rendered correctly. Renamed the open file to `self-contained-renamed.htm` and restored it; the tab, breadcrumb, file list, and rendered view followed the rename normally. |
| 2026-09-01 | Uncommitted scaffold (Git metadata unavailable) | 0.0.1788286701 | 1.13.7 (installer 1.13.6) | macOS 26.6.2 desktop | `hostile.html` | Pass | Noscript success was visible. No script marker, alert, popup, navigation, submission, worker, frame, or object appeared. DevTools Network was cleared before opening and remained empty. Live `srcdoc` audit found the exact CSP, empty sandbox, `no-referrer`, 0 active elements, 0 event attributes, 0 unsafe resource attributes, and inert forms. Console showed no plugin error or unhandled rejection. |
| 2026-09-01 | `10a0c3c` | 0.0.1788286701 | N/A | Node.js 26.7.0 on macOS 26.6.2 | Clean `npm ci`; lint, test, strict type-check, production build, and `npm run check` | Pass | ESLint: 0 findings. Vitest: 7 files, 32 tests passed. Both standalone and aggregate checks passed. `npm audit --audit-level=high` reported 0 vulnerabilities. |
| 2026-09-01 | `10a0c3c` | Generated `0.0.2001` / `0.0.2002` test versions | N/A | Temporary local Git repositories | Timestamp release, same-second uniqueness, partial rerun, and newer-`main` simulations | Pass | 4 Git integration tests proved annotated tags, source-SHA reuse, monotonic patches, non-force ancestry integration, and preservation of newer user content. No test refs touched this repository. |
| 2026-09-01 | `10a0c3c` | 0.0.1788286701 | N/A | actionlint 1.7.12 on macOS 26.6.2 | `.github/workflows/quality.yml` and `.github/workflows/release.yml` | Pass with documented validator exception | Current GitHub documentation supports `concurrency.queue: max`; actionlint 1.7.12 predates that key. With only its `unexpected key "queue"` diagnostic suppressed, both workflows had no findings. Static policy tests cover the retained queue. |
| 2026-09-01 | `10a0c3c` | Dry-run `0.0.1788286702` | N/A | Isolated clone on macOS 26.6.2 | Full-repository release preparation, tagged checks/build, and rerun | Pass | The annotated tag changed exactly `manifest.json`, `package.json`, `package-lock.json`, and `versions.json`; the prior version mapping remained. All 32 tests and checks passed at the tag. A rerun with a later clock reused the identical release commit/tag. The clone was not pushed. |
| 2026-09-01 | `1e41bda` | 0.0.1788290428 | 1.13.7 | macOS 26.6.2 desktop | Clean installation using the three downloaded first-release assets | Pass | Installed only the downloaded `main.js`, `manifest.json`, and `styles.css`. Their SHA-256 hashes matched the release assets and verified GitHub provenance attestations. Both self-contained extensions and the hostile fixture rendered correctly. |
| 2026-09-01 | `b8474c1` | 0.0.1788290428 release-equivalent local build | N/A | Node.js 26.7.0 on macOS 26.6.2 | iOS first-render regression test and complete automated suite | Pass | The iframe is visible for one layout frame before `srcdoc` navigation. ESLint: 0 findings. Vitest: 7 files, 33 tests passed. Strict type-check and minified production build passed. |
| 2026-09-01 | `b8474c1` | 0.0.1788290428 release-equivalent local build | 1.13.7 | macOS 26.6.2 desktop | Fresh first open of `self-contained.html` and `hostile.html` | Pass | After an Obsidian reload, each fixture rendered immediately when opened directly. The hostile fixture showed `SUCCESS: scripting is disabled.` with no active marker or navigation. |
| 2026-09-01 | `b8474c1` | 0.0.1788290428 release-equivalent local build | 1.13.7 | iPhone 16 Pro, iOS 26.6 | Fresh first open of `self-contained.html` | Pass, maintainer-observed | Before the fix, the first open painted blank until navigating away and back. After syncing the fixed runtime and fully restarting Obsidian, the document rendered immediately on first open. |
| 2026-09-01 | `b8474c1` | 0.0.1788290428 release-equivalent local build | 1.13.7 | iPhone 16 Pro, iOS 26.6 | `hostile.html` visible security behavior | Pass, maintainer-observed | `SUCCESS: scripting is disabled.` appeared immediately. The maintainer confirmed no popup or navigation occurred. Direct mobile network capture was not performed; that evidence remains outstanding below. |

## Automated security coverage

The unit suite must verify all of the following before a manual install:

- exact CSP text and placement as the first element in `<head>`;
- an empty iframe sandbox and `no-referrer` policy;
- removal of scripts, embedded active elements, event attributes, authored CSP,
  base elements, meta refresh, remote stylesheets, and unsafe URLs;
- disabled forms and fragment-only navigation;
- preservation of inline CSS, allowlisted raster data images, and `<noscript>`;
- browser error recovery for incomplete HTML;
- no HTML-string insertion API in runtime source;
- no Node.js, Electron, or network API in runtime source; and
- consistent fixed identity/version metadata.

## Desktop manual procedure

Use only the dedicated vault explicitly approved by the maintainer.

1. Run a clean `npm ci`, then `npm run check`.
2. Run `npm run install:local -- --vault <approved-test-vault>`.
3. Copy the three fixtures into a clearly named test folder in that vault.
4. Launch Obsidian, confirm its version, enable **HTML Document Viewer**, and
   open `self-contained.html` and `self-contained.htm`.
5. Confirm the unmistakable heading, bordered layout, inline styling, embedded
   image, and full-pane sizing in both files.
6. Rename an open fixture through Obsidian and confirm the tab/file behavior is
   normal, then restore its name.
7. Open developer tools, clear the Network panel, and open `hostile.html`.
8. Confirm `SUCCESS: scripting is disabled.` is visible and no `SCRIPT RAN`
   marker or script-created data attribute appears.
9. Confirm there is no alert, popup, navigation, form submission, worker,
   embedded frame, or object.
10. Confirm the Network panel contains no request caused by the hostile document,
    including requests to `attacker.invalid` and no `file:` or `app:` load.
11. Disable the plugin or close the view and confirm the frame is blanked without
    an unhandled rejection.

## Remaining mobile release-blocking check

The real-device rendering, no-script, popup, and navigation checks passed on the
iPhone recorded above. Before Community submission, complete a
platform-appropriate network observation while opening `hostile.html` and record
that no document-authored remote, `file:`, or `app:` request was attempted. The
automated sanitizer/CSP tests and the desktop Network-panel test are green, but
they do not replace the mobile observation required by the specification.
