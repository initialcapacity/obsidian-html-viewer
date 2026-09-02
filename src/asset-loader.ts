import type { TFile, Vault } from 'obsidian';
import { validateRasterImage } from './image-validation';
import {
	getRasterMimeType,
	isCssPath,
	type RasterMimeType,
} from './mime';
import {
	isRenderAborted,
	throwIfRenderAborted,
} from './render-abort';
import {
	resolveVaultReference,
	type RejectedVaultReference,
	type ResolvedVaultReference,
} from './vault-path';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_STYLESHEET_BYTES = 1024 * 1024;
export const MAX_TOTAL_ASSET_BYTES = 25 * 1024 * 1024;
export const MAX_ASSET_REFERENCE_LENGTH = 512;

export type AssetFailureReason =
	| 'invalid-data'
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
	path?: string;
}

export type ImageAssetResult = AssetFailure | ImageAssetSuccess;
export type StylesheetAssetResult = AssetFailure | StylesheetAssetSuccess;

export interface AssetLoadOptions {
	basePath?: string;
	signal?: AbortSignal;
}

export interface AssetLoadLimits {
	maxImageBytes: number;
	maxStylesheetBytes: number;
	maxTotalBytes: number;
}

export interface HtmlAssetLoader {
	getDependencies?(): ReadonlySet<string>;
	loadImage(
		reference: string,
		options?: AssetLoadOptions,
	): Promise<ImageAssetResult>;
	loadStylesheet(
		reference: string,
		options?: AssetLoadOptions,
	): Promise<StylesheetAssetResult>;
}

export type ResolvedAssetPath = ResolvedVaultReference;
export type RejectedAssetPath = RejectedVaultReference;
export type AssetPathResult = RejectedAssetPath | ResolvedAssetPath;

type AssetVault = Pick<Vault, 'getFileByPath' | 'read' | 'readBinary'>;

type ImageUrlCreator = (data: ArrayBuffer, mimeType: RasterMimeType) => string;

const DEFAULT_ASSET_LOAD_LIMITS: AssetLoadLimits = {
	maxImageBytes: MAX_IMAGE_BYTES,
	maxStylesheetBytes: MAX_STYLESHEET_BYTES,
	maxTotalBytes: MAX_TOTAL_ASSET_BYTES,
};

export function resolveAssetPath(
	documentPath: string,
	authoredReference: string,
): AssetPathResult {
	return resolveVaultReference(documentPath, authoredReference, {
		maxLength: MAX_ASSET_REFERENCE_LENGTH,
	});
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
	let message: string;
	switch (reason) {
		case 'invalid-path':
			message = `Blocked ${kind} reference “${displayed}”.`;
			break;
		case 'invalid-data':
			message = `Invalid or excessively large ${kind} data for “${displayed}”.`;
			break;
		case 'unsupported-type':
			message = `Unsupported ${kind} type for “${displayed}”.`;
			break;
		case 'too-large':
			message = `${label} is too large: “${displayed}”.`;
			break;
		case 'missing':
			message = `${label} not found: “${displayed}”.`;
			break;
		case 'read-failed':
			message = `Unable to read ${kind} “${displayed}”.`;
			break;
	}

	return { message, ok: false, reason };
}

export class VaultAssetLoader implements HtmlAssetLoader {
	private readonly dependencies = new Set<string>();
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
		private readonly limits: AssetLoadLimits = DEFAULT_ASSET_LOAD_LIMITS,
	) {}

	getDependencies(): ReadonlySet<string> {
		return this.dependencies;
	}

	async loadImage(
		reference: string,
		options: AssetLoadOptions = {},
	): Promise<ImageAssetResult> {
		throwIfRenderAborted(options.signal);
		const resolved = resolveAssetPath(
			options.basePath ?? this.documentPath,
			reference,
		);
		if (!resolved.ok) {
			return failure(resolved.reason, 'image', reference);
		}

		const mimeType = getRasterMimeType(resolved.fileName);
		if (mimeType === null) {
			return failure('unsupported-type', 'image', reference);
		}
		this.dependencies.add(resolved.path);

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
		const resolved = resolveAssetPath(
			this.documentPath,
			reference,
		);
		if (!resolved.ok) {
			return failure(resolved.reason, 'stylesheet', reference);
		}
		if (!isCssPath(resolved.fileName)) {
			return failure('unsupported-type', 'stylesheet', reference);
		}
		this.dependencies.add(resolved.path);

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
		mimeType: RasterMimeType,
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
			if (!validateRasterImage(data, mimeType).ok) {
				return failure('invalid-data', 'image', reference);
			}
			if (
				data.byteLength > this.limits.maxImageBytes ||
				!this.reserveBytes(data.byteLength)
			) {
				return failure('too-large', 'image', reference);
			}
			const url = this.createImageUrl(data, mimeType);
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
			const css = await this.vault.read(file);
			throwIfRenderAborted(signal);
			const size = new TextEncoder().encode(css).byteLength;
			if (
				size > this.limits.maxStylesheetBytes ||
				!this.reserveBytes(size)
			) {
				return failure('too-large', 'stylesheet', reference);
			}
			return { css, ok: true, path };
		} catch (error) {
			if (isRenderAborted(error)) {
				throw error;
			}
			return failure('read-failed', 'stylesheet', reference);
		}
	}
}
