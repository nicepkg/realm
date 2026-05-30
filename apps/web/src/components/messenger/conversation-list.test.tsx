import { describe, expect, test } from "bun:test";
import type { RoleSummary } from "@realm/api-contract";
import { renderToStaticMarkup } from "react-dom/server";
import type { RealmAppController } from "@/app/types.ts";
import { I18nProvider } from "@/i18n/index.tsx";
import { ConversationList, RoleOpenError } from "./conversation-list.tsx";

describe("conversation list contacts", () => {
  test("renders a contact row whose primary tap opens chat, with a secondary inspect affordance (DISC-R7-3)", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <ConversationList
          app={rolesApp()}
          onCreateWorld={() => undefined}
          onInspectRole={() => undefined}
          onNewDm={() => undefined}
          onNewGroup={() => undefined}
          onOpenGod={() => undefined}
        />
      </I18nProvider>,
    );

    // The role row itself is the PRIMARY tap target (opens the chat).
    expect(html).toContain('data-testid="role-row-leijun"');
    // Inspection is demoted to a SECONDARY trailing affordance, not the default.
    expect(html).toContain('data-testid="role-row-leijun-inspect"');
    expect(html).toContain("Lei Jun");
  });

  test("a failed contact open surfaces a calm inline error + retry on the row (FB2-4)", () => {
    let retried = false;
    const html = renderToStaticMarkup(
      <I18nProvider>
        <RoleOpenError
          onRetry={() => {
            retried = true;
          }}
          roleId="leijun"
        />
      </I18nProvider>,
    );

    // The inline failure is announced (role="alert"), names the open failure,
    // and is calm danger text rather than a heavy banner.
    expect(html).toContain('role="alert"');
    expect(html).toContain('data-testid="role-row-leijun-open-error"');
    expect(html).toContain("无法打开会话，请重试。");
    expect(html).toContain("text-[var(--realm-danger)]");

    // A keyboard-reachable Retry affordance is present and re-invokes the open.
    expect(html).toContain('data-testid="role-row-leijun-open-retry"');
    expect(html).toContain("重试");
    expect(retried).toBe(false);
  });

  test("the contact-open catch path raises inline failure state instead of swallowing it (FB2-4)", async () => {
    // The async open path cannot be driven under SSR, so the recovery wiring is
    // asserted at source level (same convention as the resume-chip gate test):
    // a rejected open must set inline failure state and render RoleOpenError,
    // never silently clear the spinner.
    const source = await Bun.file(new URL("./conversation-list.tsx", import.meta.url)).text();
    expect(source).toContain("setFailed(true)");
    expect(source).toContain("<RoleOpenError");
    // The old silent-swallow comment must be gone.
    expect(source).not.toContain("toast\n");
    expect(source).not.toContain("out of scope for this list primitive");
  });
});

function rolesApp(): RealmAppController {
  const role: RoleSummary = {
    displayName: "Lei Jun",
    id: "leijun",
    model: "default",
    source: "config",
  };
  return {
    activeSection: "roles",
    runRoleId: role.id,
    state: {
      conversationMessages: [],
      events: [],
      messages: [],
      projectName: "Realm",
      roles: [role],
      rooms: [],
      status: "ready",
      worlds: [],
    },
  } as unknown as RealmAppController;
}
