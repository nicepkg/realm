import type { RoleSummary, WorkflowApproval, WorkflowProjectPatch } from "@realm/api-contract";
import { CheckCircle2, FileCode2, ShieldCheck } from "lucide-react";
import { Button } from "./button.tsx";
import { PanelTitle } from "./realm-atoms.tsx";

export type ProjectPatchAction = "create" | "update" | "delete";

export function ProjectPatchPanel({
  action,
  approvalId,
  approvals,
  content,
  disabled,
  onActionChange,
  onApprovalIdChange,
  onApplyPatch,
  onApproveApproval,
  onContentChange,
  onPathChange,
  onPatchIdChange,
  onProposePatch,
  onReasonChange,
  onRequestApproval,
  onRequestedByChange,
  onTitleChange,
  patchId,
  patches,
  path,
  reason,
  requestedBy,
  result,
  roles,
  title,
}: {
  disabled: boolean;
  roles: RoleSummary[];
  approvals: WorkflowApproval[];
  patches: WorkflowProjectPatch[];
  requestedBy: string;
  reason: string;
  approvalId: string;
  title: string;
  path: string;
  action: ProjectPatchAction;
  content: string;
  patchId: string;
  result: string;
  onRequestedByChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onApprovalIdChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  onPathChange: (value: string) => void;
  onActionChange: (value: ProjectPatchAction) => void;
  onContentChange: (value: string) => void;
  onPatchIdChange: (value: string) => void;
  onRequestApproval: () => void;
  onApproveApproval: () => void;
  onProposePatch: () => void;
  onApplyPatch: () => void;
}) {
  const selectedApproval = approvals.find((approval) => approval.id === approvalId);
  const selectedPatch = patches.find((patch) => patch.id === patchId);
  const approved = selectedApproval?.status === "approved";

  return (
    <section data-testid="project-patch-panel">
      <PanelTitle icon={<FileCode2 size={16} aria-hidden="true" />} title="Project Patch" />
      <div className="mt-3 space-y-3 rounded-md border border-realm-border bg-[#fafafa] p-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs text-zinc-500">
            Requested by
            <select
              className="mt-1 w-full rounded-md border border-realm-border bg-white px-2 py-1.5 text-sm text-zinc-900"
              name="workflow-requested-by"
              value={requestedBy}
              onChange={(event) => onRequestedByChange(event.target.value)}
              data-testid="workflow-requested-by"
            >
              <option value="owner">Boss</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-zinc-500">
            Action
            <select
              className="mt-1 w-full rounded-md border border-realm-border bg-white px-2 py-1.5 text-sm text-zinc-900"
              name="project-patch-action"
              value={action}
              onChange={(event) => onActionChange(event.target.value as ProjectPatchAction)}
              data-testid="project-patch-action"
            >
              <option value="create">Create</option>
              <option value="update">Update</option>
              <option value="delete">Delete</option>
            </select>
          </label>
        </div>

        <label className="block text-xs text-zinc-500">
          Approval reason
          <input
            className="mt-1 w-full rounded-md border border-realm-border bg-white px-2 py-1.5 text-sm text-zinc-900"
            name="workflow-approval-reason"
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            data-testid="workflow-approval-reason"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled || !requestedBy || !reason.trim()}
            onClick={onRequestApproval}
            data-testid="workflow-request-approval"
          >
            <ShieldCheck size={14} aria-hidden="true" />
            Request Approval
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled || !selectedApproval || selectedApproval.status !== "pending"}
            onClick={onApproveApproval}
            data-testid="workflow-approve-approval"
          >
            <CheckCircle2 size={14} aria-hidden="true" />
            Approve
          </Button>
        </div>

        <label className="block text-xs text-zinc-500">
          Approval
          <select
            className="mt-1 w-full rounded-md border border-realm-border bg-white px-2 py-1.5 text-sm text-zinc-900"
            name="workflow-approval-id"
            value={approvalId}
            onChange={(event) => onApprovalIdChange(event.target.value)}
            data-testid="workflow-approval-id"
          >
            <option value="">No approval selected</option>
            {approvals.map((approval) => (
              <option key={approval.id} value={approval.id}>
                {approval.status} · {approval.capability} · {approval.requestedBy}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs text-zinc-500">
          Patch title
          <input
            className="mt-1 w-full rounded-md border border-realm-border bg-white px-2 py-1.5 text-sm text-zinc-900"
            name="project-patch-title"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            data-testid="project-patch-title"
          />
        </label>
        <label className="block text-xs text-zinc-500">
          Project path
          <input
            className="mt-1 w-full rounded-md border border-realm-border bg-white px-2 py-1.5 text-sm text-zinc-900"
            name="project-patch-path"
            value={path}
            onChange={(event) => onPathChange(event.target.value)}
            data-testid="project-patch-path"
          />
        </label>
        {action !== "delete" ? (
          <label className="block text-xs text-zinc-500">
            Next content
            <textarea
              className="mt-1 min-h-24 w-full resize-y rounded-md border border-realm-border bg-white px-2 py-1.5 font-mono text-xs text-zinc-900"
              name="project-patch-content"
              value={content}
              onChange={(event) => onContentChange(event.target.value)}
              data-testid="project-patch-content"
            />
          </label>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled || !title.trim() || !path.trim() || !requestedBy}
            onClick={onProposePatch}
            data-testid="project-patch-propose"
          >
            Propose Patch
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={
              disabled || !approved || !selectedPatch || selectedPatch.status !== "proposed"
            }
            onClick={onApplyPatch}
            data-testid="project-patch-apply"
          >
            Apply Patch
          </Button>
        </div>

        <label className="block text-xs text-zinc-500">
          Patch
          <select
            className="mt-1 w-full rounded-md border border-realm-border bg-white px-2 py-1.5 text-sm text-zinc-900"
            name="project-patch-id"
            value={patchId}
            onChange={(event) => onPatchIdChange(event.target.value)}
            data-testid="project-patch-id"
          >
            <option value="">No patch selected</option>
            {patches.map((patch) => (
              <option key={patch.id} value={patch.id}>
                {patch.status} · {patch.title} · {patch.files.length} file
              </option>
            ))}
          </select>
        </label>

        {result ? (
          <p
            className="rounded-md bg-white px-2 py-1.5 text-xs text-zinc-500"
            data-testid="project-patch-result"
          >
            {result}
          </p>
        ) : null}
      </div>
    </section>
  );
}
