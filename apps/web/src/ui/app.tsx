import { BuilderPanel } from "./realm-builders.tsx";
import { ChatHeader, MessageComposer, MessageTimeline } from "./realm-chat.tsx";
import {
  AdminStatePatchPanel,
  ContextPanelHeader,
  ContextSummary,
  CreateRoomPanel,
  GodActionPanel,
  RoleRunPanel,
  TracePanel,
} from "./realm-context.tsx";
import { AppRail, ConversationHeader, ConversationList, WorldSwitcher } from "./realm-panels.tsx";
import { SettingsPanel } from "./realm-settings.tsx";
import { useRealmAppState } from "./use-realm-app-state.ts";

export function App() {
  const app = useRealmAppState();

  return (
    <main
      className="grid h-screen max-h-screen overflow-hidden bg-[#f5f5f7] text-zinc-950 lg:grid-cols-[64px_296px_minmax(0,1fr)] xl:grid-cols-[64px_312px_minmax(0,1fr)_360px]"
      data-testid="realm-shell"
    >
      <AppRail activeSection={app.activeSection} onSelectSection={app.setActiveSection} />

      <aside
        className="hidden min-h-0 border-realm-border border-r bg-[#f7f7f8] md:flex md:flex-col"
        data-testid="conversation-sidebar"
      >
        <ConversationHeader projectName={app.state.projectName} />
        <WorldSwitcher
          selectedWorldId={app.selectedWorld?.id}
          worlds={app.state.worlds}
          onSelectWorld={app.selectWorld}
        />
        <ConversationList
          conversations={app.conversations}
          selectedRoomId={app.selectedRoom?.id}
          onSelectRoom={app.selectRoom}
        />
      </aside>

      <section className="flex min-w-0 flex-col bg-[#f5f5f7]" data-testid="chat-panel">
        <ChatHeader
          onOpenSettings={() => app.setActiveSection("settings")}
          room={app.selectedRoom}
          roleCount={app.selectedWorld?.roleIds.length ?? app.state.roles.length}
          turnStatus={app.turnStatus}
          world={app.selectedWorld}
        />
        <MessageTimeline
          messages={app.state.messages}
          roles={app.state.roles}
          status={app.state.status}
          error={app.state.error}
        />
        <MessageComposer
          draft={app.draft}
          identity={app.identity}
          identities={app.identities}
          disabled={!app.selectedRoom}
          onDraftChange={app.setDraft}
          onIdentityChange={app.setIdentity}
          onSubmit={app.sendMessage}
        />
      </section>

      <aside
        className="hidden min-h-0 border-realm-border border-l bg-white xl:flex xl:flex-col"
        data-testid="context-panel"
      >
        <ContextPanelHeader room={app.selectedRoom} world={app.selectedWorld} />
        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
          {app.activeSection === "settings" ? (
            <SettingsPanel client={app.client} onSaved={() => void app.reload()} />
          ) : (
            <>
              <RoleRunPanel
                roles={app.state.roles}
                selectedRoleId={app.runRoleId}
                selectedRole={app.selectedRole}
                selectedRoom={app.selectedRoom}
                status={app.turnStatus}
                error={app.state.error}
                onCancel={app.cancelActiveTurn}
                onRoleChange={app.setRunRoleId}
                onRun={app.runSelectedRoleTurn}
              />
              <ContextSummary
                eventsCount={app.state.events.length}
                rolesCount={app.state.roles.length}
                world={app.selectedWorld}
                stateVersion={app.state.worldState?.version}
              />
              <CreateRoomPanel
                type={app.roomType}
                name={app.roomName}
                memberText={app.roomMembers}
                roles={app.state.roles}
                disabled={!app.selectedWorld}
                onTypeChange={app.setRoomType}
                onNameChange={app.setRoomName}
                onMemberTextChange={app.setRoomMembers}
                onCreate={app.createRoom}
              />
              <AdminStatePatchPanel
                path={app.statePatchPath}
                value={app.statePatchValue}
                reason={app.statePatchReason}
                result={app.statePatchResult}
                disabled={!app.selectedWorld}
                onPathChange={app.setStatePatchPath}
                onValueChange={app.setStatePatchValue}
                onReasonChange={app.setStatePatchReason}
                onApply={app.applyAdminStatePatch}
              />
              <GodActionPanel
                action={app.godAction}
                roles={app.state.roles}
                targetRoleId={app.godActionRoleId}
                reason={app.godActionReason}
                result={app.godActionResult}
                disabled={!app.selectedWorld}
                onActionChange={app.setGodAction}
                onRoleChange={app.setGodActionRoleId}
                onReasonChange={app.setGodActionReason}
                onApply={app.applyGodAction}
              />
              <TracePanel events={app.traceEvents} />
              <BuilderPanel
                roleName={app.roleName}
                worldName={app.worldName}
                worldMode={app.worldMode}
                worldRoles={app.worldRoles}
                assistantGoal={app.assistantGoal}
                proposal={app.proposal}
                onRoleNameChange={app.setRoleName}
                onWorldNameChange={app.setWorldName}
                onWorldModeChange={app.setWorldMode}
                onWorldRolesChange={app.setWorldRoles}
                onAssistantGoalChange={app.setAssistantGoal}
                onProposeRole={app.proposeRole}
                onProposeWorld={app.proposeWorld}
                onProposeAssistant={app.proposeAssistantPatch}
                onApplyProposal={app.applyProposal}
              />
            </>
          )}
        </div>
      </aside>
    </main>
  );
}
