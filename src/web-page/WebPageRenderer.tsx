import { useId } from 'react';
import { assetUrl } from '../runtime';
import { WEB_PAGE_ASSETS, type WebPageV01 } from './contract';

export function WebPageRenderer({ page }: { page: WebPageV01 }) {
  const instance = useId();
  const programId = `web-page-${instance}-${page.program.id}`;
  const { hero, program } = page;

  return <article className="zwp-page">
    <header className="zwp-hero" data-layout={hero.layout}>
      <div>
        <h3>{hero.heading}</h3>
        <p>{hero.body.text}</p>
        <a className="zwp-cta" href={'#' + programId}>{hero.cta.label}</a>
      </div>
      <img src={assetUrl(WEB_PAGE_ASSETS[hero.image.assetId])} alt={hero.image.alt} width={72} height={72} />
    </header>
    <section id={programId} className="zwp-program" tabIndex={-1}>
      <h4>{program.heading}</h4>
      <ul>{program.items.map(({ text }, index) => <li key={index}>{text}</li>)}</ul>
    </section>
  </article>;
}
