// Windows/OneDrive directory read-only attributes must not become Linux tar modes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

// Reuse the exact tar implementation shipped with the existing packaging tool.
const require = createRequire(import.meta.url);
const toolRequire = createRequire(require.resolve('@companion-module/tools/package.json'));
const tar = toolRequire('tar');

const manifest = JSON.parse(await readFile('pkg/companion/manifest.json', 'utf8'));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
assert.equal(manifest.version, pkg.version, 'Build the package before normalizing it');
assert.equal(manifest.runtime.entrypoint, '../main.js');
assert.ok((await readFile('pkg/main.js')).length > 0, 'The package entrypoint must exist');

const file = `${manifest.id}-${manifest.version}.tgz`;
await tar.create(
	{
		file,
		gzip: true,
		portable: true,
		filter: (_path, stat) => {
			assert.ok(stat.isFile() || stat.isDirectory(), 'Only regular files and directories may be packaged');
			// Only modify the archive's stat metadata, not the source filesystem.
			stat.mode = (stat.mode & ~0o7777) | (stat.isDirectory() ? 0o755 : 0o644);
			return true;
		},
	},
	['pkg']
);

const entries = new Set();
await tar.list({
	file,
	onReadEntry: (entry) => {
		assert.ok(entry.type === 'Directory' || entry.type === 'File');
		assert.equal(entry.mode & 0o7777, entry.type === 'Directory' ? 0o755 : 0o644, entry.path);
		entries.add(entry.path);
	},
});
for (const path of ['pkg/', 'pkg/companion/', 'pkg/main.js', 'pkg/companion/HELP.md', 'pkg/companion/manifest.json']) {
	assert.ok(entries.has(path), `Missing archive entry: ${path}`);
}
console.log(`Verified ${entries.size} archive entries: directories 0755, files 0644 (${file})`);
