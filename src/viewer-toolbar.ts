import type { DocumentNavigationTarget } from './prepare-html';

export interface ViewerToolbarActions {
	copyDiagnostics(): void;
	navigate(target: DocumentNavigationTarget): void;
	print(): void;
	reload(): void;
	toggleSource(): void;
	zoom(direction: 'in' | 'out' | 'reset'): void;
}

export class ViewerToolbar {
	private readonly links: DocumentNavigationTarget[] = [];
	private readonly linkControls: HTMLDivElement;
	private readonly linkSelect: HTMLSelectElement;
	private readonly sourceButton: HTMLButtonElement;
	private readonly zoomButton: HTMLButtonElement;

	constructor(parent: HTMLElement, actions: ViewerToolbarActions) {
		const toolbar = parent.createDiv({
			cls: 'html-document-viewer__toolbar',
			attr: { 'aria-label': 'HTML document controls', role: 'toolbar' },
		});
		this.addButton(toolbar, 'Reload', 'Reload HTML document', () => actions.reload());
		this.sourceButton = this.addButton(
			toolbar,
			'Source',
			'Show document source',
			() => actions.toggleSource(),
		);
		this.addButton(toolbar, '−', 'Zoom out', () => actions.zoom('out'));
		this.zoomButton = this.addButton(toolbar, '100%', 'Reset zoom', () =>
			actions.zoom('reset'),
		);
		this.addButton(toolbar, '+', 'Zoom in', () => actions.zoom('in'));
		this.addButton(toolbar, 'Print', 'Print HTML document', () => actions.print());
		this.addButton(
			toolbar,
			'Copy diagnostics',
			'Copy safe viewer diagnostics',
			() => actions.copyDiagnostics(),
		);

		this.linkControls = toolbar.createDiv({
			cls: 'html-document-viewer__links',
		});
		this.linkSelect = this.linkControls.createEl('select', {
			attr: { 'aria-label': 'Document links' },
		});
		this.addButton(this.linkControls, 'Open link', 'Open selected HTML document', () => {
			const target = this.links[this.linkSelect.selectedIndex];
			if (target !== undefined) {
				actions.navigate(target);
			}
		});
		this.setNavigation([]);
	}

	setNavigation(targets: DocumentNavigationTarget[]): void {
		this.links.splice(0, this.links.length, ...targets);
		this.linkSelect.replaceChildren();
		for (const target of targets) {
			this.linkSelect.createEl('option', {
				text: `${target.label} — ${target.path}${target.fragment === null ? '' : `#${target.fragment}`}`,
			});
		}
		this.linkControls.hidden = targets.length === 0;
	}

	setSourceVisible(visible: boolean): void {
		this.sourceButton.textContent = visible ? 'Preview' : 'Source';
		this.sourceButton.setAttribute(
			'aria-label',
			visible ? 'Show rendered document' : 'Show document source',
		);
	}

	setZoom(zoom: number): void {
		this.zoomButton.textContent = `${Math.round(zoom * 100)}%`;
	}

	private addButton(
		parent: HTMLElement,
		text: string,
		label: string,
		onClick: () => void,
	): HTMLButtonElement {
		const button = parent.createEl('button', {
			text,
			attr: { 'aria-label': label, type: 'button' },
		});
		button.addEventListener('click', onClick);
		return button;
	}
}
