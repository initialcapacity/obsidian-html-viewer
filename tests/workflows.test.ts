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
const DEPENDABOT_CONFIG = readFileSync('.github/dependabot.yml', 'utf8');

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
		expect(QUALITY_WORKFLOW).toContain('run: npm run check');
		expect(QUALITY_WORKFLOW).toContain("node-version: ['22.22.0', '24']");
		expect(QUALITY_WORKFLOW).toContain('run: npm run test:e2e');
		expect(QUALITY_WORKFLOW).toContain('persist-credentials: false');
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

	it('isolates validation from release credentials and pins official actions', () => {
		const releaseJobIndex = RELEASE_WORKFLOW.indexOf('\n  release:');
		const validationJob = RELEASE_WORKFLOW.slice(0, releaseJobIndex);
		const publishingJob = RELEASE_WORKFLOW.slice(releaseJobIndex);
		expect(RELEASE_WORKFLOW).toMatch(
			/permissions:\n {2}contents: read/u,
		);
		expect(RELEASE_WORKFLOW).toMatch(
			/ {4}permissions:\n {6}attestations: write\n {6}contents: write\n {6}id-token: write/u,
		);
		expect(occurrenceCount(RELEASE_WORKFLOW, 'persist-credentials: false')).toBe(2);
		expect(RELEASE_WORKFLOW).toContain('needs: validate');
		expect(RELEASE_WORKFLOW).toContain(
			'actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803',
		);
		expect(RELEASE_WORKFLOW).toContain(
			'actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38',
		);
		expect(RELEASE_WORKFLOW).toContain(
			'actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6',
		);
		expect(RELEASE_WORKFLOW).toContain(
			'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
		);
		expect(RELEASE_WORKFLOW).toContain(
			'actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093',
		);
		expect(RELEASE_WORKFLOW).not.toMatch(/uses: [^\n]+@v\d/u);
		expect(validationJob).not.toContain('contents: write');
		expect(validationJob).not.toContain('id-token: write');
		expect(validationJob).not.toContain('GH_TOKEN:');
		expect(publishingJob).not.toContain('run: npm ci');
		expect(publishingJob).not.toContain('run: npm run');
	});

	it('checks npm and action dependencies every week', () => {
		expect(DEPENDABOT_CONFIG).toContain('package-ecosystem: npm');
		expect(DEPENDABOT_CONFIG).toContain('package-ecosystem: github-actions');
		expect(occurrenceCount(DEPENDABOT_CONFIG, 'interval: weekly')).toBe(2);
	});

	it('validates source before publishing without installing in the privileged job', () => {
		const pushIndex = RELEASE_WORKFLOW.indexOf('push --atomic origin');
		const releaseJobIndex = RELEASE_WORKFLOW.indexOf('\n  release:');
		expect(occurrenceCount(RELEASE_WORKFLOW, 'run: npm ci')).toBe(1);
		expect(occurrenceCount(RELEASE_WORKFLOW, 'run: npm run check')).toBe(1);
		expect(
			RELEASE_WORKFLOW.slice(releaseJobIndex).includes('run: npm ci'),
		).toBe(false);
		expect(RELEASE_WORKFLOW).toContain('fetch-depth: 0');
		expect(RELEASE_WORKFLOW).toContain('scripts/prepare-release.mjs');
		expect(RELEASE_WORKFLOW).toContain('Download the validated runtime bundle');
		expect(pushIndex).toBeGreaterThanOrEqual(0);
		for (const command of [
			'run: npm ci',
			'run: npm run check',
			'actions/download-artifact@',
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
		const pushIndex = RELEASE_WORKFLOW.indexOf('push --atomic origin');
		const validatedCheckoutIndex = RELEASE_WORKFLOW.indexOf(
			'git checkout --detach "$RELEASE_COMMIT"',
		);
		expect(RELEASE_WORKFLOW).toContain('push --atomic origin');
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
