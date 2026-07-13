package model

const (
	StatusPending      = "pending"
	StatusRunning      = "running"
	StatusWaitingHuman = "waiting_human"
	StatusDone         = "done"
	StatusFailed       = "failed"
)

const (
	NodeTypeAgent      = "agent"
	NodeTypeHumanInput = "human_input"
	NodeTypeApproval   = "approval"
	NodeTypeAction     = "action"
	NodeTypeLinearWait = "linear_wait"
)

type Graph struct {
	Nodes []Node `json:"nodes"`
	Edges []Edge `json:"edges"`
}

type Node struct {
	ID       string   `json:"id"`
	Type     string   `json:"type"`
	Position Position `json:"position"`
	Data     NodeData `json:"data"`
}

type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type NodeData struct {
	Name    string            `json:"name"`
	Prompt  string            `json:"prompt"`
	Inputs  []string          `json:"inputs"`
	Outputs []string          `json:"outputs"`
	Tools   string            `json:"tools,omitempty"`
	Model   string            `json:"model,omitempty"` // claude CLI --model (e.g. opus/sonnet/haiku); empty inherits the CLI default
	Action  string            `json:"action,omitempty"`
	Params  map[string]string `json:"params,omitempty"`
}

// Edge connects nodes. SourceHandle "changes" marks a loop-back edge from a
// gate node (approval / linear_wait) to an earlier node, taken when the human
// requests changes; every other edge is part of the forward walk.
type Edge struct {
	ID           string `json:"id"`
	Source       string `json:"source"`
	Target       string `json:"target"`
	SourceHandle string `json:"sourceHandle,omitempty"`
}

type PipelineConfig struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Workdir     string `json:"workdir"`
	Graph       Graph  `json:"graph"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
}

type PipelineListItem struct {
	ID            int64   `json:"id"`
	Name          string  `json:"name"`
	Description   string  `json:"description"`
	Workdir       string  `json:"workdir"`
	LastRunID     *int64  `json:"last_run_id"`
	LastRunStatus *string `json:"last_run_status"`
	UpdatedAt     string  `json:"updated_at"`
}

type PipelineRun struct {
	ID               int64          `json:"id"`
	PipelineConfigID int64          `json:"pipeline_config_id"`
	Status           string         `json:"status"`
	CurrentNodeID    string         `json:"current_node_id"`
	Context          map[string]any `json:"context"`
	CreatedAt        string         `json:"created_at"`
	UpdatedAt        string         `json:"updated_at"`
}

type NodeRun struct {
	ID            int64          `json:"id"`
	PipelineRunID int64          `json:"pipeline_run_id"`
	NodeID        string         `json:"node_id"`
	NodeType      string         `json:"node_type"`
	Status        string         `json:"status"`
	Input         map[string]any `json:"input"`
	Output        map[string]any `json:"output"`
	Log           string         `json:"log"`
	CreatedAt     string         `json:"created_at"`
	UpdatedAt     string         `json:"updated_at"`
}
