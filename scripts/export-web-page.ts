import { openExportInput, writeWebPageExport } from '../server/web-page/export';
import { WEB_PAGE_MAX_BYTES } from '../src/web-page/validate';

async function main() {
  const [input, output, language, ...rest] = process.argv.slice(2);
  if (!input || !output || rest.length) {
    throw Error('Usage: tsx scripts/export-web-page.ts <web-page.json> <new-output-directory> [language]');
  }
  const file = await openExportInput(input);
  const source = Buffer.alloc(WEB_PAGE_MAX_BYTES + 1);
  let size = 0;
  try {
    while (size < source.length) {
      const { bytesRead } = await file.read(source, size, source.length - size, null);
      if (!bytesRead) break;
      size += bytesRead;
    }
  } finally {
    await file.close();
  }
  await writeWebPageExport(source.subarray(0, size), output, language);
  console.log('Export complete: index.html and manifest.json written to the output directory.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'EXPORT_FAILED');
  process.exitCode = 1;
});
