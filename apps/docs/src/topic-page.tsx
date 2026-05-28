import type { DocSection, DocsPage } from "./content.ts";
import { pathForLocale } from "./routing.ts";

export function TopicPage({ page, section }: { page: DocsPage; section: DocSection }) {
  return (
    <main className="topic-shell" data-testid="docs-topic-page">
      <a className="topic-back" href={pathForLocale(page.locale)}>
        {page.locale === "zh-CN" ? "返回首页" : "Back to docs home"}
      </a>
      <div className="topic-layout">
        <article className="topic-article">
          <span className="topic-eyebrow">{section.eyebrow}</span>
          <h1>{section.title}</h1>
          <p>{section.body}</p>
          <ul className="topic-list">
            {section.bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
          {section.code ? <pre className="topic-code">{section.code}</pre> : null}
        </article>
        <aside className="topic-aside" aria-label="Documentation topics">
          <strong>{page.locale === "zh-CN" ? "文档目录" : "Docs topics"}</strong>
          {page.nav
            .filter((item) => item.value !== "github")
            .map((item) => (
              <a
                aria-current={item.value === section.id ? "page" : undefined}
                href={pathForLocale(page.locale, item.value)}
                key={item.value}
              >
                {item.label}
              </a>
            ))}
        </aside>
      </div>
    </main>
  );
}
