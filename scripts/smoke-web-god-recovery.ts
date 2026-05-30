import type { createAgentBrowserSmoke } from "./smoke-browser-utils.ts";

/** The browser-driver surface returned by `createAgentBrowserSmoke`, shared by
 * the smoke orchestrator and its extracted step modules so each flow takes the
 * SAME driver instance rather than re-deriving helpers. */
export type SmokeDriver = ReturnType<typeof createAgentBrowserSmoke>;

/**
 * Step 9b — the God controller is the highest-consequence surface, so its
 * recovery must be LIVE: a committed kill exposes a working "Undo this ruling"
 * that pre-seeds a revive against the SAME target through the same gate, and the
 * target Select shows each role's avatar + lifecycle status.
 *
 * Extracted from the smoke orchestrator (file-size guard ≤500 lines) — it is a
 * self-contained flow that only drives the shared smoke helpers, so lifting it
 * keeps the orchestrator readable and this consequential gate isolated.
 */
export async function runGodRecoveryStep(driver: SmokeDriver): Promise<void> {
  const {
    assertPage,
    browser,
    browserEval,
    clickInPage,
    screenshot,
    waitForPageExpression,
    waitForSelector,
  } = driver;

  await clickInPage("[data-testid='topbar-more']");
  await waitForSelector("[data-testid='topbar-god']");
  await clickInPage("[data-testid='topbar-god']");
  await waitForSelector("[data-testid='god-action-apply']");
  // Open the target-role Select and assert each portal option carries an avatar
  // (mapping the Select to real role identity, not a bare name string).
  await clickInPage("[data-testid='god-action-role-trigger']");
  await waitForSelector("[role='option'] [data-testid='god-role-option']");
  await assertPage(
    "God target Select renders each role with an identity avatar",
    "(() => { const opt = document.querySelector(\"[role='option'] [data-testid='god-role-option']\"); const avatar = opt?.querySelector(\"[data-testid='identity-avatar']\"); return Boolean(opt && avatar); })()",
  );
  await browser("press", "Escape");
  await browser("wait", "150");
  // The target the sheet opened pointed at (the room/inspected role, never an
  // arbitrary first role). Capture it so the confirmation matches and we can
  // assert the undo re-targets the SAME role.
  const killTargetId = (
    await browserEval(
      "document.querySelector(\"[data-testid='god-action-target-role-id']\")?.textContent ?? ''",
    )
  )
    .trim()
    .replace(/^"|"$/g, "");
  // Pick the explicit "kill" action. A Radix SelectItem commits via a
  // document-level pointer guard that a synthetic pointerup does not satisfy
  // (the listbox stays open, the value silently stays "mute"), so drive the open
  // listbox with the keyboard — the path a keyboard operator takes: from the
  // focused current item (mute), ArrowDown moves to kill and Enter commits. Then
  // wait until the trigger actually reflects kill (击杀) before applying.
  await clickInPage("[data-testid='god-action-type']");
  await waitForSelector("[data-testid='god-action-type-kill']");
  await browser("press", "ArrowDown");
  await browser("press", "Enter");
  await waitForPageExpression(
    "/击杀|kill/i.test((document.querySelector(\"[data-testid='god-action-type']\")?.textContent ?? ''))",
  );
  // React controls the textareas/inputs, so set values via the native setter +
  // input event. Confirmation MUST equal the target role id to pass the gate.
  await browserEval(`
    (() => {
      const setReactValue = (el, value) => {
        const proto = Object.getPrototypeOf(el);
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        setter?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      };
      const reason = document.querySelector("[data-testid='god-action-reason']");
      const confirm = document.querySelector("[data-testid='god-action-confirmation']");
      if (reason) setReactValue(reason, "smoke kill");
      if (confirm) setReactValue(confirm, ${JSON.stringify(killTargetId)});
      return true;
    })();
  `);
  await browser("wait", "150");
  await clickInPage("[data-testid='god-action-apply']");
  await waitForSelector("[data-testid='god-action-result']");
  // The committed kill's LIVE undo affordance appears once the result panel is
  // populated (canUndo is derived from the captured kill action). Wait for it
  // rather than asserting instantly so the check is not racing React commit.
  await waitForPageExpression(
    "(() => { const b = document.querySelector(\"[data-testid='god-rollback']\"); return Boolean(b) && !b.hasAttribute('disabled'); })()",
  );
  await assertPage(
    "A committed kill exposes a LIVE (enabled) Undo this ruling button",
    "(() => { const b = document.querySelector(\"[data-testid='god-rollback']\"); return Boolean(b) && !b.hasAttribute('disabled'); })()",
  );
  await assertPage(
    "Recovery model is stated as prose (no dead mark-obsolete button)",
    "document.querySelector(\"[data-testid='god-mark-obsolete']\") === null && document.querySelector(\"[data-testid='god-obsolete-note']\") !== null",
  );
  // The committed kill refreshes the world view asynchronously (Phase 2 of
  // applyGodAction); the target's status only flips to "dead" once that lands,
  // at which point the action self-snaps to the sole valid action (revive).
  // Wait for that settled state before undoing so the rollback click is not
  // racing the refresh.
  await waitForPageExpression(
    "/复活|revive/i.test((document.querySelector(\"[data-testid='god-action-type']\")?.textContent ?? ''))",
  );
  // Undo must re-seed a revive against the SAME target through the same gate.
  await clickInPage("[data-testid='god-rollback']");
  // Wait for the seeded revive form to settle (reason populated by seedUndo)
  // rather than a fixed sleep, so the assertion never reads a half-applied state.
  await waitForPageExpression(
    "(document.querySelector(\"[data-testid='god-action-reason']\")?.value ?? '').length > 0",
  );
  await assertPage(
    "Undo seeds a revive against the same target role (routed through the gate)",
    `(() => { const target = (document.querySelector("[data-testid='god-action-target-role-id']")?.textContent ?? '').trim(); const reason = document.querySelector("[data-testid='god-action-reason']")?.value ?? ""; const action = (document.querySelector("[data-testid='god-action-type']")?.textContent ?? '').trim(); return target === ${JSON.stringify(killTargetId)} && reason.length > 0 && /复活|revive/i.test(action); })()`,
  );
  await screenshot("god-recovery.png");
  await browser("press", "Escape");
  await browser("wait", "200");
}
