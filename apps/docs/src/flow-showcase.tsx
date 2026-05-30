import type { Capabilities, DocsPage, FlowShowcase, FlowStep } from "./content-types.ts";
// Side-effect import: main.tsx is not owned by this item, so the showcase pulls
// in its own styles. Vite hoists and dedupes CSS imports, so the cascade still
// lands after styles-sections.css (imported earlier in the module graph).
import "./flow-showcase.css";

/**
 * FlowShowcase — the docs section that honestly SHOWS the working NL-first
 * product. It walks the 6 core natural-language flows, each paired with the REAL
 * screenshot captured by scripts/capture-docs-shots.ts (desktop + mobile), the
 * exact zh-CN utterance the operator typed, and one honest line of what the live
 * backend did. Below it, an honest "能力与边界" block splits what works
 * end-to-end from the real limits — no marketing gloss.
 *
 * This is additive: it lives entirely inside apps/docs and references screenshots
 * under public/shots/. It does not touch the web app or the example dirs. The
 * shots are static assets, so this renders identically before and after a fresh
 * capture (a missing shot degrades to its alt text + caption, never a crash).
 */
export function FlowShowcaseSection({ page }: { page: DocsPage }) {
  const showcase = page.flowShowcase;
  return (
    <section className="band flow-showcase" id="flow-showcase" data-testid="flow-showcase">
      <div className="section-heading">
        <span>{showcase.eyebrow}</span>
        <h2>{showcase.title}</h2>
        <p>{showcase.intro}</p>
      </div>
      <ol className="flow-list" data-testid="flow-list">
        {showcase.steps.map((step, index) => (
          <FlowCard key={step.shot} step={step} index={index} showcase={showcase} />
        ))}
      </ol>
      <CapabilitiesBlock capabilities={page.capabilities} />
    </section>
  );
}

function FlowCard({
  step,
  index,
  showcase,
}: {
  step: FlowStep;
  index: number;
  showcase: FlowShowcase;
}) {
  const order = String(index + 1).padStart(2, "0");
  return (
    <li className="flow-card" data-testid={`flow-card-${step.shot}`}>
      <div className="flow-card-copy">
        <span className="flow-order">{order}</span>
        <strong className="flow-label">{step.label}</strong>
        <p className="flow-utterance" data-testid={`flow-utterance-${step.shot}`}>
          <span className="flow-utterance-mark" aria-hidden="true">
            “
          </span>
          {step.utterance}
        </p>
        <p className="flow-outcome">{step.outcome}</p>
      </div>
      <figure className="flow-shots">
        <Shot
          src={`/shots/${step.shot}-desktop.png`}
          alt={`${step.label} · desktop`}
          kind="desktop"
        />
        <Shot src={`/shots/${step.shot}-mobile.png`} alt={`${step.label} · mobile`} kind="mobile" />
        <figcaption className="flow-shot-caption">{showcase.shotCaption}</figcaption>
      </figure>
    </li>
  );
}

function Shot({ src, alt, kind }: { src: string; alt: string; kind: "desktop" | "mobile" }) {
  // Static, decode-async, lazy real screenshots. A missing file degrades to the
  // alt text + the frame, never a layout-breaking crash.
  return (
    <span className={`flow-shot flow-shot-${kind}`} data-testid={`flow-shot-${kind}`}>
      <img alt={alt} decoding="async" loading="lazy" src={src} />
    </span>
  );
}

function CapabilitiesBlock({ capabilities }: { capabilities: Capabilities }) {
  return (
    <div className="capabilities" data-testid="capabilities">
      <div className="section-heading">
        <h3>{capabilities.title}</h3>
        <p>{capabilities.intro}</p>
      </div>
      <div className="capabilities-grid">
        <article className="capability-col capability-works">
          <h4>{capabilities.worksTitle}</h4>
          <ul>
            {capabilities.works.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
        <article className="capability-col capability-limits">
          <h4>{capabilities.limitsTitle}</h4>
          <ul>
            {capabilities.limits.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </div>
    </div>
  );
}
