import type { RealmEvent, RoleSummary, Room, WorldSummary } from "@realm/api-contract";
import type { RealmHttpClient } from "@realm/client-sdk";
import { useMemo, useState } from "react";
import { latestProjectPatches, latestWorkflowApprovals } from "./realm-view-model.ts";
import type { ProjectPatchAction } from "./realm-workflow.tsx";

export type ProjectPatchWorkflowInput = {
  client: RealmHttpClient;
  events: RealmEvent[];
  roles: RoleSummary[];
  selectedRoom?: Room;
  selectedWorld?: WorldSummary;
  reload: (preferredWorldId?: string, preferredRoomId?: string) => Promise<void>;
};

export function useProjectPatchWorkflow(input: ProjectPatchWorkflowInput) {
  const [workflowRequestedBy, setWorkflowRequestedBy] = useState("engineer");
  const [workflowApprovalReason, setWorkflowApprovalReason] = useState(
    "Approve a scoped project patch from the Web UI.",
  );
  const [workflowApprovalId, setWorkflowApprovalId] = useState("");
  const [projectPatchTitle, setProjectPatchTitle] = useState("Create workflow note");
  const [projectPatchPath, setProjectPatchPath] = useState("docs/realm-workflow-note.md");
  const [projectPatchAction, setProjectPatchAction] = useState<ProjectPatchAction>("create");
  const [projectPatchContent, setProjectPatchContent] = useState(
    "# Realm workflow note\n\nCreated from the Realm Web UI project patch panel.\n",
  );
  const [projectPatchId, setProjectPatchId] = useState("");
  const [projectPatchResult, setProjectPatchResult] = useState("");

  const workflowApprovals = useMemo(
    () =>
      latestWorkflowApprovals(input.events).filter(
        (approval) => approval.worldId === input.selectedWorld?.id,
      ),
    [input.events, input.selectedWorld?.id],
  );
  const workflowProjectPatches = useMemo(
    () =>
      latestProjectPatches(input.events).filter(
        (patch) => patch.worldId === input.selectedWorld?.id,
      ),
    [input.events, input.selectedWorld?.id],
  );
  const requestedBy = resolveRequestedBy(workflowRequestedBy, input.roles);

  async function requestProjectWriteApproval() {
    if (!input.selectedWorld || !workflowApprovalReason.trim()) {
      return;
    }
    const response = await input.client.requestWorkflowApproval(input.selectedWorld.id, {
      capability: "fs.project.write",
      requestedBy,
      reason: workflowApprovalReason.trim(),
      idempotencyKey: `web-workflow-approval-${Date.now()}`,
    });
    setWorkflowApprovalId(response.approval.id);
    setProjectPatchResult(`Requested ${response.approval.id}`);
    await input.reload(input.selectedWorld.id, input.selectedRoom?.id);
  }

  async function approveWorkflowApproval() {
    if (!input.selectedWorld || !workflowApprovalId) {
      return;
    }
    const approval = workflowApprovals.find((candidate) => candidate.id === workflowApprovalId);
    if (!approval) {
      return;
    }
    const response = await input.client.decideWorkflowApproval(
      input.selectedWorld.id,
      approval.id,
      {
        approvalId: approval.id,
        capability: approval.capability,
        requestedBy: approval.requestedBy,
        decision: "approved",
        reason: "Approved from the Web UI project patch panel.",
        requestReason: approval.reason,
        idempotencyKey: `web-workflow-approval-decision-${Date.now()}`,
      },
    );
    setWorkflowApprovalId(response.approval.id);
    setProjectPatchResult(`Approved ${response.approval.id}`);
    await input.reload(input.selectedWorld.id, input.selectedRoom?.id);
  }

  async function proposeProjectPatch() {
    if (!input.selectedWorld || !projectPatchTitle.trim() || !projectPatchPath.trim()) {
      return;
    }
    const approval = workflowApprovals.find((candidate) => candidate.id === workflowApprovalId);
    const response = await input.client.proposeProjectPatch(input.selectedWorld.id, {
      title: projectPatchTitle.trim(),
      summary: "Project patch proposed from the Web UI.",
      requestedBy,
      approvalId: approval?.status === "approved" ? approval.id : undefined,
      files: [
        {
          path: projectPatchPath.trim(),
          action: projectPatchAction,
          nextContent: projectPatchAction === "delete" ? null : projectPatchContent,
        },
      ],
      idempotencyKey: `web-project-patch-${Date.now()}`,
    });
    setProjectPatchId(response.projectPatch.id);
    setProjectPatchResult(`Proposed ${response.projectPatch.id}`);
    await input.reload(input.selectedWorld.id, input.selectedRoom?.id);
  }

  async function applyProjectPatch() {
    if (!input.selectedWorld || !projectPatchId || !workflowApprovalId) {
      return;
    }
    const response = await input.client.applyProjectPatch(input.selectedWorld.id, projectPatchId, {
      approvalId: workflowApprovalId,
      appliedBy: "owner",
      idempotencyKey: `web-project-patch-apply-${Date.now()}`,
    });
    setProjectPatchResult(`Applied ${response.projectPatch.id}`);
    await input.reload(input.selectedWorld.id, input.selectedRoom?.id);
  }

  return {
    applyProjectPatch,
    approveWorkflowApproval,
    projectPatchAction,
    projectPatchContent,
    projectPatchId,
    projectPatchPath,
    projectPatchResult,
    projectPatchTitle,
    proposeProjectPatch,
    requestProjectWriteApproval,
    setProjectPatchAction,
    setProjectPatchContent,
    setProjectPatchId,
    setProjectPatchPath,
    setProjectPatchTitle,
    setWorkflowApprovalId,
    setWorkflowApprovalReason,
    setWorkflowRequestedBy,
    workflowApprovalId,
    workflowApprovalReason,
    workflowApprovals,
    workflowProjectPatches,
    workflowRequestedBy: requestedBy,
  };
}

function resolveRequestedBy(value: string, roles: RoleSummary[]): string {
  if (value === "owner" || roles.some((role) => role.id === value)) {
    return value;
  }
  return roles.find((role) => role.id === "engineer")?.id ?? roles[0]?.id ?? "owner";
}
