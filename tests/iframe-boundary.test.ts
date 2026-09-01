import { describe, expect, it } from 'vitest';
import {
	IFRAME_REFERRER_POLICY,
	IFRAME_SANDBOX,
	IFRAME_TITLE,
	createViewerIframe,
	navigateIframeToBlank,
	waitForIframeLayout,
} from '../src/iframe-boundary';

describe('iframe rendering boundary', () => {
	it('uses an empty sandbox with no permissions', () => {
		const iframe = createViewerIframe(document);

		expect(IFRAME_SANDBOX).toBe('');
		expect(iframe.hasAttribute('sandbox')).toBe(true);
		expect(iframe.getAttribute('sandbox')).toBe('');
		expect(
			iframe.getAttribute('sandbox')?.split(/\s+/u).filter(Boolean),
		).toEqual([]);
	});

	it('sets the required privacy and accessibility attributes', () => {
		const iframe = createViewerIframe(document);

		expect(IFRAME_REFERRER_POLICY).toBe('no-referrer');
		expect(IFRAME_TITLE).toBe('HTML document');
		expect(iframe.getAttribute('referrerpolicy')).toBe('no-referrer');
		expect(iframe.getAttribute('title')).toBe('HTML document');
		expect(iframe.getAttribute('src')).toBe('about:blank');
		expect(iframe.hidden).toBe(false);
	});

	it('waits for a visible layout frame before srcdoc navigation', async () => {
		const iframe = createViewerIframe(document);
		iframe.hidden = true;
		let frameCallback: FrameRequestCallback | undefined;
		const requestFrame = (callback: FrameRequestCallback): number => {
			frameCallback = callback;
			return 1;
		};

		const layoutReady = waitForIframeLayout(iframe, requestFrame);

		expect(iframe.hidden).toBe(false);
		expect(frameCallback).toBeTypeOf('function');
		expect(iframe.hasAttribute('srcdoc')).toBe(false);

		frameCallback?.(0);
		await layoutReady;
	});

	it('removes prepared content when a view is unloaded', () => {
		const iframe = createViewerIframe(document);
		iframe.srcdoc = '<p>prepared</p>';
		iframe.hidden = false;

		navigateIframeToBlank(iframe);

		expect(iframe.hasAttribute('srcdoc')).toBe(false);
		expect(iframe.getAttribute('src')).toBe('about:blank');
		expect(iframe.hidden).toBe(false);
	});
});
