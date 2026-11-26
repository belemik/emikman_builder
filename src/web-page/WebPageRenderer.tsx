import { useId } from 'react';
import { assetUrl } from '../runtime';
import { WEB_PAGE_ASSETS, type WebPageV01 } from './contract';

export function WebPageRenderer({ page, resolveAsset = assetUrl, standalone = false }: {
  page: WebPageV01;
  resolveAsset?: typeof assetUrl;
  standalone?: boolean;
}) {
  const HeroHeading = standalone ? 'h1' : 'h3';
  const ProgramHeading = standalone ? 'h2' : 'h4';
  const instance = useId();
  const programId = `web-page-${instance}-${page.program.id}`;
  const { hero, program } = page;

  return <article className="zwp-page">
    <header className="zwp-hero" data-layout={hero.layout}>
      <div>
        <HeroHeading>{hero.heading}</HeroHeading>
        <p>{hero.body.text}</p>
        <a className="zwp-cta" href={'#' + programId}>{hero.cta.label}</a>
      </div>
      <div className="zwp-poster"><img src={resolveAsset(WEB_PAGE_ASSETS[hero.image.assetId])} alt={hero.image.alt} width={72} height={72} /></div>
    </header>
    <section id={programId} className="zwp-program" tabIndex={-1}>
      <ProgramHeading>{program.heading}</ProgramHeading>
      <ul>{program.items.map(({ text }, index) => <li key={index}>{text}</li>)}</ul>
    </section>
  </article>;
}
