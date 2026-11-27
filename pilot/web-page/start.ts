import { lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { startCTestHttp, type CWebAsset } from '../../server/projects/c-test-http';
import { createBrowserAccess } from './browser-access';
import { CTestSessions } from '../../server/projects/c-test-sessions';
import { adoptBTestVolume, createBTestVolume } from '../../server/projects/b-test-volume';

const tmp = realpathSync(tmpdir());
const { values, tokens } = parseArgs({
  options: { resume: { type: 'string' }, port: { type: 'string' }, 'test-drop-edit': { type: 'boolean' } },
  tokens: true,
});
const namesSeen = new Set<string>();
for (const token of tokens) {
  if (token.kind !== 'option' || namesSeen.has(token.name)) throw Error('PILOT_ARGUMENTS');
  namesSeen.add(token.name);
}
const path = values.resume;
const drop = values['test-drop-edit'] === true;
const port = values.port === undefined ? undefined : Number(values.port);
if ((path !== undefined && !path)
  || (values.port !== undefined && (!/^[0-9]{4,5}$/.test(values.port) || !port || port < 1024 || port > 65535))) {
  throw Error('Usage: start.ts [--resume PATH] [--port PORT] [--test-drop-edit]');
}

function loadVolumes(file: string): { main: string; ledger: string } {
  const directory = dirname(file);
  if (dirname(directory) !== tmp || !basename(directory).startsWith('zarya-web-browser-')
    || basename(file) !== 'volumes.json' || realpathSync(file) !== file) throw Error('PILOT_STATE_PATH');
  const parent = lstatSync(directory), manifest = lstatSync(file);
  if (!parent.isDirectory() || parent.uid !== process.getuid?.() || (parent.mode & 0o777) !== 0o700
    || !manifest.isFile() || manifest.uid !== process.getuid?.() || manifest.nlink !== 1
    || (manifest.mode & 0o777) !== 0o600 || manifest.size > 2048) throw Error('PILOT_STATE_MODE');
  const volumes: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!volumes || typeof volumes !== 'object' || Object.keys(volumes).length !== 2
    || !('main' in volumes) || typeof volumes.main !== 'string' || !('ledger' in volumes)
    || typeof volumes.ledger !== 'string' || adoptBTestVolume(volumes.main).role !== 'main'
    || adoptBTestVolume(volumes.ledger).role !== 'ledger') throw Error('PILOT_STATE');
  return { main: volumes.main, ledger: volumes.ledger };
}

const dist = fileURLToPath(new URL('./dist-pilot/', import.meta.url));
const assets = new Map<string, CWebAsset>();
function add(url: string, file: string, mediaType: string, limit: number) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.nlink !== 1 || stat.size > limit) throw Error('PILOT_ASSET');
  assets.set(url, { mediaType, body: readFileSync(file) });
}
add('/', join(dist, 'index.html'), 'text/html; charset=utf-8', 8192);
const names = readdirSync(join(dist, 'assets'));
if (names.length < 2 || names.length > 48) throw Error('PILOT_ASSET_COUNT');
for (const name of names) {
  const entry = /^index-[\w-]+\.(js|css)$/.exec(name);
  const font = /^manrope-[a-z-]+-(400|600|700)-normal-[\w-]+\.(woff2?|woff)$/.exec(name);
  if (!entry && !font) throw Error('PILOT_ASSET_NAME');
  const mediaType = entry ? (entry[1] === 'js' ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8')
    : 'font/' + font?.[2];
  add('/assets/' + name, join(dist, 'assets', name), mediaType, entry ? 512 * 1024 : 64 * 1024);
}
add('/icons/globe-01.svg', fileURLToPath(new URL('../../public/icons/globe-01.svg', import.meta.url)),
  'image/svg+xml', 16 * 1024);

const directory = mkdtempSync(join(tmp, 'zarya-web-browser-'));
const state = path ?? join(directory, 'volumes.json');
const volumes = path ? loadVolumes(path)
  : { main: createBTestVolume('main').directory, ledger: createBTestVolume('ledger').directory };
if (!path) writeFileSync(state, JSON.stringify(volumes), { mode: 0o600, flag: 'wx' });

const sessions = new CTestSessions();
const browserAccess = createBrowserAccess(sessions);
const credentials = join(directory, 'studio-access.json');
let issue = 0;
function issueCredentials() {
  const ownerCode = browserAccess.issue('a'.repeat(32));
  const foreignCode = browserAccess.issue('b'.repeat(32));
  const next = join(directory, 'studio-access-' + ++issue + '.tmp');
  writeFileSync(next, JSON.stringify({ ownerCode, foreignCode }, null, 2), { mode: 0o600, flag: 'wx' });
  renameSync(next, credentials);
}
issueCredentials();
const harness = await startCTestHttp({ ...volumes, sessions, webPageProfile: { assets, dropEditResponseOnce: drop, port, workspace: true, browserAccess } });
console.log(JSON.stringify({ url: harness.url, credentials, state, pid: process.pid }));
process.on('SIGUSR2', () => {
  try { issueCredentials(); } catch { console.error('Could not issue a new synthetic session. Restart with --resume.'); }
});
let closing = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    void harness.close().then(() => process.exit(0), () => process.exit(1));
  });
}
