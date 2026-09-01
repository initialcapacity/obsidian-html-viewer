import { describe, expect, it, vi } from 'vitest';
import {
	REFRESH_DEBOUNCE_MS,
	RenderCoordinator,
	isRelevantVaultChange,
} from '../src/render-coordinator';

interface FakeTimers {
	cancelTimeout: (handle: number) => void;
	callbacks: Map<number, () => void>;
	scheduleTimeout: (callback: () => void, delay: number) => number;
}

function createFakeTimers(): FakeTimers {
	let nextHandle = 1;
	const callbacks = new Map<number, () => void>();
	return {
		callbacks,
		scheduleTimeout(callback, delay) {
			expect(delay).toBe(REFRESH_DEBOUNCE_MS);
			const handle = nextHandle;
			nextHandle += 1;
			callbacks.set(handle, callback);
			return handle;
		},
		cancelTimeout(handle) {
			callbacks.delete(handle);
		},
	};
}

describe('vault-change relevance', () => {
	it.each([
		['source modification', 'folder/index.html', 'folder/index.html', undefined],
		['same-folder file', 'folder/index.html', 'folder/image.png', undefined],
		['root-level sibling', 'index.html', 'style.css', undefined],
		[
			'rename out of folder',
			'folder/index.html',
			'elsewhere/image.png',
			'folder/image.png',
		],
		[
			'rename into folder',
			'folder/index.html',
			'folder/image.png',
			'elsewhere/image.png',
		],
	])('accepts %s', (_label, currentPath, changedPath, oldPath) => {
		expect(
			isRelevantVaultChange(currentPath, changedPath, oldPath),
		).toBe(true);
	});

	it.each([
		['another folder', 'other/image.png', undefined],
		['nested child', 'folder/assets/image.png', undefined],
		['unrelated rename', 'other/new.png', 'other/old.png'],
	])('rejects %s', (_label, changedPath, oldPath) => {
		expect(
			isRelevantVaultChange('folder/index.html', changedPath, oldPath),
		).toBe(false);
	});
});

describe('render coordinator', () => {
	it('debounces a burst into one final refresh', () => {
		const timers = createFakeTimers();
		const refresh = vi.fn();
		const coordinator = new RenderCoordinator(
			timers.scheduleTimeout,
			timers.cancelTimeout,
			vi.fn(),
		);

		coordinator.scheduleRefresh(refresh);
		coordinator.scheduleRefresh(refresh);
		coordinator.scheduleRefresh(refresh);

		expect(timers.callbacks.size).toBe(1);
		const callback = Array.from(timers.callbacks.values())[0];
		callback?.();
		expect(refresh).toHaveBeenCalledTimes(1);
	});

	it('invalidates an in-flight render as soon as a refresh is scheduled', () => {
		const timers = createFakeTimers();
		const coordinator = new RenderCoordinator(
			timers.scheduleTimeout,
			timers.cancelTimeout,
			vi.fn(),
		);
		const generation = coordinator.beginRender();

		coordinator.scheduleRefresh(vi.fn());

		expect(coordinator.isCurrent(generation)).toBe(false);
	});

	it('cancels in-flight render work when refreshed or reset', () => {
		const timers = createFakeTimers();
		const coordinator = new RenderCoordinator(
			timers.scheduleTimeout,
			timers.cancelTimeout,
			vi.fn(),
		);
		const refreshCancellation = vi.fn();
		coordinator.beginRender(refreshCancellation);

		coordinator.scheduleRefresh(vi.fn());

		expect(refreshCancellation).toHaveBeenCalledOnce();

		const closeCancellation = vi.fn();
		coordinator.beginRender(closeCancellation);
		coordinator.reset();

		expect(closeCancellation).toHaveBeenCalledOnce();
	});

	it('keeps the newest render and revokes stale and replaced URLs', () => {
		const timers = createFakeTimers();
		const revokeObjectUrl = vi.fn();
		const coordinator = new RenderCoordinator(
			timers.scheduleTimeout,
			timers.cancelTimeout,
			revokeObjectUrl,
		);
		const commit = vi.fn();
		const olderGeneration = coordinator.beginRender();
		const newerGeneration = coordinator.beginRender();

		expect(
			coordinator.tryCommit(
				newerGeneration,
				['blob:new'],
				() => {
					commit('new');
				},
			),
		).toBe(true);
		expect(
			coordinator.tryCommit(
				olderGeneration,
				['blob:stale'],
				() => {
					commit('stale');
				},
			),
		).toBe(false);
		expect(commit).toHaveBeenCalledOnce();
		expect(commit).toHaveBeenCalledWith('new');
		expect(revokeObjectUrl).toHaveBeenCalledWith('blob:stale');

		const finalGeneration = coordinator.beginRender();
		coordinator.tryCommit(finalGeneration, ['blob:final'], () => {
			commit('final');
		});
		expect(revokeObjectUrl).toHaveBeenCalledWith('blob:new');

		coordinator.reset();
		expect(revokeObjectUrl).toHaveBeenCalledWith('blob:final');
	});

	it('revokes failed resources and only displays a current error', () => {
		const timers = createFakeTimers();
		const revokeObjectUrl = vi.fn();
		const coordinator = new RenderCoordinator(
			timers.scheduleTimeout,
			timers.cancelTimeout,
			revokeObjectUrl,
		);
		const displayError = vi.fn();
		const staleGeneration = coordinator.beginRender();
		const currentGeneration = coordinator.beginRender();

		expect(
			coordinator.failRender(
				staleGeneration,
				['blob:stale-failure'],
				displayError,
			),
		).toBe(false);
		expect(
			coordinator.failRender(
				currentGeneration,
				['blob:current-failure'],
				displayError,
			),
		).toBe(true);
		expect(displayError).toHaveBeenCalledOnce();
		expect(revokeObjectUrl).toHaveBeenCalledWith('blob:stale-failure');
		expect(revokeObjectUrl).toHaveBeenCalledWith('blob:current-failure');
	});

	it('revokes the displayed resources when the current refresh fails', () => {
		const timers = createFakeTimers();
		const revokeObjectUrl = vi.fn();
		const coordinator = new RenderCoordinator(
			timers.scheduleTimeout,
			timers.cancelTimeout,
			revokeObjectUrl,
		);
		const displayedGeneration = coordinator.beginRender();
		coordinator.tryCommit(displayedGeneration, ['blob:displayed'], vi.fn());

		const failedGeneration = coordinator.beginRender();
		coordinator.failRender(
			failedGeneration,
			['blob:failed'],
			vi.fn(),
		);

		expect(revokeObjectUrl).toHaveBeenCalledWith('blob:displayed');
		expect(revokeObjectUrl).toHaveBeenCalledWith('blob:failed');
	});

	it('does not retain URLs when committing the new document throws', () => {
		const timers = createFakeTimers();
		const revokeObjectUrl = vi.fn();
		const coordinator = new RenderCoordinator(
			timers.scheduleTimeout,
			timers.cancelTimeout,
			revokeObjectUrl,
		);
		const generation = coordinator.beginRender();

		expect(() =>
			coordinator.tryCommit(generation, ['blob:failed-commit'], () => {
				throw new Error('commit failed');
			}),
		).toThrow('commit failed');
		coordinator.failRender(generation, ['blob:failed-commit'], vi.fn());
		coordinator.reset();

		expect(revokeObjectUrl).toHaveBeenCalledOnce();
		expect(revokeObjectUrl).toHaveBeenCalledWith('blob:failed-commit');
	});

	it('cancels a pending refresh when reset', () => {
		const timers = createFakeTimers();
		const refresh = vi.fn();
		const coordinator = new RenderCoordinator(
			timers.scheduleTimeout,
			timers.cancelTimeout,
			vi.fn(),
		);

		coordinator.scheduleRefresh(refresh);
		coordinator.reset();

		expect(timers.callbacks.size).toBe(0);
		expect(refresh).not.toHaveBeenCalled();
	});
});

describe('independent view state', () => {
	it('refreshes and cleans up one coordinator without disturbing another', () => {
		const firstTimers = createFakeTimers();
		const secondTimers = createFakeTimers();
		const firstRevoker = vi.fn();
		const secondRevoker = vi.fn();
		const first = new RenderCoordinator(
			firstTimers.scheduleTimeout,
			firstTimers.cancelTimeout,
			firstRevoker,
		);
		const second = new RenderCoordinator(
			secondTimers.scheduleTimeout,
			secondTimers.cancelTimeout,
			secondRevoker,
		);
		const firstGeneration = first.beginRender();
		const secondGeneration = second.beginRender();
		first.tryCommit(firstGeneration, ['blob:first'], vi.fn());
		second.tryCommit(secondGeneration, ['blob:second'], vi.fn());

		first.scheduleRefresh(vi.fn());

		expect(first.isCurrent(firstGeneration)).toBe(false);
		expect(second.isCurrent(secondGeneration)).toBe(true);
		expect(firstTimers.callbacks.size).toBe(1);
		expect(secondTimers.callbacks.size).toBe(0);

		first.reset();

		expect(firstRevoker).toHaveBeenCalledWith('blob:first');
		expect(secondRevoker).not.toHaveBeenCalled();
		expect(second.isCurrent(secondGeneration)).toBe(true);

		const nextSecondGeneration = second.beginRender();
		expect(
			second.tryCommit(
				nextSecondGeneration,
				['blob:second-next'],
				vi.fn(),
			),
		).toBe(true);
		expect(secondRevoker).toHaveBeenCalledWith('blob:second');
	});

	it('lets two views independently debounce the same vault change', () => {
		const firstTimers = createFakeTimers();
		const secondTimers = createFakeTimers();
		const firstRefresh = vi.fn();
		const secondRefresh = vi.fn();
		const first = new RenderCoordinator(
			firstTimers.scheduleTimeout,
			firstTimers.cancelTimeout,
			vi.fn(),
		);
		const second = new RenderCoordinator(
			secondTimers.scheduleTimeout,
			secondTimers.cancelTimeout,
			vi.fn(),
		);

		first.scheduleRefresh(firstRefresh);
		second.scheduleRefresh(secondRefresh);
		Array.from(firstTimers.callbacks.values())[0]?.();
		Array.from(secondTimers.callbacks.values())[0]?.();

		expect(firstRefresh).toHaveBeenCalledOnce();
		expect(secondRefresh).toHaveBeenCalledOnce();
	});
});
