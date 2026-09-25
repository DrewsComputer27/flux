// Allow-list of Task fields a client may set via PATCH /api/tasks/:id.
// Deliberately excludes: id, project_id, created_at, updated_at (immutable/server-set),
// comments (identity forgery — see addTaskComment for the only legitimate write path),
// blob_ids (set only by the blob attach/delete endpoints), and workers (computed
// server-side from status + agent_name in the PATCH handler, never from the raw body).
export const PATCHABLE_TASK_FIELDS = new Set<string>([
  'title',
  'description',
  'status',
  'depends_on',
  'epic_id',
  'agent',
  'archived',
  'priority',
  'blocked_reason',
  'acceptance_criteria',
  'guardrails',
]);
