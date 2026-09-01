import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { HtmlAssetLoader } from '../src/asset-loader';
import {
	CONTENT_SECURITY_POLICY,
	prepareHtml,
	prepareHtmlWithAssets,
} from '../src/prepare-html';

function fixture(name: string): string {
	return readFileSync(resolve('tests', 'fixtures', 'invalid', name), 'utf8');
}

function parse(source: string): Document {
	return new DOMParser().parseFromString(source, 'text/html');
}

describe('invalid and incomplete HTML fixtures', () => {
	it.each([
		['missing-closing-tags.html', 'Recovered incomplete document'],
		['fragment.html', 'Fragment without document wrappers'],
		['malformed-attributes.html', 'The document remains readable.'],
		['unicode.html', 'Unicode: café — 日本語 — مرحبًا — 🧭'],
	])('recovers %s into a sandbox-ready document', (name, visibleText) => {
		const prepared = parse(prepareHtml(fixture(name)));

		expect(prepared.documentElement).not.toBeNull();
		expect(prepared.body.textContent).toContain(visibleText);
		expect(prepared.querySelector('script, iframe, object, embed')).toBeNull();
		expect(
			prepared.head.firstElementChild?.getAttribute('content'),
		).toBe(CONTENT_SECURITY_POLICY);
		for (const element of Array.from(prepared.querySelectorAll('*'))) {
			for (const attribute of Array.from(element.attributes)) {
				expect(attribute.name.toLowerCase().startsWith('on')).toBe(false);
			}
		}
	});

	it('renders an empty file as a valid empty document', () => {
		expect(fixture('empty.html')).toBe('');
		const prepared = parse(prepareHtml(fixture('empty.html')));

		expect(prepared.head.firstElementChild?.localName).toBe('meta');
		expect(prepared.body.textContent).toBe('');
	});

	it('keeps unusual Unicode unchanged', () => {
		const prepared = parse(prepareHtml(fixture('unicode.html')));

		expect(prepared.body.textContent).toContain('café — 日本語 — مرحبًا — 🧭');
		expect(prepared.body.textContent).toContain('é');
		expect(prepared.body.textContent).toContain('�');
	});

	it('keeps content usable when every asset lookup fails', async () => {
		const missingLoader: HtmlAssetLoader = {
			loadImage: vi.fn(async (reference: string) => ({
				message: `Unavailable image “${reference}”.`,
				ok: false as const,
				reason: 'missing' as const,
			})),
			loadStylesheet: vi.fn(async (reference: string) => ({
				message: `Unavailable stylesheet “${reference}”.`,
				ok: false as const,
				reason: 'missing' as const,
			})),
		};
		const result = await prepareHtmlWithAssets(
			fixture('asset-failures.html'),
			missingLoader,
		);
		const prepared = parse(result.html);

		expect(prepared.querySelector('h1')?.textContent).toBe(
			'Content survives broken assets',
		);
		expect(prepared.querySelector('link')).toBeNull();
		for (const image of Array.from(prepared.querySelectorAll('img'))) {
			expect(image.hasAttribute('src')).toBe(false);
			expect(image.getAttribute('alt')).toBeTruthy();
		}
		expect(result.warnings).toHaveLength(4);
	});

	it('serializes warning text as text rather than markup', async () => {
		const hostileReference = '<img src=x onerror=bad()>".png';
		const result = await prepareHtmlWithAssets(
			`<img src="${hostileReference.replaceAll('"', '&quot;')}">`,
			{
				loadImage: async () => ({
					message: `Image not found: “${hostileReference}”.`,
					ok: false,
					reason: 'missing',
				}),
				loadStylesheet: vi.fn(),
			},
		);
		const prepared = parse(result.html);

		expect(prepared.querySelectorAll('img')).toHaveLength(1);
		expect(prepared.querySelector('img')?.getAttribute('alt')).toBe(
			`Image not found: “${hostileReference}”.`,
		);
		expect(prepared.querySelector('[onerror]')).toBeNull();
	});
});
