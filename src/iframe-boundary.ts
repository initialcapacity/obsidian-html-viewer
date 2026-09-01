export const IFRAME_SANDBOX = '';
export const IFRAME_REFERRER_POLICY = 'no-referrer';
export const IFRAME_TITLE = 'HTML document';

export function createViewerIframe(document: Document): HTMLIFrameElement {
	const iframe = document.createElement('iframe');
	iframe.className = 'html-document-viewer__frame';
	iframe.setAttribute('sandbox', IFRAME_SANDBOX);
	iframe.setAttribute('referrerpolicy', IFRAME_REFERRER_POLICY);
	iframe.setAttribute('title', IFRAME_TITLE);
	iframe.setAttribute('src', 'about:blank');
	iframe.hidden = true;
	return iframe;
}

export function navigateIframeToBlank(iframe: HTMLIFrameElement): void {
	iframe.removeAttribute('srcdoc');
	iframe.setAttribute('src', 'about:blank');
	iframe.hidden = true;
}
