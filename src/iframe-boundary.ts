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
type TimeoutScheduler = (callback: () => void, delay: number) => number;

export const IFRAME_LAYOUT_TIMEOUT_MS = 100;

export async function waitForIframeLayout(
	iframe: HTMLIFrameElement,
	requestFrame?: AnimationFrameScheduler,
	scheduleTimeout?: TimeoutScheduler,
): Promise<void> {
	iframe.hidden = false;

	const ownerWindow = iframe.ownerDocument.defaultView;
	const scheduleFrame =
		requestFrame ??
		ownerWindow?.requestAnimationFrame?.bind(ownerWindow);
	if (scheduleFrame === undefined) {
		return;
	}
	const scheduleFallback =
		scheduleTimeout ?? ownerWindow?.setTimeout.bind(ownerWindow);

	await new Promise<void>((resolve) => {
		let resolved = false;
		const resolveOnce = (): void => {
			if (resolved) {
				return;
			}

			resolved = true;
			resolve();
		};

		scheduleFrame(resolveOnce);
		scheduleFallback?.(resolveOnce, IFRAME_LAYOUT_TIMEOUT_MS);
	});
}

export function navigateIframeToBlank(iframe: HTMLIFrameElement): void {
	iframe.removeAttribute('srcdoc');
	iframe.setAttribute('src', 'about:blank');
}
