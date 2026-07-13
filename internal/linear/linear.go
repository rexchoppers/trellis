package linear

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
)

const DefaultEndpoint = "https://api.linear.app/graphql"

type Issue struct {
	ID          string
	Identifier  string
	Title       string
	Description string
	URL         string
	State       string
}

type Client struct {
	APIKey   string
	Endpoint string
}

var identifierPattern = regexp.MustCompile(`([A-Za-z][A-Za-z0-9]*)-([0-9]+)`)

// ParseIdentifier extracts a team key and issue number from an identifier
// like "TRA-123" or a linear.app issue URL.
func ParseIdentifier(raw string) (string, float64, error) {
	match := identifierPattern.FindStringSubmatch(strings.TrimSpace(raw))
	if match == nil {
		return "", 0, fmt.Errorf("%q does not contain a Linear issue identifier like TRA-123", raw)
	}
	number, err := strconv.ParseFloat(match[2], 64)
	if err != nil {
		return "", 0, err
	}
	return strings.ToUpper(match[1]), number, nil
}

func (c *Client) do(ctx context.Context, query string, variables map[string]any, out any) error {
	payload, err := json.Marshal(map[string]any{"query": query, "variables": variables})
	if err != nil {
		return err
	}
	endpoint := c.Endpoint
	if endpoint == "" {
		endpoint = DefaultEndpoint
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", c.APIKey)

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("linear api: %w", err)
	}
	defer res.Body.Close()

	var envelope struct {
		Data   json.RawMessage `json:"data"`
		Errors []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}
	if err := json.NewDecoder(res.Body).Decode(&envelope); err != nil {
		return fmt.Errorf("linear api: decode response (http %d): %w", res.StatusCode, err)
	}
	if len(envelope.Errors) > 0 {
		return fmt.Errorf("linear api: %s", envelope.Errors[0].Message)
	}
	if out != nil {
		if err := json.Unmarshal(envelope.Data, out); err != nil {
			return fmt.Errorf("linear api: decode data: %w", err)
		}
	}
	return nil
}

const issueQuery = `
query($key: String!, $number: Float!) {
  issues(filter: { team: { key: { eq: $key } }, number: { eq: $number } }) {
    nodes { id identifier title description url state { name } }
  }
}`

func (c *Client) FetchIssue(ctx context.Context, identifierOrURL string) (Issue, error) {
	team, number, err := ParseIdentifier(identifierOrURL)
	if err != nil {
		return Issue{}, err
	}
	var data struct {
		Issues struct {
			Nodes []struct {
				ID          string `json:"id"`
				Identifier  string `json:"identifier"`
				Title       string `json:"title"`
				Description string `json:"description"`
				URL         string `json:"url"`
				State       struct {
					Name string `json:"name"`
				} `json:"state"`
			} `json:"nodes"`
		} `json:"issues"`
	}
	if err := c.do(ctx, issueQuery, map[string]any{"key": team, "number": number}, &data); err != nil {
		return Issue{}, err
	}
	if len(data.Issues.Nodes) == 0 {
		return Issue{}, fmt.Errorf("linear issue %s-%d not found", team, int(number))
	}
	node := data.Issues.Nodes[0]
	return Issue{
		ID:          node.ID,
		Identifier:  node.Identifier,
		Title:       node.Title,
		Description: node.Description,
		URL:         node.URL,
		State:       node.State.Name,
	}, nil
}

type Comment struct {
	ID        string
	Body      string
	CreatedAt string
}

func (c *Client) ListComments(ctx context.Context, identifierOrURL string) ([]Comment, error) {
	issue, err := c.FetchIssue(ctx, identifierOrURL)
	if err != nil {
		return nil, err
	}
	var data struct {
		Issue struct {
			Comments struct {
				Nodes []struct {
					ID        string `json:"id"`
					Body      string `json:"body"`
					CreatedAt string `json:"createdAt"`
				} `json:"nodes"`
			} `json:"comments"`
		} `json:"issue"`
	}
	err = c.do(ctx, `
query($id: String!) {
  issue(id: $id) { comments { nodes { id body createdAt } } }
}`, map[string]any{"id": issue.ID}, &data)
	if err != nil {
		return nil, err
	}
	comments := make([]Comment, 0, len(data.Issue.Comments.Nodes))
	for _, node := range data.Issue.Comments.Nodes {
		comments = append(comments, Comment{ID: node.ID, Body: node.Body, CreatedAt: node.CreatedAt})
	}
	return comments, nil
}

func (c *Client) AddComment(ctx context.Context, identifierOrURL, body string) error {
	issue, err := c.FetchIssue(ctx, identifierOrURL)
	if err != nil {
		return err
	}
	var data struct {
		CommentCreate struct {
			Success bool `json:"success"`
		} `json:"commentCreate"`
	}
	err = c.do(ctx, `
mutation($issueId: String!, $body: String!) {
  commentCreate(input: { issueId: $issueId, body: $body }) { success }
}`, map[string]any{"issueId": issue.ID, "body": body}, &data)
	if err != nil {
		return err
	}
	if !data.CommentCreate.Success {
		return fmt.Errorf("linear api: comment on %s not accepted", issue.Identifier)
	}
	return nil
}

func (c *Client) SetStatus(ctx context.Context, identifierOrURL, stateName string) error {
	team, _, err := ParseIdentifier(identifierOrURL)
	if err != nil {
		return err
	}
	issue, err := c.FetchIssue(ctx, identifierOrURL)
	if err != nil {
		return err
	}
	var states struct {
		Teams struct {
			Nodes []struct {
				States struct {
					Nodes []struct {
						ID   string `json:"id"`
						Name string `json:"name"`
					} `json:"nodes"`
				} `json:"states"`
			} `json:"nodes"`
		} `json:"teams"`
	}
	err = c.do(ctx, `
query($key: String!) {
  teams(filter: { key: { eq: $key } }) {
    nodes { states { nodes { id name } } }
  }
}`, map[string]any{"key": team}, &states)
	if err != nil {
		return err
	}
	stateID := ""
	var names []string
	for _, teamNode := range states.Teams.Nodes {
		for _, state := range teamNode.States.Nodes {
			names = append(names, state.Name)
			if strings.EqualFold(state.Name, stateName) {
				stateID = state.ID
			}
		}
	}
	if stateID == "" {
		return fmt.Errorf("linear api: team %s has no state named %q (has: %s)", team, stateName, strings.Join(names, ", "))
	}
	return c.updateIssue(ctx, issue, map[string]any{"stateId": stateID})
}

func (c *Client) AppendDescription(ctx context.Context, identifierOrURL, text string) error {
	issue, err := c.FetchIssue(ctx, identifierOrURL)
	if err != nil {
		return err
	}
	description := strings.TrimRight(issue.Description, "\n")
	if description != "" {
		description += "\n\n"
	}
	return c.updateIssue(ctx, issue, map[string]any{"description": description + text})
}

func (c *Client) updateIssue(ctx context.Context, issue Issue, input map[string]any) error {
	var data struct {
		IssueUpdate struct {
			Success bool `json:"success"`
		} `json:"issueUpdate"`
	}
	err := c.do(ctx, `
mutation($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) { success }
}`, map[string]any{"id": issue.ID, "input": input}, &data)
	if err != nil {
		return err
	}
	if !data.IssueUpdate.Success {
		return fmt.Errorf("linear api: update of %s not accepted", issue.Identifier)
	}
	return nil
}

// ContextSeed is what a fetched issue contributes to a run's starting context.
func (i Issue) ContextSeed() map[string]any {
	return map[string]any{
		"issue":            fmt.Sprintf("%s: %s\nState: %s\nURL: %s\n\n%s", i.Identifier, i.Title, i.State, i.URL, i.Description),
		"issue_identifier": i.Identifier,
		"issue_title":      i.Title,
		"issue_url":        i.URL,
	}
}
