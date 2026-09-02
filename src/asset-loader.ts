import type { TFile, Vault } from 'obsidian';
import { getRasterMimeType, isCssPath } from './mime';
import {
	isRenderAborted,
	throwIfRenderAborted,
} from './render-abort';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_STYLESHEET_BYTES = 1024 * 1024;
export const MAX_TOTAL_ASSET_BYTES = 25 * 1024 * 1024;
export const MAX_ASSET_REFERENCE_LENGTH = 512;

export type AssetFailureReason =
	| 'invalid-path'
	| 'missing'
	| 'read-failed'
	| 'too-large'
	| 'unsupported-type';

export interface AssetFailure {
	ok: false;
	message: string;
	reason: AssetFailureReason;
}

export interface ImageAssetSuccess {
	ok: true;
	url: string;
}

export interface StylesheetAssetSuccess {
	css: string;
	ok: true;
}

export type ImageAssetResult = AssetFailure | ImageAssetSuccess;
export type StylesheetAssetResult = AssetFailure | StylesheetAssetSuccess;

export interface AssetLoadOptions {
	signal?: AbortSignal;
}

export interface AssetLoadLimits {
	maxImageBytes: number;
	maxStylesheetBytes: number;
	maxTotalBytes: number;
}

export interface HtmlAssetLoader {
	loadImage(
		reference: string,
		options?: AssetLoadOptions,
	): Promise<ImageAssetResult>;
	loadStylesheet(
		reference: string,
		options?: AssetLoadOptions,
	): Promise<StylesheetAssetResult>;
}

export interface ResolvedAssetPath {
	fileName: string;
	ok: true;
	path: string;
}

export interface RejectedAssetPath {
	ok: false;
	reason: 'invalid-path';
}

export type AssetPathResult = RejectedAssetPath | ResolvedAssetPath;

type AssetVault = Pick<
	Vault,
	'cachedRead' | 'getFileByPath' | 'readBinary'
>;

type ImageUrlCreator = (data: ArrayBuffer, mimeType: string) => string;

const DEFAULT_ASSET_LOAD_LIMITS: AssetLoadLimits = {
	maxImageBytes: MAX_IMAGE_BYTES,
	maxStylesheetBytes: MAX_STYLESHEET_BYTES,
	maxTotalBytes: MAX_TOTAL_ASSET_BYTES,
};

function parentPath(path: string): string {
	const separator = path.lastIndexOf('/');
	return separator === -1 ? '' : path.slice(0, separator);
}

function rejectedPath(): RejectedAssetPath {
	return { ok: false, reason: 'invalid-path' };
}

export function resolveSameFolderAssetPath(
	documentPath: string,
	authoredReference: string,
): AssetPathResult {
	let reference = authoredReference.trim();
	if (
		reference.length === 0 ||
		reference.length > MAX_ASSET_REFERENCE_LENGTH ||
		reference.includes('\0')
	) {
		return rejectedPath();
	}

	try {
		reference = decodeURIComponent(reference);
	} catch {
		return rejectedPath();
	}

	if (reference.startsWith('./')) {
		reference = reference.slice(2);
	}

	if (
		reference.length === 0 ||
		reference.length > MAX_ASSET_REFERENCE_LENGTH ||
		reference.includes('\0') ||
		reference.includes('/') ||
		reference.includes('\\') ||
		reference.includes('?') ||
		reference.includes('#') ||
		reference === '.' ||
		reference === '..' ||
		/^[a-z][a-z\d+.-]*:/iu.test(reference)
	) {
		return rejectedPath();
	}

	const folder = parentPath(documentPath);
	return {
		fileName: reference,
		ok: true,
		path: folder.length === 0 ? reference : `${folder}/${reference}`,
	};
}

function displayReference(reference: string): string {
	const printable = reference.replaceAll('\0', '�');
	return printable.length <= 120 ? printable : `${printable.slice(0, 117)}…`;
}

function failure(
	reason: AssetFailureReason,
	kind: 'image' | 'stylesheet',
	reference: string,
): AssetFailure {
	const displayed = displayReference(reference);
	const label = kind === 'image' ? 'Image' : 'Stylesheet';
	const message =
		reason === 'invalid-path'
			? `Blocked ${kind} reference “${displayed}”.`
			: reason === 'unsupported-type'
				? `Unsupported ${kind} type for “${displayed}”.`
				: reason === 'too-large'
					? `${label} is too large: “${displayed}”.`
					: reason === 'missing'
						? `${label} not found: “${displayed}”.`
						: `Unable to read ${kind} “${displayed}”.`;

	return { message, ok: false, reason };
}

export class SameFolderAssetLoader implements HtmlAssetLoader {
	private readonly imageCache = new Map<string, Promise<ImageAssetResult>>();
	private loadedBytes = 0;
	private readonly stylesheetCache = new Map<
		string,
		Promise<StylesheetAssetResult>
	>();

	constructor(
		private readonly vault: AssetVault,
		private readonly documentPath: string,
		private readonly createImageUrl: ImageUrlCreator,
		private readonly objectUrls: Set<string>,
		private readonly limits: AssetLoadLimits = DEFAULT_ASSET_LOAD_LIMITS,
	) {}

	async loadImage(
		reference: string,
		options: AssetLoadOptions = {},
	): Promise<ImageAssetResult> {
		throwIfRenderAborted(options.signal);
		const resolved = resolveSameFolderAssetPath(
			this.documentPath,
			reference,
		);
		if (!resolved.ok) {
			return failure(resolved.reason, 'image', reference);
		}

		const mimeType = getRasterMimeType(resolved.fileName);
		if (mimeType === null) {
			return failure('unsupported-type', 'image', reference);
		}

		const cached = this.imageCache.get(resolved.path);
		if (cached !== undefined) {
			const result = await cached;
			throwIfRenderAborted(options.signal);
			return result;
		}

		const pending = this.loadImageFile(
			resolved.path,
			reference,
			mimeType,
			options.signal,
		);
		this.imageCache.set(resolved.path, pending);
		return pending;
	}

	async loadStylesheet(
		reference: string,
		options: AssetLoadOptions = {},
	): Promise<StylesheetAssetResult> {
		throwIfRenderAborted(options.signal);
		const resolved = resolveSameFolderAssetPath(
			this.documentPath,
			reference,
		);
		if (!resolved.ok) {
			return failure(resolved.reason, 'stylesheet', reference);
		}
		if (!isCssPath(resolved.fileName)) {
			return failure('unsupported-type', 'stylesheet', reference);
		}

		const cached = this.stylesheetCache.get(resolved.path);
		if (cached !== undefined) {
			const result = await cached;
			throwIfRenderAborted(options.signal);
			return result;
		}

		const pending = this.loadStylesheetFile(
			resolved.path,
			reference,
			options.signal,
		);
		this.stylesheetCache.set(resolved.path, pending);
		return pending;
	}

	private reserveBytes(size: number): boolean {
		if (this.loadedBytes + size > this.limits.maxTotalBytes) {
			return false;
		}

		this.loadedBytes += size;
		return true;
	}

	private canLoadBytes(size: number, perAssetLimit: number): boolean {
		return (
			size <= perAssetLimit &&
			this.loadedBytes + size <= this.limits.maxTotalBytes
		);
	}

	private async loadImageFile(
		path: string,
		reference: string,
		mimeType: string,
		signal?: AbortSignal,
	): Promise<ImageAssetResult> {
		const file = this.vault.getFileByPath(path);
		if (file === null) {
			return failure('missing', 'image', reference);
		}
		if (
			file.stat?.size !== undefined &&
			!this.canLoadBytes(file.stat.size, this.limits.maxImageBytes)
		) {
			return failure('too-large', 'image', reference);
		}

		try {
			const data = await this.vault.readBinary(file);
			throwIfRenderAborted(signal);
			if (
				data.byteLength > this.limits.maxImageBytes ||
				!this.reserveBytes(data.byteLength)
			) {
				return failure('too-large', 'image', reference);
			}
			const url = this.createImageUrl(data, mimeType);
			if (url.startsWith('blob:')) {
				this.objectUrls.add(url);
			}
			return { ok: true, url };
		} catch (error) {
			if (isRenderAborted(error)) {
				throw error;
			}
			return failure('read-failed', 'image', reference);
		}
	}

	private async loadStylesheetFile(
		path: string,
		reference: string,
		signal?: AbortSignal,
	): Promise<StylesheetAssetResult> {
		const file: TFile | null = this.vault.getFileByPath(path);
		if (file === null) {
			return failure('missing', 'stylesheet', reference);
		}
		if (
			file.stat?.size !== undefined &&
			!this.canLoadBytes(file.stat.size, this.limits.maxStylesheetBytes)
		) {
			return failure('too-large', 'stylesheet', reference);
		}

		try {
			const css = await this.vault.cachedRead(file);
			throwIfRenderAborted(signal);
			const size = new TextEncoder().encode(css).byteLength;
			if (
				size > this.limits.maxStylesheetBytes ||
				!this.reserveBytes(size)
			) {
				return failure('too-large', 'stylesheet', reference);
			}
			return { css, ok: true };
		} catch (error) {
			if (isRenderAborted(error)) {
				throw error;
			}
			return failure('read-failed', 'stylesheet', reference);
		}
	}
}
