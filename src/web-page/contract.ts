export const WEB_PAGE_VERSION = '0.1' as const;

// Trusted catalog identifiers. Paths come from code, never from a document.
export const WEB_PAGE_ASSETS = Object.freeze({
  'event-mark': '/icons/globe-01.svg',
} as const);

export interface PageText {
  readonly text: string;
}

export interface PageImage {
  readonly assetId: keyof typeof WEB_PAGE_ASSETS;
  readonly alt: string;
}

export interface PageCta {
  readonly label: string;
  readonly targetId: string;
}

export interface PageHero {
  readonly layout: 'stack' | 'split';
  readonly heading: string;
  readonly body: PageText;
  readonly image: PageImage;
  readonly cta: PageCta;
}

export interface PageProgram {
  readonly id: string;
  readonly heading: string;
  readonly items: readonly PageText[];
}

export interface WebPageV01 {
  readonly version: typeof WEB_PAGE_VERSION;
  readonly hero: PageHero;
  readonly program: PageProgram;
}
