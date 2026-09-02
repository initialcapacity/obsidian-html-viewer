import {
	FileView,
	TAbstractFile,
	TFile,
	WorkspaceLeaf,
	arrayBufferToBase64,
} from 'obsidian';
import { VaultAssetLoader } from './asset-loader';
import {
	createViewerIframe,
	navigateIframeToBlank,
	waitForIframeLayout,
} from './iframe-boundary';
import {
	MAX_HTML_SOURCE_BYTES,
	prepareHtmlWithAssets,
	type DocumentNavigationTarget,
} from './prepare-html';
import { throwIfRenderAborted } from './render-abort';
import {
	RenderFailure,
	classifyRenderFailure,
} from './render-errors';
import { RenderCoordinator } from './render-coordinator';
import { isRelevantVaultChange } from './vault-path';
import { ViewerToolbar } from './viewer-toolbar';

export const HTML_DOCUMENT_VIEW_TYPE = 'html-document-view';

const PRINTING_BODY_CLASS = 'html-document-viewer-is-printing';
const PRINTING_VIEW_CLASS = 'html-document-viewer--printing';

type ViewStatusState = 'error' | 'hidden' | 'loading' | 'warning';

function updateStatus(
	status: HTMLDivElement,
	state: ViewStatusState,
	message = '',
): void {
	status.dataset.state = state;
	status.textContent = message;
	status.hidden = state === 'hidden';
}

export class HtmlDocumentView extends FileView {
	private assetDependencies = new Set<string>();
	private iframe: HTMLIFrameElement | null = null;
	private lastFailure: RenderFailure | null = null;
	private lastSource: string | null = null;
	private lastWarnings: string[] = [];
	private renderCoordinator: RenderCoordinator | null = null;
	private sourcePanel: HTMLPreElement | null = null;
	private sourceVisible = false;
	private status: HTMLDivElement | null = null;
	private toolbar: ViewerToolbar | null = null;
	private zoom = 1;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	override getViewType(): string {
		return HTML_DOCUMENT_VIEW_TYPE;
	}

	override getDisplayText(): string {
		return this.file?.name ?? 'HTML document';
	}

	protected override async onOpen(): Promise<void> {
		await super.onOpen();
		this.registerEvent(
			this.app.vault.on('create', (file) => this.handleVaultChange(file)),
		);
		this.registerEvent(
			this.app.vault.on('modify', (file) => this.handleVaultChange(file)),
		);
		this.registerEvent(
			this.app.vault.on('delete', (file) => this.handleVaultChange(file)),
		);
		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) =>
				this.handleVaultChange(file, oldPath),
			),
		);
	}

	override async onLoadFile(file: TFile): Promise<void> {
		await super.onLoadFile(file);
		this.ensureViewElements();
		await this.renderFile(file);
	}

	override async onUnloadFile(file: TFile): Promise<void> {
		this.resetViewState();
		await super.onUnloadFile(file);
	}

	override async onRename(file: TFile): Promise<void> {
		await super.onRename(file);
		this.scheduleRefresh();
	}

	protected override async onClose(): Promise<void> {
		this.resetViewState();
		this.contentEl.replaceChildren();
		this.iframe = null;
		this.renderCoordinator = null;
		this.sourcePanel = null;
		this.status = null;
		this.toolbar = null;
		await super.onClose();
	}

	private resetViewState(): void {
		this.renderCoordinator?.reset();
		if (this.iframe !== null) {
			navigateIframeToBlank(this.iframe);
		}
		this.assetDependencies.clear();
		this.lastFailure = null;
		this.lastSource = null;
		this.lastWarnings = [];
		this.sourceVisible = false;
		if (this.sourcePanel !== null) {
			this.sourcePanel.textContent = '';
			this.sourcePanel.hidden = true;
		}
		this.toolbar?.setNavigation([]);
		this.toolbar?.setSourceVisible(false);
	}

	private handleVaultChange(file: TAbstractFile, oldPath?: string): void {
		const currentFile = this.file;
		if (
			currentFile === null ||
			!(file instanceof TFile) ||
			!isRelevantVaultChange(
				currentFile.path,
				this.assetDependencies,
				file.path,
				oldPath,
			)
		) {
			return;
		}
		this.scheduleRefresh();
	}

	private scheduleRefresh(): void {
		this.renderCoordinator?.scheduleRefresh(() => {
			const file = this.file;
			if (file !== null) {
				void this.renderFile(file);
			}
		});
	}

	private reload(): void {
		const file = this.file;
		if (file !== null) {
			void this.renderFile(file);
		}
	}

	private ensureViewElements(): void {
		if (
			this.iframe !== null &&
			this.sourcePanel !== null &&
			this.status !== null &&
			this.toolbar !== null
		) {
			return;
		}

		const ownerWindow = this.contentEl.ownerDocument.defaultView;
		if (ownerWindow === null) {
			throw new Error('HTML view does not have an owning window.');
		}
		this.contentEl.replaceChildren();
		this.toolbar = new ViewerToolbar(this.contentEl, {
			copyDiagnostics: () => {
				void this.copyDiagnostics();
			},
			navigate: (target) => {
				void this.navigate(target);
			},
			print: () => this.print(),
			reload: () => this.reload(),
			toggleSource: () => this.toggleSource(),
			zoom: (direction) => this.updateZoom(direction),
		});
		const status = this.contentEl.createDiv({
			cls: 'html-document-viewer__status',
			attr: { 'aria-live': 'polite', role: 'status' },
		});
		const viewport = this.contentEl.createDiv({
			cls: 'html-document-viewer__viewport',
		});
		const sourcePanel = viewport.createEl('pre', {
			cls: 'html-document-viewer__source',
			attr: { 'aria-label': 'HTML document source', tabindex: '0' },
		});
		sourcePanel.hidden = true;
		const iframe = createViewerIframe(viewport);
		this.renderCoordinator = new RenderCoordinator(
			ownerWindow.setTimeout.bind(ownerWindow),
			ownerWindow.clearTimeout.bind(ownerWindow),
		);
		this.contentEl.classList.add('html-document-viewer');
		this.iframe = iframe;
		this.sourcePanel = sourcePanel;
		this.status = status;
		this.applyZoom();
	}

	private toggleSource(): void {
		if (this.lastSource === null || this.iframe === null || this.sourcePanel === null) {
			return;
		}
		this.sourceVisible = !this.sourceVisible;
		this.sourcePanel.textContent = this.sourceVisible ? this.lastSource : '';
		this.sourcePanel.hidden = !this.sourceVisible;
		this.iframe.hidden = this.sourceVisible;
		this.toolbar?.setSourceVisible(this.sourceVisible);
	}

	private updateZoom(direction: 'in' | 'out' | 'reset'): void {
		this.zoom =
			direction === 'reset'
				? 1
				: Math.max(
						0.5,
						Math.min(2, this.zoom + (direction === 'in' ? 0.1 : -0.1)),
					);
		this.applyZoom();
	}

	private applyZoom(): void {
		if (this.iframe === null) {
			return;
		}
		this.iframe.style.transform = `scale(${this.zoom})`;
		this.iframe.style.width = `${100 / this.zoom}%`;
		this.iframe.style.height = `${100 / this.zoom}%`;
		this.toolbar?.setZoom(this.zoom);
	}

	private print(): void {
		const ownerDocument = this.contentEl.ownerDocument;
		const ownerWindow = ownerDocument.defaultView;
		if (ownerWindow === null) {
			if (this.status !== null) {
				updateStatus(
					this.status,
					'warning',
					'Printing is unavailable in this Obsidian window.',
				);
			}
			return;
		}

		ownerDocument.body.classList.add(PRINTING_BODY_CLASS);
		this.contentEl.classList.add(PRINTING_VIEW_CLASS);
		try {
			ownerWindow.print();
		} catch {
			if (this.status !== null) {
				updateStatus(
					this.status,
					'warning',
					'Printing is unavailable in this Obsidian window.',
				);
			}
		} finally {
			this.contentEl.classList.remove(PRINTING_VIEW_CLASS);
			ownerDocument.body.classList.remove(PRINTING_BODY_CLASS);
		}
	}

	private async copyDiagnostics(): Promise<void> {
		const currentPath = this.file?.path ?? '(no file)';
		const diagnostics = [
			'HTML Document Viewer diagnostics',
			`File: ${currentPath}`,
			`Result: ${this.lastFailure?.code ?? 'rendered'}`,
			`Dependencies: ${this.assetDependencies.size}`,
			`Warnings: ${this.lastWarnings.join(' ') || 'none'}`,
		].join('\n');
		const clipboard = this.contentEl.ownerDocument.defaultView?.navigator.clipboard;
		if (clipboard === undefined) {
			if (this.status !== null) {
				updateStatus(this.status, 'warning', 'Clipboard access is unavailable.');
			}
			return;
		}
		try {
			await clipboard.writeText(diagnostics);
		} catch {
			if (this.status !== null) {
				updateStatus(this.status, 'warning', 'Unable to copy viewer diagnostics.');
			}
		}
	}

	private async navigate(target: DocumentNavigationTarget): Promise<void> {
		const file = this.app.vault.getFileByPath(target.path);
		if (file === null) {
			if (this.status !== null) {
				updateStatus(this.status, 'warning', `HTML document not found: “${target.path}”.`);
			}
			return;
		}
		await this.leaf.openFile(file);
	}

	private async renderFile(file: TFile): Promise<void> {
		const iframe = this.iframe;
		const renderCoordinator = this.renderCoordinator;
		const status = this.status;
		if (iframe === null || renderCoordinator === null || status === null) {
			return;
		}

		const renderAbortController = new AbortController();
		const generation = renderCoordinator.beginRender(() => {
			renderAbortController.abort();
		});
		updateStatus(status, 'loading', 'Loading HTML document…');

		try {
			if (file.stat.size > MAX_HTML_SOURCE_BYTES) {
				throw new RenderFailure(
					'document-too-large',
					'The HTML document exceeds the safe file-size limit.',
				);
			}
			let source: string;
			try {
				source = await this.app.vault.read(file);
			} catch {
				throw new RenderFailure('read-failed', 'Unable to read the HTML document.');
			}
			throwIfRenderAborted(renderAbortController.signal);
			const assetLoader = new VaultAssetLoader(
				this.app.vault,
				file.path,
				(data, mimeType) =>
					`data:${mimeType};base64,${arrayBufferToBase64(data)}`,
			);
			const result = await prepareHtmlWithAssets(
				source,
				file.path,
				assetLoader,
				{ signal: renderAbortController.signal },
			);
			if (!renderCoordinator.isCurrent(generation)) {
				return;
			}

			await waitForIframeLayout(iframe, { signal: renderAbortController.signal });
			renderCoordinator.tryCommit(generation, () => {
				iframe.removeAttribute('src');
				iframe.srcdoc = result.html;
				this.assetDependencies = new Set(result.dependencies);
				this.lastFailure = null;
				this.lastSource = source;
				this.lastWarnings = result.warnings;
				this.toolbar?.setNavigation(result.navigation);
				if (this.sourcePanel !== null) {
					this.sourcePanel.replaceChildren();
					this.sourcePanel.hidden = true;
				}
				this.sourceVisible = false;
				this.toolbar?.setSourceVisible(false);
				this.applyZoom();
				if (result.warnings.length === 0) {
					updateStatus(status, 'hidden');
				} else {
					updateStatus(status, 'warning', result.warnings.join(' '));
				}
			});
		} catch (error) {
			renderCoordinator.failRender(generation, () => {
				const failure = classifyRenderFailure(error);
				navigateIframeToBlank(iframe);
				this.assetDependencies.clear();
				this.lastFailure = failure;
				this.lastWarnings = [];
				this.toolbar?.setNavigation([]);
				updateStatus(status, 'error', `${failure.message} “${file.path}”`);
			});
		}
	}
}
