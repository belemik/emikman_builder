import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const read = async name => JSON.parse(await readFile(new URL(name, root), 'utf8'));
const old = await read('components.seed.json'), next = await read('components.sprint02.seed.json'), tokens = await read('tokens.verified.seed.json');
for (const item of old.components) assert.deepEqual(next.components.find(x => x.id === item.id), item, `Conflicting seed: ${item.id}`);
const rendererTokens = await read('tokens.renderer.seed.json');
for (const [name, value] of Object.entries(rendererTokens.tokens)) { assert.ok(!Object.hasOwn(tokens.tokens, name), `Duplicate renderer token ${name}`); tokens.tokens[name] = value; }
const components = [...old.components, ...next.components.filter(x => !old.components.some(y => y.id === x.id))];
assert.equal(new Set(components.map(x => x.id)).size, components.length);
for (const c of components) for (const props of [c.variantProps, c.editorProps]) for (const p of Object.values(props)) {
  assert.ok(['enum', 'boolean', 'text'].includes(p.type));
  if (p.type === 'enum') assert.ok(p.values.includes(p.default));
}
const catalog = `// Generated from the reviewed component and token seeds. Run npm run ds:generate; do not edit.\nfunction freeze<T>(value: T): T { if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }\nexport const catalog = freeze(${JSON.stringify(components, null, 2)} as const);\nexport const tokens = freeze(${JSON.stringify(tokens.tokens, null, 2)} as const);\n`;
const closed = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const props = entries => closed(Object.fromEntries(Object.entries(entries).map(([k, p]) => [k, p.type === 'enum' ? { type: 'string', enum: p.values } : p.type === 'boolean' ? { type: 'boolean' } : { type: 'string', maxLength: 2000 }])));
const schema = { $schema: 'https://json-schema.org/draft/2020-12/schema', title: 'WDeaf Screen Schema v3 (strict)', description: 'Closed document grammar, not a pixel-perfect renderer certification. Runtime validator additionally checks unique IDs and known unverified combinations.', ...closed({ schemaVersion: { const: 3 }, platform: { const: 'web' }, elements: { type: 'array', maxItems: 500, items: { oneOf: components.map(c => closed({ id: { type: 'string', minLength: 1, maxLength: 100 }, component: { const: c.id }, variantProps: props(c.variantProps), editorProps: props(c.editorProps) })) } }, themeOverrides: closed({}), tokenReferences: { type: 'array', uniqueItems: true, maxItems: Object.keys(tokens.tokens).length, items: { enum: Object.keys(tokens.tokens) } } }) };
const outputs = [['src/design-system/catalog.generated.ts', catalog], ['design-system/screen.schema.json', JSON.stringify(schema, null, 2) + '\n']];
for (const [name, content] of outputs) {
  if (process.argv.includes('--check')) assert.equal(await readFile(new URL(name, root), 'utf8'), content, `${name} is stale; run npm run ds:generate`);
  else await writeFile(new URL(name, root), content);
}
console.log(process.argv.includes('--check') ? 'DS generated contract matches reviewed seeds.' : 'DS contract generated.');
