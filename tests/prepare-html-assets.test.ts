import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TFile } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import type {
	HtmlAssetLoader,
	ImageAssetResult,
	StylesheetAssetResult,
} from '../src/asset-loader';
import { SameFolderAssetLoader } from '../src/asset-loader';
import { prepareHtmlWithAssets } from '../src/prepare-html';

function parsePrepared(source: string): Document {
	return new DOMParser().parseFromString(source, 'text/html');
}

function loader(
	loadImage: (reference: string) => Promise<ImageAssetResult>,
	loadStylesheet: (
		reference: string,
	) => Promise<StylesheetAssetResult>,
): HtmlAssetLoader {
	return { loadImage, loadStylesheet };
}

describe('HTML preparation with vault assets', () => {
	it('loads the complete same-folder fixture through vault-only dependencies', async () => {
		const html = readFileSync(
			resolve('tests', 'fixtures', 'same-folder-assets', 'index.html'),
			'utf8',
		);
		const css = readFileSync(
			resolve('tests', 'fixtures', 'same-folder-assets', 'style.css'),
			'utf8',
		);
		const imageBytes = readFileSync(
			resolve('tests', 'fixtures', 'same-folder-assets', 'image.png'),
		);
		const imageFile: TFile = {} as never;
		const styleFile: TFile = {} as never;
		const objectUrls = new Set<string>();
		const assetLoader = new SameFolderAssetLoader(
			{
				cachedRead: vi.fn(async (file) => {
					expect(file).toBe(styleFile);
					return css;
				}),
				getFileByPath: vi.fn((path: string) =>
					path.endsWith('image.png')
						? imageFile
						: path.endsWith('style.css')
							? styleFile
							: null,
				),
				readBinary: vi.fn(async (file) => {
					expect(file).toBe(imageFile);
					return imageBytes.buffer.slice(
						imageBytes.byteOffset,
						imageBytes.byteOffset + imageBytes.byteLength,
					);
				}),
			},
			'same-folder-assets/index.html',
			(data, mimeType) => {
				expect(new Uint8Array(data).slice(1, 4)).toEqual(
					new Uint8Array([0x50, 0x4e, 0x47]),
				);
				expect(mimeType).toBe('image/png');
				return 'blob:fixture-image';
			},
			objectUrls,
		);

		const result = await prepareHtmlWithAssets(html, assetLoader);
		const prepared = parsePrepared(result.html);
		expect(result.warnings).toEqual([]);
		expect(objectUrls).toEqual(new Set(['blob:fixture-image']));
		expect(prepared.querySelector('.asset-image')?.getAttribute('src')).toBe(
			'blob:fixture-image',
		);
		expect(prepared.querySelector('style')?.textContent).toBe(css);
	});

	it('rewrites a local image URL and inserts stylesheet text inertly', async () => {
		const loadImage = vi.fn(async () => ({
			ok: true as const,
			url: 'blob:owned-image',
		}));
		const loadStylesheet = vi.fn(async () => ({
			css: 'body { color: rgb(12, 34, 56); }',
			ok: true as const,
		}));
		const result = await prepareHtmlWithAssets(
			'<link rel="stylesheet" href="style.css"><img src="image.png">',
			loader(loadImage, loadStylesheet),
		);
		const prepared = parsePrepared(result.html);

		expect(loadImage).toHaveBeenCalledWith('image.png');
		expect(loadStylesheet).toHaveBeenCalledWith('style.css');
		expect(prepared.querySelector('img')?.getAttribute('src')).toBe(
			'blob:owned-image',
		);
		expect(
			prepared.querySelector('img')?.hasAttribute(
				'data-html-document-viewer-blocked',
			),
		).toBe(false);
		expect(prepared.querySelector('link')).toBeNull();
		expect(prepared.querySelector('style')?.textContent).toContain(
			'rgb(12, 34, 56)',
		);
		expect(result.warnings).toEqual([]);
	});

	it('keeps data images without consulting the vault', async () => {
		const loadImage = vi.fn();
		const result = await prepareHtmlWithAssets(
			'<img src="data:image/png;base64,iVBORw0KGgo=">',
			loader(loadImage, vi.fn()),
		);

		expect(loadImage).not.toHaveBeenCalled();
		expect(
			parsePrepared(result.html).querySelector('img')?.getAttribute('src'),
		).toBe('data:image/png;base64,iVBORw0KGgo=');
	});

	it('renders the rest of the document and exposes safe warnings after partial failures', async () => {
		const result = await prepareHtmlWithAssets(
			`<h1>Still visible</h1>
			<img id="missing" src="missing.png">
			<img id="good" src="good.png" alt="Good image">
			<link rel="stylesheet" href="missing.css">`,
			loader(
				async (reference) =>
					reference === 'good.png'
						? { ok: true, url: 'blob:good' }
						: {
								message: 'Image not found: “missing.png”.',
								ok: false,
								reason: 'missing',
							},
				async () => ({
					message: 'Stylesheet not found: “missing.css”.',
					ok: false,
					reason: 'missing',
				}),
			),
		);
		const prepared = parsePrepared(result.html);

		expect(prepared.querySelector('h1')?.textContent).toBe('Still visible');
		expect(prepared.getElementById('good')?.getAttribute('src')).toBe(
			'blob:good',
		);
		expect(prepared.getElementById('missing')?.hasAttribute('src')).toBe(false);
		expect(prepared.getElementById('missing')?.getAttribute('alt')).toBe(
			'Image not found: “missing.png”.',
		);
		expect(prepared.querySelector('link')).toBeNull();
		expect(result.warnings).toEqual([
			'Image not found: “missing.png”.',
			'Stylesheet not found: “missing.css”.',
		]);
	});

	it('removes every non-stylesheet link and catches an unexpected loader rejection', async () => {
		const result = await prepareHtmlWithAssets(
			'<link rel="preload" href="https://attacker.invalid/x"><img src="image.png">',
			loader(
				async () => {
					throw new Error('unexpected');
				},
				vi.fn(),
			),
		);
		const prepared = parsePrepared(result.html);

		expect(prepared.querySelector('link')).toBeNull();
		expect(prepared.querySelector('img')?.hasAttribute('src')).toBe(false);
		expect(result.warnings).toEqual(['Unable to load a local image.']);
	});

	it('keeps remote CSS references confined behind the exact CSP', async () => {
		const css =
			'@import url("https://attacker.invalid/import.css"); body { background: url(https://attacker.invalid/pixel.png); }';
		const result = await prepareHtmlWithAssets(
			'<link rel="stylesheet" href="style.css">',
			loader(vi.fn(), async () => ({ css, ok: true })),
		);
		const prepared = parsePrepared(result.html);

		expect(prepared.querySelector('link')).toBeNull();
		expect(prepared.querySelector('style')?.textContent).toBe(css);
		expect(
			prepared.head.firstElementChild?.getAttribute('content'),
		).toContain("default-src 'none'");
		expect(
			prepared.head.firstElementChild?.getAttribute('content'),
		).toContain("connect-src 'none'");
	});

	it('cannot turn stylesheet text into markup during serialization', async () => {
		const css =
			'body { color: green; } </style><script id="css-script">bad()</script>';
		const result = await prepareHtmlWithAssets(
			'<link rel="stylesheet" href="style.css">',
			loader(vi.fn(), async () => ({ css, ok: true })),
		);
		const prepared = parsePrepared(result.html);

		expect(prepared.getElementById('css-script')).toBeNull();
		expect(prepared.querySelector('style')?.textContent).toContain(
			'<\\/style><script',
		);
	});

	it('preserves external stylesheet raw text and link presentation semantics', async () => {
		const css =
			'main > p { color: red; } .card { & > strong { content: "<&>"; } }';
		const result = await prepareHtmlWithAssets(
			`<link rel="stylesheet" href="screen.css" media="screen and (min-width: 1px)" title="Screen">
			<link rel="alternate stylesheet" href="alternate.css" media="print" title="Alternate">`,
			loader(vi.fn(), async () => ({ css, ok: true })),
		);
		const styles = Array.from(parsePrepared(result.html).querySelectorAll('style'));

		expect(styles).toHaveLength(2);
		expect(styles[0]?.textContent).toBe(css);
		expect(styles[0]?.getAttribute('media')).toBe(
			'screen and (min-width: 1px)',
		);
		expect(styles[0]?.getAttribute('title')).toBe('Screen');
		expect(styles[1]?.textContent).toBe(css);
		expect(styles[1]?.getAttribute('media')).toBe('not all');
		expect(styles[1]?.getAttribute('title')).toBe('Alternate');
	});

	it('aborts between asset reads and does not start later work', async () => {
		const controller = new AbortController();
		const loadImage = vi.fn(async () => {
			controller.abort();
			return { ok: true as const, url: 'blob:first' };
		});
		const loadStylesheet = vi.fn();

		await expect(
			prepareHtmlWithAssets(
				'<img src="first.png"><img src="second.png"><link rel="stylesheet" href="style.css">',
				loader(loadImage, loadStylesheet),
				{ signal: controller.signal },
			),
		).rejects.toMatchObject({ name: 'AbortError' });
		expect(loadImage).toHaveBeenCalledOnce();
		expect(loadStylesheet).not.toHaveBeenCalled();
	});

	it('bounds repeated embedded asset expansion after deduplicated loads', async () => {
		const result = await prepareHtmlWithAssets(
			'<img id="first" src="image.png"><img id="second" src="image.png"><link rel="stylesheet" href="style.css">',
			loader(
				async () => ({ ok: true, url: 'data:image/png;base64,AAAA' }),
				async () => ({ css: 'body { color: green; }', ok: true }),
			),
			{ maxEmbeddedAssetCharacters: 30 },
		);
		const prepared = parsePrepared(result.html);

		expect(prepared.getElementById('first')?.hasAttribute('src')).toBe(true);
		expect(prepared.getElementById('second')?.hasAttribute('src')).toBe(false);
		expect(prepared.querySelector('style')).toBeNull();
		expect(result.warnings).toEqual([
			'Skipped local assets because the prepared document is too large.',
		]);
	});
});
