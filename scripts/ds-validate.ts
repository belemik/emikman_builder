import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { CONTRACT_VERSION, MAX_BYTES, migrateJSON, validateScreen } from '../src/design-system';
const args = process.argv.slice(2);
const compatible = args.includes('--compatible');
if (args.some(arg => arg.startsWith('--') && arg !== '--compatible')) {
  console.error('Usage: npm run ds:validate -- [--compatible] [project.json ...]'); process.exit(2);
}
const files = args.filter(arg => arg !== '--compatible');
if (!files.length) files.push(fileURLToPath(new URL('../design-system/examples/screen.v3.json', import.meta.url)));
for (const file of files) {
  try {
    if ((await stat(file)).size > MAX_BYTES) throw new Error('Document exceeds 2 MB.');
    const migration = migrateJSON(await readFile(file, 'utf8'));
    const result = migration.valid && !compatible ? validateScreen(migration.value) : migration;
    const warnings = [...migration.warnings, ...(result === migration ? [] : result.warnings)];
    console.log(JSON.stringify({ file, contractVersion: CONTRACT_VERSION, mode: compatible ? 'compatible (not DS certification)' : 'strict', valid: result.valid, errors: result.valid ? [] : result.errors, warnings }, null, 2));
    if (!result.valid) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ file, valid: false, error: error instanceof Error ? error.message : 'Read failure' })); process.exitCode = 1;
  }
}
