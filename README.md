# HTML Document Viewer

HTML Document Viewer is an Obsidian community plugin for viewing static `.html`
and `.htm` files stored in a vault. Each document is treated as untrusted and is
rendered read-only inside a separate sandboxed iframe.

The runtime currently implements milestones 1 and 2 from `SPEC.md`: viewing
self-contained HTML and enforcing the no-script, no-network security boundary.
Milestone 4's timestamp release automation is live and verified. The plugin is
published in the Obsidian Community directory after passing its automated
security, dependency, provenance, and reproducible-build checks.

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
- HTTP, HTTPS, protocol-relative, `file:`, `app:`, path traversal, and other
  document-authored resource references are removed.
- Remote URLs in inline CSS remain blocked by CSP and cannot load.
- The plugin makes no telemetry or network requests.

There is no trusted mode, bypass toggle, or setting that weakens this model.

## Supported content

The milestone 1–2 build supports:

- ordinary static HTML;
- inline CSS in `<style>` and `style` attributes;
- fragment-only links such as `href="#section"`; and
- embedded base64 raster data images using PNG, JPEG, GIF, WebP, or AVIF.

Same-folder raster images and external stylesheets are specified for milestone
9 and are deliberately not implemented yet. Their references are removed in the
current build rather than passed through to the browser.

## Known limitations

- The view is read-only.
- JavaScript, event handlers, WebAssembly, workers, embedded frames, objects,
  forms, downloads, popups, meta refresh, and top-level navigation are blocked.
- Remote resources and filesystem/application URLs are blocked.
- Relative images and stylesheets are not yet supported.
- SVG, CSS `@import`, CSS `url(...)` assets, `srcset`, fonts, audio, and video are
  not supported.
- Vault-aware link navigation, live refresh, settings, and editing are not part
  of milestones 1–2.

## Platforms

The runtime uses only Obsidian's Vault API and browser APIs. It does not use
Node.js, Electron, `FileSystemAdapter`, or absolute filesystem paths, and the
manifest supports both desktop and mobile Obsidian.

Desktop and mobile behavior have been verified in real Obsidian, including a
real-device mobile no-network observation. A clean desktop installation from
the published release and a clean mobile Community-directory installation have
also passed. Current evidence is recorded in
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
