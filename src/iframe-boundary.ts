export const IFRAME_SANDBOX = '';
export const IFRAME_REFERRER_POLICY = 'no-referrer';
export const IFRAME_TITLE = 'HTML document';

export function createViewerIframe(parent: HTMLElement): HTMLIFrameElement {
	return parent.createEl('iframe', {
		cls: 'html-document-viewer__frame',
		attr: {
			referrerpolicy: IFRAME_REFERRER_POLICY,
			sandbox: IFRAME_SANDBOX,
			src: 'about:blank',
			title: IFRAME_TITLE,
		},
	});
}

type AnimationFrameScheduler = (callback: FrameRequestCallback) => number;
type AnimationFrameCanceler = (handle: number) => void;
type TimeoutScheduler = (callback: () => void, delay: number) => number;
type TimeoutCanceler = (handle: number) => void;

interface IframeLayoutWaitOptions {
	cancelFrame?: AnimationFrameCanceler;
	cancelTimeout?: TimeoutCanceler;
	requestFrame?: AnimationFrameScheduler;
	scheduleTimeout?: TimeoutScheduler;
	signal?: AbortSignal;
}

export const IFRAME_LAYOUT_TIMEOUT_MS = 100;

export async function waitForIframeLayout(
	iframe: HTMLIFrameElement,
	options: IframeLayoutWaitOptions = {},
): Promise<void> {
	iframe.hidden = false;

	const ownerWindow = iframe.ownerDocument.defaultView;
	const scheduleFrame =
		options.requestFrame ??
		ownerWindow?.requestAnimationFrame?.bind(ownerWindow);
	if (scheduleFrame === undefined) {
		return;
	}
	const scheduleFallback =
		options.scheduleTimeout ?? ownerWindow?.setTimeout.bind(ownerWindow);
	const cancelFrame =
		options.cancelFrame ?? ownerWindow?.cancelAnimationFrame?.bind(ownerWindow);
	const cancelFallback =
		options.cancelTimeout ?? ownerWindow?.clearTimeout.bind(ownerWindow);

	await new Promise<void>((resolve) => {
		let resolved = false;
		let frameHandle: number | null = null;
		let timeoutHandle: number | null = null;
		const cleanup = (): void => {
			if (frameHandle !== null) {
				cancelFrame?.(frameHandle);
				frameHandle = null;
			}
			if (timeoutHandle !== null) {
				cancelFallback?.(timeoutHandle);
				timeoutHandle = null;
			}
			options.signal?.removeEventListener('abort', resolveOnce);
		};
		const resolveOnce = (): void => {
			if (resolved) {
				return;
			}

			resolved = true;
			cleanup();
			resolve();
		};

		if (options.signal?.aborted === true) {
			resolveOnce();
			return;
		}

		options.signal?.addEventListener('abort', resolveOnce, { once: true });
		frameHandle = scheduleFrame(resolveOnce);
		if (resolved) {
			cancelFrame?.(frameHandle);
			frameHandle = null;
			return;
		}
		if (scheduleFallback !== undefined) {
			timeoutHandle = scheduleFallback(
				resolveOnce,
				IFRAME_LAYOUT_TIMEOUT_MS,
			);
			if (resolved) {
				cancelFallback?.(timeoutHandle);
				timeoutHandle = null;
			}
		}
	});
}

export function navigateIframeToBlank(iframe: HTMLIFrameElement): void {
	iframe.removeAttribute('srcdoc');
	iframe.setAttribute('src', 'about:blank');
}
