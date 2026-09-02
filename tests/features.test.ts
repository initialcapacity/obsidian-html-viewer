import type { TFile } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { VaultAssetLoader } from '../src/asset-loader';
import { prepareHtmlWithAssets } from '../src/prepare-html';

function validPng(): ArrayBuffer {
	const bytes = new Uint8Array(24);
	bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
	bytes.set([73, 72, 68, 82], 12);
	const view = new DataView(bytes.buffer);
	view.setUint32(16, 2);
	view.setUint32(20, 2);
	return bytes.buffer;
}

describe('viewer feature integration', () => {
	it('rewrites nested images, stylesheet URLs, inline CSS, and srcset', async () => {
		const image = {} as TFile;
		const stylesheet = {} as TFile;
		const files = new Map<string, TFile>([
			['styles/site.css', stylesheet],
			['images/from-css.png', image],
			['docs/images/inline.png', image],
			['docs/images/fallback.png', image],
			['docs/images/one.png', image],
			['docs/images/two.png', image],
		]);
		const loader = new VaultAssetLoader(
			{
				read: vi.fn(async (file) => {
					expect(file).toBe(stylesheet);
					return '.card { background: url("../images/from-css.png"); }';
				}),
				getFileByPath: vi.fn((path: string) => files.get(path) ?? null),
				readBinary: vi.fn(async () => validPng()),
			},
			'docs/pages/index.html',
			() => 'data:image/png;base64,AAAA',
		);
		const result = await prepareHtmlWithAssets(
			`<link rel="stylesheet" href="../../styles/site.css">
			<style>.inline { background: url("../images/inline.png"); }</style>
			<p style="background-image:url('../images/inline.png')">Inline</p>
			<picture><source type="image/png" sizes="50vw" srcset="../images/one.png 1x, ../images/two.png 2x">
			<img src="../images/fallback.png" sizes="100vw" srcset="../images/one.png 400w, ../images/two.png 800w"></picture>`,
			'docs/pages/index.html',
			loader,
		);
		const prepared = new DOMParser().parseFromString(result.html, 'text/html');

		expect(result.warnings).toEqual([]);
		expect(new Set(result.dependencies)).toEqual(new Set(files.keys()));
		expect(prepared.querySelectorAll('style')[0]?.textContent).toContain(
			'url("data:image/png;base64,AAAA")',
		);
		expect(prepared.querySelectorAll('style')[1]?.textContent).toContain(
			'url("data:image/png;base64,AAAA")',
		);
		expect(prepared.querySelector('p')?.getAttribute('style')).toContain(
			'url("data:image/png;base64,AAAA")',
		);
		expect(prepared.querySelector('source')?.getAttribute('srcset')).toBe(
			'data:image/png;base64,AAAA 1x, data:image/png;base64,AAAA 2x',
		);
		expect(prepared.querySelector('img')?.getAttribute('srcset')).toBe(
			'data:image/png;base64,AAAA 400w, data:image/png;base64,AAAA 800w',
		);
		expect(prepared.querySelector('img')?.getAttribute('sizes')).toBe('100vw');
	});

	it('exposes only normalized HTML links for parent-owned navigation', async () => {
		const result = await prepareHtmlWithAssets(
			`<a id="fragment" href="#local">Local</a>
			<a id="document" href="../other.html#section">Other page</a>
			<a id="remote" href="https://attacker.invalid/page.html">Remote</a>
			<a id="escape" href="../../../outside.html">Outside</a>`,
			'docs/pages/index.html',
			{
				loadImage: vi.fn(),
				loadStylesheet: vi.fn(),
			},
		);
		const prepared = new DOMParser().parseFromString(result.html, 'text/html');

		expect(result.navigation).toEqual([
			{ fragment: 'section', label: 'Other page', path: 'docs/other.html' },
		]);
		expect(prepared.getElementById('fragment')?.getAttribute('href')).toBe('#local');
		expect(prepared.getElementById('document')?.hasAttribute('href')).toBe(false);
		expect(
			prepared.getElementById('document')?.getAttribute('aria-disabled'),
		).toBe('true');
		expect(prepared.getElementById('remote')?.hasAttribute('href')).toBe(false);
		expect(prepared.getElementById('escape')?.hasAttribute('href')).toBe(false);
	});
});
