package model

// ActionSpec describes one deterministic side-effect kind an action node can
// perform. Params are rendered from context with {{key}} templates; Produces
// are the context keys the action writes (fixed per kind).
type ActionSpec struct {
	RequiredParams []string
	OptionalParams []string
	Produces       []string
	NeedsIssue     bool // requires issue_identifier in context (Linear actions)
	NeedsRepo      bool // runs against a git repository, so the pipeline must have a working directory (git/GitHub actions)
}

var ActionSpecs = map[string]ActionSpec{
	"git_create_branch": {RequiredParams: []string{"name"}, Produces: []string{"branch"}, NeedsRepo: true},
	"git_commit":        {RequiredParams: []string{"message"}, Produces: []string{"committed"}, NeedsRepo: true},
	"git_push":          {NeedsRepo: true},
	"gh_open_pr":        {RequiredParams: []string{"title"}, OptionalParams: []string{"body"}, Produces: []string{"pr_number", "pr_url"}, NeedsRepo: true},
	"gh_pr_comment":     {RequiredParams: []string{"body"}, NeedsRepo: true},
	"gh_pr_ready":       {NeedsRepo: true},
	"linear_comment":    {RequiredParams: []string{"body"}, NeedsIssue: true},
	"linear_set_status": {RequiredParams: []string{"status"}, NeedsIssue: true},
	"linear_append_description": {RequiredParams: []string{"text"}, NeedsIssue: true},
}
