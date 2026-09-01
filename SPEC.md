# HTML Document Viewer — implementation specification

## 1. Objective

Build, test, release, and publish a simple, robust Obsidian community plugin that displays static HTML documents stored in an Obsidian vault.

The plugin is a read-only viewer. It must render ordinary static HTML while treating every HTML file as untrusted content. Scripts must not run, resources outside the vault must not load, and the document must never be inserted into Obsidian's own DOM.

This specification is written for a Codex implementation agent. Work through the milestones in order, keep the repository usable after every milestone, and do not claim a milestone is complete without satisfying its acceptance criteria.

## 2. Fixed project identity

| Field | Value |
| --- | --- |
| Product name | HTML Document Viewer |
| Obsidian plugin ID | `html-document-viewer` |
| Author | Tyson Gern |
| Repository | `https://github.com/initialcapacity/obsidian-html-viewer` |
| Supported platforms | Obsidian desktop and mobile |
| Development model | Trunk-based development on `main` |
| Version format | `0.0.<Unix timestamp in UTC seconds>` |

The repository name intentionally differs from the plugin ID. Current Obsidian publication rules prohibit plugin IDs containing `obsidian`, so the immutable manifest ID is `html-document-viewer`. Do not change the ID after publication.

The project is licensed under the MIT License. Add the standard MIT `LICENSE` text with copyright attribution to Tyson Gern and identify the applicable copyright year from the repository's initial publication date.

## 3. Product boundaries

### Required

- Open `.html` and `.htm` files from the vault in a normal Obsidian file view.
- Render static HTML and inline CSS.
- Support ordinary relative raster images and external CSS files located in the same vault folder as the HTML file.
- Refresh open views when the HTML file or a supported same-folder asset changes.
- Work in more than one pane at the same time.
- Fail safely on invalid, incomplete, missing, or unreadable content.
- Work without Node.js, Electron, filesystem-adapter, or desktop-only APIs at runtime.
- Make no telemetry or network requests.

### Explicitly out of scope for the first public version

- Editing HTML inside the viewer.
- Executing JavaScript, inline event handlers, WebAssembly, workers, or embedded active content.
- Loading HTTP, HTTPS, protocol-relative, `file:`, or arbitrary `app:` resources supplied by a document.
- Forms, downloads, popups, embedded frames, meta refresh, or top-level navigation.
- Vault-aware link navigation.
- Assets outside the HTML file's own folder.
- CSS `@import`, CSS `url(...)` asset rewriting, `srcset`, web fonts, audio, and video.
- Settings whose only purpose would be to weaken the security model.

Do not add speculative features. If a requirement would expand these boundaries, document it for a later release instead of quietly broadening the plugin.

## 4. Technical architecture

### 4.1 Obsidian integration

Use the current official Obsidian sample plugin as the starting structure and TypeScript as the source language.

The plugin entry point must:

1. Register one custom view type, `html-document-view`.
2. Register `html` and `htm` extensions, without leading dots, to that view type.
3. Create one independent view object per `WorkspaceLeaf`.
4. Clean up registered events and open resources when the plugin or view unloads.

Prefer a small `FileView` subclass over an editor implementation. Read files through `app.vault.cachedRead()` or `app.vault.read()`. Read binary assets through `app.vault.readBinary()`. Do not use `FileSystemAdapter`, absolute filesystem paths, Node.js, or Electron.

Suggested source organization:

```text
src/
  main.ts                 Plugin registration and unload behavior
  html-document-view.ts   FileView lifecycle and refresh scheduling
  prepare-html.ts         Detached parsing, sanitization, CSP, serialization
  asset-loader.ts         Same-folder asset validation and loading
  mime.ts                 Small explicit image MIME allowlist
tests/
  fixtures/
  prepare-html.test.ts
  asset-loader.test.ts
  lifecycle.test.ts
scripts/
  install-local.mjs
  release-version.mjs
.github/workflows/
  quality.yml
  release.yml
```

Keep modules smaller than necessary only when doing so makes security behavior or lifecycle ownership easier to audit.

### 4.2 Rendering boundary

Never assign document content to `contentEl.innerHTML`, `outerHTML`, or `insertAdjacentHTML`.

The Obsidian view owns a single `<iframe>`. Set all of these attributes in code:

```text
sandbox=""
referrerpolicy="no-referrer"
title="HTML document"
```

Do not add any sandbox permissions, including `allow-scripts` or `allow-same-origin`.

Render prepared content through `iframe.srcdoc`. The iframe must fill the view, have no border, and use a predictable white default canvas. Show load errors in an Obsidian-owned status element created with DOM APIs and `textContent`, never with HTML interpolation.

### 4.3 HTML preparation pipeline

Treat the source as hostile. Prepare it in a detached document before assigning `srcdoc`:

1. Parse with `DOMParser` using `text/html`. Browser error recovery is the intended handling for incomplete HTML.
2. Remove all existing `<base>` elements and existing CSP meta elements.
3. Remove `<script>`, `<object>`, `<embed>`, `<iframe>`, `<frame>`, and executable or embedded active-content elements.
4. Remove meta refresh elements.
5. Remove every attribute whose name begins with `on`, case-insensitively.
6. Disable forms and non-fragment links. Strip `action`, `formaction`, `ping`, and other navigation-producing attributes. Only `href="#fragment"` links may remain active.
7. Reject or remove all document-authored network, `file:`, and `app:` resource URLs.
8. Resolve only the explicitly supported same-folder image and stylesheet references described below.
9. Insert the plugin's CSP as the first element in `<head>`.
10. Serialize with `XMLSerializer`; do not use `innerHTML` or `outerHTML` as the serializer.

Use a CSP at least as restrictive as:

```text
default-src 'none';
script-src 'none';
connect-src 'none';
object-src 'none';
frame-src 'none';
child-src 'none';
worker-src 'none';
form-action 'none';
base-uri 'none';
img-src data: blob:;
style-src 'unsafe-inline' data: blob:;
font-src data: blob:;
media-src 'none';
manifest-src 'none';
```

Keep this policy centralized and covered by an exact unit test. The prepared document must not require `app:` or `file:` in its CSP.

### 4.4 Supported vault assets

For version 1 of the viewer, support only these relative references:

- `<img src="image.png">` and equivalent supported raster image extensions.
- `<link rel="stylesheet" href="style.css">`.
- An optional leading `./` is allowed.
- The asset must be a `TFile` in exactly the same vault folder as the HTML file.

Reject absolute paths, URL schemes, protocol-relative URLs, parent traversal, nested paths, null bytes, malformed percent encoding, and any resolved path outside the current folder.

Use a small explicit raster MIME allowlist such as PNG, JPEG, GIF, WebP, and AVIF. Do not infer a MIME type from untrusted HTML. Defer SVG until it has a separate security review because SVG can contain active content.

Load images with `Vault.readBinary()`, create `Blob` object URLs with the allowlisted MIME type, and rewrite the parsed element to that generated URL. Track every object URL owned by a view and call `URL.revokeObjectURL()` on refresh, file unload, view close, and plugin disable.

Load same-folder stylesheets as text through the Vault API. Convert the stylesheet to a `data:text/css` URL or another inert representation allowed by the CSP. Do not enable filesystem schemes. External imports and asset URLs inside CSS remain blocked by CSP and are not supported in this release.

When an asset is missing or unsupported, remove the unsafe reference and leave an accessible broken-asset indication or useful `alt` text. Do not crash the entire document.

### 4.5 Refresh and concurrency model

Each `HtmlDocumentView` owns its iframe, status element, refresh timer, render generation counter, and object URL collection. Do not store view-specific state in module globals or the plugin singleton.

Refresh the view when:

- Its current HTML file is loaded, modified, or renamed.
- A file in the same folder is created, modified, deleted, or renamed.
- The view is explicitly reopened after the plugin is enabled.

Debounce bursts by approximately 100–250 ms. Every asynchronous render receives a monotonically increasing generation number. If an older render finishes after a newer one, revoke the older render's newly created object URLs and discard its output.

On a successful refresh:

1. Finish building the new prepared document and its object URL collection.
2. Verify that its generation is still current.
3. Revoke the previous generation's object URLs.
4. Replace `iframe.srcdoc`.
5. Store the new object URL collection.

On a failed refresh, revoke any URLs created by the failed attempt and display a safe error message. No unhandled promise rejection may escape.

### 4.6 Disable and re-enable behavior

Disabling the plugin must remove or detach its HTML leaves, cancel refresh timers, unregister vault events, navigate frames to `about:blank`, and revoke all object URLs. Closing HTML tabs on disable is acceptable and should be documented because it is safer and more predictable than leaving stale custom views.

After re-enabling, opening an `.html` or `.htm` file must create a fresh working view. Repeated disable/enable cycles must not duplicate event handlers or leak frames and object URLs.

## 5. Repository and quality requirements

The repository must contain:

- `manifest.json`, `versions.json`, `README.md`, `LICENSE`, and `styles.css` at the repository root.
- TypeScript sources and the official sample plugin build configuration, updated rather than copied blindly.
- A strict TypeScript configuration.
- ESLint using the Obsidian-specific lint rules from the current sample plugin.
- Automated unit tests for pure HTML preparation, path validation, and resource cleanup logic.
- Test fixtures covering every milestone.
- A local installation script that copies `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/html-document-viewer/`.
- A `.gitignore` that excludes `node_modules`, generated maps, local vault paths, test output, and plugin data.
- No committed credentials, vault contents, absolute developer paths, or generated `main.js` unless current Obsidian publication rules explicitly require committing it.

Required package scripts:

```text
npm run dev
npm run build
npm run lint
npm test
npm run check       # lint + test + build
npm run install:local -- --vault <path>
```

`npm run build` must type-check before producing the bundle. Use `npm ci` in automation.

The README must explain installation, usage, supported resources, mobile support, the no-script guarantee, the no-network guarantee, known limitations, reporting security issues, and local development.

## 6. Milestones

### Milestone 1 — View one self-contained page and test locally

Implement the minimal plugin registration and one sandboxed iframe view. At this milestone, a self-contained file using ordinary HTML, inline styles, and `data:` images must render.

Create `tests/fixtures/self-contained.html` with unmistakable headings, layout, inline styling, and a small embedded image. Add a local installation script rather than hard-coding a vault path. If no suitable test vault is discoverable, ask the user for its path; do not create or modify an unrelated vault.

Build the plugin, install it into a real desktop Obsidian test vault, enable it, and open both `.html` and `.htm` fixtures.

Acceptance criteria:

- `npm run check` passes from a clean install.
- The built plugin contains only the expected runtime files.
- Both extensions open in the custom view.
- The self-contained page fills the pane and renders correctly.
- Renaming the HTML file preserves normal Obsidian file behavior.
- Local testing steps and observed results are recorded in `docs/testing.md` with date and Obsidian version.

### Milestone 2 — Prove that scripts and network resources do not execute

Implement the full sandbox, sanitizer, and CSP boundary before public distribution.

Create a hostile fixture containing:

- Inline and external `<script>` elements.
- Inline event handlers such as `onload` and `onerror`.
- An attempted `fetch`, worker, iframe, object, form submission, meta refresh, and top navigation.
- Remote image and stylesheet URLs.
- Absolute `file:` and `app:` URLs.
- A `<noscript>` success message visible when scripting is disabled.

Acceptance criteria:

- Unit tests prove active elements and event attributes are absent from prepared output.
- Unit tests assert the exact CSP and empty iframe sandbox.
- The fixture visibly shows its `<noscript>` success state in Obsidian.
- No script-created DOM marker appears.
- No alert, popup, navigation, form submission, worker, or embedded frame succeeds.
- Network inspection shows no request caused by the document.
- No path outside the vault can be loaded.
- The source never enters Obsidian's DOM through an HTML-string insertion API.
- The same test passes on desktop and on at least one supported mobile Obsidian platform before community publication. Record device/OS/Obsidian versions.

Security tests are release blockers. Do not introduce a “trusted mode” or bypass toggle.

### Milestone 3 — Publish through Obsidian and make the plugin installable

Prepare a public repository at `initialcapacity/obsidian-html-viewer`. Verify repository ownership and existing content before pushing; preserve any user-owned work.

Before the first release:

- Add and verify the MIT `LICENSE` with copyright attribution to Tyson Gern.
- Finish the README and manifest metadata.
- Confirm `manifest.json.id` is `html-document-viewer`.
- Confirm the repository is public.
- Run the complete clean-build and security test suite.
- Complete and record desktop and mobile smoke tests.
- Create an initial timestamp version in the form `0.0.<UTC epoch seconds>`.
- Commit that exact version to `manifest.json`, `package.json`, the lockfile, and `versions.json`.
- Create a Git tag with exactly the same version and no `v` prefix.
- Publish a GitHub release with `main.js`, `manifest.json`, and `styles.css` as individual assets.

Use the current official submission route at implementation time. As of this specification, submission is performed at `https://community.obsidian.md`: sign in with an Obsidian account, link the maintainer's GitHub account, add the plugin, address automated review feedback, and publish it. Do not use the older `obsidian-releases` pull-request process unless current official documentation explicitly directs you back to it.

The user has authorized preparing and performing the submission, but do not request or handle passwords. Use an existing authenticated browser session and pause for the user to complete sign-in or account linking when required.

Acceptance criteria:

- The GitHub tag exactly equals the committed manifest version.
- The release contains the three required assets as individual files.
- A clean manual installation from the release works.
- The Community directory submission has no unresolved automated errors.
- The plugin is published, visible in the Community directory, and installable from Obsidian on desktop and mobile.

External review is outside the agent's control. Do not falsely mark publication complete while review is pending. Record the submission URL/status and continue later engineering milestones when they are not blocked by review.

### Milestone 4 — Automatic timestamp releases from `main`

Implement trunk-based CI. Every user-authored push to `main` must run validation and, if successful, create one published release. A release-version commit made by the workflow must not recursively create another release.

Create a quality workflow for pull requests and a release workflow for pushes to `main`. The release workflow must:

1. Check out the latest `main` with complete tag history.
2. Install dependencies with `npm ci`.
3. Run lint, unit tests, type-checking, and the production build.
4. Compute `patch = max(current UTC epoch seconds, previous patch + 1)` so versions remain unique and monotonic even within one second.
5. Set `version = 0.0.<patch>` in `manifest.json`, `package.json`, the lockfile, and `versions.json`.
6. Map the new version to the tested `minAppVersion` in `versions.json` without deleting old entries.
7. Re-run the checks that can be affected by version files.
8. Commit the version change to `main` with a clearly marked release commit and source commit SHA.
9. Create an annotated tag whose name is exactly the version.
10. Push the commit and tag without force.
11. Generate build provenance attestations for release assets.
12. Create a non-draft GitHub release with generated notes and attach `main.js`, `manifest.json`, and `styles.css` individually.

Grant only the required workflow permissions: `contents: write`, `id-token: write`, and `attestations: write`. Pin third-party actions to reviewed versions or commit SHAs. Prefer official GitHub actions.

Make the release operation serialized and retry-safe. A rerun after a partial failure must identify an existing version/tag for the triggering source SHA, repair or finish the release when safe, and never overwrite a different tag or silently issue an unrelated second version. Account for a newer commit reaching `main` while a release is running; never force-push or discard it.

Document any required GitHub repository setting, including workflow write permission or a narrowly scoped ruleset exception for the release workflow.

Acceptance criteria:

- A normal push to `main` produces exactly one new timestamp version and published release.
- The release commit does not recursively trigger another release.
- A same-second version calculation is still unique and increasing.
- A deliberately failing test prevents version commits, tags, and releases.
- A rerun after simulated partial failure is idempotent.
- Release assets match a fresh local build and have provenance attestations.
- The manifest at default-branch HEAD points to an existing release with the same tag.

### Milestone 5 — Live updating

Add debounced vault-event handling and stale-render protection.

Acceptance criteria:

- Saving the open HTML file refreshes the rendered view without closing the pane.
- Modifying, creating, deleting, or renaming a same-folder supported asset refreshes the view.
- A rapid burst of changes produces one final correct render rather than stale output.
- Failed or superseded renders revoke every object URL they created.
- Changes in unrelated folders do not cause visible reloads.
- No timer, event listener, or rejected promise remains after the view closes.

### Milestone 6 — Open the same file in two panes

Verify that state is owned by view instances rather than the plugin singleton.

Acceptance criteria:

- The same HTML file can be open in two Obsidian panes simultaneously.
- Both panes render independently and refresh after a source or supported asset change.
- Closing one pane does not blank, refresh, or revoke resources used by the other.
- Pane resizing works without fixed dimensions or horizontal overflow introduced by the plugin.

### Milestone 7 — Disable and re-enable the plugin

Implement and test the explicit cleanup behavior in section 4.6.

Acceptance criteria:

- Disabling closes/detaches HTML views without errors and revokes their object URLs.
- Re-enabling restores `.html` and `.htm` registration exactly once.
- Reopening a file works after at least three disable/enable cycles.
- Vault event handling occurs once per change, with no duplicated listeners.
- The behavior is documented in the README.

### Milestone 8 — Invalid or incomplete HTML

Create fixtures for missing closing tags, fragments without `<html>` or `<body>`, malformed attributes, unusual Unicode, an empty file, and content that fails asset lookup.

Acceptance criteria:

- Every fixture either renders through browser error recovery or displays a safe, useful error state.
- No fixture crashes Obsidian, escapes the iframe, or causes an unhandled rejection.
- The view remains usable after switching from an invalid file to a valid file.
- Error text is inserted with DOM APIs and cannot itself become markup.

### Milestone 9 — Relative images and stylesheets in the same folder

Finish the allowlisted asset loader described in section 4.4 and add a fixture folder containing `index.html`, `style.css`, and at least one raster image.

Acceptance criteria:

- `<img src="image.png">` renders from the vault.
- `<link rel="stylesheet" href="style.css">` applies the local stylesheet.
- Editing either file updates every open pane.
- Missing and unsupported assets fail safely.
- `../secret.png`, `/absolute.png`, nested paths, encoded traversal, HTTP(S), `file:`, and document-authored `app:` references are rejected.
- Remote CSS imports and CSS resource URLs do not load.
- Desktop and mobile pass the same fixture test.

## 7. Testing strategy

Separate pure preparation logic from Obsidian UI code so most security behavior can be tested without launching Obsidian.

Automated tests must cover:

- HTML parsing and serialization.
- Removal of active elements, event attributes, refresh navigation, forms, and external links.
- CSP construction.
- Same-folder path resolution, including encoded and Unicode inputs.
- MIME allowlisting.
- Missing assets and partial asset failures.
- Blob URL ownership and revocation.
- Render-generation race handling.
- Debounce cleanup.
- Two independent view-state containers.
- Timestamp version format, monotonicity, manifest/package/lockfile consistency, and `versions.json` preservation.

Manual testing must use real Obsidian rather than a browser-only approximation. Maintain `docs/testing.md` as a concise matrix containing test date, commit, plugin version, Obsidian version, platform, fixture, result, and relevant notes. Never mark mobile support verified from TypeScript compilation alone.

## 8. Error handling and observability

- Do not log routine document contents or absolute paths.
- Development diagnostics may use concise console messages prefixed with the plugin name, but remove noisy logging before release.
- Surface user-actionable failures in the view: unreadable file, missing same-folder asset, unsupported image type, or failed preparation.
- One broken asset must not prevent the rest of a document from rendering.
- Include the relative vault path in errors only when useful; escape it through `textContent`.
- No telemetry, crash reporting, or external error service is permitted.

## 9. Release and publication invariants

- `manifest.json.id` is always `html-document-viewer`.
- Versions are valid three-part SemVer strings: `0.0.<integer epoch seconds>`.
- Release tags have no `v` prefix and exactly match `manifest.json.version`.
- `versions.json` retains every published version-to-minimum-app-version mapping.
- The default branch manifest always points to an existing published GitHub release after a successful workflow.
- Release assets are individually named `main.js`, `manifest.json`, and `styles.css`.
- A release is never created when quality or security tests fail.
- Tags and releases are never force-replaced.
- Community publication is not complete until the directory shows the plugin as installable.

## 10. Agent operating instructions

1. Inspect the existing repository, current branch, remote, and uncommitted work before editing. Preserve user changes.
2. Re-check the current official Obsidian sample plugin, API definitions, developer policies, plugin guidelines, and submission instructions before implementation and again before publication.
3. Work directly on `main` for trunk-based development unless repository protection requires a short-lived review branch. Keep commits small and the tree buildable.
4. Complete automated checks and relevant manual evidence at each milestone.
5. Do not publish or submit before the security milestone passes on desktop and mobile.
6. The user has authorized publishing this plugin and submitting it to Obsidian. Still pause for authentication or an external review decision that requires the maintainer; never request credentials.
7. When official documentation conflicts with this spec on submission mechanics or required release metadata, follow the current official documentation and record the deviation. Do not weaken the security or vault-only requirements without Tyson Gern's explicit approval.
8. Report exact release URLs, submission status, test evidence, and any remaining external-review dependency. Do not claim success based only on creating files or starting a workflow.

## 11. Definition of done

The project is complete when all nine milestones pass, all automated checks are green, desktop and mobile manual tests are recorded, every required security boundary is verified, timestamp releases are automatic and retry-safe, and HTML Document Viewer is visible and installable through Obsidian's Community directory.

## 12. Authoritative references

Verify these before acting because platform and publication requirements can change:

- Obsidian sample plugin: <https://github.com/obsidianmd/obsidian-sample-plugin>
- Obsidian API definitions: <https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts>
- Plugin guidelines: <https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines>
- Submit a plugin: <https://docs.obsidian.md/plugins/releasing/submit-plugin>
- GitHub Actions release guide: <https://docs.obsidian.md/Plugins/Releasing/Release+your+plugin+with+GitHub+Actions>
- Obsidian Community directory: <https://community.obsidian.md>

Specification prepared on 2026-09-01.
