import type { TFile } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import {
	MAX_ASSET_REFERENCE_LENGTH,
	SameFolderAssetLoader,
	resolveSameFolderAssetPath,
} from '../src/asset-loader';
import { getRasterMimeType, isCssPath } from '../src/mime';

describe('same-folder path resolution', () => {
	it.each([
		['plain file', 'folder/index.html', 'image.png', 'folder/image.png'],
		['one leading dot segment', 'folder/index.html', './image.png', 'folder/image.png'],
		['root file', 'index.html', 'image.png', 'image.png'],
		['Unicode file', 'folder/index.html', 'café.png', 'folder/café.png'],
		['encoded Unicode file', 'folder/index.html', 'caf%C3%A9.png', 'folder/café.png'],
	])('accepts %s', (_label, documentPath, reference, expectedPath) => {
		expect(resolveSameFolderAssetPath(documentPath, reference)).toEqual({
			fileName: expectedPath.slice(expectedPath.lastIndexOf('/') + 1),
			ok: true,
			path: expectedPath,
		});
	});

	it.each([
		['empty', ''],
		['absolute', '/absolute.png'],
		['protocol relative', '//attacker.invalid/image.png'],
		['parent traversal', '../secret.png'],
		['encoded traversal', '%2e%2e%2fsecret.png'],
		['encoded slash', 'nested%2Fimage.png'],
		['nested path', 'nested/image.png'],
		['backslash', 'nested\\image.png'],
		['encoded backslash', 'nested%5Cimage.png'],
		['HTTP', 'https://attacker.invalid/image.png'],
		['file URL', 'file:///secret.png'],
		['app URL', 'app://local/secret.png'],
		['blob URL', 'blob:attacker'],
		['data URL', 'data:image/png;base64,AA=='],
		['query', 'image.png?cache=1'],
		['fragment', 'image.png#fragment'],
		['null byte', 'image.png\0.css'],
		['encoded null byte', 'image.png%00.css'],
		['malformed percent encoding', 'image%ZZ.png'],
		['two dot prefixes', './../image.png'],
		['overlong reference', `${'a'.repeat(MAX_ASSET_REFERENCE_LENGTH)}.png`],
	])('rejects %s', (_label, reference) => {
		expect(
			resolveSameFolderAssetPath('folder/index.html', reference),
		).toEqual({ ok: false, reason: 'invalid-path' });
	});
});

describe('MIME allowlist', () => {
	it.each([
		['image.png', 'image/png'],
		['image.JPG', 'image/jpeg'],
		['image.jpeg', 'image/jpeg'],
		['image.gif', 'image/gif'],
		['image.webp', 'image/webp'],
		['image.avif', 'image/avif'],
	])('maps %s', (path, expected) => {
		expect(getRasterMimeType(path)).toBe(expected);
	});

	it.each(['image.svg', 'image.bmp', 'image.html', 'image', 'image.png.exe'])(
		'rejects %s',
		(path) => {
			expect(getRasterMimeType(path)).toBeNull();
		},
	);

	it('accepts only a CSS filename suffix', () => {
		expect(isCssPath('style.css')).toBe(true);
		expect(isCssPath('STYLE.CSS')).toBe(true);
		expect(isCssPath('style.css.html')).toBe(false);
	});
});

describe('same-folder asset loading', () => {
	const testFile: TFile = {} as never;

	it('loads raster bytes with the allowlisted MIME and tracks the blob URL', async () => {
		const data = new ArrayBuffer(4);
		const objectUrls = new Set<string>();
		const getFileByPath = vi.fn(() => testFile);
		const readBinary = vi.fn(async () => data);
		const createObjectUrl = vi.fn(() => 'blob:owned-image');
		const loader = new SameFolderAssetLoader(
			{
				cachedRead: vi.fn(),
				getFileByPath,
				readBinary,
			},
			'folder/index.html',
			createObjectUrl,
			objectUrls,
		);

		await expect(loader.loadImage('./image.PNG')).resolves.toEqual({
			ok: true,
			url: 'blob:owned-image',
		});
		expect(getFileByPath).toHaveBeenCalledWith('folder/image.PNG');
		expect(readBinary).toHaveBeenCalledWith(testFile);
		expect(createObjectUrl).toHaveBeenCalledWith(data, 'image/png');
		expect(objectUrls).toEqual(new Set(['blob:owned-image']));
	});

	it('loads same-folder CSS as text without creating an object URL', async () => {
		const objectUrls = new Set<string>();
		const cachedRead = vi.fn(async () => 'body { color: rebeccapurple; }');
		const loader = new SameFolderAssetLoader(
			{
				cachedRead,
				getFileByPath: vi.fn(() => testFile),
				readBinary: vi.fn(),
			},
			'folder/index.html',
			vi.fn(),
			objectUrls,
		);

		await expect(loader.loadStylesheet('style.css')).resolves.toEqual({
			css: 'body { color: rebeccapurple; }',
			ok: true,
		});
		expect(cachedRead).toHaveBeenCalledWith(testFile);
		expect(objectUrls).toHaveLength(0);
	});

	it('deduplicates equivalent image and stylesheet reads', async () => {
		const readBinary = vi.fn(async () => new ArrayBuffer(4));
		const cachedRead = vi.fn(async () => 'body { color: green; }');
		const createImageUrl = vi.fn(() => 'blob:deduplicated');
		const loader = new SameFolderAssetLoader(
			{
				cachedRead,
				getFileByPath: vi.fn(() => testFile),
				readBinary,
			},
			'folder/index.html',
			createImageUrl,
			new Set(),
		);

		await Promise.all([
			loader.loadImage('image.png'),
			loader.loadImage('./image.png'),
			loader.loadStylesheet('style.css'),
			loader.loadStylesheet('./style.css'),
		]);

		expect(readBinary).toHaveBeenCalledOnce();
		expect(createImageUrl).toHaveBeenCalledOnce();
		expect(cachedRead).toHaveBeenCalledOnce();
	});

	it('enforces per-asset and aggregate byte limits', async () => {
		const firstImage: TFile = {} as never;
		const secondImage: TFile = {} as never;
		const stylesheet: TFile = {} as never;
		const loader = new SameFolderAssetLoader(
			{
				cachedRead: vi.fn(async () => '12345'),
				getFileByPath: vi.fn((path: string) =>
					path.endsWith('first.png')
						? firstImage
						: path.endsWith('second.png')
							? secondImage
							: stylesheet,
				),
				readBinary: vi.fn(async () => new ArrayBuffer(3)),
			},
			'folder/index.html',
			vi.fn(() => 'blob:bounded'),
			new Set(),
			{
				maxImageBytes: 4,
				maxStylesheetBytes: 4,
				maxTotalBytes: 5,
			},
		);

		await expect(loader.loadImage('first.png')).resolves.toMatchObject({
			ok: true,
		});
		await expect(loader.loadImage('second.png')).resolves.toMatchObject({
			ok: false,
			reason: 'too-large',
		});
		await expect(loader.loadStylesheet('style.css')).resolves.toMatchObject({
			ok: false,
			reason: 'too-large',
		});
	});

	it('does not convert bytes after an in-flight read is aborted', async () => {
		const controller = new AbortController();
		let finishRead: ((data: ArrayBuffer) => void) | undefined;
		const readBinary = vi.fn(
			async () =>
				await new Promise<ArrayBuffer>((resolveRead) => {
					finishRead = resolveRead;
				}),
		);
		const createImageUrl = vi.fn(() => 'blob:should-not-exist');
		const loader = new SameFolderAssetLoader(
			{
				cachedRead: vi.fn(),
				getFileByPath: vi.fn(() => testFile),
				readBinary,
			},
			'folder/index.html',
			createImageUrl,
			new Set(),
		);
		const pending = loader.loadImage('image.png', {
			signal: controller.signal,
		});

		controller.abort();
		finishRead?.(new ArrayBuffer(4));

		await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
		expect(createImageUrl).not.toHaveBeenCalled();
	});

	it('rejects an oversized asset from vault metadata before reading it', async () => {
		const oversizedFile: TFile = { stat: { size: 5 } } as never;
		const readBinary = vi.fn();
		const cachedRead = vi.fn();
		const loader = new SameFolderAssetLoader(
			{
				cachedRead,
				getFileByPath: vi.fn(() => oversizedFile),
				readBinary,
			},
			'folder/index.html',
			vi.fn(),
			new Set(),
			{
				maxImageBytes: 4,
				maxStylesheetBytes: 4,
				maxTotalBytes: 8,
			},
		);

		await expect(loader.loadImage('image.png')).resolves.toMatchObject({
			ok: false,
			reason: 'too-large',
		});
		await expect(loader.loadStylesheet('style.css')).resolves.toMatchObject({
			ok: false,
			reason: 'too-large',
		});
		expect(readBinary).not.toHaveBeenCalled();
		expect(cachedRead).not.toHaveBeenCalled();
	});

	it('classifies invalid, unsupported, missing, and unreadable assets safely', async () => {
		const loader = new SameFolderAssetLoader(
			{
				cachedRead: vi.fn(async () => {
					throw new Error('unreadable');
				}),
				getFileByPath: vi.fn((path: string) =>
					path.endsWith('missing.png') ? null : testFile,
				),
				readBinary: vi.fn(async () => {
					throw new Error('unreadable');
				}),
			},
			'folder/index.html',
			vi.fn(),
			new Set(),
		);

		await expect(loader.loadImage('../secret.png')).resolves.toMatchObject({
			ok: false,
			reason: 'invalid-path',
		});
		await expect(loader.loadImage('vector.svg')).resolves.toMatchObject({
			ok: false,
			reason: 'unsupported-type',
		});
		await expect(loader.loadImage('missing.png')).resolves.toMatchObject({
			ok: false,
			reason: 'missing',
		});
		await expect(loader.loadImage('broken.png')).resolves.toMatchObject({
			ok: false,
			reason: 'read-failed',
		});
		await expect(loader.loadStylesheet('broken.css')).resolves.toMatchObject({
			ok: false,
			reason: 'read-failed',
		});
	});
});
