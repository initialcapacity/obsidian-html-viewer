import { describe, expect, it } from 'vitest';
import {
	IFRAME_REFERRER_POLICY,
	IFRAME_SANDBOX,
	IFRAME_TITLE,
	createViewerIframe,
	navigateIframeToBlank,
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
	});

	it('removes prepared content when a view is unloaded', () => {
		const iframe = createViewerIframe(document);
		iframe.srcdoc = '<p>prepared</p>';
		iframe.hidden = false;

		navigateIframeToBlank(iframe);

		expect(iframe.hasAttribute('srcdoc')).toBe(false);
		expect(iframe.getAttribute('src')).toBe('about:blank');
		expect(iframe.hidden).toBe(true);
	});
});
