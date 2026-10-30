// Checked by tsc -p tsconfig.contract.json, including negative compile-time assertions.
import type { ScreenElement, ScreenSchema, TokenName } from '../src/design-system';
const button: ScreenElement = { id: 'b', component: 'button', variantProps: { size: 'm', state: 'default', variant: 'primary', colorScheme: 'accent' }, editorProps: { label: 'OK' } };
const screen: ScreenSchema = { schemaVersion: 3, platform: 'web', elements: [button], themeOverrides: {}, tokenReferences: ['surface/primary/default'] };
// @ts-expect-error Unknown token literal.
const unknownToken: TokenName = 'color/brand/new';
// @ts-expect-error The discriminant forbids arbitrary components.
const custom: ScreenElement = { ...button, component: 'div' };
// @ts-expect-error Component-specific enum is a literal union.
const large: ScreenElement = { ...button, variantProps: { ...button.variantProps, size: 'xxl' } };
// @ts-expect-error Table has no root variant props.
const table: ScreenElement = { id: 't', component: 'table', variantProps: { color: 'blue' }, editorProps: { title: 'Table' } };
// @ts-expect-error Strict document forbids raw editor styles.
const styled: ScreenSchema = { ...screen, themeOverrides: { radiusPx: 4 } };
void [screen, unknownToken, custom, large, table, styled];
