package engine

import (
	"context"
	"errors"
	"fmt"
	"log"
	"maps"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"github.com/rexchoppers/trellis/internal/model"
	"github.com/rexchoppers/trellis/internal/store"
)

var ErrNotWaiting = errors.New("run is not waiting for human input")

const (
	// MaxGateLoops is how many times a single gate node may run in one run
	// before the runaway guard fails it (each loop re-runs agents = tokens).
	MaxGateLoops = 5
	// MaxNodeRunsPerRun is the absolute backstop for a single run.
	MaxNodeRunsPerRun = 200
	// gateClassifierModel keeps the ambiguous-reply classification (a trivial
	// one-word decision) off the expensive default model.
	gateClassifierModel = "haiku"
)

// Explicit change-request phrasing wins outright; only ambiguous replies go
// to the model, which is biased toward approve (same as the old pipeline).
var changeRequestMarkers = []string{
	"request change", "requesting change", "changes requested", "change request",
	"send back", "sending back", "needs rework", "please redo", "please revise",
	"start over", "try again", "redo it", "not approved",
}

func (e *Engine) classifyGateReply(reply string) string {
	lower := strings.ToLower(reply)
	for _, marker := range changeRequestMarkers {
		if strings.Contains(lower, marker) {
			return "changes"
		}
	}
	prompt := fmt.Sprintf(
		"At a pipeline gate an agent posted its work, possibly asked questions, and asked for approval or changes. The human replied:\n\n%s\n\n"+
			"Classify their intent. It is 'changes' ONLY if they ask for the work to be done differently. "+
			"If they approve, agree, answer the questions, or say yes / ok / looks good / proceed, it is 'approve'. "+
			"When in doubt, choose approve. Reply with exactly one word: approve or changes.",
		reply,
	)
	out, err := e.agent.Run(context.Background(), prompt, "", gateClassifierModel, e.DefaultWorkdir, nil)
	if err != nil {
		log.Printf("gate classification failed, defaulting to approve: %v", err)
		return "approve"
	}
	if strings.Contains(strings.ToLower(out), "change") {
		return "changes"
	}
	return "approve"
}

type Engine struct {
	store *store.Store
	agent AgentRunner

	// DefaultWorkdir is where agents and git actions run when a pipeline has
	// no working directory of its own (trellis's launch dir / -workdir flag).
	DefaultWorkdir string
	// Actions executes action nodes (git/GitHub/Linear side effects).
	Actions *ActionRunner
	// Notify, when set, is called after every persisted state change so the
	// API layer can push updates over SSE.
	Notify func(runID int64)
}

// workdirFor resolves a run's working directory: the pipeline's own setting
// (with ~ expanded) or the engine default, and it must exist.
func (e *Engine) workdirFor(pipeline model.PipelineConfig) (string, error) {
	dir := strings.TrimSpace(pipeline.Workdir)
	if dir == "" {
		return e.DefaultWorkdir, nil
	}
	if dir == "~" || strings.HasPrefix(dir, "~/") {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		dir = filepath.Join(home, strings.TrimPrefix(strings.TrimPrefix(dir, "~"), "/"))
	}
	info, err := os.Stat(dir)
	if err != nil || !info.IsDir() {
		return "", fmt.Errorf("pipeline working directory %q does not exist", pipeline.Workdir)
	}
	return dir, nil
}

func New(s *store.Store, agent AgentRunner) *Engine {
	return &Engine{store: s, agent: agent}
}

func (e *Engine) notify(runID int64) {
	if e.Notify != nil {
		e.Notify(runID)
	}
}

func (e *Engine) Start(runID int64) error {
	run, err := e.store.GetRun(runID)
	if err != nil {
		return err
	}
	pipeline, err := e.store.GetPipeline(run.PipelineConfigID)
	if err != nil {
		return err
	}
	if err := pipeline.Graph.Validate(slices.Collect(maps.Keys(run.Context))...); err != nil {
		return fmt.Errorf("pipeline is not runnable: %w", err)
	}
	if pipeline.Graph.NeedsRepo() && strings.TrimSpace(pipeline.Workdir) == "" {
		return fmt.Errorf("pipeline is not runnable: working directory is required because this pipeline has a git or GitHub action")
	}
	if _, err := e.workdirFor(pipeline); err != nil {
		return fmt.Errorf("pipeline is not runnable: %w", err)
	}
	ok, err := e.store.TransitionRunStatus(runID, model.StatusPending, model.StatusRunning)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("run %d has already been started", runID)
	}
	e.notify(runID)
	go e.execute(runID)
	return nil
}

func (e *Engine) Resume(runID int64, decision, response string) error {
	run, err := e.store.GetRun(runID)
	if err != nil {
		return err
	}
	if run.Status != model.StatusWaitingHuman {
		return ErrNotWaiting
	}
	nodeRun, err := e.store.GetWaitingNodeRun(runID)
	if err != nil {
		return ErrNotWaiting
	}
	pipeline, err := e.store.GetPipeline(run.PipelineConfigID)
	if err != nil {
		return err
	}
	node, err := pipeline.Graph.NodeByID(nodeRun.NodeID)
	if err != nil {
		return fmt.Errorf("waiting node is gone from the pipeline graph: %w", err)
	}
	if node.Type == model.NodeTypeApproval &&
		decision != "approve" && decision != "reject" && decision != "request_changes" {
		return fmt.Errorf("approval decision must be approve, reject or request_changes, got %q", decision)
	}

	ok, err := e.store.TransitionRunStatus(runID, model.StatusWaitingHuman, model.StatusRunning)
	if err != nil {
		return err
	}
	if !ok {
		return ErrNotWaiting
	}
	run.Status = model.StatusRunning

	var jumpTarget *model.Node
	switch node.Type {
	case model.NodeTypeHumanInput, model.NodeTypeLinearWait:
		for _, key := range node.Data.Outputs {
			run.Context[key] = response
		}
		gateDecision := ""
		changesTarget, err := pipeline.Graph.ChangesTarget(node.ID)
		if err != nil {
			return err
		}
		if changesTarget != nil {
			gateDecision = e.classifyGateReply(response)
			if gateDecision == "changes" {
				jumpTarget = changesTarget
			}
		}
		if err := e.store.FinishNodeRun(nodeRun.ID, model.StatusDone, map[string]any{"response": response, "decision": gateDecision}); err != nil {
			return err
		}
	case model.NodeTypeApproval:
		value := decision
		if response != "" {
			value = decision + ": " + response
		}
		for _, key := range node.Data.Outputs {
			run.Context[key] = value
		}
		if err := e.store.FinishNodeRun(nodeRun.ID, model.StatusDone, map[string]any{"decision": decision, "response": response}); err != nil {
			return err
		}
		if decision == "reject" {
			run.Status = model.StatusFailed
			if err := e.store.UpdateRun(run); err != nil {
				return err
			}
			e.notify(runID)
			return nil
		}
		if decision == "request_changes" {
			changesTarget, err := pipeline.Graph.ChangesTarget(node.ID)
			if err != nil {
				return err
			}
			jumpTarget = changesTarget
		}
	default:
		return fmt.Errorf("node %q of type %q cannot be resumed", node.Data.Name, node.Type)
	}

	if jumpTarget != nil {
		nodeRuns, err := e.store.ListNodeRuns(runID)
		if err != nil {
			return err
		}
		gateRuns := 0
		for _, past := range nodeRuns {
			if past.NodeID == node.ID {
				gateRuns++
			}
		}
		if gateRuns >= MaxGateLoops {
			e.failRun(run, fmt.Errorf("gate %q has run %d times; stopping the loop so it cannot burn tokens", node.Data.Name, gateRuns))
			return nil
		}
		predecessor, err := pipeline.Graph.ForwardPredecessor(jumpTarget.ID)
		if err != nil {
			return err
		}
		if predecessor == nil {
			run.CurrentNodeID = ""
		} else {
			run.CurrentNodeID = predecessor.ID
		}
	}

	if err := e.store.UpdateRun(run); err != nil {
		return err
	}
	e.notify(runID)
	go e.execute(runID)
	return nil
}

// execute walks the graph from the run's current position until the pipeline
// finishes, fails, or pauses on a human node. A pause is just persisted state:
// the goroutine returns and Resume spawns a fresh one later.
func (e *Engine) execute(runID int64) {
	for {
		run, err := e.store.GetRun(runID)
		if err != nil {
			log.Printf("run %d: %v", runID, err)
			return
		}
		pipeline, err := e.store.GetPipeline(run.PipelineConfigID)
		if err != nil {
			e.failRun(run, err)
			return
		}
		if past, err := e.store.ListNodeRuns(runID); err == nil && len(past) >= MaxNodeRunsPerRun {
			e.failRun(run, fmt.Errorf("run has executed %d nodes; stopping (runaway guard)", len(past)))
			return
		}
		workdir, err := e.workdirFor(pipeline)
		if err != nil {
			e.failRun(run, err)
			return
		}

		var node *model.Node
		if run.CurrentNodeID == "" {
			node, err = pipeline.Graph.StartNode()
		} else {
			node, err = pipeline.Graph.NextNode(run.CurrentNodeID)
		}
		if err != nil {
			e.failRun(run, err)
			return
		}
		if node == nil {
			run.Status = model.StatusDone
			e.persist(run)
			return
		}

		input := contextSubset(run.Context, node.Data.Inputs)
		switch node.Type {
		case model.NodeTypeAgent:
			nodeRun, err := e.store.CreateNodeRun(runID, node.ID, node.Type, model.StatusRunning, input)
			if err != nil {
				e.failRun(run, err)
				return
			}
			run.CurrentNodeID = node.ID
			run.Status = model.StatusRunning
			e.persist(run)

			progress := func(chunk string) {
				if err := e.store.AppendNodeRunLog(nodeRun.ID, chunk); err != nil {
					log.Printf("run %d: append node log: %v", runID, err)
					return
				}
				e.notify(runID)
			}
			output, agentErr := e.agent.Run(context.Background(), RenderPrompt(node.Data.Prompt, node.Data.Inputs, run.Context), node.Data.Tools, node.Data.Model, workdir, progress)
			if agentErr != nil {
				if err := e.store.FinishNodeRun(nodeRun.ID, model.StatusFailed, map[string]any{"error": agentErr.Error()}); err != nil {
					log.Printf("run %d: finish node run: %v", runID, err)
				}
				run.Status = model.StatusFailed
				e.persist(run)
				return
			}
			for _, key := range node.Data.Outputs {
				run.Context[key] = output
			}
			if err := e.store.FinishNodeRun(nodeRun.ID, model.StatusDone, map[string]any{"result": output}); err != nil {
				e.failRun(run, err)
				return
			}
			e.persist(run)

		case model.NodeTypeAction:
			if e.Actions == nil {
				e.failRun(run, fmt.Errorf("action node %q: no action runner configured", node.Data.Name))
				return
			}
			rendered := map[string]string{}
			input = map[string]any{"action": node.Data.Action}
			var renderErr error
			for param, value := range node.Data.Params {
				rendered[param], renderErr = RenderTemplate(value, run.Context)
				if renderErr != nil {
					break
				}
				input[param] = rendered[param]
			}
			if renderErr != nil {
				e.failRun(run, fmt.Errorf("action node %q: %w", node.Data.Name, renderErr))
				return
			}
			nodeRun, err := e.store.CreateNodeRun(runID, node.ID, node.Type, model.StatusRunning, input)
			if err != nil {
				e.failRun(run, err)
				return
			}
			run.CurrentNodeID = node.ID
			run.Status = model.StatusRunning
			e.persist(run)

			issueRef, _ := run.Context["issue_identifier"].(string)
			outputs, actionErr := e.Actions.Run(context.Background(), node.Data.Action, rendered, issueRef, workdir)
			if actionErr != nil {
				if err := e.store.FinishNodeRun(nodeRun.ID, model.StatusFailed, map[string]any{"error": actionErr.Error()}); err != nil {
					log.Printf("run %d: finish node run: %v", runID, err)
				}
				run.Status = model.StatusFailed
				e.persist(run)
				return
			}
			if outputs == nil {
				outputs = map[string]any{}
			}
			for key, value := range outputs {
				run.Context[key] = value
			}
			if err := e.store.FinishNodeRun(nodeRun.ID, model.StatusDone, outputs); err != nil {
				e.failRun(run, err)
				return
			}
			e.persist(run)

		case model.NodeTypeLinearWait:
			if e.Actions == nil || e.Actions.Linear == nil {
				e.failRun(run, fmt.Errorf("linear_wait node %q: LINEAR_API_KEY is not configured", node.Data.Name))
				return
			}
			issueRef, _ := run.Context["issue_identifier"].(string)
			comments, err := e.Actions.Linear.ListComments(context.Background(), issueRef)
			if err != nil {
				e.failRun(run, err)
				return
			}
			marker := ""
			for _, comment := range comments {
				if comment.CreatedAt > marker {
					marker = comment.CreatedAt
				}
			}
			input["awaiting_since"] = marker
			if _, err := e.store.CreateNodeRun(runID, node.ID, node.Type, model.StatusWaitingHuman, input); err != nil {
				e.failRun(run, err)
				return
			}
			run.CurrentNodeID = node.ID
			run.Status = model.StatusWaitingHuman
			e.persist(run)
			return

		case model.NodeTypeHumanInput, model.NodeTypeApproval:
			if _, err := e.store.CreateNodeRun(runID, node.ID, node.Type, model.StatusWaitingHuman, input); err != nil {
				e.failRun(run, err)
				return
			}
			run.CurrentNodeID = node.ID
			run.Status = model.StatusWaitingHuman
			e.persist(run)
			return

		default:
			e.failRun(run, fmt.Errorf("node %q has unknown type %q", node.Data.Name, node.Type))
			return
		}
	}
}

func (e *Engine) persist(run model.PipelineRun) {
	if err := e.store.UpdateRun(run); err != nil {
		log.Printf("run %d: persist: %v", run.ID, err)
	}
	e.notify(run.ID)
}

func (e *Engine) failRun(run model.PipelineRun, cause error) {
	log.Printf("run %d failed: %v", run.ID, cause)
	run.Status = model.StatusFailed
	run.Context["error"] = cause.Error()
	e.persist(run)
}

func contextSubset(context map[string]any, keys []string) map[string]any {
	subset := map[string]any{}
	for _, key := range keys {
		subset[key] = context[key]
	}
	return subset
}
