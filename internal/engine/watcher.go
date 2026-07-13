package engine

import (
	"context"
	"log"
	"time"

	"github.com/rexchoppers/trellis/internal/linear"
	"github.com/rexchoppers/trellis/internal/model"
)

// CheckLinearWaits resumes any run paused on a linear_wait node whose Linear
// issue has a comment newer than the pause marker. The comment body becomes
// the node's response, exactly as if it had been typed into the run view.
// WatchLinear loops this; the single pass is exposed for tests.
func (e *Engine) CheckLinearWaits(ctx context.Context) {
	if e.Actions == nil || e.Actions.Linear == nil {
		return
	}
	runs, err := e.store.ListRunsByStatus(model.StatusWaitingHuman)
	if err != nil {
		log.Printf("linear watch: %v", err)
		return
	}
	for _, run := range runs {
		pipeline, err := e.store.GetPipeline(run.PipelineConfigID)
		if err != nil {
			continue
		}
		node, err := pipeline.Graph.NodeByID(run.CurrentNodeID)
		if err != nil || node.Type != model.NodeTypeLinearWait {
			continue
		}
		nodeRun, err := e.store.GetWaitingNodeRun(run.ID)
		if err != nil {
			continue
		}
		marker, _ := nodeRun.Input["awaiting_since"].(string)
		issueRef, _ := run.Context["issue_identifier"].(string)
		comments, err := e.Actions.Linear.ListComments(ctx, issueRef)
		if err != nil {
			log.Printf("linear watch: run %d: %v", run.ID, err)
			continue
		}
		var newest *linear.Comment
		for i := range comments {
			if comments[i].CreatedAt > marker && (newest == nil || comments[i].CreatedAt > newest.CreatedAt) {
				newest = &comments[i]
			}
		}
		if newest == nil {
			continue
		}
		log.Printf("linear watch: resuming run %d with a new comment on %s", run.ID, issueRef)
		if err := e.Resume(run.ID, "", newest.Body); err != nil {
			log.Printf("linear watch: resume run %d: %v", run.ID, err)
		}
	}
}

func (e *Engine) WatchLinear(interval time.Duration) {
	for {
		e.CheckLinearWaits(context.Background())
		time.Sleep(interval)
	}
}
