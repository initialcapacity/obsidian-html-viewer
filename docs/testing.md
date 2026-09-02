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
| 2026-09-01 | `b8474c1` | 0.0.1788290428 release-equivalent local build | 1.13.7 | iPhone 16 Pro, iOS 26.6 | `hostile.html` visible security behavior | Pass, maintainer-observed | `SUCCESS: scripting is disabled.` appeared immediately. The maintainer confirmed no popup or navigation occurred. |
| 2026-09-01 | `29cdb83` | 0.0.1788292792 | N/A | GitHub-hosted Ubuntu runner and clean local install on macOS 26.6.2 | Automatic release and independent asset verification | Pass | The workflow completed every source/tagged check, produced one annotated monotonic tag and published release, and verified the default-branch manifest. A clean local `npm ci` and `npm run check` passed all 33 tests. Downloaded `main.js`, `manifest.json`, and `styles.css` were byte-identical to a fresh local build, matched their published SHA-256 digests, and passed GitHub provenance verification. |
| 2026-09-01 | `29cdb83` | 0.0.1788292792 | 1.13.7 | iPhone 16 Pro, iOS 26.6 and LAN test server on macOS 26.6.2 | Mobile no-network control test | Pass, maintainer and server observed | Safari first fetched a temporary LAN control page, proving phone-to-server reachability. Obsidian then opened a synced hostile probe containing remote stylesheet, image, and scripted-fetch URLs for that server and showed `SUCCESS: scripting is disabled.` Two subsequent server-log observations contained zero new requests. |
| 2026-09-01 | `38a85d1` | 0.0.1788293616 | N/A | Obsidian Community directory | Publication and automated review | Pass with one style advisory | The public listing is live at `https://community.obsidian.md/plugins/html-document-viewer`. Artifact attestations, suspicious-network scanning, dependency scanning, obfuscation scanning, and byte-for-byte build reproduction passed. The reviewer reported only `obsidianmd/prefer-create-el` at three plugin-owned structural element creation sites; the detached-document CSP insertion intentionally uses the owning document's standard DOM API. |
| 2026-09-01 | `c70b9b4` | 0.0.1788294198 | 1.13.7 | macOS 26.6.2 desktop | Clean Community-directory uninstall, install, enable, restart, and first-open test | Regression found | The public build installed and rendered `self-contained.html`, but reopening the test vault in a second Obsidian window exposed a suspended `requestAnimationFrame`: the view remained on `Loading HTML document…` while its owner document was hidden. The Community-installed artifact was preserved for comparison and the issue was fixed before signing off the desktop check. |
| 2026-09-01 | `e8aa544` | 0.0.1788295977 | N/A | Node.js 26.7.0 on macOS 26.6.2 and GitHub-hosted Ubuntu runner | Hidden-window fallback regression test and complete automated release suite | Pass | The layout wait now preserves the visible animation-frame path and has a bounded timer fallback for hidden documents. ESLint reported 0 findings; all 34 Vitest tests, strict type-check, production build, tagged reruns, asset checks, provenance generation, and published-release verification passed. |
| 2026-09-01 | `e8aa544` | 0.0.1788295977 | 1.13.7 | macOS 26.6.2 desktop | Clean Community-directory uninstall, install, enable, restart, and fixture smoke test | Pass | Obsidian showed version `0.0.1788295977`. The downloaded manifest and stylesheet hashes matched the release assets; `main.js` matched the 5,429-byte release asset exactly before Obsidian's appended `/* nosourcemap */` marker. After closing and reopening the dedicated test vault, `self-contained.html` rendered immediately with its blue layout, inline CSS, green embedded PNG, and fragment link. `hostile.html` showed `SUCCESS: scripting is disabled.` with blocked remote/file/app/traversal images, no script marker, popup, or navigation. |
| 2026-09-01 | `de72684` | 0.0.1788296371 | 1.13.7 | iPhone 16 Pro, iOS 26.6 | Clean Community-directory installation, restart, and fixture smoke test | Pass, maintainer-observed | The maintainer installed and enabled the public Community build, fully restarted Obsidian, and confirmed that both self-contained extensions rendered correctly and immediately. `hostile.html` showed `SUCCESS: scripting is disabled.` without a `SCRIPT RAN` marker, alert, popup, navigation, or form submission; document-authored remote, file, app, and traversal resources remained blocked. |
| 2026-09-01 | Working tree based on `ecac94c` | 0.0.1788297260 | N/A | Node.js 26.7.0 on macOS 26.6.2 | Milestones 5–6 lifecycle, race, and isolation suite plus `npm run check` | Pass | ESLint reported 0 findings. Vitest passed 8 files and 54 tests, including 18 render-coordinator and 6 iframe-lifecycle tests. Strict type-check and the minified production build passed. Coverage proves 150 ms burst debouncing, immediate stale-render invalidation, current/stale failure behavior, object-URL revocation, layout-callback cancellation, same-folder and rename relevance, unrelated-folder rejection, reset cleanup, and two independent state containers. |
| 2026-09-01 | Working tree based on `ecac94c` | 0.0.1788297260 local build | 1.13.7 | macOS 26.6.2 desktop | `live-update-a.html` / `live-update-b.html`, same file split into two panes | Pass | Installed the three local runtime artifacts into the approved `test-vault` and force-loaded that build. Both panes initially rendered version B, then independently refreshed in place to version A within the debounce window after one external source update. Splitting resized the original pane; text wrapped and the plugin introduced no horizontal overflow. Closing the right tab left the first rendered pane intact, and a later A-to-B source update refreshed the surviving pane without reopening it. |
| 2026-09-01 | Working tree based on `04a63e5` | 0.0.1788298548 local build | 1.13.7 | macOS 26.6.2 desktop | Obsidian DOM-helper advisory fix; `live-update.html`, `self-contained.html`, and `hostile.html` | Pass | Replaced every runtime `document.createElement` call with Obsidian `createEl`/`createDiv` helpers, including CSP creation on the detached parsed document's own `<head>`. The Obsidian lint rule is enabled and reports 0 warnings. After a clean Obsidian process restart, the existing live-update view reopened, the styled self-contained document and embedded data image rendered, and the hostile fixture showed `SUCCESS: scripting is disabled.` with its unsafe resources blocked. |
| 2026-09-01 | `674269b` | 0.0.1788300334 | 1.13.7 | iPhone 16 Pro, iOS 26.6 | Already-open `live-update.html` refreshed after its synced source changed | Pass, maintainer-observed | With the fixture open on mobile, the maintainer changed its source on desktop, waited for Obsidian Sync, and confirmed that the existing mobile view updated in place without navigating away or reopening the document. |
| 2026-09-01 | Working tree based on `15353ff` | 0.0.1788300592 local build | N/A | Node.js 26.7.0 on macOS 26.6.2 | Milestones 7–9 lifecycle, malformed-document, asset-loader, and security suite plus `npm run check` | Pass | ESLint reported 0 findings. Vitest passed 11 files and 112 tests. Strict type-check and the minified production build passed; npm audit reported 0 vulnerabilities. Coverage includes exact same-folder resolution, encoded and Unicode paths, MIME allowlisting, partial failures, CSS serialization safety, browser HTML recovery, valid-after-failure behavior, disable cleanup source boundaries, and unchanged iframe security attributes. |
| 2026-09-01 | Working tree based on `15353ff` | 0.0.1788300592 local build | 1.13.7 | macOS 26.6.2 desktop | Three disable/re-enable cycles; two open HTML leaves; `invalid/*.html` | Pass | Each disable detached both HTML leaves and left one ordinary new tab. After the third re-enable, `index.html` reopened immediately. A subsequent stylesheet edit produced exactly one iframe load, showing that vault handling was not duplicated. Missing tags, fragment-only markup, malformed attributes, unusual Unicode, an empty file, and asset lookup failures all recovered or displayed safe text; switching from the empty fixture back to the valid fixture worked without an error or stale view. |
| 2026-09-01 | Working tree based on `15353ff` | 0.0.1788300592 local build | 1.13.7 | macOS 26.6.2 desktop | `same-folder-assets/index.html`, `style.css`, `image.png`, and `failures.html`, including the same document in two panes | Pass | The local stylesheet produced the distinctive green card and the vault PNG rendered. Editing the stylesheet and image changed both open panes in place; restoring them returned both panes to green. The failures fixture kept usable content and showed safe plain-text warnings for every missing, unsupported, traversal, absolute, nested, encoded-traversal, HTTP(S), `file:`, and `app:` reference. DevTools showed CSP blocking the remote CSS import and CSS image URL, with 0 `attacker.invalid` resource entries. |
| 2026-09-01 | `5cff652` | 0.0.1788303302 | N/A | GitHub-hosted Ubuntu runner and Obsidian Community directory | Automatic release, independent asset verification, provenance, and Community review | Pass | Every source and tagged-release check passed. The published `main.js`, `manifest.json`, and `styles.css` were byte-identical to a fresh local build and all three provenance attestations verified. The Community review passed release-attestation, suspicious-network, vault-access, dependency, obfuscation, and byte-for-byte build-reproduction checks; version 0.0.1788303302 became the current public release. |
| 2026-09-01 | `5cff652` | 0.0.1788303302 Community build | 1.13.7 | iPhone 16 Pro, iOS 26.6 | `same-folder-assets/index.html`, `style.css`, and `image.png` | Pass, maintainer-observed | The synced fixture initially rendered its green stylesheet and green raster image. With the document left open, a desktop stylesheet change refreshed the mobile card to purple while the image remained green; a separate image change then refreshed the image to purple while the card remained purple. Neither update required navigation or reopening. The synced files were restored byte-for-byte to the committed green baseline afterward. |
| 2026-09-01 | Working tree based on `aaef36e` | 0.0.1788311102 local build | N/A | Node.js 26.7.0 on macOS 26.6.2 | Adversarial hardening, feature, and behavioral-view suite plus `npm run check` | Pass | ESLint reported 0 findings. Vitest passed 12 files and 132 tests. Strict type-check and the minified production build passed; `npm audit --audit-level=high` reported 0 vulnerabilities. Coverage now includes resource budgets and deduplication, render-wide cancellation, pre-read file rejection, exact raw CSS preservation and stylesheet semantics, MathML safety, special request attributes, warning layout, behavioral view integration, and pre-push release validation. |
| 2026-09-01 | Working tree based on `aaef36e` | 0.0.1788311102 local build | 1.13.7 | macOS 26.6.2 desktop | `mathml.html`, `css-raw-text.html`, `same-folder-assets/failures.html`, and `hostile.html` | Pass | After a full Obsidian process restart, native MathML rendered as a purple equation with its accessibility label while the unsafe `annotation-xml` content remained absent. DevTools computed the raw-CSS fixture's child-selector border as `rgb(22, 163, 74)`, nested-selector text as `rgb(124, 58, 237)`, and generated content as `" <&> preserved"`. The failure warning had `position: static`; its bottom and the iframe top were both `190.9921875`, proving it consumed layout rather than covering content. The hostile fixture continued to report its HTTP(S), `file:`, `app:`, and traversal resources as blocked. Obsidian's plugin-reload control retained the prior JavaScript, so the new runtime was verified only after a full process restart. |
| 2026-09-01 | `aaef36e` | 0.0.1788311102 Community build | 1.13.7 | iPhone 16 Pro, iOS 26.6 | `mathml.html`, `css-raw-text.html`, and `failures.html` | Invalid regression attempt; fixed bundle absent | The maintainer confirmed the displayed version and force-quit Obsidian, but none of the new expectations appeared. Artifact comparison then proved the approved vault had the published `main.js` (`46260bd8…`, excluding Obsidian's suffix) and `styles.css` (`412cc11a…`), not the fixed working-tree artifacts (`52aa33bf…` and `173d6e9d…`). The shared manifest hash and version therefore did not prove runtime parity. The observed mobile behavior is consistent with those public assets; the fixed source requires a new release before this regression can be evaluated. |
| 2026-09-01 | `bf72360` | 0.0.1788317389 | N/A | GitHub-hosted Ubuntu runner | Hardened pre-push release workflow and published artifact verification | Pass | Source and exact tagged-release lint, all 132 tests, strict type-check, production build, required-asset checks, atomic main/tag push, provenance generation, release publication, and final remote verification all passed. Published `main.js` (`52aa33bf…`) and `styles.css` (`173d6e9d…`) matched the desktop-tested fixed build exactly. |
| 2026-09-01 | `bf72360` | 0.0.1788317389 Community build | 1.13.7 | iPhone 16 Pro, iOS 26.6 | `mathml.html`, `css-raw-text.html`, and `failures.html` | Pass, maintainer-observed | After installing the new Community release and force-quitting Obsidian, the maintainer validated all three regressions: native static MathML rendered, raw CSS child/nested selectors and generated content rendered correctly, and the resource-warning banner remained readable above rather than over the surviving document content. |
| 2026-09-02 | Working tree based on `5c330d0` | 0.0.1788317881 local build | N/A | Node.js 26.7.0 on macOS 26.6.2; Chromium and WebKit | Dependency update, release-credential isolation, feature, compatibility, coverage, and browser security suites | Pass | ESLint reported 0 findings. Vitest passed 19 files and 165 tests with 91.33% line and 81.56% branch coverage. Current and minimum Obsidian API type checks and the production build passed. Playwright proved in both engines that hostile prepared HTML made zero server requests, executed no script, opened no popup, and did not navigate. `npm audit --audit-level=low` reported 0 vulnerabilities. |
| 2026-09-02 | Working tree based on `5c330d0` | 0.0.1788317881 local build | 1.13.7 | macOS 26.6.2 desktop | Packaged feature, security, refresh, split-pane, print, and lifecycle smoke test | Pass after three live regressions were found and fixed | Nested linked CSS, inline and linked-CSS image paths, responsive image markup, source/preview, 100–110% zoom and reset, safe relative navigation, missing-target warnings, diagnostics copy, native Print dialog, MathML, and `.htm` all worked. The smoke test found author CSS overriding `hidden`, opaque-sandbox printing, and stale cached reads; regression tests now cover visibility and fresh reads, and the secure parent-owned print path opened the native dialog. Same-size green→purple→green stylesheet changes committed into both open panes. The hostile fixture showed the no-script success marker, no popup or navigation, and zero `attacker.invalid` requests in a cleared filtered Network panel. Disabling removed every viewer root and detached the HTML leaf; re-enabling loaded the plugin and reopened the fixture. Final automated verification passed 20 files and 168 tests, both browser security runs, the production build, and an audit with 0 vulnerabilities. |
| 2026-09-02 | `b96726e` | 0.0.1788371054 | N/A | GitHub-hosted Ubuntu runner | Automatic two-job release and independent artifact verification | Pass | The read-only job passed the clean install, 168 tests, both type checks, production build, and Chromium/WebKit security suite. The publishing job atomically pushed the release commit and tag, attested all three assets, published the release, then downloaded and compared every asset and verified its provenance. |
| 2026-09-02 | Working tree based on `6ea3862` | 0.0.1788371054 local build | N/A | Node.js 26.7.0 on macOS 26.6.2; Chromium and WebKit | Toolbar and control-feature removal | Pass | Removed the complete toolbar module plus reload, source/preview, zoom, print, diagnostics, and parent-owned navigation behavior. The simplified view owns only its safe status element and sandboxed iframe. All 165 remaining tests, lint, current and minimum API type checks, coverage, production build, and both browser security runs passed. |

## Automated security coverage

The unit suite must verify all of the following before a manual install:

- exact CSP text and placement as the first element in `<head>`;
- an empty iframe sandbox and `no-referrer` policy;
- removal of scripts, embedded active elements, event attributes, authored CSP,
  base elements, meta refresh, remote stylesheets, special request attributes,
  and unsafe URLs;
- disabled forms and fragment-only navigation;
- exact raw-text preservation of inline and local CSS, safe escaping of closing
  style tokens, allowlisted line-wrapped raster data images, and `<noscript>`;
- preservation of static presentation MathML with removal of
  `annotation-xml` integration content;
- browser error recovery for incomplete HTML;
- no HTML-string insertion API in runtime source;
- no Node.js, Electron, or network API in runtime source; and
- consistent fixed identity/version metadata;
- property-tested relative vault path resolution, including nested, parent,
  encoded, Unicode, absolute, scheme, and vault-escaping input;
- raster-image MIME, magic-byte, dimension, and decoded-pixel validation for
  PNG, GIF, JPEG, WebP, and AVIF, plus isolated missing/unsupported failures;
- safe stylesheet adoption without source-text HTML interpolation;
- stylesheet media, title, disabled, and alternate semantics;
- responsive `srcset`, `<picture>`, inline CSS image URLs, and linked-stylesheet
  image URLs resolved relative to the correct vault file;
- fixed DOM element-count and nesting-depth limits;
- fixed source, reference, per-asset, aggregate-byte, and embedded-output limits;
- deduplicated asset reads and abort propagation through stale render work; and
- behavioral view integration for srcdoc commit, warnings, stale reads, and
  close cleanup;
- plugin registration and complete disable cleanup; and
- read-only dependency installation separated from release write credentials,
  immutable action pins, and non-persisted checkout credentials.

The lifecycle suite also verifies:

- a 150 ms refresh debounce with one callback for a rapid burst;
- stale-render invalidation before asynchronous work can commit;
- refresh and layout-timer cancellation during view cleanup;
- exact current-file and tracked-dependency create/modify/delete/rename
  relevance, including old rename paths;
- rejection of unrelated vault changes; and
- isolation between two independent view-state coordinators.

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

## Mobile network observation

The real-device rendering, no-script, popup, navigation, and no-network checks
passed on the iPhone recorded above. The network test used a temporary HTTP
server reachable only on the local network. A Safari control request returned
success, while opening the hostile probe in Obsidian caused no request for its
stylesheet, image, or scripted-fetch endpoints. The server was stopped
immediately after the observation.

## Remaining manual verification

The original milestones remain manually verified by release `0.0.1788317389`.
The nested-asset and responsive-image features have automated and packaged
desktop coverage but still need a focused mobile Obsidian smoke test. The
toolbar and all associated controls were removed after mobile review. The
revised two-job release workflow passed operationally for release
`0.0.1788371054`.

## Asset representation deviation

`SPEC.md` prefers parent-created `blob:` URLs for images and a
`data:text/css` stylesheet URL. Real Obsidian 1.13.7 testing showed that an
empty-sandbox `srcdoc` frame has an opaque origin and cannot load a parent
`blob:app://obsidian.md/...` URL. Obsidian's inherited application CSP also
blocks external data stylesheets before the plugin CSP is considered. The
implementation therefore converts allowlisted vault image bytes to base64 data
URLs and adopts stylesheet text into a detached `<style>` element via
`textContent`. This keeps the required empty sandbox, vault-only lookup, and
no-network boundary intact. Serializer tests cover `</style>` injection, and
the desktop DevTools observation above confirms that remote CSS references are
blocked before any request is recorded.
