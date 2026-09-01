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
	'math',
	'object',
	'portal',
	'script',
	'source',
	'svg',
	'template',
	'track',
	'video',
].join(',');

const NAVIGATION_OR_RESOURCE_ATTRIBUTES = new Set([
	'action',
	'archive',
	'background',
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
	/^data:image\/(?:avif|gif|jpeg|png|webp);base64,[a-z\d+/]*={0,2}$/i;

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

function sanitizeAttributes(element: Element): void {
	const tagName = element.localName.toLowerCase();
	const authoredImageSource = tagName === 'img' && element.hasAttribute('src');
	let blockedImageSource = false;

	for (const attribute of Array.from(element.attributes)) {
		const name = attribute.name.toLowerCase();
		const value = attribute.value.trim();

		if (name.startsWith('on')) {
			element.removeAttribute(attribute.name);
			continue;
		}

		if (name === 'autofocus' || name === 'contenteditable') {
			element.removeAttribute(attribute.name);
			continue;
		}

		if (name === 'href') {
			if ((tagName === 'a' || tagName === 'area') && value.startsWith('#')) {
				element.setAttribute('href', value);
			} else {
				element.removeAttribute(attribute.name);
			}
			continue;
		}

		if (name === 'src') {
			if (tagName === 'img' && isAllowedRasterDataUrl(value)) {
				element.setAttribute('src', value);
			} else {
				element.removeAttribute(attribute.name);
				blockedImageSource = tagName === 'img';
			}
			continue;
		}

		if (NAVIGATION_OR_RESOURCE_ATTRIBUTES.has(name)) {
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

	const meta = document.createElement('meta');
	meta.setAttribute('http-equiv', 'Content-Security-Policy');
	meta.setAttribute('content', CONTENT_SECURITY_POLICY);
	head.insertBefore(meta, head.firstChild);
}

/**
 * Parse and prepare hostile HTML in a detached document. The returned string is
 * intended only for an iframe's `srcdoc` property.
 */
export function prepareHtml(source: string): string {
	const parser = new DOMParser();
	const parsed = parser.parseFromString(source, 'text/html');

	removeAuthoredPoliciesAndNavigation(parsed);
	removeElements(parsed, ACTIVE_ELEMENT_SELECTOR);

	// Same-folder stylesheets are deliberately deferred until milestone 9.
	removeElements(parsed, 'link');

	for (const element of Array.from(parsed.querySelectorAll('*'))) {
		sanitizeAttributes(element);
	}

	disableForms(parsed);
	insertContentSecurityPolicy(parsed);

	const serializer = new XMLSerializer();
	return `<!doctype html>\n${serializer.serializeToString(parsed.documentElement)}`;
}
