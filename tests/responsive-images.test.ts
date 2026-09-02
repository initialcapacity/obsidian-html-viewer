import { describe, expect, it, vi } from 'vitest';
import type { HtmlAssetLoader } from '../src/asset-loader';
import type { AssetRewriteBudget } from '../src/css-assets';
import { rewriteSrcset } from '../src/responsive-images';

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

describe('responsive image rewriting', () => {
	it('rejects invalid descriptors and preserves valid raster data URLs', async () => {
		const invalid = setup();
		expect(
			await rewriteSrcset('image.png 0w', invalid.loader, invalid.budget),
		).toBeNull();
		expect(invalid.warnings).toEqual([
			'Blocked an invalid responsive image reference.',
		]);

		const data = setup();
		expect(
			await rewriteSrcset(
				`${VALID_PNG_DATA_URL} 2x`,
				data.loader,
				data.budget,
			),
		).toBe(`${VALID_PNG_DATA_URL} 2x`);
		expect(data.loadImage).not.toHaveBeenCalled();
	});

	it('drops candidates when either resource budget is exhausted', async () => {
		const referenceLimited = setup({ references: false });
		expect(
			await rewriteSrcset(
				'image.png 1x',
				referenceLimited.loader,
				referenceLimited.budget,
			),
		).toBeNull();
		expect(referenceLimited.warnings).toContain(
			'Skipped local assets because the document has too many references.',
		);

		const embeddedLimited = setup({ embedded: false });
		expect(
			await rewriteSrcset(
				'image.png 400w',
				embeddedLimited.loader,
				embeddedLimited.budget,
			),
		).toBeNull();
		expect(embeddedLimited.warnings).toContain(
			'Skipped local assets because the prepared document is too large.',
		);
	});

	it('drops failed candidates and converts unexpected failures to safe warnings', async () => {
		const failed = setup();
		failed.loadImage.mockResolvedValue({
			message: 'Image not found.',
			ok: false,
			reason: 'missing',
		});
		expect(await rewriteSrcset('missing.png', failed.loader, failed.budget)).toBeNull();
		expect(failed.warnings).toEqual(['Image not found.']);

		const throwing = setup();
		throwing.loadImage.mockRejectedValue(new Error('secret'));
		expect(
			await rewriteSrcset('image.png', throwing.loader, throwing.budget),
		).toBeNull();
		expect(throwing.warnings).toEqual(['Unable to load a responsive image.']);

		const unsafe = setup();
		unsafe.loadImage.mockResolvedValue({
			ok: true,
			url: 'https://attacker.invalid/image.png',
		});
		expect(
			await rewriteSrcset('image.png', unsafe.loader, unsafe.budget),
		).toBeNull();
		expect(unsafe.warnings).toEqual([
			'Blocked an unsafe generated responsive image URL.',
		]);
	});
});
