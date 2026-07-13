package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"maps"
	"net/http"
	"slices"
	"strconv"
	"strings"

	"github.com/rexchoppers/trellis/internal/engine"
	"github.com/rexchoppers/trellis/internal/linear"
	"github.com/rexchoppers/trellis/internal/model"
	"github.com/rexchoppers/trellis/internal/store"
)

type server struct {
	store  *store.Store
	engine *engine.Engine
	hub    *Hub
	linear *linear.Client
}

// New builds the HTTP handler. linearClient may be nil, in which case runs
// cannot be triggered from Linear issues.
func New(st *store.Store, eng *engine.Engine, hub *Hub, linearClient *linear.Client, frontend fs.FS) http.Handler {
	s := &server{store: st, engine: eng, hub: hub, linear: linearClient}
	eng.Notify = func(runID int64) {
		payload, err := s.runDetailJSON(runID)
		if err != nil {
			log.Printf("run %d: build SSE payload: %v", runID, err)
			return
		}
		hub.Publish(runID, payload)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/pipelines", s.createPipeline)
	mux.HandleFunc("GET /api/pipelines", s.listPipelines)
	mux.HandleFunc("GET /api/pipelines/{id}", s.getPipeline)
	mux.HandleFunc("PUT /api/pipelines/{id}", s.updatePipeline)
	mux.HandleFunc("DELETE /api/pipelines/{id}", s.deletePipeline)
	mux.HandleFunc("GET /api/pipelines/{id}/runs", s.listPipelineRuns)
	mux.HandleFunc("POST /api/runs", s.createRun)
	mux.HandleFunc("GET /api/runs/{id}", s.getRun)
	mux.HandleFunc("POST /api/runs/{id}/resume", s.resumeRun)
	mux.HandleFunc("GET /api/runs/{id}/stream", s.streamRun)
	mux.Handle("/", spaHandler(frontend))
	return mux
}

type runDetail struct {
	Run          model.PipelineRun `json:"run"`
	NodeRuns     []model.NodeRun   `json:"node_runs"`
	Graph        model.Graph       `json:"graph"`
	PipelineName string            `json:"pipeline_name"`
}

func (s *server) buildRunDetail(runID int64) (runDetail, error) {
	run, err := s.store.GetRun(runID)
	if err != nil {
		return runDetail{}, err
	}
	pipeline, err := s.store.GetPipeline(run.PipelineConfigID)
	if err != nil {
		return runDetail{}, err
	}
	nodeRuns, err := s.store.ListNodeRuns(runID)
	if err != nil {
		return runDetail{}, err
	}
	return runDetail{Run: run, NodeRuns: nodeRuns, Graph: pipeline.Graph, PipelineName: pipeline.Name}, nil
}

func (s *server) runDetailJSON(runID int64) ([]byte, error) {
	detail, err := s.buildRunDetail(runID)
	if err != nil {
		return nil, err
	}
	return json.Marshal(detail)
}

func (s *server) createPipeline(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		writeError(w, http.StatusBadRequest, errors.New("name is required"))
		return
	}
	pipeline, err := s.store.CreatePipeline(body.Name, body.Description)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusCreated, pipeline)
}

func (s *server) listPipelines(w http.ResponseWriter, r *http.Request) {
	items, err := s.store.ListPipelines()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *server) getPipeline(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	pipeline, err := s.store.GetPipeline(id)
	if err != nil {
		writeError(w, statusForLookup(err), err)
		return
	}
	writeJSON(w, http.StatusOK, pipeline)
}

func (s *server) updatePipeline(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	var body struct {
		Name        string      `json:"name"`
		Description string      `json:"description"`
		Workdir     string      `json:"workdir"`
		Graph       model.Graph `json:"graph"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		writeError(w, http.StatusBadRequest, errors.New("name is required"))
		return
	}
	if body.Graph.NeedsRepo() && strings.TrimSpace(body.Workdir) == "" {
		writeError(w, http.StatusBadRequest, errors.New("working directory is required because this pipeline has a git or GitHub action"))
		return
	}
	if err := s.store.UpdatePipeline(id, body.Name, body.Description, body.Workdir, body.Graph); err != nil {
		writeError(w, statusForLookup(err), err)
		return
	}
	pipeline, err := s.store.GetPipeline(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, pipeline)
}

func (s *server) deletePipeline(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := s.store.DeletePipeline(id); err != nil {
		writeError(w, statusForLookup(err), err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) listPipelineRuns(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if _, err := s.store.GetPipeline(id); err != nil {
		writeError(w, statusForLookup(err), err)
		return
	}
	runs, err := s.store.ListRunsForPipeline(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, runs)
}

func (s *server) createRun(w http.ResponseWriter, r *http.Request) {
	var body struct {
		PipelineID  int64  `json:"pipeline_id"`
		LinearIssue string `json:"linear_issue"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	pipeline, err := s.store.GetPipeline(body.PipelineID)
	if err != nil {
		writeError(w, statusForLookup(err), err)
		return
	}

	seed := map[string]any{}
	if strings.TrimSpace(body.LinearIssue) != "" {
		if s.linear == nil {
			writeError(w, http.StatusBadRequest,
				errors.New("LINEAR_API_KEY is not set; export it before starting trellis to trigger runs from Linear issues"))
			return
		}
		issue, err := s.linear.FetchIssue(r.Context(), body.LinearIssue)
		if err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		seed = issue.ContextSeed()
	}
	if err := pipeline.Graph.Validate(slices.Collect(maps.Keys(seed))...); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	run, err := s.store.CreateRun(pipeline.ID, seed)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	if err := s.engine.Start(run.ID); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusCreated, run)
}

func (s *server) getRun(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	detail, err := s.buildRunDetail(id)
	if err != nil {
		writeError(w, statusForLookup(err), err)
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

func (s *server) resumeRun(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	var body struct {
		Decision string `json:"decision"`
		Response string `json:"response"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := s.engine.Resume(id, body.Decision, body.Response); err != nil {
		if errors.Is(err, engine.ErrNotWaiting) {
			writeError(w, http.StatusConflict, err)
			return
		}
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "resumed"})
}

func (s *server) streamRun(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, errors.New("streaming not supported"))
		return
	}
	snapshot, err := s.runDetailJSON(id)
	if err != nil {
		writeError(w, statusForLookup(err), err)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	ch, cancel := s.hub.Subscribe(id)
	defer cancel()

	writeEvent(w, flusher, snapshot)
	for {
		select {
		case <-r.Context().Done():
			return
		case payload := <-ch:
			writeEvent(w, flusher, payload)
		}
	}
}

func writeEvent(w http.ResponseWriter, flusher http.Flusher, payload []byte) {
	fmt.Fprintf(w, "data: %s\n\n", payload)
	flusher.Flush()
}

func spaHandler(frontend fs.FS) http.Handler {
	fileServer := http.FileServerFS(frontend)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path != "" {
			if f, err := frontend.Open(path); err == nil {
				f.Close()
				fileServer.ServeHTTP(w, r)
				return
			}
		}
		index, err := fs.ReadFile(frontend, "index.html")
		if err != nil {
			http.Error(w, "frontend not built: run `make ui`", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(index)
	})
}

func pathID(r *http.Request) (int64, error) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid id %q", r.PathValue("id"))
	}
	return id, nil
}

func statusForLookup(err error) int {
	if strings.Contains(err.Error(), "not found") {
		return http.StatusNotFound
	}
	return http.StatusInternalServerError
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("encode response: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}
