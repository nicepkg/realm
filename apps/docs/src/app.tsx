import { realmColors } from "@realm/design-tokens";
import { type CSSProperties, useEffect, useState } from "react";
import { type DocsPage, type Locale, locales, pages } from "./content.ts";

const LOCALE_STORAGE_KEY = "realm-docs-locale";
const githubUrl = "https://github.com/nicepkg/realm";

export function DocsApp() {
  const [locale, setLocale] = useState<Locale>(() => resolveInitialLocale());
  const page = pages[locale];
  const shellStyle = { "--realm-primary": realmColors.primary } as CSSProperties;

  useEffect(() => {
    const onPopState = () =>
      setLocale((current) => localeFromPath(window.location.pathname) ?? current);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }, [locale]);

  function switchLocale() {
    const nextLocale: Locale = locale === "en" ? "zh-CN" : "en";
    window.history.pushState({}, "", pathForLocale(nextLocale));
    setLocale(nextLocale);
  }

  return (
    <div className="docs-shell" style={shellStyle}>
      <TopBar page={page} onSwitchLocale={switchLocale} />
      <main>
        <Hero page={page} />
        <ProofBand page={page} />
        <DocIndex page={page} />
        <QuickStart page={page} />
        <Concepts page={page} />
        <WebWorkflow page={page} />
        <TuiPreview page={page} />
        <TrustModel page={page} />
        <Examples page={page} />
        <SectionList page={page} />
        <FinalCta page={page} />
      </main>
    </div>
  );
}

function TopBar({ onSwitchLocale, page }: { onSwitchLocale: () => void; page: DocsPage }) {
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
          <a href={`#${item.value}`} key={item.value}>
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

function Hero({ page }: { page: DocsPage }) {
  return (
    <section className="hero-section" aria-labelledby="hero-title">
      <div className="hero-copy">
        <div className="proof-row">
          {page.hero.proof.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
        <h1 id="hero-title">{page.hero.title}</h1>
        <p>{page.hero.promise}</p>
        <div className="install-strip">
          <span>{page.hero.installLabel}</span>
          <code>{page.hero.installCommand}</code>
        </div>
        <div className="hero-actions">
          <a className="primary-action" href="#quick-start">
            {page.hero.primaryAction}
          </a>
          <a className="secondary-action" href={githubUrl}>
            {page.hero.secondaryAction}
          </a>
        </div>
      </div>
      <ProductPreview page={page} />
    </section>
  );
}

function ProductPreview({ page }: { page: DocsPage }) {
  const preview = page.preview;
  return (
    <section className="product-preview" aria-label="Realm product preview">
      <section className="manager-preview">
        <header>
          <span>{page.hero.title}</span>
          <button type="button">{preview.settings}</button>
        </header>
        <div className="manager-body">
          <p>{preview.managerTitle}</p>
          <button type="button">{preview.managerAction}</button>
        </div>
        <div className="world-row">
          <GroupAvatar />
          <span>
            <strong>{preview.worldName}</strong>
            <small>{preview.worldMeta}</small>
          </span>
        </div>
      </section>
      <section className="chat-preview">
        <header>
          <span>‹</span>
          <strong>{preview.chatTitle}</strong>
          <span>•••</span>
        </header>
        <div className="message-time">{preview.time}</div>
        <div className="message-row outgoing">
          <div className="message-bubble">{preview.outgoing}</div>
          <Avatar seed="🎧" />
        </div>
        <div className="message-row incoming">
          <Avatar seed="🚀" />
          <span>
            <small>{preview.incomingAuthor}</small>
            <div className="message-bubble">{preview.incoming}</div>
          </span>
        </div>
        <footer>
          <span className="voice-mark">▥</span>
          <span className="composer">{preview.composer}</span>
          <span>☺</span>
          <span>＋</span>
        </footer>
      </section>
      <section className="god-chip" aria-label={preview.god}>
        {preview.god}
      </section>
    </section>
  );
}

function DocIndex({ page }: { page: DocsPage }) {
  return (
    <section className="doc-index" aria-label="Documentation topics">
      {page.nav
        .filter((item) => item.value !== "github")
        .map((item) => (
          <a href={`#${item.value}`} key={item.value}>
            {item.label}
          </a>
        ))}
    </section>
  );
}

function ProofBand({ page }: { page: DocsPage }) {
  const items =
    page.locale === "zh-CN"
      ? [
          { label: "Web", value: "Agent Browser 截图验收" },
          { label: "TUI", value: "Pi TUI 覆盖交互确认" },
          { label: "Docs", value: "中英文路线与移动端 smoke" },
          { label: "Release", value: "Bun 二进制与 CI 检查" },
        ]
      : [
          { label: "Web", value: "Agent Browser screenshot acceptance" },
          { label: "TUI", value: "Pi TUI interaction coverage" },
          { label: "Docs", value: "EN/ZH routes and mobile smoke" },
          { label: "Release", value: "Bun binary and CI checks" },
        ];

  return (
    <section className="proof-band" aria-label="Verification signals">
      {items.map((item) => (
        <article key={item.label}>
          <strong>{item.label}</strong>
          <span>{item.value}</span>
        </article>
      ))}
    </section>
  );
}

function QuickStart({ page }: { page: DocsPage }) {
  return (
    <section className="band quick-start" id="quick-start">
      <div className="section-heading">
        <h2>{page.quickStart.title}</h2>
        <p>{page.quickStart.intro}</p>
      </div>
      <div className="command-list">
        {page.quickStart.steps.map((step, index) => (
          <div className="command-row" key={step.label}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{step.label}</strong>
            <code>{step.value}</code>
          </div>
        ))}
      </div>
    </section>
  );
}

function Concepts({ page }: { page: DocsPage }) {
  return (
    <section className="band concepts" id="concepts">
      <div className="section-heading">
        <h2>{page.concepts.title}</h2>
        <p>{page.concepts.intro}</p>
      </div>
      <div className="concept-map">
        {page.concepts.nodes.map((node) => (
          <article key={node.label}>
            <span>{node.label}</span>
            <p>{node.value}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function WebWorkflow({ page }: { page: DocsPage }) {
  const section = page.sections.find((item) => item.id === "web-ui");
  if (!section) {
    return null;
  }
  return (
    <section className="band split-band" id="web-ui">
      <div className="section-heading">
        <span>{section.eyebrow}</span>
        <h2>{section.title}</h2>
        <p>{section.body}</p>
      </div>
      <ul className="workflow-list">
        {section.bullets.map((bullet) => (
          <li key={bullet}>{bullet}</li>
        ))}
      </ul>
    </section>
  );
}

function TuiPreview({ page }: { page: DocsPage }) {
  return (
    <section className="band tui-band" id="tui">
      <div className="section-heading">
        <h2>{page.tui.title}</h2>
        <p>{page.tui.intro}</p>
      </div>
      <pre className="terminal-preview">
        {page.tui.lines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </pre>
    </section>
  );
}

function TrustModel({ page }: { page: DocsPage }) {
  return (
    <section className="band split-band" id="identity-safety">
      <div className="section-heading">
        <h2>{page.trust.title}</h2>
        <p>{page.trust.intro}</p>
      </div>
      <ul className="trust-list">
        {page.trust.bullets.map((bullet) => (
          <li key={bullet}>{bullet}</li>
        ))}
      </ul>
    </section>
  );
}

function Examples({ page }: { page: DocsPage }) {
  return (
    <section className="band examples" id="templates">
      <div className="section-heading">
        <h2>{page.examples.title}</h2>
        <p>{page.examples.intro}</p>
      </div>
      <div className="example-grid">
        {page.examples.items.map((item) => (
          <article key={item.label}>
            <strong>{item.label}</strong>
            <p>{item.value}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function SectionList({ page }: { page: DocsPage }) {
  return (
    <section className="reference-section" aria-label="Documentation reference">
      {page.sections
        .filter((section) => !["web-ui", "tui", "identity-safety"].includes(section.id))
        .map((section) => (
          <article className="reference-row" id={section.id} key={section.id}>
            <span>{section.eyebrow}</span>
            <div>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
              <ul>
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
              {section.code ? <pre>{section.code}</pre> : null}
            </div>
          </article>
        ))}
    </section>
  );
}

function FinalCta({ page }: { page: DocsPage }) {
  return (
    <section className="final-cta">
      <h2>{page.cta.title}</h2>
      <p>{page.cta.body}</p>
      <div className="hero-actions">
        <a className="primary-action" href="#quick-start">
          {page.cta.install}
        </a>
        <a className="secondary-action" href={githubUrl}>
          {page.cta.github}
        </a>
      </div>
    </section>
  );
}

function GroupAvatar() {
  const cells = ["🎧", "🚀", "🔥", "🧪", "📚", "🎯", "🧭", "💬", "⚡"];
  return (
    <span className="group-avatar" aria-hidden="true">
      {cells.map((cell) => (
        <i key={cell}>{cell}</i>
      ))}
    </span>
  );
}

function Avatar({ seed }: { seed: string }) {
  return (
    <span className="avatar" aria-hidden="true">
      {seed}
    </span>
  );
}

function resolveInitialLocale(): Locale {
  const routeLocale = localeFromPath(window.location.pathname);
  if (routeLocale) {
    return routeLocale;
  }
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (isLocale(stored)) {
    return stored;
  }
  return window.navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

function localeFromPath(pathname: string): Locale | undefined {
  if (pathname === "/zh-CN" || pathname.startsWith("/zh-CN/")) {
    return "zh-CN";
  }
  if (pathname === "/" || pathname.startsWith("/en/")) {
    return "en";
  }
  return undefined;
}

function pathForLocale(locale: Locale): string {
  return locale === "en" ? "/" : "/zh-CN";
}

function isLocale(value: string | null): value is Locale {
  return locales.some((locale) => locale === value);
}
