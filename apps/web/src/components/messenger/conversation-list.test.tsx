import { describe, expect, test } from "bun:test";
import type { RoleSummary } from "@realm/api-contract";
import { renderToStaticMarkup } from "react-dom/server";
import type { RealmAppController } from "@/app/types.ts";
import { I18nProvider } from "@/i18n/index.tsx";
import { ConversationList } from "./conversation-list.tsx";

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
