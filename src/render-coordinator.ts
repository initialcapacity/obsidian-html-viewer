export const REFRESH_DEBOUNCE_MS = 150;

type TimeoutScheduler = (callback: () => void, delay: number) => number;
type TimeoutCanceler = (handle: number) => void;

export class RenderCoordinator {
	private cancelPendingRender: (() => void) | null = null;
	private generation = 0;
	private refreshTimer: number | null = null;

	constructor(
		private readonly scheduleTimeout: TimeoutScheduler,
		private readonly cancelTimeout: TimeoutCanceler,
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

	tryCommit(generation: number, commit: () => void): boolean {
		if (!this.isCurrent(generation)) {
			return false;
		}

		commit();
		this.cancelPendingRender = null;
		return true;
	}

	failRender(
		generation: number,
		displayError: () => void,
	): boolean {
		if (!this.isCurrent(generation)) {
			return false;
		}

		this.cancelPendingRender = null;
		displayError();
		return true;
	}

	reset(): void {
		this.invalidateRender();
		this.cancelRefreshTimer();
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
