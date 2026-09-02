import type { WorkspaceLeaf } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => {
	class MockFileView {
		app: unknown;
		contentEl: HTMLElement;
		file: {
			basename: string;
			name: string;
			path: string;
			stat: { size: number };
		} | null = null;
		leaf: { app: unknown };

		constructor(leaf: { app: unknown }) {
			this.app = leaf.app;
			this.contentEl = document.body.createDiv();
			this.leaf = leaf;
		}

		getDisplayText(): string {
			return '';
		}

		getViewType(): string {
			return '';
		}

		onClose(): Promise<void> {
			return Promise.resolve();
		}

		onLoadFile(file: {
			basename: string;
			name: string;
			path: string;
			stat: { size: number };
		}): Promise<void> {
			this.file = file;
			return Promise.resolve();
		}

		onOpen(): Promise<void> {
			return Promise.resolve();
		}

		onRename(_file: {
			basename: string;
			name: string;
			path: string;
			stat: { size: number };
		}): Promise<void> {
			return Promise.resolve();
		}

		onUnloadFile(_file: {
			basename: string;
			name: string;
			path: string;
			stat: { size: number };
		}): Promise<void> {
			return Promise.resolve();
		}

		registerEvent(_event: unknown): void {}
	}

	class MockTFile {
		static [Symbol.hasInstance](value: unknown): boolean {
			return (
				typeof value === 'object' &&
				value !== null &&
				Reflect.get(value, 'isTFile') === true
			);
		}
	}

	return {
		FileView: MockFileView,
		TAbstractFile: class {},
		TFile: MockTFile,
		WorkspaceLeaf: class {},
		arrayBufferToBase64: () => 'AA==',
	};
});

import { HtmlDocumentView } from '../src/html-document-view';
import { MAX_HTML_SOURCE_BYTES } from '../src/prepare-html';

function validPng(): ArrayBuffer {
	const bytes = new Uint8Array(24);
	bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
	bytes.set([73, 72, 68, 82], 12);
	const view = new DataView(bytes.buffer);
	view.setUint32(16, 1);
	view.setUint32(20, 1);
	return bytes.buffer;
}

interface ClosableView {
	onClose(): Promise<void>;
}

interface OpenableView {
	onOpen(): Promise<void>;
}

interface UnloadableView {
	onUnloadFile(file: never): Promise<void>;
}

interface TestVault {
	getFileByPath: ReturnType<typeof vi.fn>;
	on: ReturnType<typeof vi.fn>;
	read: ReturnType<typeof vi.fn>;
	readBinary: ReturnType<typeof vi.fn>;
}

function createView(source: string): {
	file: { basename: string; name: string; path: string; stat: { size: number } };
	vault: TestVault;
	view: HtmlDocumentView;
} {
	const vault: TestVault = {
		getFileByPath: vi.fn(() => null),
		on: vi.fn(() => ({})),
		read: vi.fn(async () => source),
		readBinary: vi.fn(),
	};
	const leaf = { app: { vault } };
	return {
		file: {
			basename: 'index',
			name: 'index.html',
			path: 'folder/index.html',
			stat: { size: source.length },
		},
		vault,
		view: new HtmlDocumentView(leaf as unknown as WorkspaceLeaf),
	};
}

describe('HtmlDocumentView behavior', () => {
	beforeEach(() => {
		document.body.replaceChildren();
	});

	it('renders prepared CSS and MathML only into the sandboxed iframe', async () => {
		const css = 'main > p { color: red; } .card { & > strong { color: blue; } }';
		const { file, view } = createView(
			`<style>${css}</style><main><p>Rendered</p><math><msup><mi>x</mi><mn>2</mn></msup></math></main>`,
		);

		await view.onLoadFile(file as never);

		const iframe = view.contentEl.querySelector('iframe');
		const status = view.contentEl.querySelector<HTMLDivElement>(
			'.html-document-viewer__status',
		);
		expect(iframe?.getAttribute('sandbox')).toBe('');
		expect(iframe?.srcdoc).toContain(css);
		expect(iframe?.srcdoc).toContain('<math');
		expect(view.contentEl.querySelector('main, math')).toBeNull();
		expect(status?.hidden).toBe(true);
	});

	it('renders safe warning text without covering preparation output', async () => {
		const { file, view } = createView(
			'<h1>Visible content</h1><img src="missing.png">',
		);

		await view.onLoadFile(file as never);

		const iframe = view.contentEl.querySelector('iframe');
		const status = view.contentEl.querySelector<HTMLDivElement>(
			'.html-document-viewer__status',
		);
		expect(iframe?.srcdoc).toContain('Visible content');
		expect(status?.dataset.state).toBe('warning');
		expect(status?.textContent).toBe('Image not found: “missing.png”.');
		expect(status?.querySelector('*')).toBeNull();
	});

	it('uses the production base64 path for a validated local raster image', async () => {
		const { file, vault, view } = createView('<img src="image.png">');
		vault.getFileByPath.mockReturnValue({});
		vault.readBinary.mockResolvedValue(validPng());

		await view.onLoadFile(file as never);

		const iframe = view.contentEl.querySelector('iframe');
		const prepared = new DOMParser().parseFromString(
			iframe?.srcdoc ?? '',
			'text/html',
		);
		expect(prepared.querySelector('img')?.getAttribute('src')).toBe(
			'data:image/png;base64,AA==',
		);
		expect(vault.readBinary).toHaveBeenCalledOnce();
	});

	it('rejects an oversized HTML file before reading it into memory', async () => {
		const { file, vault, view } = createView('<h1>Too large</h1>');
		file.stat.size = MAX_HTML_SOURCE_BYTES + 1;

		await view.onLoadFile(file as never);

		const iframe = view.contentEl.querySelector('iframe');
		const status = view.contentEl.querySelector<HTMLDivElement>(
			'.html-document-viewer__status',
		);
		expect(vault.read).not.toHaveBeenCalled();
		expect(iframe?.getAttribute('src')).toBe('about:blank');
		expect(status?.dataset.state).toBe('error');
	});

	it('discards an older read after a newer render starts', async () => {
		const { file, vault, view } = createView('unused');
		let finishFirstRead: ((source: string) => void) | undefined;
		const firstRead = new Promise<string>((resolveRead) => {
			finishFirstRead = resolveRead;
		});
		vault.read
			.mockReturnValueOnce(firstRead)
			.mockResolvedValueOnce('<h1>Newest render</h1>');

		const olderRender = view.onLoadFile(file as never);
		await Promise.resolve();
		const newerRender = view.onLoadFile(file as never);
		await newerRender;
		finishFirstRead?.('<h1>Stale render</h1>');
		await olderRender;

		const iframe = view.contentEl.querySelector('iframe');
		expect(iframe?.srcdoc).toContain('Newest render');
		expect(iframe?.srcdoc).not.toContain('Stale render');
	});

	it('renders without controls or non-fragment navigation', async () => {
		const { file, view } = createView(
			'<a id="document" href="next.html">Next</a><a id="fragment" href="#local">Local</a>',
		);
		await view.onLoadFile(file as never);

		const iframe = view.contentEl.querySelector('iframe');
		const prepared = new DOMParser().parseFromString(
			iframe?.srcdoc ?? '',
			'text/html',
		);
		expect(view.contentEl.querySelector('button, select, pre')).toBeNull();
		expect(prepared.getElementById('document')?.hasAttribute('href')).toBe(false);
		expect(prepared.getElementById('fragment')?.getAttribute('href')).toBe('#local');
	});

	it('refreshes only for the source or a tracked dependency', async () => {
		vi.useFakeTimers();
		try {
			const { file, vault, view } = createView('<img src="image.png">');
			await (view as unknown as OpenableView).onOpen();
			const initialRender = view.onLoadFile(file as never);
			await vi.runAllTimersAsync();
			await initialRender;
			const modify = vault.on.mock.calls.find(
				(call) => call[0] === 'modify',
			)?.[1] as ((file: unknown) => void) | undefined;
			expect(modify).toBeTypeOf('function');

			modify?.({ isTFile: true, path: 'folder/unrelated.png' });
			await vi.advanceTimersByTimeAsync(500);
			expect(vault.read).toHaveBeenCalledOnce();

			modify?.({ isTFile: true, path: 'folder/image.png' });
			await vi.advanceTimersByTimeAsync(500);
			expect(vault.read).toHaveBeenCalledTimes(2);
		} finally {
			vi.useRealTimers();
		}
	});

	it('blanks prepared content when a file unloads', async () => {
		const { file, view } = createView('<h1>Unload me</h1>');
		await view.onLoadFile(file as never);
		const iframe = view.contentEl.querySelector('iframe');

		await (view as unknown as UnloadableView).onUnloadFile(file as never);

		expect(iframe?.hasAttribute('srcdoc')).toBe(false);
		expect(iframe?.getAttribute('src')).toBe('about:blank');
		expect(view.contentEl.querySelector('button, select, pre')).toBeNull();
	});

	it('blanks and removes the frame on close', async () => {
		const { file, view } = createView('<h1>Close me</h1>');
		await view.onLoadFile(file as never);
		const iframe = view.contentEl.querySelector('iframe');

		await (view as unknown as ClosableView).onClose();

		expect(iframe?.hasAttribute('srcdoc')).toBe(false);
		expect(iframe?.getAttribute('src')).toBe('about:blank');
		expect(view.contentEl.childElementCount).toBe(0);
	});
});
