import type { HtmlAssetLoader } from './asset-loader';
import type { AssetRewriteBudget } from './css-assets';
import {
	isAllowedRasterDataUrl,
	isSafeAuthoredRasterDataUrl,
} from './html-sanitizer';
import { isRenderAborted, throwIfRenderAborted } from './render-abort';

interface SrcsetCandidate {
	descriptor: string;
	url: string;
}

function parseSrcset(value: string): SrcsetCandidate[] | null {
	const candidates: SrcsetCandidate[] = [];
	let cursor = 0;
	while (cursor < value.length) {
		while (/[\s,]/u.test(value[cursor] ?? '')) {
			cursor += 1;
		}
		if (cursor >= value.length) {
			break;
		}

		const urlStart = cursor;
		const dataUrl = value.slice(cursor, cursor + 5).toLowerCase() === 'data:';
		while (
			cursor < value.length &&
			!(/\s/u.test(value[cursor] ?? '') || (!dataUrl && value[cursor] === ','))
		) {
			cursor += 1;
		}
		const url = value.slice(urlStart, cursor);
		while (/\s/u.test(value[cursor] ?? '')) {
			cursor += 1;
		}
		const descriptorStart = cursor;
		while (cursor < value.length && value[cursor] !== ',') {
			cursor += 1;
		}
		const descriptor = value.slice(descriptorStart, cursor).trim();
		if (
			url.length === 0 ||
			(descriptor.length > 0 && !/^(?:[1-9]\d*w|(?:\d+(?:\.\d+)?|\.\d+)x)$/u.test(descriptor))
		) {
			return null;
		}
		candidates.push({ descriptor, url });
		cursor += 1;
	}
	return candidates;
}

export async function rewriteSrcset(
	value: string,
	assetLoader: HtmlAssetLoader,
	budget: AssetRewriteBudget,
	signal?: AbortSignal,
): Promise<string | null> {
	const candidates = parseSrcset(value);
	if (candidates === null) {
		budget.recordWarning('Blocked an invalid responsive image reference.');
		return null;
	}

	const rewritten: string[] = [];
	for (const candidate of candidates) {
		throwIfRenderAborted(signal);
		const reference = candidate.url.trim();
		if (isSafeAuthoredRasterDataUrl(reference)) {
			rewritten.push(`${reference}${candidate.descriptor.length > 0 ? ` ${candidate.descriptor}` : ''}`);
			continue;
		}
		if (!budget.reserveReference()) {
			budget.recordWarning('Skipped local assets because the document has too many references.');
			continue;
		}

		try {
			const result = await assetLoader.loadImage(
				reference,
				signal === undefined ? undefined : { signal },
			);
			if (result.ok && isAllowedRasterDataUrl(result.url)) {
				if (budget.reserveEmbeddedCharacters(result.url.length)) {
					rewritten.push(`${result.url}${candidate.descriptor.length > 0 ? ` ${candidate.descriptor}` : ''}`);
				} else {
					budget.recordWarning('Skipped local assets because the prepared document is too large.');
				}
			} else if (!result.ok) {
				budget.recordWarning(result.message);
			} else {
				budget.recordWarning('Blocked an unsafe generated responsive image URL.');
			}
		} catch (error) {
			if (isRenderAborted(error)) {
				throw error;
			}
			budget.recordWarning('Unable to load a responsive image.');
		}
	}
	return rewritten.length === 0 ? null : rewritten.join(', ');
}
