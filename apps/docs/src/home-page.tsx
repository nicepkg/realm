import type { DocsPage } from "./content.ts";
import { githubUrl } from "./docs-links.ts";
import { pathForLocale } from "./routing.ts";

export function HomePage({ page }: { page: DocsPage }) {
  return (
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

// NL-first hero mockup: a single chat window. The operator talks to 天道 in
// plain language; the assistant replies and surfaces a lightweight inline
// preview/confirm card for the risky write — no messenger collage, no rails.
function ProductPreview({ page }: { page: DocsPage }) {
  const preview = page.preview;
  return (
    <section
      className="product-preview"
      aria-label="Realm product preview"
      data-testid="docs-chat-preview"
    >
      <section className="chat-window">
        <header className="chat-window-bar">
          <Avatar seed={preview.chatTitle.charAt(0)} />
          <strong>{preview.chatTitle}</strong>
        </header>
        <div className="chat-window-body">
          <p className="chat-empty-hint">{preview.emptyPrompt}</p>
          <div className="message-row outgoing">
            <div className="chat-bubble">{preview.userMessage}</div>
          </div>
          <div className="message-row incoming">
            <Avatar seed={preview.chatTitle.charAt(0)} />
            <div className="chat-bubble assistant">
              <span>{preview.assistantReply}</span>
              <div className="confirm-card" data-testid="docs-confirm-card">
                <strong>{preview.confirmTitle}</strong>
                <small>{preview.confirmSummary}</small>
                <button type="button">{preview.confirmAction}</button>
              </div>
            </div>
          </div>
          <div className="suggestion-row" data-testid="docs-suggestion-chips">
            {preview.suggestions.map((chip) => (
              <button className="suggestion-chip" type="button" key={chip}>
                {chip}
              </button>
            ))}
          </div>
        </div>
        <footer className="chat-composer">
          <span className="composer">{preview.composer}</span>
          <button type="button" aria-label={preview.composer} className="composer-send">
            ↑
          </button>
        </footer>
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
          <a href={pathForLocale(page.locale, item.value)} key={item.value}>
            {item.label}
          </a>
        ))}
    </section>
  );
}

function ProofBand({ page }: { page: DocsPage }) {
  return (
    <section className="proof-band" aria-label="Why Realm">
      {page.valueProps.map((item) => (
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

function Avatar({ seed }: { seed: string }) {
  return (
    <span className="avatar" aria-hidden="true">
      {seed}
    </span>
  );
}
