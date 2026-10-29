import seed from '../../tokens.verified.seed.json';
export const verifiedTokens = Object.freeze(Object.fromEntries(Object.entries(seed.tokens).map(([key, token]) => [key, Object.freeze({ ...token })]))) as Readonly<typeof seed.tokens>;
export const tokenSource = Object.freeze({ ...seed.source });
export const token = <K extends keyof typeof verifiedTokens>(name: K): typeof verifiedTokens[K]['value'] => verifiedTokens[name].value;
