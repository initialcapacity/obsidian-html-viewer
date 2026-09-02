import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	CONTENT_SECURITY_POLICY,
	MAX_ASSET_REFERENCES,
	MAX_DOM_DEPTH,
	MAX_DOM_ELEMENTS,
	MAX_HTML_SOURCE_CHARACTERS,
	prepareHtml,
} from '../src/prepare-html';

const VALID_PNG_DATA_URL =
	'data:image/png;base64,iVBORw0KGgoAAAAASUhEUgAAAAEAAAAB';

const EXPECTED_CSP =
	"default-src 'none'; " +
	"script-src 'none'; " +
	"connect-src 'none'; " +
	"object-src 'none'; " +
	"frame-src 'none'; " +
	"child-src 'none'; " +
	"worker-src 'none'; " +
	"form-action 'none'; " +
	"base-uri 'none'; " +
	'img-src data:; ' +
	"style-src 'unsafe-inline'; " +
	"font-src 'none'; " +
	"media-src 'none'; " +
	"manifest-src 'none';";

function fixture(name: string): string {
	return readFileSync(resolve('tests', 'fixtures', name), 'utf8');
}

function parsePrepared(source: string): Document {
	return new DOMParser().parseFromString(prepareHtml(source), 'text/html');
}

describe('prepareHtml', () => {
	it('keeps the centralized CSP exact and inserts it first in head', () => {
		expect(CONTENT_SECURITY_POLICY).toBe(EXPECTED_CSP);

		const prepared = parsePrepared('<title>safe</title><p>content</p>');
		const firstElement = prepared.head.firstElementChild;

		expect(firstElement?.localName).toBe('meta');
		expect(firstElement?.getAttribute('http-equiv')).toBe(
			'Content-Security-Policy',
		);
		expect(firstElement?.getAttribute('content')).toBe(EXPECTED_CSP);
	});

	it('removes executable and embedded active content', () => {
		const prepared = parsePrepared(fixture('hostile.html'));

		expect(
			prepared.querySelector(
				'script, iframe, frame, frameset, object, embed, applet, portal, fencedframe, svg, template, audio, video, source, track, webview, annotation-xml',
			),
		).toBeNull();
		expect(prepared.getElementById('script-marker')).toBeNull();
		expect(
			prepared.documentElement.hasAttribute('data-script-created-marker'),
		).toBe(false);
	});

	it('removes event handler attributes case-insensitively', () => {
		const prepared = parsePrepared(
			'<body OnLoAd="bad()"><img oNeRrOr="bad()"><p ONCLICK="bad()">x</p></body>',
		);

		for (const element of Array.from(prepared.querySelectorAll('*'))) {
			for (const attribute of Array.from(element.attributes)) {
				expect(attribute.name.toLowerCase().startsWith('on')).toBe(false);
			}
		}
	});

	it('removes authored policies, base URLs, refresh, and external stylesheets', () => {
		const prepared = parsePrepared(fixture('hostile.html'));

		expect(prepared.querySelector('base, link')).toBeNull();
		expect(prepared.querySelector('meta[http-equiv="refresh" i]')).toBeNull();
		expect(
			prepared.querySelectorAll(
				'meta[http-equiv="content-security-policy" i]',
			),
		).toHaveLength(1);
	});

	it('removes document-authored network, file, app, and path resource URLs', () => {
		const prepared = parsePrepared(fixture('hostile.html'));

		for (const image of Array.from(prepared.querySelectorAll('img'))) {
			expect(image.hasAttribute('src')).toBe(false);
			expect(image.getAttribute('data-html-document-viewer-blocked')).toBe(
				'true',
			);
			expect(image.getAttribute('alt')).toBeTruthy();
		}

		for (const link of Array.from(prepared.querySelectorAll('a'))) {
			const href = link.getAttribute('href');
			expect(href === null || href.startsWith('#')).toBe(true);
			expect(link.hasAttribute('ping')).toBe(false);
			expect(link.hasAttribute('target')).toBe(false);
		}
	});

	it('strips special request attributes even when the primary URL is inert', () => {
		const prepared = parsePrepared(`
			<a href="#safe" attributionsrc="https://attacker.invalid/register">safe</a>
			<img src="${VALID_PNG_DATA_URL}" attributionsrc="https://attacker.invalid/image" browsingtopics>
		`);

		for (const element of Array.from(prepared.querySelectorAll('*'))) {
			expect(element.hasAttribute('attributionsrc')).toBe(false);
			expect(element.hasAttribute('browsingtopics')).toBe(false);
		}
	});

	it('rejects every non-data image reference including traversal and nested paths', () => {
		const prepared = parsePrepared(`
			<img src="../secret.png">
			<img src="%2e%2e%2fsecret.png">
			<img src="/absolute.png">
			<img src="nested/image.png">
			<img src="//attacker.invalid/image.png">
			<img src="https://attacker.invalid/image.png">
			<img src="file:///secret.png">
			<img src="app://local/secret.png">
		`);

		for (const image of Array.from(prepared.querySelectorAll('img'))) {
			expect(image.hasAttribute('src')).toBe(false);
		}
	});

	it('disables forms and strips submission attributes', () => {
		const prepared = parsePrepared(fixture('hostile.html'));
		const form = prepared.querySelector('form');

		expect(form?.hasAttribute('inert')).toBe(true);
		expect(form?.getAttribute('aria-disabled')).toBe('true');
		expect(form?.hasAttribute('action')).toBe(false);
		expect(form?.hasAttribute('target')).toBe(false);

		for (const control of Array.from(
			prepared.querySelectorAll('input, button, select, textarea, fieldset'),
		)) {
			expect(control.hasAttribute('disabled')).toBe(true);
			expect(control.hasAttribute('formaction')).toBe(false);
		}
	});

	it('preserves inline CSS, raster data images, fragments, and noscript content', () => {
		const preparedSource = prepareHtml(fixture('self-contained.html'));
		const prepared = new DOMParser().parseFromString(
			preparedSource,
			'text/html',
		);

		expect(prepared.querySelector('style')?.textContent).toContain('#2563eb');
		expect(prepared.querySelector('img')?.getAttribute('src')).toMatch(
			/^data:image\/png;base64,/,
		);
		expect(prepared.querySelector('a')?.getAttribute('href')).toBe('#finish');

		const hostilePrepared = prepareHtml(fixture('hostile.html'));
		expect(hostilePrepared).toContain('SUCCESS: scripting is disabled.');
	});

	it('preserves ordinary CSS raw text exactly across serialization', () => {
		const source = fixture('css-raw-text.html');
		const sourceDocument = new DOMParser().parseFromString(source, 'text/html');
		const css = sourceDocument.querySelector('style')?.textContent;
		const prepared = parsePrepared(source);

		expect(prepared.querySelector('style')?.textContent).toBe(css);
	});

	it('preserves static presentation MathML while removing integration points', () => {
		const prepared = parsePrepared(
			fixture('mathml.html').replace(
				'<mi>x</mi>',
				'<mi id="math-link" href="https://attacker.invalid" xlink:href="https://attacker.invalid">x</mi>',
			),
		);
		const math = prepared.querySelector('math');
		const mathLink = prepared.getElementById('math-link');

		expect(math).not.toBeNull();
		expect(math?.querySelector('msup')).not.toBeNull();
		expect(math?.textContent).toContain('x');
		expect(prepared.querySelector('annotation-xml, script')).toBeNull();
		expect(math?.hasAttribute('onclick')).toBe(false);
		expect(
			Array.from(mathLink?.attributes ?? []).some(
				(attribute) => attribute.localName.toLowerCase() === 'href',
			),
		).toBe(false);
	});

	it('removes SVG data images while preserving allowlisted raster MIME types', () => {
		const prepared = parsePrepared(`
			<img id="svg" src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=">
			<img id="png" src="${VALID_PNG_DATA_URL}">
		`);

		expect(prepared.getElementById('svg')?.hasAttribute('src')).toBe(false);
		expect(prepared.getElementById('png')?.getAttribute('src')).toBe(
			VALID_PNG_DATA_URL,
		);
	});

	it('accepts line-wrapped base64 raster data images', () => {
		const prepared = parsePrepared(
			'<img src="data:image/png;base64,iVBO\nRw0KGgoAAAAASUhEUgAAAAEAAAAB">',
		);

		expect(prepared.querySelector('img')?.getAttribute('src')).toBe(
			'data:image/png;base64,iVBO\nRw0KGgoAAAAASUhEUgAAAAEAAAAB',
		);
	});

	it('rejects malformed and over-dimensioned raster data images', () => {
		const oversized = new Uint8Array(24);
		oversized.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
		oversized.set([73, 72, 68, 82], 12);
		new DataView(oversized.buffer).setUint32(16, 20_000);
		new DataView(oversized.buffer).setUint32(20, 1);
		const oversizedUrl = `data:image/png;base64,${Buffer.from(oversized).toString('base64')}`;
		const prepared = parsePrepared(`
			<img id="malformed" src="data:image/png;base64,AAAA">
			<img id="oversized" src="${oversizedUrl}">
		`);

		expect(prepared.getElementById('malformed')?.hasAttribute('src')).toBe(false);
		expect(prepared.getElementById('oversized')?.hasAttribute('src')).toBe(false);
	});

	it('bounds source size and authored asset-reference count', () => {
		expect(() => prepareHtml('x'.repeat(MAX_HTML_SOURCE_CHARACTERS + 1))).toThrow(
			'safe rendering size limit',
		);
		const references = '<img src="image.png">'.repeat(
			MAX_ASSET_REFERENCES + 1,
		);
		expect(() => prepareHtml(references)).toThrow('too many asset references');
	});

	it('bounds parsed DOM element count and nesting depth', () => {
		expect(() =>
			prepareHtml('<i></i>'.repeat(MAX_DOM_ELEMENTS + 1)),
		).toThrow('too many elements');
		expect(() =>
			prepareHtml(
				`${'<div>'.repeat(MAX_DOM_DEPTH + 1)}content${'</div>'.repeat(MAX_DOM_DEPTH + 1)}`,
			),
		).toThrow('nested too deeply');
	});

	it('uses browser error recovery for fragments and incomplete HTML', () => {
		const prepared = parsePrepared(
			'<main><h1>Recovered fragment<p>Missing closing tags<script>bad()',
		);

		expect(prepared.querySelector('main h1')?.textContent).toContain(
			'Recovered fragment',
		);
		expect(prepared.querySelector('script')).toBeNull();
	});
});
