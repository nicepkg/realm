import type { DocsPage } from "./content.ts";
import { githubUrl } from "./docs-links.ts";
import { pathForLocale } from "./routing.ts";

export function TopBar({ onSwitchLocale, page }: { onSwitchLocale: () => void; page: DocsPage }) {
  return (
    <header className="topbar">
      <a className="brand" href={pathForLocale(page.locale)} aria-label="Realm docs home">
        <span className="brand-mark">R</span>
        <span>
          <strong>{page.hero.title}</strong>
          <small>{page.languageLabel}</small>
        </span>
      </a>
      <nav className="topnav" aria-label="Primary">
        {page.nav.slice(0, 6).map((item) => (
          <a href={pathForLocale(page.locale, item.value)} key={item.value}>
            {item.label}
          </a>
        ))}
        <a href={githubUrl}>GitHub</a>
      </nav>
      <button className="language-button" type="button" onClick={onSwitchLocale}>
        {page.switchLabel}
      </button>
    </header>
  );
}
