// -----------------------------------------------------------------------------
// The changelog roll of the Release workflow (.github/scripts/changelog-release.mjs).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rollChangelog } from '../.github/scripts/changelog-release.mjs';

const REPO = 'https://github.com/prohand/gladys-draytonwiserheating';

test('the Unreleased section moves under the new version, with its links', () => {
  const before = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '### Added',
    '',
    '- Boost a room.',
    '',
    '## [1.0.0] - 2026-10-01',
    '',
    '- First release.',
    '',
    `[Unreleased]: ${REPO}/compare/v1.0.0...HEAD`,
    `[1.0.0]: ${REPO}/releases/tag/v1.0.0`,
    '',
  ].join('\n');
  const after = rollChangelog(before, '1.1.0', '2026-10-21');
  assert.match(
    after,
    /## \[Unreleased\]\n\n## \[1\.1\.0\] - 2026-10-21\n\n### Added\n\n- Boost a room\./,
  );
  assert.match(after, new RegExp(`\\[Unreleased\\]: ${REPO}/compare/v1\\.1\\.0\\.\\.\\.HEAD`));
  assert.match(after, new RegExp(`\\[1\\.1\\.0\\]: ${REPO}/compare/v1\\.0\\.0\\.\\.\\.v1\\.1\\.0`));
});

test('the first release links to its tag', () => {
  const after = rollChangelog(
    `## [Unreleased]\n\n- First.\n\n[Unreleased]: ${REPO}/commits/main\n`,
    '1.0.0',
    '2026-10-21',
  );
  assert.match(after, new RegExp(`\\[1\\.0\\.0\\]: ${REPO}/releases/tag/v1\\.0\\.0`));
});

test('an empty Unreleased section still writes the version', () => {
  const after = rollChangelog('## [Unreleased]\n', '1.0.1', '2026-10-21');
  assert.match(after, /## \[1\.0\.1\] - 2026-10-21\n\n- Maintenance release/);
});

test('the repository changelog has an Unreleased section the workflow can roll', async () => {
  const changelog = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  assert.ok(changelog.includes('## [Unreleased]'));
  assert.notEqual(rollChangelog(changelog, '1.0.0', '2026-10-21'), changelog);
});
