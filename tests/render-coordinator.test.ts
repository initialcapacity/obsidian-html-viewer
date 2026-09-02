import { describe, expect, it, vi } from 'vitest';
import {
	REFRESH_DEBOUNCE_MS,
	RenderCoordinator,
} from '../src/render-coordinator';
import { isRelevantVaultChange } from '../src/vault-path';

function coordinator() {
		let callback: (() => void) | undefined;
		const cancelTimeout = vi.fn(() => {
			callback = undefined;
	});
	const scheduleTimeout = vi.fn((next: () => void, delay: number) => {
		expect(delay).toBe(REFRESH_DEBOUNCE_MS);
		callback = next;
		return 17;
	});
	return {
		cancelTimeout,
		coordinator: new RenderCoordinator(scheduleTimeout, cancelTimeout),
		flush(): void {
				const scheduled = callback;
				callback = undefined;
			scheduled?.();
		},
		scheduleTimeout,
	};
}

describe('dependency-aware vault-change relevance', () => {
	const dependencies = new Set([
		'folder/assets/image.png',
		'shared/theme.css',
	]);

	it.each([
		['current source', 'folder/index.html', undefined],
		['nested image', 'folder/assets/image.png', undefined],
		['parent stylesheet', 'shared/theme.css', undefined],
		['renamed dependency', 'archive/theme.css', 'shared/theme.css'],
	])('accepts %s', (_label, changedPath, oldPath) => {
		expect(
			isRelevantVaultChange(
				'folder/index.html',
				dependencies,
				changedPath,
				oldPath,
			),
		).toBe(true);
	});

	it.each([
		['unreferenced sibling', 'folder/notes.md', undefined],
		['unreferenced nested file', 'folder/assets/other.png', undefined],
		['different folder', 'elsewhere/theme.css', undefined],
	])('rejects %s', (_label, changedPath, oldPath) => {
		expect(
			isRelevantVaultChange(
				'folder/index.html',
				dependencies,
				changedPath,
				oldPath,
			),
		).toBe(false);
	});
});

describe('render coordinator', () => {
	it('debounces a burst into one final refresh', () => {
		const state = coordinator();
		const first = vi.fn();
		const second = vi.fn();
		state.coordinator.scheduleRefresh(first);
		state.coordinator.scheduleRefresh(second);

		expect(state.scheduleTimeout).toHaveBeenCalledTimes(2);
		expect(state.cancelTimeout).toHaveBeenCalledWith(17);
		state.flush();
		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledOnce();
	});

	it('invalidates and cancels an in-flight render immediately', () => {
		const state = coordinator();
		const cancelRender = vi.fn();
		const generation = state.coordinator.beginRender(cancelRender);
		state.coordinator.scheduleRefresh(vi.fn());

		expect(cancelRender).toHaveBeenCalledOnce();
		expect(state.coordinator.isCurrent(generation)).toBe(false);
	});

	it('commits only the newest render', () => {
		const state = coordinator();
		const staleGeneration = state.coordinator.beginRender();
		const currentGeneration = state.coordinator.beginRender();
		const staleCommit = vi.fn();
		const currentCommit = vi.fn();

		expect(
			state.coordinator.tryCommit(staleGeneration, staleCommit),
		).toBe(false);
		expect(
			state.coordinator.tryCommit(currentGeneration, currentCommit),
		).toBe(true);
		expect(staleCommit).not.toHaveBeenCalled();
		expect(currentCommit).toHaveBeenCalledOnce();
	});

	it('shows only a current failure', () => {
		const state = coordinator();
		const staleGeneration = state.coordinator.beginRender();
		const currentGeneration = state.coordinator.beginRender();
		const staleFailure = vi.fn();
		const currentFailure = vi.fn();

		expect(
			state.coordinator.failRender(staleGeneration, staleFailure),
		).toBe(false);
		expect(
			state.coordinator.failRender(currentGeneration, currentFailure),
		).toBe(true);
		expect(staleFailure).not.toHaveBeenCalled();
		expect(currentFailure).toHaveBeenCalledOnce();
	});

	it('cancels pending work and refreshes on reset', () => {
		const state = coordinator();
		const cancelRender = vi.fn();
		const refresh = vi.fn();
		state.coordinator.beginRender(cancelRender);
		state.coordinator.scheduleRefresh(refresh);
		state.coordinator.beginRender(cancelRender);
		state.coordinator.reset();
		state.flush();

		expect(cancelRender).toHaveBeenCalledTimes(2);
		expect(state.cancelTimeout).toHaveBeenCalledWith(17);
		expect(refresh).not.toHaveBeenCalled();
	});

	it('keeps independent view coordinators isolated', () => {
		const first = coordinator();
		const second = coordinator();
		const firstRefresh = vi.fn();
		const secondRefresh = vi.fn();
		first.coordinator.scheduleRefresh(firstRefresh);
		second.coordinator.scheduleRefresh(secondRefresh);
		first.coordinator.reset();
		second.flush();

		expect(firstRefresh).not.toHaveBeenCalled();
		expect(secondRefresh).toHaveBeenCalledOnce();
	});
});
