import type { HtmlAssetLoader } from './asset-loader';
import {
	isAllowedRasterDataUrl,
	isSafeAuthoredRasterDataUrl,
} from './html-sanitizer';
import { isRenderAborted, throwIfRenderAborted } from './render-abort';

export interface AssetRewriteBudget {
	recordWarning(message: string): void;
	reserveEmbeddedCharacters(size: number): boolean;
	reserveReference(): boolean;
}

interface CssUrlToken {
	end: number;
	reference: string;
	start: number;
}

function isIdentifierCharacter(character: string | undefined): boolean {
	return character !== undefined && /[a-z\d_-]/iu.test(character);
}

function consumeString(css: string, start: number, quote: string): number {
	for (let index = start + 1; index < css.length; index += 1) {
		if (css[index] === '\\') {
			index += 1;
		} else if (css[index] === quote) {
			return index + 1;
		}
	}
	return css.length;
}

function decodeCssEscapes(value: string): string | null {
	let decoded = '';
	for (let index = 0; index < value.length; index += 1) {
		const character = value[index];
		if (character !== '\\') {
			decoded += character;
			continue;
		}
		const next = value[index + 1];
		if (next === undefined) {
			return null;
		}
		if (next === '\n' || next === '\f') {
			index += 1;
			continue;
		}
		if (next === '\r') {
			index += value[index + 2] === '\n' ? 2 : 1;
			continue;
		}
		if (/[a-f\d]/iu.test(next)) {
			let hex = '';
			let cursor = index + 1;
			while (cursor < value.length && hex.length < 6 && /[a-f\d]/iu.test(value[cursor] ?? '')) {
				hex += value[cursor];
				cursor += 1;
			}
			const codePoint = Number.parseInt(hex, 16);
			decoded +=
				codePoint === 0 || codePoint > 0x10ffff
					? '�'
					: String.fromCodePoint(codePoint);
			if (/\s/u.test(value[cursor] ?? '')) {
				cursor += 1;
			}
			index = cursor - 1;
			continue;
		}
		decoded += next;
		index += 1;
	}
	return decoded;
}

function parseUrlToken(css: string, start: number): CssUrlToken | null {
	if (
		css.slice(start, start + 3).toLowerCase() !== 'url' ||
		isIdentifierCharacter(css[start - 1]) ||
		isIdentifierCharacter(css[start + 3])
	) {
		return null;
	}

	let cursor = start + 3;
	while (/\s/u.test(css[cursor] ?? '')) {
		cursor += 1;
	}
	if (css[cursor] !== '(') {
		return null;
	}
	cursor += 1;
	while (/\s/u.test(css[cursor] ?? '')) {
		cursor += 1;
	}

	let rawReference = '';
	const quote = css[cursor];
	if (quote === '"' || quote === "'") {
		const end = consumeString(css, cursor, quote);
		if (end > css.length || css[end - 1] !== quote) {
			return null;
		}
		rawReference = css.slice(cursor + 1, end - 1);
		cursor = end;
		while (/\s/u.test(css[cursor] ?? '')) {
			cursor += 1;
		}
		if (css[cursor] !== ')') {
			return null;
		}
	} else {
		const referenceStart = cursor;
		let escaped = false;
		while (cursor < css.length) {
			const character = css[cursor];
			if (!escaped && character === ')') {
				break;
			}
			if (!escaped && (character === '"' || character === "'")) {
				return null;
			}
			escaped = !escaped && character === '\\';
			if (character !== '\\') {
				escaped = false;
			}
			cursor += 1;
		}
		if (css[cursor] !== ')') {
			return null;
		}
		rawReference = css.slice(referenceStart, cursor).trim();
	}

	const reference = decodeCssEscapes(rawReference);
	return reference === null
		? null
		: { end: cursor + 1, reference, start };
}

function findCssUrlTokens(css: string): CssUrlToken[] {
	const tokens: CssUrlToken[] = [];
	for (let index = 0; index < css.length; index += 1) {
		if (css[index] === '/' && css[index + 1] === '*') {
			const commentEnd = css.indexOf('*/', index + 2);
			index = commentEnd === -1 ? css.length : commentEnd + 1;
			continue;
		}
		if (css[index] === '"' || css[index] === "'") {
			index = consumeString(css, index, css[index] ?? '') - 1;
			continue;
		}
		const token = parseUrlToken(css, index);
		if (token !== null) {
			tokens.push(token);
			index = token.end - 1;
		}
	}
	return tokens;
}

export async function rewriteCssAssetUrls(
	css: string,
	assetLoader: HtmlAssetLoader,
	budget: AssetRewriteBudget,
	basePath: string,
	signal?: AbortSignal,
): Promise<string> {
	const tokens = findCssUrlTokens(css);
	if (tokens.length === 0) {
		return css;
	}

	let rewritten = '';
	let cursor = 0;
	for (const token of tokens) {
		throwIfRenderAborted(signal);
		rewritten += css.slice(cursor, token.start);
		cursor = token.end;
		const reference = token.reference.trim();
		if (
			reference.length === 0 ||
			reference.startsWith('#') ||
			isSafeAuthoredRasterDataUrl(reference)
		) {
			rewritten += css.slice(token.start, token.end);
			continue;
		}
		if (!budget.reserveReference()) {
			budget.recordWarning('Skipped local assets because the document has too many references.');
			rewritten += 'url("")';
			continue;
		}

		try {
			const result = await assetLoader.loadImage(reference, {
				basePath,
				signal,
			});
			if (result.ok && isAllowedRasterDataUrl(result.url)) {
				if (budget.reserveEmbeddedCharacters(result.url.length)) {
					rewritten += `url("${result.url}")`;
				} else {
					budget.recordWarning('Skipped local assets because the prepared document is too large.');
					rewritten += 'url("")';
				}
			} else if (!result.ok) {
				budget.recordWarning(result.message);
				rewritten += 'url("")';
			} else {
				budget.recordWarning('Blocked an unsafe generated CSS image URL.');
				rewritten += 'url("")';
			}
		} catch (error) {
			if (isRenderAborted(error)) {
				throw error;
			}
			budget.recordWarning('Unable to load a local CSS image.');
			rewritten += 'url("")';
		}
	}
	return rewritten + css.slice(cursor);
}
