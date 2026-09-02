import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const QUALITY_WORKFLOW = readFileSync(
	'.github/workflows/quality.yml',
	'utf8',
);
const RELEASE_WORKFLOW = readFileSync(
	'.github/workflows/release.yml',
	'utf8',
);

function occurrenceCount(source: string, value: string): number {
	return source.split(value).length - 1;
}

describe('GitHub Actions policy', () => {
	it('validates pull requests using immutable official action pins', () => {
		expect(QUALITY_WORKFLOW).toContain('pull_request:');
		expect(QUALITY_WORKFLOW).toContain('contents: read');
		expect(QUALITY_WORKFLOW).toContain(
			'actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803',
		);
		expect(QUALITY_WORKFLOW).toContain(
			'actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38',
		);
		expect(QUALITY_WORKFLOW).toContain('run: npm ci');
		expect(QUALITY_WORKFLOW).toContain('run: npm run lint');
		expect(QUALITY_WORKFLOW).toContain('run: npm test');
		expect(QUALITY_WORKFLOW).toContain('run: npm run typecheck');
		expect(QUALITY_WORKFLOW).toContain('run: npm run build');
	});

	it('serializes main releases without canceling queued source commits', () => {
		expect(RELEASE_WORKFLOW).toContain('push:');
		expect(RELEASE_WORKFLOW).toContain('      - main');
		expect(RELEASE_WORKFLOW).toContain(
			'group: html-document-viewer-release-main',
		);
		expect(RELEASE_WORKFLOW).toContain('queue: max');
		expect(RELEASE_WORKFLOW).not.toContain('cancel-in-progress: true');
		expect(RELEASE_WORKFLOW).not.toContain('github.event.head_commit.message');
		expect(RELEASE_WORKFLOW).not.toContain('contains(github.event');
	});

	it('grants exactly the release permissions and pins official actions', () => {
		expect(RELEASE_WORKFLOW).toMatch(
			/permissions:\n {2}contents: write\n {2}id-token: write\n {2}attestations: write/u,
	);
		expect(RELEASE_WORKFLOW).toContain(
			'actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803',
		);
		expect(RELEASE_WORKFLOW).toContain(
			'actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38',
		);
		expect(RELEASE_WORKFLOW).toContain(
			'actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6',
		);
		expect(RELEASE_WORKFLOW).not.toMatch(/uses: [^\n]+@v\d/u);
	});

	it('validates both source and tagged metadata before publishing', () => {
		const pushIndex = RELEASE_WORKFLOW.indexOf('git push --atomic origin');
		expect(occurrenceCount(RELEASE_WORKFLOW, 'run: npm ci')).toBe(2);
		expect(occurrenceCount(RELEASE_WORKFLOW, 'run: npm run lint')).toBe(2);
		expect(occurrenceCount(RELEASE_WORKFLOW, 'run: npm test')).toBe(2);
		expect(occurrenceCount(RELEASE_WORKFLOW, 'run: npm run typecheck')).toBe(2);
		expect(occurrenceCount(RELEASE_WORKFLOW, 'run: npm run build')).toBe(2);
		expect(RELEASE_WORKFLOW).toContain('fetch-depth: 0');
		expect(RELEASE_WORKFLOW).toContain('scripts/prepare-release.mjs');
		expect(pushIndex).toBeGreaterThanOrEqual(0);
		for (const command of [
			'run: npm ci',
			'run: npm run lint',
			'run: npm test',
			'run: npm run typecheck',
			'run: npm run build',
			'run: test -f main.js && test -f manifest.json && test -f styles.css',
		]) {
			const taggedCheckIndex = RELEASE_WORKFLOW.lastIndexOf(command);
			expect(taggedCheckIndex).toBeGreaterThanOrEqual(0);
			expect(taggedCheckIndex).toBeLessThan(pushIndex);
		}
		expect(RELEASE_WORKFLOW.indexOf('gh release create')).toBeGreaterThan(
			pushIndex,
		);
	});

	it('uses an atomic non-force push and retry-safe release reconciliation', () => {
		const pushIndex = RELEASE_WORKFLOW.indexOf('git push --atomic origin');
		const validatedCheckoutIndex = RELEASE_WORKFLOW.indexOf(
			'git checkout --detach "$RELEASE_COMMIT"',
		);
		expect(RELEASE_WORKFLOW).toContain('git push --atomic origin');
		expect(RELEASE_WORKFLOW).not.toContain('git push --force');
		expect(RELEASE_WORKFLOW).not.toContain('--clobber');
		expect(RELEASE_WORKFLOW).toContain('for attempt in 1 2 3');
		expect(validatedCheckoutIndex).toBeGreaterThan(pushIndex);
		expect(validatedCheckoutIndex).toBeLessThan(
			RELEASE_WORKFLOW.indexOf('gh release create'),
		);
		expect(RELEASE_WORKFLOW).toContain(
			'test "$(git rev-parse HEAD)" = "$RELEASE_COMMIT"',
		);
		expect(RELEASE_WORKFLOW).toContain('Existing $asset does not match');
		expect(RELEASE_WORKFLOW).toContain('gh release upload');
	});

	it('attests and publishes the three exact runtime assets', () => {
		for (const asset of ['main.js', 'manifest.json', 'styles.css']) {
			expect(RELEASE_WORKFLOW).toContain(asset);
			expect(RELEASE_WORKFLOW).toContain(
				`gh attestation verify ${asset}`,
			);
		}
		expect(RELEASE_WORKFLOW).toContain('--generate-notes');
		expect(RELEASE_WORKFLOW).toContain('--verify-tag');
		expect(RELEASE_WORKFLOW).toContain(
			'gh release view "$head_version"',
		);
	});
});
