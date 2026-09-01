import { FileView, TAbstractFile, TFile, WorkspaceLeaf } from 'obsidian';
import {
	createViewerIframe,
	navigateIframeToBlank,
	waitForIframeLayout,
} from './iframe-boundary';
import { prepareHtml } from './prepare-html';
import {
	RenderCoordinator,
	isRelevantVaultChange,
} from './render-coordinator';

export const HTML_DOCUMENT_VIEW_TYPE = 'html-document-view';

export class HtmlDocumentView extends FileView {
	private iframe: HTMLIFrameElement | null = null;
	private renderCoordinator: RenderCoordinator | null = null;
	private status: HTMLDivElement | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	override getViewType(): string {
		return HTML_DOCUMENT_VIEW_TYPE;
	}

	override getDisplayText(): string {
		return this.file?.basename ?? 'HTML document';
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
		this.renderCoordinator?.reset();
		if (this.iframe !== null) {
			navigateIframeToBlank(this.iframe);
		}
		await super.onUnloadFile(file);
	}

	override async onRename(file: TFile): Promise<void> {
		await super.onRename(file);
		this.scheduleRefresh();
	}

	protected override async onClose(): Promise<void> {
		this.renderCoordinator?.reset();
		if (this.iframe !== null) {
			navigateIframeToBlank(this.iframe);
		}
		this.contentEl.replaceChildren();
		this.iframe = null;
		this.renderCoordinator = null;
		this.status = null;
		await super.onClose();
	}

	private handleVaultChange(file: TAbstractFile, oldPath?: string): void {
		const currentFile = this.file;
		if (
			currentFile === null ||
			!(file instanceof TFile) ||
			!isRelevantVaultChange(currentFile.path, file.path, oldPath)
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

	private ensureViewElements(): void {
		if (this.iframe !== null && this.status !== null) {
			return;
		}

		const ownerWindow = this.contentEl.ownerDocument.defaultView;
		if (ownerWindow === null) {
			throw new Error('HTML view does not have an owning window.');
		}

		this.contentEl.replaceChildren();
		const status = this.contentEl.createDiv({
			cls: 'html-document-viewer__status',
			attr: {
				'aria-live': 'polite',
				role: 'status',
			},
		});
		const iframe = createViewerIframe(this.contentEl);
		const renderCoordinator = new RenderCoordinator(
			ownerWindow.setTimeout.bind(ownerWindow),
			ownerWindow.clearTimeout.bind(ownerWindow),
			ownerWindow.URL.revokeObjectURL.bind(ownerWindow.URL),
		);
		this.contentEl.classList.add('html-document-viewer');
		this.status = status;
		this.iframe = iframe;
		this.renderCoordinator = renderCoordinator;
	}

	private async renderFile(file: TFile): Promise<void> {
		const iframe = this.iframe;
		const renderCoordinator = this.renderCoordinator;
		const status = this.status;
		if (iframe === null || renderCoordinator === null || status === null) {
			return;
		}

		const layoutAbortController = new AbortController();
		const generation = renderCoordinator.beginRender(() => {
			layoutAbortController.abort();
		});
		const objectUrls = new Set<string>();
		status.textContent = 'Loading HTML document…';
		status.hidden = false;

		try {
			const source = await this.app.vault.cachedRead(file);
			const prepared = prepareHtml(source);

			if (!renderCoordinator.isCurrent(generation)) {
				renderCoordinator.discardObjectUrls(objectUrls);
				return;
			}

			await waitForIframeLayout(iframe, {
				signal: layoutAbortController.signal,
			});
			renderCoordinator.tryCommit(generation, objectUrls, () => {
				iframe.removeAttribute('src');
				iframe.srcdoc = prepared;
				status.textContent = '';
				status.hidden = true;
			});
		} catch {
			renderCoordinator.failRender(generation, objectUrls, () => {
				navigateIframeToBlank(iframe);
				status.textContent = `Unable to display “${file.path}”.`;
				status.hidden = false;
			});
		}
	}
}
