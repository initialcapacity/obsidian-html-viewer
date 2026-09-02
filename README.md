# HTML Document Viewer

HTML Document Viewer is an Obsidian community plugin for viewing static `.html`
and `.htm` files stored in a vault. Each document is treated as untrusted and is
rendered read-only inside a separate sandboxed iframe.

The runtime implements milestones 1–9 from `SPEC.md` plus nested vault assets,
responsive images, CSS image URLs, dependency-aware refresh, safe document
navigation, and viewer controls. The plugin is published in the Obsidian
Community directory after passing its automated security, dependency,
provenance, and reproducible-build checks.

## Installation and usage

Install **HTML Document Viewer** from **Settings → Community plugins → Browse**.
Enable it, then select an `.html` or `.htm` file in the file explorer. The file
opens read-only in a normal Obsidian pane. It can be split into multiple panes,
and open views refresh when the document or one of its referenced assets
changes. The toolbar provides reload, source/preview, zoom, print, diagnostics,
and safe navigation to relative HTML documents.

## Security guarantees

Document markup is never interpreted in Obsidian's DOM. The plugin parses HTML
in a detached document, removes active and navigation-producing content, inserts
a restrictive Content Security Policy (CSP), serializes with `XMLSerializer`,
and assigns only that prepared output to an iframe's `srcdoc` property. When the
user requests source view, the original source is displayed as plain text with
`textContent`.

The iframe has an empty `sandbox` attribute. It receives no `allow-scripts`,
`allow-same-origin`, navigation, popup, form, or download permissions. The CSP
also denies scripts, connections, frames, objects, workers, forms, media,
manifests, and every default resource type.

- Inline and external scripts do not run.
- Inline event handlers are removed.
- Forms and in-frame non-fragment navigation are disabled. Safe relative links
  to `.html` and `.htm` files are exposed only through parent-owned controls.
- HTTP, HTTPS, protocol-relative, `file:`, `app:`, vault-escaping traversal, and
  other unsupported document-authored resource references are removed.
- Supported vault raster bytes are rewritten to generated base64 `data:` URLs
  only after path normalization, vault lookup, magic-byte validation, and
  decoded-dimension limits. Authored raster data URLs receive the same byte and
  dimension validation. Stylesheet text is inserted into the detached document
  without HTML interpolation.
- Documents are bounded before rendering: HTML source, DOM element count and
  depth, authored asset count, decoded image dimensions, individual image and
  stylesheet size, aggregate loaded bytes, and embedded output expansion all
  have fixed limits. Repeated references share one vault read, and superseded
  renders stop before further asset processing.
- Raster references in inline and linked CSS are resolved through the same
  vault-only loader. Unsupported or remote CSS URLs are replaced with empty
  URLs, and the CSP remains a second no-network boundary.
- The plugin makes no telemetry or network requests.

There is no trusted mode, bypass toggle, or setting that weakens this model.

## Supported content

The current build supports:

- ordinary static HTML;
- static presentation MathML, excluding `annotation-xml` integration content;
- inline CSS in `<style>` and `style` attributes;
- fragment-only links such as `href="#section"`;
- embedded base64 raster data images, including line-wrapped base64, using PNG,
  JPEG, GIF, WebP, or AVIF;
- relative PNG, JPEG, GIF, WebP, and AVIF images anywhere in the vault reachable
  by a relative path that does not escape the vault;
- responsive `srcset` and `<picture>` raster sources;
- raster `url(...)` references in inline styles and linked stylesheets;
- relative `.css` stylesheets within the vault. Stylesheet `media` and
  `title` semantics are preserved; disabled and alternate stylesheets remain
  inactive; and
- relative `.html` and `.htm` navigation through the parent-owned toolbar.

An open document refreshes after its source or an exact referenced dependency
changes through a create, modification, deletion, or rename. Unrelated vault
changes do not trigger work. Changes are debounced, stale asynchronous renders
are discarded, and each pane owns its own refresh and prepared asset state. The
same document can therefore remain open and live in more than one pane.

Disabling the plugin closes all open HTML Document Viewer panes. This blanks
their sandboxed frames, cancels pending refreshes, unregisters their vault
listeners, and discards prepared source, dependency, and warning state. After
re-enabling, opening an `.html` or `.htm` file creates a fresh view; stale tabs
are intentionally not left behind.

The specification originally preferred parent-created `blob:` URLs for local
images and a `data:text/css` URL for stylesheets. Current Obsidian applies an
inherited application CSP to `srcdoc` and gives an empty-sandbox frame an opaque
origin: the former blocks external data stylesheets, while the latter cannot
load a parent-origin `blob:app://…` URL. The runtime therefore uses allowlisted
base64 image data URLs and inline stylesheet text. This preserves the empty
sandbox, the no-network guarantee, and the vault-only validation boundary.

## Known limitations

- The view is read-only.
- JavaScript, event handlers, WebAssembly, workers, embedded frames, objects,
  forms, downloads, popups, meta refresh, and top-level navigation are blocked.
- Remote resources and filesystem/application URLs are blocked.
- SVG, audio, video, fonts, and MathML `annotation-xml` are not supported.
- CSS `@import` and font URLs are not resolved. CSS image URLs support only the
  allowlisted raster formats.
- HTML files are limited to 10 MiB and 5,000,000 decoded source characters,
  100,000 elements, 256 levels of nesting, and 256 authored asset references.
  Local images are limited to 10 MiB each, 16,384 pixels in either dimension,
  and 40 million decoded pixels. Stylesheets are limited to 1 MiB each, total
  loaded assets to 25 MiB, and embedded asset output to 25 MiB.
- Navigation supports relative HTML targets but not arbitrary vault files or
  automatic fragment scrolling. Settings and editing are not supported.

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

Prerequisites are Node.js 22.22.0 or later, npm, Obsidian, and a dedicated test
vault.

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
npm run typecheck:min
npm run lint
npm test
npm run test:coverage
npm run test:e2e
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
