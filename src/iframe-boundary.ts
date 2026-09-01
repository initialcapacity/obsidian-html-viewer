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
	return iframe;
}

type AnimationFrameScheduler = (callback: FrameRequestCallback) => number;

export async function waitForIframeLayout(
	iframe: HTMLIFrameElement,
	requestFrame?: AnimationFrameScheduler,
): Promise<void> {
	iframe.hidden = false;

	const ownerWindow = iframe.ownerDocument.defaultView;
	const scheduleFrame =
		requestFrame ??
		ownerWindow?.requestAnimationFrame?.bind(ownerWindow);
	if (scheduleFrame === undefined) {
		return;
	}

	await new Promise<void>((resolve) => {
		scheduleFrame(() => resolve());
	});
}

export function navigateIframeToBlank(iframe: HTMLIFrameElement): void {
	iframe.removeAttribute('srcdoc');
	iframe.setAttribute('src', 'about:blank');
}
