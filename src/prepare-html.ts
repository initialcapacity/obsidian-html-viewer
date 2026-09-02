import type { HtmlAssetLoader } from './asset-loader';
import {
	isRenderAborted,
	throwIfRenderAborted,
} from './render-abort';

export const MAX_HTML_SOURCE_CHARACTERS = 5_000_000;
export const MAX_HTML_SOURCE_BYTES = 10 * 1024 * 1024;
export const MAX_ASSET_REFERENCES = 256;
export const MAX_EMBEDDED_ASSET_CHARACTERS = 25 * 1024 * 1024;

export const CONTENT_SECURITY_POLICY =
	"default-src 'none'; " +
	"script-src 'none'; " +
	"connect-src 'none'; " +
	"object-src 'none'; " +
	"frame-src 'none'; " +
	"child-src 'none'; " +
	"worker-src 'none'; " +
	"form-action 'none'; " +
	"base-uri 'none'; " +
	'img-src data: blob:; ' +
	"style-src 'unsafe-inline' data: blob:; " +
	'font-src data: blob:; ' +
	"media-src 'none'; " +
	"manifest-src 'none';";

const ACTIVE_ELEMENT_SELECTOR = [
	'applet',
	'audio',
	'embed',
	'fencedframe',
	'frame',
	'frameset',
	'iframe',
	'object',
	'portal',
	'script',
	'source',
	'svg',
	'template',
	'track',
	'video',
	'webview',
	'annotation-xml',
].join(',');

const NAVIGATION_OR_RESOURCE_ATTRIBUTES = new Set([
	'action',
	'archive',
	'attributionsrc',
	'background',
	'browsingtopics',
	'cite',
	'codebase',
	'data',
	'download',
	'dynsrc',
	'form',
	'formaction',
	'formenctype',
	'formmethod',
	'formnovalidate',
	'formtarget',
	'href',
	'longdesc',
	'lowsrc',
	'manifest',
	'ping',
	'poster',
	'profile',
	'sizes',
	'src',
	'srcdoc',
	'srcset',
	'target',
	'usemap',
	'xlink:href',
]);

const FORM_CONTROL_SELECTOR = [
	'button',
	'fieldset',
	'input',
	'optgroup',
	'option',
	'select',
	'textarea',
].join(',');

const RASTER_DATA_URL =
	/^data:image\/(?:avif|gif|jpeg|png|webp);base64,[a-z\d+/\t\n\f\r ]*={0,2}$/i;

function removeElements(document: Document, selector: string): void {
	for (const element of Array.from(document.querySelectorAll(selector))) {
		element.remove();
	}
}

function removeAuthoredPoliciesAndNavigation(document: Document): void {
	removeElements(document, 'base');

	for (const meta of Array.from(document.querySelectorAll('meta[http-equiv]'))) {
		const directive = meta.getAttribute('http-equiv')?.trim().toLowerCase();
		if (
			directive === 'content-security-policy' ||
			directive === 'content-security-policy-report-only' ||
			directive === 'refresh'
		) {
			meta.remove();
		}
	}
}

function isAllowedRasterDataUrl(value: string): boolean {
	return RASTER_DATA_URL.test(value);
}

interface ImageReference {
	element: HTMLImageElement;
	hadAuthoredAlt: boolean;
	reference: string;
}

interface StylesheetReference {
	disabled: boolean;
	element: HTMLLinkElement;
	media: string | null;
	reference: string;
	title: string | null;
}

interface SanitizedDocument {
	document: Document;
	images: ImageReference[];
	stylesheets: StylesheetReference[];
}

export interface PreparedHtmlResult {
	html: string;
	warnings: string[];
}

export interface PrepareHtmlOptions {
	maxEmbeddedAssetCharacters?: number;
	signal?: AbortSignal;
}

function sanitizeAttributes(element: Element): void {
	const tagName = element.localName.toLowerCase();
	const authoredImageSource = tagName === 'img' && element.hasAttribute('src');
	let blockedImageSource = false;

	for (const attribute of Array.from(element.attributes)) {
		const name = attribute.name.toLowerCase();
		const localName = attribute.localName.toLowerCase();
		const value = attribute.value.trim();

		if (name.startsWith('on') || localName.startsWith('on')) {
			element.removeAttribute(attribute.name);
			continue;
		}

		if (name === 'autofocus' || name === 'contenteditable') {
			element.removeAttribute(attribute.name);
			continue;
		}

		if (localName === 'href') {
			if (
				name === 'href' &&
				(tagName === 'a' || tagName === 'area') &&
				value.startsWith('#')
			) {
				element.setAttribute('href', value);
			} else {
				element.removeAttribute(attribute.name);
			}
			continue;
		}

		if (localName === 'src') {
			if (
				name === 'src' &&
				tagName === 'img' &&
				isAllowedRasterDataUrl(value)
			) {
				element.setAttribute('src', value);
			} else {
				element.removeAttribute(attribute.name);
				blockedImageSource = tagName === 'img';
			}
			continue;
		}

		if (
			NAVIGATION_OR_RESOURCE_ATTRIBUTES.has(name) ||
			NAVIGATION_OR_RESOURCE_ATTRIBUTES.has(localName)
		) {
			element.removeAttribute(attribute.name);
		}
	}

	if (authoredImageSource && blockedImageSource) {
		element.setAttribute('data-html-document-viewer-blocked', 'true');
		if (!element.hasAttribute('alt')) {
			element.setAttribute('alt', 'Blocked image');
		}
	}
}

function disableForms(document: Document): void {
	for (const form of Array.from(document.querySelectorAll('form'))) {
		form.setAttribute('inert', '');
		form.setAttribute('aria-disabled', 'true');
	}

	for (const control of Array.from(
		document.querySelectorAll(FORM_CONTROL_SELECTOR),
	)) {
		control.setAttribute('disabled', '');
	}
}

function insertContentSecurityPolicy(document: Document): void {
	const head = document.head;
	if (head === null) {
		throw new Error('Parsed HTML did not contain a head element.');
	}

	head.createEl('meta', {
		attr: {
			content: CONTENT_SECURITY_POLICY,
			'http-equiv': 'Content-Security-Policy',
		},
		prepend: true,
	});
}

function parseAndSanitize(source: string): SanitizedDocument {
	if (source.length > MAX_HTML_SOURCE_CHARACTERS) {
		throw new Error('HTML document exceeds the safe rendering size limit.');
	}

	const parser = new DOMParser();
	const parsed = parser.parseFromString(source, 'text/html');

	removeAuthoredPoliciesAndNavigation(parsed);
	removeElements(parsed, ACTIVE_ELEMENT_SELECTOR);

	const images = Array.from(
		parsed.querySelectorAll<HTMLImageElement>('img[src]'),
	).map(
		(element): ImageReference => ({
			element,
			hadAuthoredAlt: element.hasAttribute('alt'),
			reference: element.getAttribute('src') ?? '',
		}),
	);
	const stylesheets = Array.from(
		parsed.querySelectorAll<HTMLLinkElement>('link[href]'),
	)
		.filter((element) =>
			(element.getAttribute('rel') ?? '')
				.toLowerCase()
				.split(/\s+/u)
				.includes('stylesheet'),
		)
		.map(
			(element): StylesheetReference => ({
				disabled:
					element.hasAttribute('disabled') ||
					(element.getAttribute('rel') ?? '')
						.toLowerCase()
						.split(/\s+/u)
						.includes('alternate'),
				element,
				media: element.getAttribute('media'),
				reference: element.getAttribute('href') ?? '',
				title: element.getAttribute('title'),
			}),
		);

	if (images.length + stylesheets.length > MAX_ASSET_REFERENCES) {
		throw new Error('HTML document contains too many asset references.');
	}

	for (const element of Array.from(parsed.querySelectorAll('*'))) {
		sanitizeAttributes(element);
	}

	disableForms(parsed);
	return { document: parsed, images, stylesheets };
}

function serializePrepared(document: Document): string {
	insertContentSecurityPolicy(document);
	const serializer = new XMLSerializer();
	const styles = Array.from(document.querySelectorAll('style')).map((style) => ({
		css: style.textContent ?? '',
		style,
	}));
	const initialSerialization = serializer.serializeToString(
		document.documentElement,
	);
	let markerPrefix = '__HTML_DOCUMENT_VIEWER_RAW_STYLE_0_';
	let markerAttempt = 0;
	while (initialSerialization.includes(markerPrefix)) {
		markerAttempt += 1;
		markerPrefix = `__HTML_DOCUMENT_VIEWER_RAW_STYLE_${markerAttempt}_`;
	}

	for (const [index, entry] of styles.entries()) {
		entry.style.textContent = `${markerPrefix}${index}__`;
	}

	let serialized = serializer.serializeToString(document.documentElement);
	for (const [index, entry] of styles.entries()) {
		const marker = `${markerPrefix}${index}__`;
		const rawCss = entry.css
			.replaceAll('\0', '�')
			.replace(/<\/style/giu, '<\\/style');
		if (!serialized.includes(marker)) {
			throw new Error('Unable to serialize a stylesheet safely.');
		}
		serialized = serialized.replace(marker, rawCss);
	}

	return `<!doctype html>\n${serialized}`;
}

function recordWarning(warnings: Set<string>, message: string): void {
	warnings.add(message);
}

function createDetachedStylesheet(
	document: Document,
	css: string,
	reference: StylesheetReference,
): HTMLStyleElement {
	const template = new DOMParser().parseFromString(
		'<style></style>',
		'text/html',
	);
	const style = template.querySelector('style');
	if (style === null) {
		throw new Error('Unable to create a detached stylesheet.');
	}

	const adopted = document.adoptNode(style);
	adopted.textContent = css;
	if (reference.disabled) {
		adopted.setAttribute('media', 'not all');
	} else if (reference.media !== null) {
		adopted.setAttribute('media', reference.media);
	}
	if (reference.title !== null) {
		adopted.setAttribute('title', reference.title);
	}
	return adopted;
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

/**
 * Parse and prepare hostile HTML in a detached document. The returned string is
 * intended only for an iframe's `srcdoc` property.
 */
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

/**
 * Prepare hostile HTML while resolving only same-folder assets through an
 * injected vault-backed loader. A failed asset is removed without failing the
 * rest of the document.
 */
export async function prepareHtmlWithAssets(
	source: string,
	assetLoader: HtmlAssetLoader,
	options: PrepareHtmlOptions = {},
): Promise<PreparedHtmlResult> {
	throwIfRenderAborted(options.signal);
	const sanitized = parseAndSanitize(source);
	throwIfRenderAborted(options.signal);
	const warnings = new Set<string>();
	const embeddedAssetLimit = Math.min(
		options.maxEmbeddedAssetCharacters ?? MAX_EMBEDDED_ASSET_CHARACTERS,
		MAX_EMBEDDED_ASSET_CHARACTERS,
	);
	let embeddedAssetCharacters = 0;
	const reserveEmbeddedCharacters = (size: number): boolean => {
		if (embeddedAssetCharacters + size > embeddedAssetLimit) {
			return false;
		}

		embeddedAssetCharacters += size;
		return true;
	};

	for (const image of sanitized.images) {
		throwIfRenderAborted(options.signal);
		if (isAllowedRasterDataUrl(image.reference.trim())) {
			continue;
		}

		try {
			const result = await loadImage(
				assetLoader,
				image.reference,
				options.signal,
			);
			if (result.ok) {
				if (!reserveEmbeddedCharacters(result.url.length)) {
					const message =
						'Skipped local assets because the prepared document is too large.';
					recordWarning(warnings, message);
					if (!image.hadAuthoredAlt) {
						image.element.setAttribute('alt', message);
					}
					continue;
				}
				image.element.setAttribute('src', result.url);
				image.element.removeAttribute('data-html-document-viewer-blocked');
				continue;
			}

			recordWarning(warnings, result.message);
			if (!image.hadAuthoredAlt) {
				image.element.setAttribute('alt', result.message);
			}
		} catch (error) {
			if (isRenderAborted(error)) {
				throw error;
			}
			const message = 'Unable to load a local image.';
			recordWarning(warnings, message);
			if (!image.hadAuthoredAlt) {
				image.element.setAttribute('alt', message);
			}
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
				if (!reserveEmbeddedCharacters(result.css.length)) {
					recordWarning(
						warnings,
						'Skipped local assets because the prepared document is too large.',
					);
					stylesheet.element.remove();
					continue;
				}
				stylesheet.element.replaceWith(
					createDetachedStylesheet(
						sanitized.document,
						result.css,
						stylesheet,
					),
				);
			} else {
				recordWarning(warnings, result.message);
				stylesheet.element.remove();
			}
		} catch (error) {
			if (isRenderAborted(error)) {
				throw error;
			}
			recordWarning(warnings, 'Unable to load a local stylesheet.');
			stylesheet.element.remove();
		}
	}

	removeElements(sanitized.document, 'link');
	return {
		html: serializePrepared(sanitized.document),
		warnings: Array.from(warnings),
	};
}
