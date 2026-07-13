// Package store persists pipelines, runs and node-runs as plain JSON files in
// a data directory: one file per record under pipelines/, runs/ and node_runs/.
// A single mutex serialises access (this is a solo, single-process local tool)
// and every write goes to a temp file then renames into place, so a record is
// never seen half-written. IDs auto-increment from the highest file on disk.
package store

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/rexchoppers/trellis/internal/model"
)

type Store struct {
	dir string
	mu  sync.Mutex

	nextPipeline int64
	nextRun      int64
	nextNodeRun  int64
}

// New opens (creating if needed) the data directory and its subfolders and
// resolves the next id for each kind from the highest file already present.
func New(dir string) (*Store, error) {
	s := &Store{dir: dir}
	for _, sub := range []string{"pipelines", "runs", "node_runs"} {
		if err := os.MkdirAll(filepath.Join(dir, sub), 0o755); err != nil {
			return nil, err
		}
	}
	var err error
	if s.nextPipeline, err = nextID(filepath.Join(dir, "pipelines")); err != nil {
		return nil, err
	}
	if s.nextRun, err = nextID(filepath.Join(dir, "runs")); err != nil {
		return nil, err
	}
	if s.nextNodeRun, err = nextID(filepath.Join(dir, "node_runs")); err != nil {
		return nil, err
	}
	return s, nil
}

func now() string { return time.Now().UTC().Format("2006-01-02 15:04:05") }

func (s *Store) pipelineFile(id int64) string {
	return filepath.Join(s.dir, "pipelines", strconv.FormatInt(id, 10)+".json")
}
func (s *Store) runFile(id int64) string {
	return filepath.Join(s.dir, "runs", strconv.FormatInt(id, 10)+".json")
}
func (s *Store) nodeRunFile(id int64) string {
	return filepath.Join(s.dir, "node_runs", strconv.FormatInt(id, 10)+".json")
}

// --- pipelines ---

func (s *Store) CreatePipeline(name, description string) (model.PipelineConfig, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	id := s.nextPipeline
	s.nextPipeline++
	ts := now()
	p := model.PipelineConfig{
		ID: id, Name: name, Description: description,
		Graph:     model.Graph{Nodes: []model.Node{}, Edges: []model.Edge{}},
		CreatedAt: ts, UpdatedAt: ts,
	}
	if err := writeEntity(s.pipelineFile(id), p); err != nil {
		return model.PipelineConfig{}, err
	}
	return p, nil
}

func (s *Store) GetPipeline(id int64) (model.PipelineConfig, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return readEntity[model.PipelineConfig](s.pipelineFile(id), "pipeline", id)
}

func (s *Store) UpdatePipeline(id int64, name, description, workdir string, graph model.Graph) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, err := readEntity[model.PipelineConfig](s.pipelineFile(id), "pipeline", id)
	if err != nil {
		return err
	}
	p.Name, p.Description, p.Workdir, p.Graph, p.UpdatedAt = name, description, workdir, graph, now()
	return writeEntity(s.pipelineFile(id), p)
}

func (s *Store) DeletePipeline(id int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, err := os.Stat(s.pipelineFile(id)); err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("pipeline %d not found", id)
		}
		return err
	}
	// Cascade: remove the pipeline's runs and their node-runs.
	runIDs, err := listIDs(filepath.Join(s.dir, "runs"))
	if err != nil {
		return err
	}
	for _, rid := range runIDs {
		r, err := readEntity[model.PipelineRun](s.runFile(rid), "run", rid)
		if err != nil {
			return err
		}
		if r.PipelineConfigID != id {
			continue
		}
		if err := s.deleteRunLocked(rid); err != nil {
			return err
		}
	}
	return os.Remove(s.pipelineFile(id))
}

func (s *Store) ListPipelines() ([]model.PipelineListItem, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	pipelineIDs, err := listIDs(filepath.Join(s.dir, "pipelines"))
	if err != nil {
		return nil, err
	}
	runIDs, err := listIDs(filepath.Join(s.dir, "runs"))
	if err != nil {
		return nil, err
	}
	type last struct {
		id     int64
		status string
	}
	latest := map[int64]last{}
	for _, rid := range runIDs {
		r, err := readEntity[model.PipelineRun](s.runFile(rid), "run", rid)
		if err != nil {
			return nil, err
		}
		if cur, ok := latest[r.PipelineConfigID]; !ok || r.ID > cur.id {
			latest[r.PipelineConfigID] = last{r.ID, r.Status}
		}
	}
	items := []model.PipelineListItem{}
	for _, id := range slices.Backward(pipelineIDs) { // newest first
		p, err := readEntity[model.PipelineConfig](s.pipelineFile(id), "pipeline", id)
		if err != nil {
			return nil, err
		}
		item := model.PipelineListItem{
			ID: p.ID, Name: p.Name, Description: p.Description, Workdir: p.Workdir, UpdatedAt: p.UpdatedAt,
		}
		if lr, ok := latest[p.ID]; ok {
			id, status := lr.id, lr.status
			item.LastRunID, item.LastRunStatus = &id, &status
		}
		items = append(items, item)
	}
	return items, nil
}

// --- runs ---

func (s *Store) CreateRun(pipelineConfigID int64, context map[string]any) (model.PipelineRun, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if context == nil {
		context = map[string]any{}
	}
	id := s.nextRun
	s.nextRun++
	ts := now()
	r := model.PipelineRun{
		ID: id, PipelineConfigID: pipelineConfigID, Status: model.StatusPending,
		Context: context, CreatedAt: ts, UpdatedAt: ts,
	}
	if err := writeEntity(s.runFile(id), r); err != nil {
		return model.PipelineRun{}, err
	}
	return r, nil
}

func (s *Store) GetRun(id int64) (model.PipelineRun, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return readEntity[model.PipelineRun](s.runFile(id), "run", id)
}

func (s *Store) ListRunsForPipeline(pipelineConfigID int64) ([]model.PipelineRun, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.filterRuns(func(r model.PipelineRun) bool { return r.PipelineConfigID == pipelineConfigID }, true)
}

func (s *Store) ListRunsByStatus(status string) ([]model.PipelineRun, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.filterRuns(func(r model.PipelineRun) bool { return r.Status == status }, false)
}

func (s *Store) UpdateRun(run model.PipelineRun) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, err := os.Stat(s.runFile(run.ID)); err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("run %d not found", run.ID)
		}
		return err
	}
	run.UpdatedAt = now()
	return writeEntity(s.runFile(run.ID), run)
}

// TransitionRunStatus flips a run from one status to another only if it is
// currently in `from`, returning false if it was not (the compare-and-set the
// engine relies on to never double-run a node).
func (s *Store) TransitionRunStatus(id int64, from, to string) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	r, err := readEntity[model.PipelineRun](s.runFile(id), "run", id)
	if err != nil {
		return false, err
	}
	if r.Status != from {
		return false, nil
	}
	r.Status, r.UpdatedAt = to, now()
	if err := writeEntity(s.runFile(id), r); err != nil {
		return false, err
	}
	return true, nil
}

// --- node runs ---

func (s *Store) CreateNodeRun(runID int64, nodeID, nodeType, status string, input map[string]any) (model.NodeRun, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if input == nil {
		input = map[string]any{}
	}
	id := s.nextNodeRun
	s.nextNodeRun++
	ts := now()
	n := model.NodeRun{
		ID: id, PipelineRunID: runID, NodeID: nodeID, NodeType: nodeType, Status: status,
		Input: input, Output: map[string]any{}, CreatedAt: ts, UpdatedAt: ts,
	}
	if err := writeEntity(s.nodeRunFile(id), n); err != nil {
		return model.NodeRun{}, err
	}
	return n, nil
}

func (s *Store) AppendNodeRunLog(id int64, chunk string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	n, err := readEntity[model.NodeRun](s.nodeRunFile(id), "node run", id)
	if err != nil {
		return err
	}
	n.Log += chunk
	n.UpdatedAt = now()
	return writeEntity(s.nodeRunFile(id), n)
}

func (s *Store) FinishNodeRun(id int64, status string, output map[string]any) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	n, err := readEntity[model.NodeRun](s.nodeRunFile(id), "node run", id)
	if err != nil {
		return err
	}
	if output == nil {
		output = map[string]any{}
	}
	n.Status, n.Output, n.UpdatedAt = status, output, now()
	return writeEntity(s.nodeRunFile(id), n)
}

func (s *Store) ListNodeRuns(runID int64) ([]model.NodeRun, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	ids, err := listIDs(filepath.Join(s.dir, "node_runs"))
	if err != nil {
		return nil, err
	}
	list := []model.NodeRun{}
	for _, id := range ids { // oldest first
		n, err := readEntity[model.NodeRun](s.nodeRunFile(id), "node run", id)
		if err != nil {
			return nil, err
		}
		if n.PipelineRunID == runID {
			list = append(list, n)
		}
	}
	return list, nil
}

func (s *Store) GetWaitingNodeRun(runID int64) (model.NodeRun, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	ids, err := listIDs(filepath.Join(s.dir, "node_runs"))
	if err != nil {
		return model.NodeRun{}, err
	}
	for _, id := range slices.Backward(ids) { // newest first
		n, err := readEntity[model.NodeRun](s.nodeRunFile(id), "node run", id)
		if err != nil {
			return model.NodeRun{}, err
		}
		if n.PipelineRunID == runID && n.Status == model.StatusWaitingHuman {
			return n, nil
		}
	}
	return model.NodeRun{}, fmt.Errorf("no waiting node run for run %d", runID)
}

// --- internal helpers (callers already hold s.mu) ---

func (s *Store) filterRuns(keep func(model.PipelineRun) bool, newestFirst bool) ([]model.PipelineRun, error) {
	ids, err := listIDs(filepath.Join(s.dir, "runs"))
	if err != nil {
		return nil, err
	}
	if newestFirst {
		slices.Reverse(ids)
	}
	runs := []model.PipelineRun{}
	for _, id := range ids {
		r, err := readEntity[model.PipelineRun](s.runFile(id), "run", id)
		if err != nil {
			return nil, err
		}
		if keep(r) {
			runs = append(runs, r)
		}
	}
	return runs, nil
}

func (s *Store) deleteRunLocked(runID int64) error {
	ids, err := listIDs(filepath.Join(s.dir, "node_runs"))
	if err != nil {
		return err
	}
	for _, id := range ids {
		n, err := readEntity[model.NodeRun](s.nodeRunFile(id), "node run", id)
		if err != nil {
			return err
		}
		if n.PipelineRunID != runID {
			continue
		}
		if err := os.Remove(s.nodeRunFile(id)); err != nil {
			return err
		}
	}
	return os.Remove(s.runFile(runID))
}

// listIDs returns the numeric ids of the <n>.json files in dir, ascending.
func listIDs(dir string) ([]int64, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	ids := []int64{}
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasSuffix(name, ".json") {
			continue
		}
		id, err := strconv.ParseInt(strings.TrimSuffix(name, ".json"), 10, 64)
		if err != nil {
			continue
		}
		ids = append(ids, id)
	}
	slices.Sort(ids)
	return ids, nil
}

func nextID(dir string) (int64, error) {
	ids, err := listIDs(dir)
	if err != nil {
		return 0, err
	}
	if len(ids) == 0 {
		return 1, nil
	}
	return ids[len(ids)-1] + 1, nil
}

func readEntity[T any](path, kind string, id int64) (T, error) {
	var v T
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return v, fmt.Errorf("%s %d not found", kind, id)
		}
		return v, err
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		return v, fmt.Errorf("read %s %d: %w", kind, id, err)
	}
	return v, nil
}

func writeEntity(path string, v any) error {
	raw, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
