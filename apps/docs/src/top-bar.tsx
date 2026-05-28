import { useState } from "react";
import type { DocsPage } from "./content.ts";
import { githubUrl } from "./docs-links.ts";
import { pathForLocale } from "./routing.ts";

export function TopBar({ onSwitchLocale, page }: { onSwitchLocale: () => void; page: DocsPage }) {
  const [menuOpen, setMenuOpen] = useState(false);

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
      <button
        className="menu-toggle"
        type="button"
        aria-label={page.menuLabel}
        aria-expanded={menuOpen}
        aria-controls="mobile-nav"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span className="menu-toggle-bars" aria-hidden="true" />
      </button>
      {menuOpen ? (
        <nav id="mobile-nav" className="mobile-nav" aria-label="Mobile">
          {page.nav.map((item) => (
            <a
              href={pathForLocale(page.locale, item.value)}
              key={item.value}
              onClick={() => setMenuOpen(false)}
            >
              {item.label}
            </a>
          ))}
          <a href={githubUrl} onClick={() => setMenuOpen(false)}>
            GitHub
          </a>
          <button
            className="mobile-nav-locale"
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onSwitchLocale();
            }}
          >
            {page.switchLabel}
          </button>
        </nav>
      ) : null}
    </header>
  );
}
