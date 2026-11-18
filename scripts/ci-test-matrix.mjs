/**
 * Shared PR/Pages inventory. G1b runtime remains mandatory on the separately
 * qualified macOS/Node26 job. New Node test files are portable by default;
 * adding an exclusion requires a corresponding qualified entry.
 */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultG1bOnly = Object.freeze([
  'project-durable-session-bridge.test.mjs',
  'project-session-authority.test.mjs',
  'project-session-store-recovery.test.mjs',
  'project-session-store.test.mjs',
]);
const defaultQualified = Object.freeze([
  'project-durable-session-bridge.test.mjs',
  'project-session-bridge.test.mjs',
  'project-principal-boundary.test.mjs',
  'auth.test.mjs',
  'auth-add-user.test.mjs',
  'project-session-store.test.mjs',
  'project-session-store-recovery.test.mjs',
  'project-session-authority.test.mjs',
]);

/** @typedef {{g1bOnly?:readonly string[], qualified?:readonly string[]}} InventoryOptions */
/** @typedef {{typescript:readonly string[], portableNode:readonly string[], qualified:readonly string[], g1bOnly:readonly string[]}} TestInventory */

/**
 * Pure inventory validation: importing this module neither reads the test
 * directory nor starts any child process. Options permit isolated negative
 * inventory tests; the CLI always uses the fixed reviewed defaults above.
 * @param {readonly string[]} files
 * @param {InventoryOptions} [options]
 * @returns {TestInventory}
 */
export function buildTestInventory(files, options = {}) {
  const g1bOnly = [...(options.g1bOnly ?? defaultG1bOnly)];
  const qualified = [...(options.qualified ?? defaultQualified)];
  /** @param {string} label @param {readonly string[]} names */
  function uniqueNames(label, names) {
    const seen = new Set();
    for (const name of names) {
      if (typeof name !== 'string' || !name || name.includes('/') || name.includes('\\') ||
          name === '.' || name === '..' || name.includes('\0')) {
        throw new Error(`Invalid ${label} filename.`);
      }
      if (seen.has(name)) throw new Error(`Duplicate ${label} filename: ${name}`);
      seen.add(name);
    }
    return seen;
  }
  uniqueNames('discovered', files);
  const excluded = uniqueNames('g1bOnly', g1bOnly);
  const required = uniqueNames('qualified', qualified);
  if (!qualified.length) throw new Error('Qualified inventory is unexpectedly empty.');
  for (const file of g1bOnly) {
    if (!required.has(file)) throw new Error(`G1b exclusion missing from qualified inventory: ${file}`);
  }
  const nodeTests = files.filter(file => file.endsWith('.test.mjs')).sort();
  const typescript = files.filter(file => file.endsWith('.test.ts')).sort();
  const discoveredNode = new Set(nodeTests);
  for (const file of [...g1bOnly, ...qualified]) {
    if (!file.endsWith('.test.mjs') || !discoveredNode.has(file)) {
      throw new Error(`Required Node test missing: tests/${file}`);
    }
  }
  if (!typescript.length) throw new Error('TypeScript test inventory is unexpectedly empty.');
  if (!nodeTests.length) throw new Error('Node test inventory is unexpectedly empty.');
  const portableNode = nodeTests.filter(file => !excluded.has(file));
  if (!portableNode.length) throw new Error('No portable Node tests.');
  return Object.freeze({
    typescript: Object.freeze(typescript),
    portableNode: Object.freeze(portableNode),
    qualified: Object.freeze(qualified),
    g1bOnly: Object.freeze(g1bOnly),
  });
}

/** @param {string} command @param {readonly string[]} args @param {string} cwd */
function run(command, args, cwd) {
  const result = spawnSync(command, [...args], { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

/** @param {string|undefined} mode */
function main(mode) {
  if (!['portable', 'qualified', 'list'].includes(mode ?? '')) {
    throw new Error('Usage: node scripts/ci-test-matrix.mjs portable|qualified|list');
  }
  const root = fileURLToPath(new URL('../', import.meta.url));
  const files = readdirSync(join(root, 'tests'), { withFileTypes: true })
    .filter(entry => entry.isFile()).map(entry => entry.name);
  const inventory = buildTestInventory(files);
  if (mode === 'portable') {
    console.log(`Portable: ${inventory.typescript.length} TypeScript, ${inventory.portableNode.length} Node; G1b-only: ${inventory.g1bOnly.length}, all mandatory in qualified.`);
    run(process.execPath, ['node_modules/tsx/dist/cli.mjs', '--test', ...inventory.typescript.map(file => join('tests', file))], root);
    run(process.execPath, ['--test', ...inventory.portableNode.map(file => join('tests', file))], root);
  } else if (mode === 'qualified') {
    console.log(`Qualified G1b/adjacent: ${inventory.qualified.length} test files.`);
    run(process.execPath, ['--test', '--test-concurrency=1', ...inventory.qualified.map(file => join('tests', file))], root);
  } else {
    console.log(JSON.stringify(inventory, null, 2));
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv[2]);
}
