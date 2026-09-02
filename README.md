# HTML Document Viewer

HTML Document Viewer is an Obsidian community plugin for viewing static `.html`
and `.htm` files stored in a vault. Each document is treated as untrusted and is
rendered read-only inside a separate sandboxed iframe.

The runtime implements milestones 1–9 from `SPEC.md`: secure static rendering,
automatic releases, live multi-pane updates, complete disable cleanup,
malformed-document recovery, and same-folder raster image and stylesheet
loading. The plugin is published in the Obsidian Community directory after
passing its automated security, dependency, provenance, and reproducible-build
checks.

## Installation and usage

Install **HTML Document Viewer** from **Settings → Community plugins → Browse**.
Enable it, then select an `.html` or `.htm` file in the file explorer. The file
opens read-only in a normal Obsidian pane. It can be split into multiple panes,
and open views refresh when the document or a supported same-folder asset
changes.

## Security guarantees

Document content is never inserted into Obsidian's DOM. The plugin parses HTML
in a detached document, removes active and navigation-producing content, inserts
a restrictive Content Security Policy (CSP), serializes with `XMLSerializer`,
and assigns only that prepared output to an iframe's `srcdoc` property.

The iframe has an empty `sandbox` attribute. It receives no `allow-scripts`,
`allow-same-origin`, navigation, popup, form, or download permissions. The CSP
also denies scripts, connections, frames, objects, workers, forms, media,
manifests, and every default resource type.

- Inline and external scripts do not run.
- Inline event handlers are removed.
- Forms and non-fragment links are disabled.
- HTTP, HTTPS, protocol-relative, `file:`, `app:`, path traversal, nested paths,
  and other unsupported document-authored resource references are removed.
- Supported same-folder raster bytes are rewritten to generated base64 `data:`
  URLs only after vault lookup and explicit type validation. Stylesheet text is
  inserted into the detached document without HTML interpolation.
- Remote URLs in inline CSS remain blocked by CSP and cannot load.
- The plugin makes no telemetry or network requests.

There is no trusted mode, bypass toggle, or setting that weakens this model.

## Supported content

The current build supports:

- ordinary static HTML;
- inline CSS in `<style>` and `style` attributes;
- fragment-only links such as `href="#section"`; and
- embedded base64 raster data images using PNG, JPEG, GIF, WebP, or AVIF;
- relative PNG, JPEG, GIF, WebP, and AVIF images in the HTML file's own folder;
  and
- relative `.css` stylesheets in that same folder.

An open document refreshes after its source changes. Vault changes in the same
folder are also watched so relative assets refresh after a create, modification,
deletion, or rename. Changes are debounced, stale asynchronous renders are
discarded, and each pane owns its own refresh and prepared asset state. The same
document can therefore remain open and live in more than one pane.

Disabling the plugin closes all open HTML Document Viewer panes. This blanks
their sandboxed frames, cancels pending refreshes, unregisters their vault
listeners, discards prepared asset state, and revokes any owned object URLs.
After re-enabling, opening an `.html` or `.htm` file creates a fresh view; stale
tabs are intentionally not left behind.

The specification originally preferred parent-created `blob:` URLs for local
images and a `data:text/css` URL for stylesheets. Current Obsidian applies an
inherited application CSP to `srcdoc` and gives an empty-sandbox frame an opaque
origin: the former blocks external data stylesheets, while the latter cannot
load a parent-origin `blob:app://…` URL. The runtime therefore uses allowlisted
base64 image data URLs and inline stylesheet text. This preserves the empty
sandbox, the no-network guarantee, and the same-folder validation boundary.

## Known limitations

- The view is read-only.
- JavaScript, event handlers, WebAssembly, workers, embedded frames, objects,
  forms, downloads, popups, meta refresh, and top-level navigation are blocked.
- Remote resources and filesystem/application URLs are blocked.
- SVG, CSS `@import`, CSS `url(...)` assets, `srcset`, fonts, audio, and video are
  not supported.
- Assets in parent folders, nested folders, or any folder other than the HTML
  document's own folder are not supported.
- Vault-aware link navigation, settings, and editing are not supported.

## Platforms

The runtime uses only Obsidian's Vault API and browser APIs. It does not use
Node.js, Electron, `FileSystemAdapter`, or absolute filesystem paths, and the
manifest supports both desktop and mobile Obsidian.

Desktop and mobile behavior have been verified in real Obsidian, including a
real-device mobile no-network observation and live same-folder stylesheet and
image refreshes. A clean desktop installation from the published release and a
clean mobile Community-directory installation have also passed. Current
evidence is recorded in
[`docs/testing.md`](docs/testing.md).

## Development installation

Prerequisites are Node.js 20 or later, npm, Obsidian, and a dedicated test vault.

```sh
npm ci
npm run check
npm run install:local -- --vault /path/to/test-vault
```

The install script refuses paths that are not existing Obsidian vaults and
copies only `main.js`, `manifest.json`, and `styles.css` into
`<vault>/.obsidian/plugins/html-document-viewer/`. Enable the plugin in
**Settings → Community plugins**, then open an `.html` or `.htm` file.

Available commands:

```sh
npm run dev
npm run build
npm run typecheck
npm run lint
npm test
npm run check
```

The production bundle is generated as `main.js` and intentionally ignored by
Git. The release workflow attaches `main.js`, `manifest.json`, and `styles.css`
as separate attested assets. Maintainer configuration, retry behavior, first
release checks, and Community submission steps are documented in
[`docs/releasing.md`](docs/releasing.md).

## Security reports

Please follow [`SECURITY.md`](SECURITY.md). Do not include exploit details or
private vault content in a public issue.

## License

[MIT](LICENSE) © 2026 Tyson Gern.
