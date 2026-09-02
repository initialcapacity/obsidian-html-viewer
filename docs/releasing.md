# Release and publication operations

This project releases from `main` with timestamp versions in the form
`0.0.<UTC epoch seconds>`. Releases are intentionally blocked until every
security test in `docs/testing.md`, including the real mobile hostile-document
test, has passed.

## Required repository configuration

Before enabling the first release:

1. Make `initialcapacity/obsidian-html-viewer` public. GitHub artifact
   attestations on GitHub Free, Pro, and Team require a public repository.
2. In **Settings → Actions → General → Workflow permissions**, allow GitHub
   Actions to read and write repository contents. The release job narrows its
   token to `contents: write`, `id-token: write`, and `attestations: write`.
3. Permit the official GitHub actions pinned in the workflows if the repository
   restricts allowed actions.
4. If a branch ruleset prevents the workflow token from updating `main`, add a
   narrowly scoped bypass for this repository's release workflow. Do not add a
   general administrator or force-push bypass. Required checks should remain in
   force for user-authored changes.

No personal access token or repository secret is required. The workflow uses
the run-scoped `GITHUB_TOKEN`; GitHub does not create another workflow run for
the release commit pushed with that token. Commit-message filtering is not used,
so an ordinary source commit cannot suppress validation by copying a trailer.

## Automated release path

`.github/workflows/quality.yml` runs `npm ci`, lint, tests, strict type-checking,
and the production build for pull requests.

`.github/workflows/release.yml` queues every user-authored `main` push in one
serialized concurrency group. For each triggering source SHA, it:

1. validates the unmodified source commit;
2. finds an existing tagged release commit for that source SHA or computes
   `patch = max(current UTC seconds, highest known patch + 1)`;
3. updates `manifest.json`, `package.json`, `package-lock.json`, and
   `versions.json`, preserving published version history;
4. creates a local marked release commit and annotated tag with no `v` prefix;
5. checks out that exact local tag, repeats all validation, and creates a fresh
   production build;
6. only after those checks pass, atomically pushes the validated tag and a
   non-force update to `main`, then restores the exact validated tag checkout;
7. attests `main.js`, `manifest.json`, and `styles.css`;
8. creates or safely finishes a published GitHub release with generated notes;
   and
9. downloads and compares the release assets, verifies their attestations, and
   confirms that the default-branch manifest names a published release.

If a newer user commit reaches `main` while a release is running, the tagged
release still contains the triggering source tree. The automation records that
release commit as an ancestor of the newer tip using a merge whose tree keeps
the newer user content, then updates only the four release metadata files. It
never force-pushes or replaces an existing tag.

## Retry and repair

Use GitHub's **Re-run jobs** control for the failed run. A manual
`workflow_dispatch` is also available; supply the original full source SHA only
when repairing a known run.

| Failure point | Persistent state | Safe recovery |
| --- | --- | --- |
| Install, lint, test, type-check, or build | No remote state; candidate commits and tags exist only in the disposable runner clone | Fix the source and push normally. No version, tag, or release was published. |
| Competing `main` update during push | None, because the main/tag push is atomic | The job fetches and retries up to three times while keeping the same release candidate. Re-run if contention continues. |
| Version commit and tag pushed; attestation or release failed | Marked commit and annotated tag identify the source SHA and version | Re-run the same workflow. It reuses the tag and completes missing safe steps. |
| Release exists with a missing required asset | Existing release and remaining assets | Re-run. The workflow compares existing assets and uploads only a missing asset. |
| Existing asset or tag disagrees with the fresh build/source | Conflicting external state | The workflow stops. Investigate manually; never replace the tag or use `--clobber`. |

The release preparation behavior is exercised in temporary Git repositories by
`tests/prepare-release.test.ts`, including partial reruns, same-second releases,
and a newer `main` commit. Workflow policy and immutable action pins are checked
by `tests/workflows.test.ts`.

## First-release verification

After the mobile release gate passes, push the reviewed workflow commit to
`main` and wait for **Release from main** to finish. Then verify:

1. the manifest version at default-branch `HEAD` equals the annotated tag;
2. the release is published, not a draft or prerelease;
3. the release has `main.js`, `manifest.json`, and `styles.css` as individual
   files;
4. `gh attestation verify <asset> --repo initialcapacity/obsidian-html-viewer`
   succeeds for each file;
5. a clean manual installation using only the downloaded release assets works
   in the dedicated desktop and mobile test vaults; and
6. the evidence matrix in `docs/testing.md` records the release URL, commit,
   platform versions, and observed results.

## Obsidian Community publication

Use the current Community directory flow at
<https://community.obsidian.md>. Sign in with the maintainer's Obsidian account,
link the existing GitHub account if requested, add **HTML Document Viewer**, and
resolve every automated review error before publishing. Never enter credentials
into project files or automation.

Publication remains pending until the directory shows the plugin as published
and it can be installed from Obsidian on both desktop and mobile. Record the
submission URL and status in `docs/testing.md`; external review is not a passing
result by itself.
