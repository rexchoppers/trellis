package gate

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"slices"
	"strings"
	"sync"
)

type Handler func(name string, args json.RawMessage) (string, error)

type session struct {
	tools   []string
	handler Handler
}

type Server struct {
	mu       sync.Mutex
	sessions map[string]session
	http     *http.Server
	addr     string
}

func New() *Server { return &Server{sessions: map[string]session{}} }

func (s *Server) Start() error {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return err
	}
	s.addr = listener.Addr().String()
	// No timeouts: a permission call is held open until the human answers.
	s.http = &http.Server{Handler: s}
	go func() { _ = s.http.Serve(listener) }()
	return nil
}

func (s *Server) Close() error {
	if s.http == nil {
		return nil
	}
	return s.http.Shutdown(context.Background())
}

func (s *Server) URL(token string) string { return fmt.Sprintf("http://%s/mcp/%s", s.addr, token) }

func NewToken() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func (s *Server) Register(token string, tools []string, handler Handler) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sessions[token] = session{tools: tools, handler: handler}
}

func (s *Server) Revoke(token string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.sessions, token)
}

type request struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	token, ok := strings.CutPrefix(r.URL.Path, "/mcp/")
	s.mu.Lock()
	sess, found := s.sessions[token]
	s.mu.Unlock()
	if !ok || !found {
		http.NotFound(w, r)
		return
	}
	switch r.Method {
	case http.MethodPost:
	case http.MethodDelete:
		w.WriteHeader(http.StatusOK)
		return
	default:
		// No server-to-client stream: every reply comes back on its POST.
		w.Header().Set("Allow", "POST, DELETE")
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req request
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		reply(w, nil, nil, &rpcError{Code: -32700, Message: "Parse error"})
		return
	}
	if len(req.ID) == 0 {
		// Notifications get no reply.
		w.WriteHeader(http.StatusAccepted)
		return
	}
	result, rerr := s.handle(sess, req)
	reply(w, req.ID, result, rerr)
}

func reply(w http.ResponseWriter, id json.RawMessage, result any, rerr *rpcError) {
	w.Header().Set("Content-Type", "application/json")
	body := map[string]any{"jsonrpc": "2.0", "id": id}
	if rerr != nil {
		body["error"] = rerr
	} else {
		body["result"] = result
	}
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(body)
}

func (s *Server) handle(sess session, req request) (any, *rpcError) {
	switch req.Method {
	case "initialize":
		var params struct {
			ProtocolVersion string `json:"protocolVersion"`
		}
		_ = json.Unmarshal(req.Params, &params)
		version := params.ProtocolVersion
		if version == "" {
			version = "2025-06-18"
		}
		return map[string]any{
			"protocolVersion": version,
			"capabilities":    map[string]any{"tools": map[string]any{}},
			"serverInfo":      map[string]any{"name": "trellis", "version": "0.1.0"},
		}, nil
	case "ping":
		return map[string]any{}, nil
	case "tools/list":
		tools := make([]Tool, 0, len(sess.tools))
		for _, name := range sess.tools {
			if tool, ok := Catalogue[name]; ok {
				tools = append(tools, tool)
			}
		}
		return map[string]any{"tools": tools}, nil
	case "tools/call":
		var params struct {
			Name      string          `json:"name"`
			Arguments json.RawMessage `json:"arguments"`
		}
		if err := json.Unmarshal(req.Params, &params); err != nil {
			return nil, &rpcError{Code: -32602, Message: "Invalid params"}
		}
		if !slices.Contains(sess.tools, params.Name) {
			return nil, &rpcError{Code: -32602, Message: fmt.Sprintf("Tool %s is not available", params.Name)}
		}
		args := params.Arguments
		if len(args) == 0 {
			args = json.RawMessage("{}")
		}
		text, err := sess.handler(params.Name, args)
		if err != nil {
			return map[string]any{"content": []map[string]any{{"type": "text", "text": err.Error()}}, "isError": true}, nil
		}
		return map[string]any{"content": []map[string]any{{"type": "text", "text": text}}}, nil
	default:
		return nil, &rpcError{Code: -32601, Message: "Method not found"}
	}
}

type Tool struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"inputSchema"`
}

var str = map[string]any{"type": "string"}

// Finish is added separately, for agents with outcomes.
var Tools = []string{Permission, CheckIn}

const (
	Permission   = "permission"
	CheckIn      = "check_in"
	Finish       = "finish"
	Publish      = "publish"
	Step         = "step"
	FreshSession = "fresh_session"
	Delegate     = "delegate"
	Message      = "message"
	Rest         = "rest"
)

var All = []Tool{
	{
		Name: FreshSession,
		Description: "Start a fresh session in this same job, leaving your current context behind: use it when you finish one independent piece of a larger job and the next piece does not need what is in your context. " +
			"handover is what the next session must know: what is done (with links), what is next, anything blocked. Your task and the handover start the new session. After calling this, end your turn.",
		InputSchema: map[string]any{
			"type":       "object",
			"required":   []string{"handover"},
			"properties": map[string]any{"handover": str},
		},
	},
	{
		Name: Delegate,
		Description: "Start a job for one of the agents you delegate to: agent is its department/agent (as in your instructions), task is the work, with everything they need (identifiers, links, branches). " +
			"Returns the new job's id. Trellis tells you when that job checks in, finishes or fails. Refused when the agent has no free desk: try again later.",
		InputSchema: map[string]any{
			"type":       "object",
			"required":   []string{"agent", "task"},
			"properties": map[string]any{"agent": str, "task": str},
		},
	},
	{
		Name:        Message,
		Description: "Send a message to a job you delegated (job is its id). It reaches the agent straight away, waking it if it is waiting on the human. Only send what they can act on.",
		InputSchema: map[string]any{
			"type":       "object",
			"required":   []string{"job", "text"},
			"properties": map[string]any{"job": str, "text": str},
		},
	},
	{
		Name:        Rest,
		Description: "End this check and sleep until the next one; Trellis also wakes you early when one of your delegated jobs checks in, finishes or fails. handover is a short note of where things stand, for your next check. After calling this, end your turn.",
		InputSchema: map[string]any{
			"type":       "object",
			"required":   []string{"handover"},
			"properties": map[string]any{"handover": str},
		},
	},
	{
		Name:        Permission,
		Description: "Trellis decides whether a tool call may run. Claude Code calls this; agents do not.",
		InputSchema: map[string]any{
			"type":     "object",
			"required": []string{"tool_name", "input"},
			"properties": map[string]any{
				"tool_name":   str,
				"input":       map[string]any{"type": "object"},
				"tool_use_id": str,
			},
		},
	},
	{
		Name: Step,
		Description: "Report where you are in your steps: status active when you start a step, done when you finish it (note: one short line on what came of it), skipped if it does not apply. " +
			"The human follows your progress from this, so keep your messages short.",
		InputSchema: map[string]any{
			"type":     "object",
			"required": []string{"name", "status"},
			"properties": map[string]any{
				"name":   str,
				"status": map[string]any{"type": "string", "enum": []string{"active", "done", "skipped"}},
				"note":   str,
			},
		},
	},
	{
		Name: Publish,
		Description: "Send an outcome's event again without ending your job: for earlier work whose hand-off was missed, or when the human asks. " +
			"outcome is one of the outcomes in your instructions that sends an event; data holds the details, as short text fields. " +
			"Check the work really is in that state first.",
		InputSchema: map[string]any{
			"type":     "object",
			"required": []string{"outcome", "data"},
			"properties": map[string]any{
				"outcome": str,
				"data":    map[string]any{"type": "object", "additionalProperties": str},
			},
		},
	},
	{
		Name: Finish,
		Description: "End your job when it is finished: outcome is how it ended (one of the outcomes in your instructions), summary says what you did, " +
			"data holds the details whoever picks it up next needs, as short text fields. Trellis ends the job and passes your data on. " +
			"For an outcome that needs the human's say, this only proposes it and they finish the job. After calling this, end your turn.",
		InputSchema: map[string]any{
			"type":     "object",
			"required": []string{"outcome", "summary"},
			"properties": map[string]any{
				"outcome": str,
				"summary": str,
				"data":    map[string]any{"type": "object", "additionalProperties": str},
			},
		},
	},
	{
		Name: CheckIn,
		Description: "Come back to the human: you think the job is finished, you need something from them, or a tool was refused. Never for a progress update: it ends your turn and waits on the human. " +
			"summary says what you did and found, in markdown, and what you need if anything. After calling this, end your turn. " +
			"The human replies with feedback, finishes the job, or cancels it; only they finish it.",
		InputSchema: map[string]any{
			"type":     "object",
			"required": []string{"summary"},
			"properties": map[string]any{
				"summary": str,
				"outcome": map[string]any{"type": "string", "description": "When the job is finished: how it ended, one of the outcomes in your instructions."},
				"data":    map[string]any{"type": "object", "description": "Details for whoever picks this up next, as short text fields.", "additionalProperties": str},
			},
		},
	},
}

var Catalogue = func() map[string]Tool {
	byName := make(map[string]Tool, len(All))
	for _, tool := range All {
		byName[tool.Name] = tool
	}
	return byName
}()
