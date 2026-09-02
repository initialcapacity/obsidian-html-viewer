import type { TFile } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import {
	MAX_ASSET_REFERENCE_LENGTH,
	VaultAssetLoader,
	resolveAssetPath,
} from '../src/asset-loader';
import { getRasterMimeType, isCssPath } from '../src/mime';

function validPng(width = 1, height = 1): ArrayBuffer {
	const bytes = new Uint8Array(24);
	bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
	bytes.set([73, 72, 68, 82], 12);
	const view = new DataView(bytes.buffer);
	view.setUint32(16, width);
	view.setUint32(20, height);
	return bytes.buffer;
}

describe('vault-relative path resolution', () => {
	it.each([
		['plain file', 'folder/index.html', 'image.png', 'folder/image.png'],
		['one leading dot segment', 'folder/index.html', './image.png', 'folder/image.png'],
		['nested path', 'folder/index.html', 'images/image.png', 'folder/images/image.png'],
		['parent path within the vault', 'folder/index.html', '../image.png', 'image.png'],
		['root file', 'index.html', 'image.png', 'image.png'],
		['Unicode file', 'folder/index.html', 'café.png', 'folder/café.png'],
		['encoded Unicode file', 'folder/index.html', 'caf%C3%A9.png', 'folder/café.png'],
	])('accepts %s', (_label, documentPath, reference, expectedPath) => {
		expect(resolveAssetPath(documentPath, reference)).toEqual({
			fileName: expectedPath.slice(expectedPath.lastIndexOf('/') + 1),
			ok: true,
			path: expectedPath,
		});
	});

	it.each([
		['empty', ''],
		['absolute', '/absolute.png'],
		['protocol relative', '//attacker.invalid/image.png'],
		['vault escape', '../../secret.png'],
		['encoded traversal', '%2e%2e%2fsecret.png'],
		['encoded slash', 'nested%2Fimage.png'],
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
		['overlong reference', `${'a'.repeat(MAX_ASSET_REFERENCE_LENGTH)}.png`],
	])('rejects %s', (_label, reference) => {
		expect(
			resolveAssetPath('folder/index.html', reference),
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

describe('vault-relative asset loading', () => {
	const testFile: TFile = {} as never;

	it('validates and loads raster bytes while tracking the dependency', async () => {
			const data = validPng();
		const getFileByPath = vi.fn(() => testFile);
		const readBinary = vi.fn(async () => data);
			const createImageUrl = vi.fn(() => 'data:image/png;base64,AAAA');
		const loader = new VaultAssetLoader(
			{
				read: vi.fn(),
				getFileByPath,
				readBinary,
			},
			'folder/index.html',
				createImageUrl,
		);

		await expect(loader.loadImage('./image.PNG')).resolves.toEqual({
			ok: true,
				url: 'data:image/png;base64,AAAA',
		});
		expect(getFileByPath).toHaveBeenCalledWith('folder/image.PNG');
		expect(readBinary).toHaveBeenCalledWith(testFile);
			expect(createImageUrl).toHaveBeenCalledWith(data, 'image/png');
			expect(loader.getDependencies()).toEqual(new Set(['folder/image.PNG']));
		});

		it('loads vault-relative CSS as text', async () => {
		const read = vi.fn(async () => 'body { color: rebeccapurple; }');
		const loader = new VaultAssetLoader(
			{
				read,
				getFileByPath: vi.fn(() => testFile),
				readBinary: vi.fn(),
			},
				'folder/index.html',
				vi.fn(),
		);

		await expect(loader.loadStylesheet('style.css')).resolves.toEqual({
			css: 'body { color: rebeccapurple; }',
			ok: true,
			path: 'folder/style.css',
		});
		expect(read).toHaveBeenCalledWith(testFile);
			expect(loader.getDependencies()).toEqual(new Set(['folder/style.css']));
	});

	it('deduplicates equivalent image and stylesheet reads', async () => {
			const readBinary = vi.fn(async () => validPng());
		const read = vi.fn(async () => 'body { color: green; }');
			const createImageUrl = vi.fn(() => 'data:image/png;base64,AAAA');
		const loader = new VaultAssetLoader(
			{
				read,
				getFileByPath: vi.fn(() => testFile),
				readBinary,
			},
			'folder/index.html',
				createImageUrl,
		);

		await Promise.all([
			loader.loadImage('image.png'),
			loader.loadImage('./image.png'),
			loader.loadStylesheet('style.css'),
			loader.loadStylesheet('./style.css'),
		]);

		expect(readBinary).toHaveBeenCalledOnce();
		expect(createImageUrl).toHaveBeenCalledOnce();
		expect(read).toHaveBeenCalledOnce();
	});

	it('enforces per-asset and aggregate byte limits', async () => {
		const firstImage: TFile = {} as never;
		const secondImage: TFile = {} as never;
		const stylesheet: TFile = {} as never;
		const loader = new VaultAssetLoader(
			{
				read: vi.fn(async () => '12345'),
				getFileByPath: vi.fn((path: string) =>
					path.endsWith('first.png')
						? firstImage
						: path.endsWith('second.png')
							? secondImage
							: stylesheet,
				),
				readBinary: vi.fn(async () => validPng()),
			},
			'folder/index.html',
				vi.fn(() => 'data:image/png;base64,AAAA'),
				{
					maxImageBytes: 24,
					maxStylesheetBytes: 24,
					maxTotalBytes: 28,
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
			const createImageUrl = vi.fn(() => 'data:image/png;base64,AAAA');
		const loader = new VaultAssetLoader(
			{
				read: vi.fn(),
				getFileByPath: vi.fn(() => testFile),
				readBinary,
			},
			'folder/index.html',
				createImageUrl,
		);
		const pending = loader.loadImage('image.png', {
			signal: controller.signal,
		});

		controller.abort();
			finishRead?.(validPng());

		await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
		expect(createImageUrl).not.toHaveBeenCalled();
	});

	it('rejects an oversized asset from vault metadata before reading it', async () => {
			const oversizedFile: TFile = { stat: { size: 25 } } as never;
		const readBinary = vi.fn();
		const read = vi.fn();
		const loader = new VaultAssetLoader(
			{
				read,
				getFileByPath: vi.fn(() => oversizedFile),
				readBinary,
			},
				'folder/index.html',
				vi.fn(),
				{
					maxImageBytes: 24,
					maxStylesheetBytes: 24,
					maxTotalBytes: 48,
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
		expect(read).not.toHaveBeenCalled();
	});

	it('classifies invalid, unsupported, missing, and unreadable assets safely', async () => {
		const loader = new VaultAssetLoader(
			{
				read: vi.fn(async () => {
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
		);

		await expect(loader.loadImage('../../secret.png')).resolves.toMatchObject({
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
