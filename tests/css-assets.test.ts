import { describe, expect, it, vi } from 'vitest';
import type { HtmlAssetLoader } from '../src/asset-loader';
import {
	type AssetRewriteBudget,
	rewriteCssAssetUrls,
} from '../src/css-assets';

const VALID_PNG_DATA_URL =
	'data:image/png;base64,iVBORw0KGgoAAAAASUhEUgAAAAEAAAAB';

function setup(options: { embedded?: boolean; references?: boolean } = {}) {
	const warnings: string[] = [];
	const budget: AssetRewriteBudget = {
		recordWarning: (message) => warnings.push(message),
		reserveEmbeddedCharacters: vi.fn(() => options.embedded ?? true),
		reserveReference: vi.fn(() => options.references ?? true),
	};
	const loadImage = vi.fn<HtmlAssetLoader['loadImage']>(async () => ({
		ok: true as const,
		url: 'data:image/png;base64,AAAA',
	}));
	const loader: HtmlAssetLoader = {
		loadImage,
		loadStylesheet: vi.fn(),
	};
	return { budget, loader, loadImage, warnings };
}

describe('CSS image rewriting', () => {
	it('leaves comments, strings, fragments, data URLs, and plain CSS unchanged', async () => {
		const { budget, loader, loadImage } = setup();
		const css = `/* url(ignored.png) */ .x::before { content: "url(ignored.png)"; }
			.a { mask: url(#mask); background: url(${VALID_PNG_DATA_URL}); color: red; }`;
		expect(await rewriteCssAssetUrls(css, loader, budget, 'docs/index.html')).toBe(css);
		expect(loadImage).not.toHaveBeenCalled();
	});

	it('decodes CSS escapes and resolves against the supplied base path', async () => {
		const { budget, loader, loadImage } = setup();
		const result = await rewriteCssAssetUrls(
			'.x { background: url("..\\2f images\\2f icon.png"); }',
			loader,
			budget,
			'styles/site.css',
		);
		expect(result).toContain('url("data:image/png;base64,AAAA")');
		expect(loadImage).toHaveBeenCalledWith('../images/icon.png', {
			basePath: 'styles/site.css',
			signal: undefined,
		});
	});

	it('blocks references when the reference or embedded-size budget is exhausted', async () => {
		const referenceLimited = setup({ references: false });
		expect(
			await rewriteCssAssetUrls(
				'.x { background: url(image.png) }',
				referenceLimited.loader,
				referenceLimited.budget,
				'index.html',
			),
		).toContain('url("")');
		expect(referenceLimited.loadImage).not.toHaveBeenCalled();
		expect(referenceLimited.warnings).toContain(
			'Skipped local assets because the document has too many references.',
		);

		const embeddedLimited = setup({ embedded: false });
		expect(
			await rewriteCssAssetUrls(
				'.x { background: url(image.png) }',
				embeddedLimited.loader,
				embeddedLimited.budget,
				'index.html',
			),
		).toContain('url("")');
		expect(embeddedLimited.warnings).toContain(
			'Skipped local assets because the prepared document is too large.',
		);
	});

	it('blocks failed and throwing image loads with safe warnings', async () => {
		const failed = setup();
		failed.loadImage.mockResolvedValue({
			message: 'Image not found.',
			ok: false,
			reason: 'missing',
		});
		expect(
			await rewriteCssAssetUrls(
				'.x { background: url(image.png) }',
				failed.loader,
				failed.budget,
				'index.html',
			),
		).toContain('url("")');
		expect(failed.warnings).toEqual(['Image not found.']);

		const throwing = setup();
		throwing.loadImage.mockRejectedValue(new Error('secret'));
		await rewriteCssAssetUrls(
			'.x { background: url(image.png) }',
			throwing.loader,
			throwing.budget,
			'index.html',
		);
		expect(throwing.warnings).toEqual(['Unable to load a local CSS image.']);

		const unsafe = setup();
		unsafe.loadImage.mockResolvedValue({
			ok: true,
			url: 'https://attacker.invalid/image.png',
		});
		expect(
			await rewriteCssAssetUrls(
				'.x { background: url(image.png) }',
				unsafe.loader,
				unsafe.budget,
				'index.html',
			),
		).toContain('url("")');
		expect(unsafe.warnings).toEqual([
			'Blocked an unsafe generated CSS image URL.',
		]);
	});

	it('does not reinterpret malformed url functions', async () => {
		const { budget, loader } = setup();
		for (const css of [
			'url',
			'url("unterminated)',
			'url("image.png" trailing)',
			'url(image.png',
			'myurl(image.png)',
		]) {
			expect(await rewriteCssAssetUrls(css, loader, budget, 'index.html')).toBe(css);
		}
	});
});
