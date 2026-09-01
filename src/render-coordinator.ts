export const REFRESH_DEBOUNCE_MS = 150;

type TimeoutScheduler = (callback: () => void, delay: number) => number;
type TimeoutCanceler = (handle: number) => void;
type ObjectUrlRevoker = (url: string) => void;

function parentPath(path: string): string {
	const separator = path.lastIndexOf('/');
	return separator === -1 ? '' : path.slice(0, separator);
}

export function isRelevantVaultChange(
	currentFilePath: string,
	changedPath: string,
	oldPath?: string,
): boolean {
	const currentFolder = parentPath(currentFilePath);
	const isRelevantPath = (path: string): boolean =>
		path === currentFilePath || parentPath(path) === currentFolder;

	return (
		isRelevantPath(changedPath) ||
		(oldPath !== undefined && isRelevantPath(oldPath))
	);
}

export class RenderCoordinator {
	private readonly activeObjectUrls = new Set<string>();
	private cancelPendingRender: (() => void) | null = null;
	private generation = 0;
	private refreshTimer: number | null = null;

	constructor(
		private readonly scheduleTimeout: TimeoutScheduler,
		private readonly cancelTimeout: TimeoutCanceler,
		private readonly revokeObjectUrl: ObjectUrlRevoker,
		private readonly debounceMilliseconds = REFRESH_DEBOUNCE_MS,
	) {}

	scheduleRefresh(refresh: () => void): void {
		this.invalidateRender();
		this.cancelRefreshTimer();
		this.refreshTimer = this.scheduleTimeout(() => {
			this.refreshTimer = null;
			refresh();
		}, this.debounceMilliseconds);
	}

	beginRender(cancelRender?: () => void): number {
		this.invalidateRender();
		this.cancelPendingRender = cancelRender ?? null;
		return this.generation;
	}

	isCurrent(generation: number): boolean {
		return generation === this.generation;
	}

	discardObjectUrls(objectUrls: Iterable<string>): void {
		for (const url of new Set(objectUrls)) {
			this.revokeObjectUrl(url);
		}
	}

	tryCommit(
		generation: number,
		objectUrls: Iterable<string>,
		commit: () => void,
	): boolean {
		const nextObjectUrls = new Set(objectUrls);
		if (!this.isCurrent(generation)) {
			this.discardObjectUrls(nextObjectUrls);
			return false;
		}

		this.discardObjectUrls(this.activeObjectUrls);
		this.activeObjectUrls.clear();
		commit();
		for (const url of nextObjectUrls) {
			this.activeObjectUrls.add(url);
		}
		this.cancelPendingRender = null;
		return true;
	}

	failRender(
		generation: number,
		objectUrls: Iterable<string>,
		displayError: () => void,
	): boolean {
		this.discardObjectUrls(objectUrls);
		if (!this.isCurrent(generation)) {
			return false;
		}

		this.discardObjectUrls(this.activeObjectUrls);
		this.activeObjectUrls.clear();
		this.cancelPendingRender = null;
		displayError();
		return true;
	}

	reset(): void {
		this.invalidateRender();
		this.cancelRefreshTimer();
		this.discardObjectUrls(this.activeObjectUrls);
		this.activeObjectUrls.clear();
	}

	private invalidateRender(): void {
		this.generation += 1;
		this.cancelPendingRender?.();
		this.cancelPendingRender = null;
	}

	private cancelRefreshTimer(): void {
		if (this.refreshTimer === null) {
			return;
		}

		this.cancelTimeout(this.refreshTimer);
		this.refreshTimer = null;
	}
}
