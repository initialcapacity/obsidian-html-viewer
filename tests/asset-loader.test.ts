import type { TFile } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import {
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
