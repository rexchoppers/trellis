export interface ActionParamSpec {
  key: string
  label: string
  placeholder?: string
  multiline?: boolean
}

export interface ActionSpec {
  label: string
  params: ActionParamSpec[]
  produces: string[]
  needsRepo?: boolean // runs against a git repo, so the pipeline needs a working directory
}

export const ACTION_SPECS: Record<string, ActionSpec> = {
  git_create_branch: {
    label: 'Git: create branch',
    params: [{ key: 'name', label: 'Branch name', placeholder: '{{issue_identifier}} {{issue_title}}' }],
    produces: ['branch'],
    needsRepo: true,
  },
  git_commit: {
    label: 'Git: commit all',
    params: [{ key: 'message', label: 'Commit message', placeholder: 'feat: {{issue_title}} ({{issue_identifier}})' }],
    produces: ['committed'],
    needsRepo: true,
  },
  git_push: { label: 'Git: push branch', params: [], produces: [], needsRepo: true },
  gh_open_pr: {
    label: 'GitHub: open draft PR',
    params: [
      { key: 'title', label: 'PR title', placeholder: '{{issue_identifier}}: {{issue_title}}' },
      { key: 'body', label: 'PR body', multiline: true },
    ],
    produces: ['pr_number', 'pr_url'],
    needsRepo: true,
  },
  gh_pr_comment: {
    label: 'GitHub: comment on PR',
    params: [{ key: 'body', label: 'Comment body', multiline: true }],
    produces: [],
    needsRepo: true,
  },
  gh_pr_ready: { label: 'GitHub: mark PR ready', params: [], produces: [], needsRepo: true },
  linear_comment: {
    label: 'Linear: comment on issue',
    params: [{ key: 'body', label: 'Comment body', multiline: true }],
    produces: [],
  },
  linear_set_status: {
    label: 'Linear: set status',
    params: [{ key: 'status', label: 'Status name', placeholder: 'In Review' }],
    produces: [],
  },
  linear_append_description: {
    label: 'Linear: append to description',
    params: [{ key: 'text', label: 'Text to append', multiline: true }],
    produces: [],
  },
}
