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
| TBD | TBD | 0.0.1788286701 | TBD | iOS or Android | All three milestone 1–2 fixtures | Not run | A supported mobile device and Obsidian build are not available in this environment. |

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

## Outstanding mobile release-blocking test

Before community publication, install the same built runtime files into a
dedicated vault on at least one supported iOS or Android Obsidian platform.
Record the device, OS version, Obsidian version, plugin version, date, and commit.
Open both self-contained extensions and the hostile fixture; repeat the visible
render, noscript, marker, navigation, popup, form, frame/object, and resource-load
checks above using platform-appropriate network inspection. Do not mark mobile
support verified until that real-device result is recorded here.
