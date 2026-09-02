import type { HtmlAssetLoader } from './asset-loader';
import {
	type AssetRewriteBudget,
	rewriteCssAssetUrls,
} from './css-assets';
import {
	MAX_ASSET_REFERENCES,
	createDetachedStylesheet,
	isAllowedRasterDataUrl,
	parseAndSanitize,
	removeElements,
	serializePrepared,
} from './html-sanitizer';
import { isRenderAborted, throwIfRenderAborted } from './render-abort';
import { rewriteSrcset } from './responsive-images';
import { resolveVaultReference } from './vault-path';

export {
	CONTENT_SECURITY_POLICY,
	MAX_ASSET_REFERENCES,
	MAX_DOM_DEPTH,
	MAX_DOM_ELEMENTS,
	MAX_HTML_SOURCE_BYTES,
	MAX_HTML_SOURCE_CHARACTERS,
} from './html-sanitizer';

export const MAX_EMBEDDED_ASSET_CHARACTERS = 25 * 1024 * 1024;

export interface DocumentNavigationTarget {
	fragment: string | null;
	label: string;
	path: string;
}

export interface PreparedHtmlResult {
	dependencies: string[];
	html: string;
	navigation: DocumentNavigationTarget[];
	warnings: string[];
}

export interface PrepareHtmlOptions {
	maxEmbeddedAssetCharacters?: number;
	signal?: AbortSignal;
}

function createBudget(
	initialReferences: number,
	maximumEmbeddedCharacters: number,
	warnings: Set<string>,
): AssetRewriteBudget {
	let embeddedCharacters = 0;
	let references = initialReferences;
	return {
		recordWarning(message): void {
			warnings.add(message);
		},
		reserveEmbeddedCharacters(size): boolean {
			if (embeddedCharacters + size > maximumEmbeddedCharacters) {
				return false;
			}
			embeddedCharacters += size;
			return true;
		},
		reserveReference(): boolean {
			if (references + 1 > MAX_ASSET_REFERENCES) {
				return false;
			}
			references += 1;
			return true;
		},
	};
}

function navigationTargets(
	documentPath: string,
	references: ReturnType<typeof parseAndSanitize>['navigation'],
): DocumentNavigationTarget[] {
	const targets = new Map<string, DocumentNavigationTarget>();
	for (const reference of references) {
		const resolved = resolveVaultReference(documentPath, reference.reference, {
			allowFragment: true,
		});
		if (!resolved.ok || !/[.]html?$/iu.test(resolved.fileName)) {
			continue;
		}
		const key = `${resolved.path}#${resolved.fragment ?? ''}`;
		const target = {
			fragment: resolved.fragment,
			label: reference.label,
			path: resolved.path,
		};
		targets.set(key, target);
		reference.element.setAttribute('aria-disabled', 'true');
		reference.element.setAttribute('data-html-document-viewer-navigation', key);
		reference.element.setAttribute(
			'title',
			`Open “${reference.label}” from the viewer toolbar.`,
		);
	}
	return Array.from(targets.values());
}

async function loadImage(
	assetLoader: HtmlAssetLoader,
	reference: string,
	signal?: AbortSignal,
) {
	return signal === undefined
		? assetLoader.loadImage(reference)
		: assetLoader.loadImage(reference, { signal });
}

async function loadStylesheet(
	assetLoader: HtmlAssetLoader,
	reference: string,
	signal?: AbortSignal,
) {
	return signal === undefined
		? assetLoader.loadStylesheet(reference)
		: assetLoader.loadStylesheet(reference, { signal });
}

/** Prepare hostile HTML for assignment only to a sandboxed iframe's srcdoc. */
export function prepareHtml(
	source: string,
	options: PrepareHtmlOptions = {},
): string {
	throwIfRenderAborted(options.signal);
	const sanitized = parseAndSanitize(source);
	throwIfRenderAborted(options.signal);
	removeElements(sanitized.document, 'link');
	return serializePrepared(sanitized.document);
}

export async function prepareHtmlWithAssets(
	source: string,
	documentPath: string,
	assetLoader: HtmlAssetLoader,
	options: PrepareHtmlOptions = {},
): Promise<PreparedHtmlResult> {
	throwIfRenderAborted(options.signal);
	const sanitized = parseAndSanitize(source);
	throwIfRenderAborted(options.signal);
	const warnings = new Set<string>();
	const embeddedLimit = Math.min(
		options.maxEmbeddedAssetCharacters ?? MAX_EMBEDDED_ASSET_CHARACTERS,
		MAX_EMBEDDED_ASSET_CHARACTERS,
	);
	const budget = createBudget(
		sanitized.images.length + sanitized.stylesheets.length,
		embeddedLimit,
		warnings,
	);
	const stylesheetBasePaths = new Map<HTMLStyleElement, string>();

	for (const image of sanitized.images) {
		throwIfRenderAborted(options.signal);
		if (image.element.hasAttribute('src')) {
			continue;
		}
		let imageWarning = 'Blocked image';
		try {
			const result = await loadImage(assetLoader, image.reference, options.signal);
			if (result.ok && isAllowedRasterDataUrl(result.url)) {
				if (budget.reserveEmbeddedCharacters(result.url.length)) {
					image.element.setAttribute('src', result.url);
					image.element.removeAttribute('data-html-document-viewer-blocked');
					continue;
				}
				imageWarning = 'Skipped local assets because the prepared document is too large.';
				budget.recordWarning(imageWarning);
			} else if (!result.ok) {
				imageWarning = result.message;
				budget.recordWarning(imageWarning);
			} else {
				imageWarning = 'Blocked an unsafe generated image URL.';
				budget.recordWarning(imageWarning);
			}
		} catch (error) {
			if (isRenderAborted(error)) {
				throw error;
			}
			imageWarning = 'Unable to load a local image.';
			budget.recordWarning(imageWarning);
		}
		if (!image.hadAuthoredAlt) {
			image.element.setAttribute('alt', imageWarning);
		}
	}

	for (const imageSet of sanitized.imageSets) {
		const rewritten = await rewriteSrcset(
			imageSet.reference,
			assetLoader,
			budget,
			options.signal,
		);
		if (rewritten === null) {
			imageSet.element.removeAttribute('srcset');
		} else {
			imageSet.element.setAttribute('srcset', rewritten);
		}
	}

	for (const stylesheet of sanitized.stylesheets) {
		throwIfRenderAborted(options.signal);
		try {
			const result = await loadStylesheet(
				assetLoader,
				stylesheet.reference,
				options.signal,
			);
			if (result.ok) {
				if (!budget.reserveEmbeddedCharacters(result.css.length)) {
					budget.recordWarning('Skipped local assets because the prepared document is too large.');
					stylesheet.element.remove();
					continue;
				}
				const adopted = createDetachedStylesheet(
					sanitized.document,
					result.css,
					stylesheet,
				);
				stylesheetBasePaths.set(adopted, result.path ?? documentPath);
				stylesheet.element.replaceWith(adopted);
			} else {
				budget.recordWarning(result.message);
				stylesheet.element.remove();
			}
		} catch (error) {
			if (isRenderAborted(error)) {
				throw error;
			}
			budget.recordWarning('Unable to load a local stylesheet.');
			stylesheet.element.remove();
		}
	}

	for (const style of Array.from(sanitized.document.querySelectorAll('style'))) {
		style.textContent = await rewriteCssAssetUrls(
			style.textContent ?? '',
			assetLoader,
			budget,
			stylesheetBasePaths.get(style) ?? documentPath,
			options.signal,
		);
	}
	for (const element of Array.from(
		sanitized.document.querySelectorAll<HTMLElement>('[style]'),
	)) {
		const css = element.getAttribute('style') ?? '';
		element.setAttribute(
			'style',
			await rewriteCssAssetUrls(
				css,
				assetLoader,
				budget,
				documentPath,
				options.signal,
			),
		);
	}

	removeElements(sanitized.document, 'link');
	const navigation = navigationTargets(documentPath, sanitized.navigation);
	return {
		dependencies: Array.from(assetLoader.getDependencies?.() ?? []),
		html: serializePrepared(sanitized.document),
		navigation,
		warnings: Array.from(warnings),
	};
}
