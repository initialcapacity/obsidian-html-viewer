import { expect, test } from '@playwright/test';
import { JSDOM } from 'jsdom';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { prepareHtml } from '../../src/prepare-html';

function installPreparationDom(): void {
	const dom = new JSDOM('<!doctype html><html><body></body></html>');
	Object.assign(globalThis, {
		DOMParser: dom.window.DOMParser,
		Node: dom.window.Node,
		XMLSerializer: dom.window.XMLSerializer,
	});
	Object.defineProperty(dom.window.Node.prototype, 'createEl', {
		configurable: true,
		value(this: Node, tag: string, options?: DomElementInfo): HTMLElement {
			const ownerDocument =
				this.nodeType === dom.window.Node.DOCUMENT_NODE
					? (this as Document)
					: this.ownerDocument;
			if (ownerDocument === null) {
				throw new Error('Missing owner document.');
			}
			const createElement = Reflect.get(ownerDocument, 'createElement');
			const element = Reflect.apply(createElement, ownerDocument, [tag]);
			for (const [name, value] of Object.entries(options?.attr ?? {})) {
				if (value !== null) {
					element.setAttribute(name, String(value));
				}
			}
			if (options?.prepend === true) {
				this.insertBefore(element, this.firstChild);
			} else {
				this.appendChild(element);
			}
			return element;
		},
	});
}

test('sandboxed prepared HTML cannot execute, navigate, or use the network', async ({
	page,
}) => {
	installPreparationDom();
	let requests = 0;
	const server = createServer((_request, response) => {
		requests += 1;
		response.writeHead(204);
		response.end();
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address() as AddressInfo;
	const endpoint = `http://127.0.0.1:${port}/leak`;
	const prepared = prepareHtml(`
		<meta http-equiv="refresh" content="0;url=${endpoint}">
		<link rel="stylesheet" href="${endpoint}.css">
		<style>body { background-image: url('${endpoint}.png'); }</style>
		<img src="${endpoint}.png" onerror="fetch('${endpoint}')">
		<script>fetch('${endpoint}'); window.open('${endpoint}'); document.body.dataset.ran='yes';</script>
		<p id="safe">Static content rendered.</p>
	`);
	let dialogs = 0;
	let popups = 0;
	page.on('dialog', async (dialog) => {
		dialogs += 1;
		await dialog.dismiss();
	});
	page.on('popup', () => {
		popups += 1;
	});

	try {
		await page.setContent(
			'<iframe id="viewer" sandbox="" referrerpolicy="no-referrer"></iframe>',
		);
		await page.locator('#viewer').evaluate(
			(iframe, html) => {
				(iframe as HTMLIFrameElement).srcdoc = html;
			},
			prepared,
		);
		const frame = page.frameLocator('#viewer');
		await expect(frame.locator('#safe')).toHaveText('Static content rendered.');
		await page.waitForTimeout(250);
		await expect(frame.locator('[data-ran]')).toHaveCount(0);
		expect(requests).toBe(0);
		expect(dialogs).toBe(0);
		expect(popups).toBe(0);
		expect(page.url()).toBe('about:blank');
	} finally {
		await new Promise<void>((resolve, reject) => {
			server.close((error) => (error === undefined ? resolve() : reject(error)));
		});
	}
});
