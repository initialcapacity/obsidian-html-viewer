import { validateRasterImage } from './image-validation';
import type { RasterMimeType } from './mime';

export const MAX_HTML_SOURCE_CHARACTERS = 5_000_000;
export const MAX_HTML_SOURCE_BYTES = 10 * 1024 * 1024;
export const MAX_ASSET_REFERENCES = 256;
export const MAX_DOM_ELEMENTS = 100_000;
export const MAX_DOM_DEPTH = 256;

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
	'img-src data:; ' +
	"style-src 'unsafe-inline'; " +
	"font-src 'none'; " +
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
	/^data:image\/(avif|gif|jpeg|png|webp);base64,([a-z\d+/\t\n\f\r ]*={0,2})$/iu;

export interface ImageReference {
	element: HTMLImageElement;
	hadAuthoredAlt: boolean;
	reference: string;
}

export interface ImageSetReference {
	element: HTMLImageElement | HTMLSourceElement;
	reference: string;
}

export interface StylesheetReference {
	disabled: boolean;
	element: HTMLLinkElement;
	media: string | null;
	reference: string;
	title: string | null;
}

export interface SanitizedDocument {
	document: Document;
	images: ImageReference[];
	imageSets: ImageSetReference[];
	stylesheets: StylesheetReference[];
}

export function isAllowedRasterDataUrl(value: string): boolean {
	return RASTER_DATA_URL.test(value);
}

export function isSafeAuthoredRasterDataUrl(value: string): boolean {
	const match = RASTER_DATA_URL.exec(value);
	if (match?.[1] === undefined || match[2] === undefined) {
		return false;
	}

	try {
		const decoded = atob(match[2].replaceAll(/[\t\n\f\r ]/gu, ''));
		const bytes = new Uint8Array(decoded.length);
		for (let index = 0; index < decoded.length; index += 1) {
			bytes[index] = decoded.charCodeAt(index);
		}
		return validateRasterImage(
			bytes.buffer,
			`image/${match[1].toLowerCase()}` as RasterMimeType,
		).ok;
	} catch {
		return false;
	}
}

export function removeElements(document: Document, selector: string): void {
	for (const element of Array.from(document.querySelectorAll(selector))) {
		element.remove();
	}
}

function validateDomComplexity(document: Document): void {
	const elements = document.querySelectorAll('*');
	if (elements.length > MAX_DOM_ELEMENTS) {
		throw new Error('HTML document contains too many elements.');
	}

	const root = document.documentElement;
	if (root === null) {
		return;
	}
	const stack: Array<{ depth: number; element: Element }> = [
		{ depth: 1, element: root },
	];
	while (stack.length > 0) {
		const entry = stack.pop();
		if (entry === undefined) {
			break;
		}
		if (entry.depth > MAX_DOM_DEPTH) {
			throw new Error('HTML document is nested too deeply.');
		}
		for (const child of Array.from(entry.element.children)) {
			stack.push({ depth: entry.depth + 1, element: child });
		}
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

function removeUnsupportedSources(document: Document): void {
	for (const source of Array.from(document.querySelectorAll('source'))) {
		if (source.parentElement?.localName !== 'picture') {
			source.remove();
		}
	}
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
		if (name === 'sizes') {
			if (tagName !== 'img' && tagName !== 'source') {
				element.removeAttribute(attribute.name);
			}
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
				isSafeAuthoredRasterDataUrl(value)
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

export function parseAndSanitize(source: string): SanitizedDocument {
	if (source.length > MAX_HTML_SOURCE_CHARACTERS) {
		throw new Error('HTML document exceeds the safe rendering size limit.');
	}

	const parsed = new DOMParser().parseFromString(source, 'text/html');
	validateDomComplexity(parsed);
	removeAuthoredPoliciesAndNavigation(parsed);
	removeElements(parsed, ACTIVE_ELEMENT_SELECTOR);
	removeUnsupportedSources(parsed);

	const images = Array.from(
		parsed.querySelectorAll<HTMLImageElement>('img[src]'),
	).map((element): ImageReference => ({
		element,
		hadAuthoredAlt: element.hasAttribute('alt'),
		reference: element.getAttribute('src') ?? '',
	}));
	const imageSets = Array.from(
		parsed.querySelectorAll<HTMLImageElement | HTMLSourceElement>(
			'img[srcset], picture > source[srcset]',
		),
	).map((element): ImageSetReference => ({
		element,
		reference: element.getAttribute('srcset') ?? '',
	}));
	const stylesheets = Array.from(
		parsed.querySelectorAll<HTMLLinkElement>('link[href]'),
	)
		.filter((element) =>
			(element.getAttribute('rel') ?? '')
				.toLowerCase()
				.split(/\s+/u)
				.includes('stylesheet'),
		)
		.map((element): StylesheetReference => ({
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
		}));
	if (images.length + imageSets.length + stylesheets.length > MAX_ASSET_REFERENCES) {
		throw new Error('HTML document contains too many asset references.');
	}
	for (const element of Array.from(parsed.querySelectorAll('*'))) {
		sanitizeAttributes(element);
	}
	disableForms(parsed);
	return { document: parsed, images, imageSets, stylesheets };
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

export function createDetachedStylesheet(
	document: Document,
	css: string,
	reference: StylesheetReference,
): HTMLStyleElement {
	const template = new DOMParser().parseFromString('<style></style>', 'text/html');
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

export function serializePrepared(document: Document): string {
	insertContentSecurityPolicy(document);
	const serializer = new XMLSerializer();
	const styles = Array.from(document.querySelectorAll('style')).map((style) => ({
		css: style.textContent ?? '',
		style,
	}));
	const initialSerialization = serializer.serializeToString(document.documentElement);
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
