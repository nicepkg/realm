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
import { WorldEventPanel } from "./realm-events.tsx";
import { AppRail, ConversationHeader, ConversationList, WorldSwitcher } from "./realm-panels.tsx";
import { SettingsPanel } from "./realm-settings.tsx";
import { WorldSimulationPanel } from "./realm-simulation.tsx";
import { ProjectPatchPanel } from "./realm-workflow.tsx";
import { useRealmAppState } from "./use-realm-app-state.ts";

export function App() {
  const app = useRealmAppState();
  const showChatTools = app.activeSection === "chats";
  const showRoleTools = app.activeSection === "roles";
  const showWorldTools = app.activeSection === "worlds";
  const showGodTools = app.activeSection === "god";
  const showTrace = showChatTools || showRoleTools || showGodTools;

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
              {showChatTools || showRoleTools ? (
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
              ) : null}
              {showChatTools || showRoleTools || showWorldTools ? (
                <ContextSummary
                  eventsCount={app.state.events.length}
                  rolesCount={app.state.roles.length}
                  world={app.selectedWorld}
                  stateVersion={app.state.worldState?.version}
                />
              ) : null}
              {showChatTools ? (
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
              ) : null}
              {showGodTools ? (
                <>
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
                </>
              ) : null}
              {showWorldTools || showGodTools ? (
                <>
                  <WorldEventPanel
                    disabled={!app.selectedWorld}
                    title={app.worldEventTitle}
                    description={app.worldEventDescription}
                    path={app.worldEventPath}
                    value={app.worldEventValue}
                    conditionPath={app.worldEventConditionPath}
                    result={app.worldEventResult}
                    onTitleChange={app.setWorldEventTitle}
                    onDescriptionChange={app.setWorldEventDescription}
                    onPathChange={app.setWorldEventPath}
                    onValueChange={app.setWorldEventValue}
                    onConditionPathChange={app.setWorldEventConditionPath}
                    onTriggerManual={app.triggerManualWorldEvent}
                    onRandom={app.triggerRandomWorldEvent}
                    onTick={app.triggerWorldTick}
                    onTriggerCondition={app.triggerConditionWorldEvent}
                    onReplay={app.loadWorldEventReplay}
                  />
                  <WorldSimulationPanel
                    disabled={!app.selectedWorld}
                    ticks={app.simulationTicks}
                    maxActivations={app.simulationMaxActivations}
                    intervalMs={app.simulationIntervalMs}
                    seed={app.simulationSeed}
                    forkLabel={app.simulationForkLabel}
                    forkId={app.simulationForkId}
                    runId={app.simulationRunId}
                    result={app.simulationResult}
                    status={app.simulationStatus}
                    onTicksChange={app.setSimulationTicks}
                    onMaxActivationsChange={app.setSimulationMaxActivations}
                    onIntervalMsChange={app.setSimulationIntervalMs}
                    onSeedChange={app.setSimulationSeed}
                    onForkLabelChange={app.setSimulationForkLabel}
                    onForkIdChange={app.setSimulationForkId}
                    onRefresh={app.refreshSimulationStatus}
                    onRunTicks={app.runSimulationTicks}
                    onPause={app.pauseSimulation}
                    onResume={app.resumeSimulation}
                    onExport={app.exportSimulation}
                    onFork={app.forkSimulation}
                    onStartBackground={app.startBackgroundSimulation}
                    onStopBackground={app.stopBackgroundSimulation}
                  />
                </>
              ) : null}
              {showWorldTools ? (
                <ProjectPatchPanel
                  disabled={!app.selectedWorld}
                  roles={app.state.roles}
                  approvals={app.workflowApprovals}
                  patches={app.workflowProjectPatches}
                  requestedBy={app.workflowRequestedBy}
                  reason={app.workflowApprovalReason}
                  approvalId={app.workflowApprovalId}
                  title={app.projectPatchTitle}
                  path={app.projectPatchPath}
                  action={app.projectPatchAction}
                  content={app.projectPatchContent}
                  patchId={app.projectPatchId}
                  result={app.projectPatchResult}
                  onRequestedByChange={app.setWorkflowRequestedBy}
                  onReasonChange={app.setWorkflowApprovalReason}
                  onApprovalIdChange={app.setWorkflowApprovalId}
                  onTitleChange={app.setProjectPatchTitle}
                  onPathChange={app.setProjectPatchPath}
                  onActionChange={app.setProjectPatchAction}
                  onContentChange={app.setProjectPatchContent}
                  onPatchIdChange={app.setProjectPatchId}
                  onRequestApproval={app.requestProjectWriteApproval}
                  onApproveApproval={app.approveWorkflowApproval}
                  onProposePatch={app.proposeProjectPatch}
                  onApplyPatch={app.applyProjectPatch}
                />
              ) : null}
              {showTrace ? <TracePanel events={app.traceEvents} /> : null}
              {showRoleTools ? (
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
              ) : null}
            </>
          )}
        </div>
      </aside>
    </main>
  );
}
