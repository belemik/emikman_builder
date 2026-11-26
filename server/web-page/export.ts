import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, mkdtemp, open, realpath, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WEB_PAGE_ASSETS } from '../../src/web-page/contract';
import { validateWebPage, WEB_PAGE_MAX_BYTES } from '../../src/web-page/validate';
import { WebPageRenderer } from '../../src/web-page/WebPageRenderer';

const fontPackage = createRequire(import.meta.url);
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
// This export rendition is authored here. The editor keeps its existing catalog icon.
const eventMark = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">'
  + '<g fill="none" stroke="#191f29" stroke-width="1.3">'
  + '<circle cx="12" cy="12" r="8.5"/><ellipse cx="12" cy="12" rx="4" ry="8.5"/>'
  + '<path d="M4 9h16M4 15h16"/></g></svg>\n';
const iconPath = 'icons/event-mark.svg';
const stylesPath = new URL('../../src/web-page/web-page-content.css', import.meta.url);
type DependencyReader = (path: string | URL) => Promise<Buffer>;

export async function openExportInput(path: string | URL) {
  const source = resolve(typeof path === 'string' ? path : fileURLToPath(path));
  const parent = dirname(source);
  if (await realpath(parent) !== parent) throw Error('SYMLINK_EXPORT_INPUT_PARENT');
  const file = await open(source, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    if (!(await file.stat()).isFile()) throw Error('EXPECTED_EXPORT_FILE');
    return file;
  } catch (error) {
    await file.close();
    throw error;
  }
}

async function readDependency(path: string | URL) {
  const file = await openExportInput(path);
  try {
    return await file.readFile();
  } finally {
    await file.close();
  }
}


const wrapperStyles = `
* { box-sizing: border-box; }
body { margin: 0; font-synthesis: none; }
.zwp-viewport { container-type: inline-size; }
.zwp-hero :is(h1,p) { margin: 0; }
.zwp-cta { text-decoration: none; }
:focus-visible { outline: 3px solid #73421d; outline-offset: 3px; }
`;

export async function buildWebPageExport(source: Buffer, language = 'und', read: DependencyReader = readDependency) {
  if (source.byteLength > WEB_PAGE_MAX_BYTES) throw Error('INVALID_WEB_PAGE: SIZE');
  // Take a snapshot before the first await so manifest and rendered document share the same input.
  const bytes = Buffer.from(source);
  let payload: string;
  try {
    payload = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw Error('INVALID_WEB_PAGE: UTF8');
  }
  const validated = validateWebPage(payload);
  if (!validated.valid) throw Error('INVALID_WEB_PAGE: ' + validated.issue.code + ' ' + validated.issue.path);
  const page = validated.value;
  const [lang] = Intl.getCanonicalLocales(language);
  if (!lang) throw Error('INVALID_EXPORT_LANGUAGE');

  const files = new Map<string, Buffer>();
  async function dependency(sourcePath: string | URL, label: string) {
    try {
      const data = await read(sourcePath);
      if (!data.length) throw Error('EMPTY');
      return data;
    } catch {
      throw Error('MISSING_EXPORT_DEPENDENCY: ' + label);
    }
  }
  const sharedStyles = (await dependency(stylesPath, 'web-page-content.css')).toString('utf8');
  if (/@import|\burl\s*\(/iu.test(sharedStyles)) throw Error('UNSUPPORTED_EXPORT_CSS_DEPENDENCY');

  const icon = WEB_PAGE_ASSETS[page.hero.image.assetId];
  if (page.hero.image.assetId !== 'event-mark' || icon !== '/icons/globe-01.svg') {
    throw Error('UNSUPPORTED_EXPORT_ASSET');
  }
  files.set(iconPath, Buffer.from(eventMark));

  let fontDirectory: string;
  try {
    fontDirectory = dirname(fontPackage.resolve('@fontsource/manrope/package.json'));
  } catch {
    throw Error('MISSING_EXPORT_DEPENDENCY: Manrope package');
  }
  let fonts = '';
  for (const weight of [500, 700]) {
    const fontStylesPath = join(fontDirectory, weight + '.css');
    const sheet = (await dependency(fontStylesPath, 'Manrope ' + weight + ' CSS')).toString('utf8');
    const matches = [...sheet.matchAll(/\burl\(([^)]*)\)/gu)];
    const fontPath = new RegExp('^\\./files/(manrope-[a-z-]+-' + weight + '-normal\\.(?:woff2|woff))$', 'u');
    if (/@import/iu.test(sheet) || !matches.length || matches.some(match => !fontPath.test(match[1]))) {
      throw Error('UNSUPPORTED_EXPORT_FONT_DEPENDENCY');
    }
    for (const [, path] of matches) {
      const name = fontPath.exec(path)![1];
      files.set('fonts/' + name, await dependency(join(fontDirectory, path), name));
    }
    fonts += sheet.replaceAll('url(./files/', 'url(./fonts/') + '\n';
    if (weight === 500) {
      files.set('fonts/LICENSE.txt', await dependency(join(fontDirectory, 'LICENSE'), 'Manrope license'));
    }
  }

  const html = renderToStaticMarkup(createElement('html', { lang },
    createElement('head', null,
      createElement('meta', { charSet: 'utf-8' }),
      createElement('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }),
      createElement('title', null, page.hero.heading),
      createElement('link', { rel: 'stylesheet', href: './styles.css' }),
    ),
    createElement('body', null, createElement('main', { className: 'zwp-viewport' },
      createElement(WebPageRenderer, { page, standalone: true, resolveAsset(path) {
        if (path !== icon) throw Error('UNSUPPORTED_EXPORT_ASSET');
        return './' + iconPath;
      } }),
    )),
  ));
  files.set('index.html', Buffer.from('<!doctype html>\n' + html + '\n'));
  files.set('styles.css', Buffer.from(fonts + wrapperStyles + sharedStyles));

  const manifest = {
    formatVersion: 'zarya.web-page.static-export/v1',
    contractVersion: page.version,
    inputSha256: sha256(bytes),
    entry: 'index.html',
    files: [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([path, content]) => ({
      path, bytes: content.byteLength, sha256: sha256(content),
    })),
  };
  files.set('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
  return files;
}

/** Publish a complete package on a local POSIX filesystem with a trusted destination parent. */
export async function writeWebPageExport(source: Buffer, directory: string, language?: string) {
  const target = resolve(directory);
  const parent = dirname(target);
  if (await realpath(parent) !== parent) throw Error('SYMLINK_EXPORT_OUTPUT_PARENT');
  const files = await buildWebPageExport(source, language);
  const stage = await mkdtemp(join(parent, '.zarya-web-export-'));
  let reserved = false;
  let published = false;
  try {
    for (const path of ['fonts', 'icons']) await mkdir(join(stage, path));
    for (const [path, content] of files) await writeFile(join(stage, path), content, { flag: 'wx' });
    // Exclusive directory creation arbitrates competing exporters and rejects pre-existing paths.
    await mkdir(target, { mode: 0o700 });
    reserved = true;
    await rename(stage, target);
    published = true;
  } finally {
    if (!published) {
      // Only the current export's staging directory and empty reservation are eligible for rollback.
      await Promise.all([
        rm(stage, { recursive: true, force: true }),
        reserved ? rmdir(target) : Promise.resolve(),
      ]);
    }
  }
}
