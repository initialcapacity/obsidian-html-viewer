import type { TFile, Vault } from 'obsidian';
import { getRasterMimeType, isCssPath } from './mime';

export type AssetFailureReason =
	| 'invalid-path'
	| 'missing'
	| 'read-failed'
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

export interface HtmlAssetLoader {
	loadImage(reference: string): Promise<ImageAssetResult>;
	loadStylesheet(reference: string): Promise<StylesheetAssetResult>;
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
	if (reference.length === 0 || reference.includes('\0')) {
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
				: reason === 'missing'
					? `${label} not found: “${displayed}”.`
					: `Unable to read ${kind} “${displayed}”.`;

	return { message, ok: false, reason };
}

export class SameFolderAssetLoader implements HtmlAssetLoader {
	constructor(
		private readonly vault: AssetVault,
		private readonly documentPath: string,
		private readonly createImageUrl: ImageUrlCreator,
		private readonly objectUrls: Set<string>,
	) {}

	async loadImage(reference: string): Promise<ImageAssetResult> {
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

		const file = this.vault.getFileByPath(resolved.path);
		if (file === null) {
			return failure('missing', 'image', reference);
		}

		try {
			const data = await this.vault.readBinary(file);
			const url = this.createImageUrl(data, mimeType);
			if (url.startsWith('blob:')) {
				this.objectUrls.add(url);
			}
			return { ok: true, url };
		} catch {
			return failure('read-failed', 'image', reference);
		}
	}

	async loadStylesheet(reference: string): Promise<StylesheetAssetResult> {
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

		const file: TFile | null = this.vault.getFileByPath(resolved.path);
		if (file === null) {
			return failure('missing', 'stylesheet', reference);
		}

		try {
			return { css: await this.vault.cachedRead(file), ok: true };
		} catch {
			return failure('read-failed', 'stylesheet', reference);
		}
	}
}
