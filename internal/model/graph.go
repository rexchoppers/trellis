package model

import (
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strings"
)

var templateKeyPattern = regexp.MustCompile(`\{\{\s*(\w+)\s*\}\}`)

// TemplateKeys returns the context keys referenced as {{key}} in s.
func TemplateKeys(s string) []string {
	var keys []string
	for _, match := range templateKeyPattern.FindAllStringSubmatch(s, -1) {
		keys = append(keys, match[1])
	}
	return keys
}

func (g Graph) NodeByID(id string) (*Node, error) {
	for i := range g.Nodes {
		if g.Nodes[i].ID == id {
			return &g.Nodes[i], nil
		}
	}
	return nil, fmt.Errorf("node %q not found in graph", id)
}

const ChangesHandle = "changes"

func (e Edge) IsChanges() bool {
	return e.SourceHandle == ChangesHandle
}

func (g Graph) StartNode() (*Node, error) {
	hasIncoming := map[string]bool{}
	for _, edge := range g.Edges {
		if edge.IsChanges() {
			continue
		}
		hasIncoming[edge.Target] = true
	}
	var starts []*Node
	for i := range g.Nodes {
		if !hasIncoming[g.Nodes[i].ID] {
			starts = append(starts, &g.Nodes[i])
		}
	}
	switch len(starts) {
	case 0:
		return nil, errors.New("graph has no start node (every node has an incoming edge)")
	case 1:
		return starts[0], nil
	default:
		names := make([]string, len(starts))
		for i, n := range starts {
			names[i] = n.Data.Name
		}
		return nil, fmt.Errorf("graph has %d start nodes (%v); connect them into one line", len(starts), names)
	}
}

// NextNode follows the single forward (non-changes) edge out of a node.
func (g Graph) NextNode(afterNodeID string) (*Node, error) {
	if _, err := g.NodeByID(afterNodeID); err != nil {
		return nil, err
	}
	var targets []string
	for _, edge := range g.Edges {
		if edge.Source == afterNodeID && !edge.IsChanges() {
			targets = append(targets, edge.Target)
		}
	}
	switch len(targets) {
	case 0:
		return nil, nil
	case 1:
		return g.NodeByID(targets[0])
	default:
		return nil, fmt.Errorf("node %q has %d outgoing edges; branching is not supported", afterNodeID, len(targets))
	}
}

// ChangesTarget returns the node a gate's changes edge loops back to, or nil.
func (g Graph) ChangesTarget(gateNodeID string) (*Node, error) {
	for _, edge := range g.Edges {
		if edge.Source == gateNodeID && edge.IsChanges() {
			return g.NodeByID(edge.Target)
		}
	}
	return nil, nil
}

// ForwardPredecessor returns the node whose forward edge leads into nodeID,
// or nil when nodeID is the start node.
func (g Graph) ForwardPredecessor(nodeID string) (*Node, error) {
	for _, edge := range g.Edges {
		if edge.Target == nodeID && !edge.IsChanges() {
			return g.NodeByID(edge.Source)
		}
	}
	return nil, nil
}

// NeedsRepo reports whether the graph contains any action that runs against a
// git repository (git/GitHub actions). Such pipelines must have a working
// directory set; without one there is no repo to act on.
func (g Graph) NeedsRepo() bool {
	for _, node := range g.Nodes {
		if node.Type == NodeTypeAction && ActionSpecs[node.Data.Action].NeedsRepo {
			return true
		}
	}
	return false
}

// Validate checks the graph is runnable. seededKeys are context keys present
// before the first node runs (e.g. a Linear issue seeded at run start); they
// count as produced for input validation.
func (g Graph) Validate(seededKeys ...string) error {
	var problems []error
	fail := func(format string, args ...any) {
		problems = append(problems, fmt.Errorf(format, args...))
	}

	if len(g.Nodes) == 0 {
		return errors.New("graph has no nodes")
	}

	validTypes := []string{NodeTypeAgent, NodeTypeHumanInput, NodeTypeApproval, NodeTypeAction, NodeTypeLinearWait}
	ids := map[string]bool{}
	for _, node := range g.Nodes {
		if ids[node.ID] {
			fail("duplicate node id %q", node.ID)
		}
		ids[node.ID] = true
		if !slices.Contains(validTypes, node.Type) {
			fail("node %q has unknown type %q", node.Data.Name, node.Type)
		}
		if (node.Type == NodeTypeHumanInput || node.Type == NodeTypeApproval || node.Type == NodeTypeLinearWait) && len(node.Data.Outputs) == 0 {
			fail("%s node %q must declare at least one output key for its response", node.Type, node.Data.Name)
		}
		if node.Type == NodeTypeAction {
			spec, known := ActionSpecs[node.Data.Action]
			if !known {
				fail("action node %q has unknown action %q", node.Data.Name, node.Data.Action)
				continue
			}
			for _, param := range spec.RequiredParams {
				if strings.TrimSpace(node.Data.Params[param]) == "" {
					fail("action node %q (%s) is missing required parameter %q", node.Data.Name, node.Data.Action, param)
				}
			}
		}
	}

	nodeName := func(id string) string {
		if node, err := g.NodeByID(id); err == nil {
			return node.Data.Name
		}
		return id
	}
	outgoingForward := map[string]int{}
	outgoingChanges := map[string]int{}
	for _, edge := range g.Edges {
		if !ids[edge.Source] {
			fail("edge %q references unknown source node %q", edge.ID, edge.Source)
		}
		if !ids[edge.Target] {
			fail("edge %q references unknown target node %q", edge.ID, edge.Target)
		}
		if edge.IsChanges() {
			outgoingChanges[edge.Source]++
		} else {
			outgoingForward[edge.Source]++
		}
	}
	for nodeID, count := range outgoingForward {
		if count > 1 {
			fail("node %q has %d outgoing edges; branching is not supported in v1", nodeName(nodeID), count)
		}
	}
	for nodeID, count := range outgoingChanges {
		if node, err := g.NodeByID(nodeID); err == nil &&
			node.Type != NodeTypeApproval && node.Type != NodeTypeLinearWait && node.Type != NodeTypeHumanInput {
			fail("only approval, linear_wait and human_input gates can have a changes edge; %q is a %s node", node.Data.Name, node.Type)
		}
		if count > 1 {
			fail("node %q has %d changes edges; at most one is allowed", nodeName(nodeID), count)
		}
	}
	if len(problems) > 0 {
		return errors.Join(problems...)
	}

	start, err := g.StartNode()
	if err != nil {
		return err
	}

	// First pass: the forward order (also catches cycles and stray nodes).
	var order []Node
	index := map[string]int{}
	visited := map[string]bool{}
	for node := start; node != nil; {
		if visited[node.ID] {
			return fmt.Errorf("graph has a cycle through node %q", node.Data.Name)
		}
		visited[node.ID] = true
		index[node.ID] = len(order)
		order = append(order, *node)
		node, err = g.NextNode(node.ID)
		if err != nil {
			return err
		}
	}
	if len(visited) < len(g.Nodes) {
		fail("%d node(s) are not connected to the pipeline", len(g.Nodes)-len(visited))
	}

	// Changes edges must loop back to an earlier node on the path. Keys
	// produced inside a loop body exist on re-entry, so they count as
	// produced for the whole walk (agents see them as empty on the first
	// pass).
	produced := map[string]bool{}
	for _, key := range seededKeys {
		produced[key] = true
	}
	for _, edge := range g.Edges {
		if !edge.IsChanges() {
			continue
		}
		gateIndex, gateOnPath := index[edge.Source]
		targetIndex, targetOnPath := index[edge.Target]
		if !gateOnPath || !targetOnPath {
			fail("changes edge %q must connect nodes that are on the pipeline path", edge.ID)
			continue
		}
		if targetIndex >= gateIndex {
			fail("the changes edge on %q must loop back to an EARLIER node", nodeName(edge.Source))
			continue
		}
		for _, loopNode := range order[targetIndex : gateIndex+1] {
			for _, key := range loopNode.Data.Outputs {
				produced[key] = true
			}
			if loopNode.Type == NodeTypeAction {
				for _, key := range ActionSpecs[loopNode.Data.Action].Produces {
					produced[key] = true
				}
			}
		}
	}

	// Second pass: inputs, templates and issue requirements in walk order.
	for i := range order {
		node := &order[i]
		for _, key := range node.Data.Inputs {
			if !produced[key] {
				fail("node %q reads input %q but no upstream node produces it", node.Data.Name, key)
			}
		}
		if node.Type == NodeTypeLinearWait && !produced["issue_identifier"] {
			fail("linear_wait node %q needs a Linear issue on the run (issue_identifier is not in context)", node.Data.Name)
		}
		if node.Type == NodeTypeAction {
			spec := ActionSpecs[node.Data.Action]
			if spec.NeedsIssue && !produced["issue_identifier"] {
				fail("action node %q (%s) needs a Linear issue on the run (issue_identifier is not in context)", node.Data.Name, node.Data.Action)
			}
			for param, value := range node.Data.Params {
				for _, key := range TemplateKeys(value) {
					if !produced[key] {
						fail("action node %q parameter %q references {{%s}} but no upstream node produces it", node.Data.Name, param, key)
					}
				}
			}
			for _, key := range spec.Produces {
				produced[key] = true
			}
		}
		for _, key := range node.Data.Outputs {
			produced[key] = true
		}
	}

	return errors.Join(problems...)
}
