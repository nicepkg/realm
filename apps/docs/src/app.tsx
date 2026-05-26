import { realmColors } from "@realm/design-tokens";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { type DocPage, type Locale, pages } from "./content.ts";

export function DocsApp() {
  const [locale, setLocale] = useState<Locale>(() => localeFromPath(window.location.pathname));
  const page = pages[locale];
  const otherLocale: Locale = locale === "en" ? "zh" : "en";
  const shellStyle = { "--realm-primary": realmColors.primary } as CSSProperties;

  useEffect(() => {
    const onPopState = () => setLocale(localeFromPath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function switchLocale() {
    const nextPath = otherLocale === "en" ? "/" : "/zh";
    window.history.pushState({}, "", nextPath);
    setLocale(otherLocale);
  }

  return (
    <div className="docs-shell" style={shellStyle}>
      <header className="topbar">
        <a className="brand" href={locale === "en" ? "/" : "/zh"} aria-label="Realm docs home">
          <span className="brand-mark">R</span>
          <span>
            <strong>Realm</strong>
            <small>CLI Docs</small>
          </span>
        </a>
        <nav className="topnav" aria-label="Primary">
          <a href="#install">Install</a>
          <a href="#configuration">Config</a>
          <a href="#development">Develop</a>
          <a href="https://github.com/nicepkg/realm">GitHub</a>
        </nav>
        <button className="language-button" type="button" onClick={switchLocale}>
          {page.switchLabel}
        </button>
      </header>

      <main className="docs-main">
        <aside className="sidebar" aria-label="Documentation navigation">
          <strong>{page.languageLabel}</strong>
          {page.sections.map((section, index) => (
            <a key={section.id} href={`#${section.id}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              {page.nav[index] ?? section.title}
            </a>
          ))}
        </aside>

        <article className="content">
          <Hero page={page} />
          <MessengerPreview locale={locale} />
          <SectionList page={page} />
        </article>
      </main>
    </div>
  );
}

function Hero({ page }: { page: DocPage }) {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy">
        <div className="badge-row">
          {page.badges.map((badge) => (
            <span key={badge}>{badge}</span>
          ))}
        </div>
        <h1 id="hero-title">{page.title}</h1>
        <p>{page.subtitle}</p>
        <div className="hero-actions">
          <a className="primary-action" href="#start">
            {page.primaryAction}
          </a>
          <a className="secondary-action" href="#concepts">
            {page.secondaryAction}
          </a>
        </div>
      </div>
    </section>
  );
}

function MessengerPreview({ locale }: { locale: Locale }) {
  const copy = useMemo(
    () =>
      locale === "en"
        ? {
            conversations: "Conversations",
            allHands: "Cultivation · All Hands",
            dm: "DM · Lei Jun",
            header: "Cultivation World",
            owner: "Owner",
            role: "Lei Jun",
            message: "Can you evaluate this encounter?",
            reply: "The opportunity is real, but the cost must be bounded.",
            inspector: "Context",
            state: "Visible state",
          }
        : {
            conversations: "会话",
            allHands: "修真世界 · 全员群",
            dm: "私聊 · 雷军",
            header: "修真世界",
            owner: "Boss",
            role: "雷军",
            message: "你判断一下这次奇遇值不值得冒险？",
            reply: "机会是真的，但成本必须可控。",
            inspector: "上下文",
            state: "可见状态",
          },
    [locale],
  );

  return (
    <section className="preview" aria-label="Realm messenger preview">
      <div className="preview-rail" aria-hidden="true">
        <span className="active-dot" />
        <span />
        <span />
        <span />
      </div>
      <div className="preview-list">
        <strong>{copy.conversations}</strong>
        <div className="conversation selected">
          <span className="avatar">修</span>
          <p>
            <b>{copy.allHands}</b>
            <small>@all · God patch committed</small>
          </p>
        </div>
        <div className="conversation">
          <span className="avatar light">雷</span>
          <p>
            <b>{copy.dm}</b>
            <small>Private state visible</small>
          </p>
        </div>
      </div>
      <div className="preview-chat">
        <header>{copy.header}</header>
        <div className="bubble owner">
          <small>{copy.owner}</small>
          <span>{copy.message}</span>
        </div>
        <div className="bubble role">
          <small>{copy.role}</small>
          <span>{copy.reply}</span>
        </div>
      </div>
      <div className="preview-inspector">
        <strong>{copy.inspector}</strong>
        <p>{copy.state}</p>
        <code>hp: 88</code>
        <code>realm: Qi Refining</code>
      </div>
    </section>
  );
}

function SectionList({ page }: { page: DocPage }) {
  return (
    <div className="section-list">
      {page.sections.map((section) => (
        <section className="doc-section" id={section.id} key={section.id}>
          <h2>{section.title}</h2>
          {section.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          {section.bullets ? (
            <ul>
              {section.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          ) : null}
          {section.code ? <pre>{section.code}</pre> : null}
          {section.note ? <div className="note">{section.note}</div> : null}
        </section>
      ))}
    </div>
  );
}

function localeFromPath(pathname: string): Locale {
  if (pathname.startsWith("/zh")) {
    return "zh";
  }
  return "en";
}
