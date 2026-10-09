package jobs

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strings"
	"time"
)

var pullURL = regexp.MustCompile(`https://github\.com/([\w.-]+)/([\w.-]+)/pull/(\d+)`)

type pull struct {
	owner, repo, number, url string
}

// The job's PR: the one Trellis opened, or one the agent opened and named in its outcome or its words.
func pullOf(root string, job Job) (pull, bool) {
	candidates := []string{job.PR}
	for _, p := range job.Produced {
		if p.Kind == "pr" {
			candidates = append(candidates, p.URL)
		}
	}
	for _, value := range job.Data {
		candidates = append(candidates, value)
	}
	if thread, err := Thread(root, job.ID); err == nil {
		for _, entry := range slices.Backward(thread) {
			candidates = append(candidates, entry.Text)
			for _, value := range entry.Data {
				candidates = append(candidates, value)
			}
		}
	}
	for _, text := range candidates {
		if match := pullURL.FindStringSubmatch(text); match != nil {
			return pull{owner: match[1], repo: match[2], number: match[3], url: match[0]}, true
		}
	}
	return pull{}, false
}

type reviewThread struct {
	ID         string
	IsResolved bool
	IsOutdated bool
	Path       string
	Line       *int
	Comments   struct {
		Nodes []struct {
			DatabaseID int `json:"databaseId"`
			Body       string
			Author     struct{ Login string }
		}
	}
}

type review struct {
	State       string
	Body        string
	SubmittedAt time.Time
	Author      struct{ Login string }
}

const reviewQuery = `query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviews(last: 30) { nodes { state body submittedAt author { login } } }
      reviewThreads(first: 100) { nodes { id isResolved isOutdated path line comments(first: 30) { nodes { databaseId body author { login } } } } }
    }
  }
}`

func fetchReview(root string, pr pull) ([]reviewThread, []review, error) {
	out, err := capture(root, "gh", "api", "graphql", "-f", "query="+reviewQuery, "-f", "owner="+pr.owner, "-f", "repo="+pr.repo, "-F", "number="+pr.number)
	if err != nil {
		return nil, nil, fmt.Errorf("gh api: %w", err)
	}
	var parsed struct {
		Data struct {
			Repository struct {
				PullRequest struct {
					Reviews       struct{ Nodes []review }
					ReviewThreads struct{ Nodes []reviewThread }
				}
			}
		}
	}
	if err := json.Unmarshal([]byte(out), &parsed); err != nil {
		return nil, nil, err
	}
	p := parsed.Data.Repository.PullRequest
	return p.ReviewThreads.Nodes, p.Reviews.Nodes, nil
}

// ReviewComments sends the open review comments on the job's PR back to the agent that made it,
// in the same job and session.
func (m *Manager) ReviewComments(root, id string) error {
	job, err := Load(root, id)
	if err != nil {
		return err
	}
	pr, ok := pullOf(root, job)
	if !ok {
		return errors.New("This job has no PR")
	}
	threads, reviews, err := fetchReview(root, pr)
	if err != nil {
		return err
	}
	threads = slices.DeleteFunc(threads, func(t reviewThread) bool { return t.IsResolved || len(t.Comments.Nodes) == 0 })
	// Review summaries are sent once: only those written since the last time.
	reviews = slices.DeleteFunc(reviews, func(r review) bool {
		return strings.TrimSpace(r.Body) == "" || !r.SubmittedAt.After(job.Reviewed)
	})
	if len(threads) == 0 && len(reviews) == 0 {
		return fmt.Errorf("No open review comments on PR #%s", pr.number)
	}

	data := map[string]string{}
	for _, t := range threads {
		where := t.Path
		if t.Line != nil {
			where = fmt.Sprintf("%s:%d", t.Path, *t.Line)
		}
		data[where] = t.Comments.Nodes[0].Body
	}
	for _, r := range reviews {
		data["review by "+r.Author.Login] = r.Body
	}

	text := reviewMessage(pr, threads, reviews)
	entry := Entry{From: "trellis", Kind: "event", Text: "GitHub review", Outcome: "PR #" + pr.number, Data: data}
	if job.State == Working || job.State == NeedsYou {
		if err := m.deliver(root, id, entry, text); err != nil {
			return err
		}
	} else if err := m.reopen(root, job, entry, text); err != nil {
		return err
	}
	_, _ = m.update(root, id, func(j *Job) { j.Reviewed = time.Now().UTC() })
	m.changed(root, id)
	return nil
}

func reviewMessage(pr pull, threads []reviewThread, reviews []review) string {
	var b strings.Builder
	fmt.Fprintf(&b, "The human reviewed your PR #%s (%s) on GitHub. Address every comment below, in this same job and session.\n", pr.number, pr.url)
	for _, r := range reviews {
		fmt.Fprintf(&b, "\nReview by %s (%s):\n%s\n", r.Author.Login, strings.ToLower(strings.ReplaceAll(r.State, "_", " ")), quote(r.Body))
	}
	for i, t := range threads {
		where := t.Path
		if t.Line != nil {
			where = fmt.Sprintf("%s line %d", t.Path, *t.Line)
		}
		if t.IsOutdated {
			where += " (the code has moved since)"
		}
		fmt.Fprintf(&b, "\n%d. %s (thread %s, reply to comment %d)\n", i+1, where, t.ID, t.Comments.Nodes[0].DatabaseID)
		for _, c := range t.Comments.Nodes {
			fmt.Fprintf(&b, "%s:\n%s\n", c.Author.Login, quote(c.Body))
		}
	}
	fmt.Fprintf(&b, `
For each comment:
1. Make the change, commit, and push to the PR's branch, so the PR updates.
2. Reply on its thread with what you changed: gh api repos/%[1]s/%[2]s/pulls/%[3]s/comments/<comment id>/replies -f body='...'
3. Resolve the thread: gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "<thread id>"}) { thread { isResolved } } }'
If you disagree with a comment, reply on its thread saying why, leave it open, and check in about it.
When every comment is dealt with, finish the job again.`, pr.owner, pr.repo, pr.number)
	return b.String()
}

func quote(text string) string {
	lines := strings.Split(strings.TrimSpace(text), "\n")
	for i, line := range lines {
		lines[i] = "> " + line
	}
	return strings.Join(lines, "\n")
}

// OpenPulls says which of the given PR links are still open, with one gh call per repository.
func OpenPulls(root string, urls []string) (map[string]bool, error) {
	repos := map[string]bool{}
	for _, url := range urls {
		if match := pullURL.FindStringSubmatch(url); match != nil {
			repos[match[1]+"/"+match[2]] = true
		}
	}
	open := map[string]bool{}
	for repo := range repos {
		out, err := capture(root, "gh", "pr", "list", "--repo", repo, "--state", "open", "--limit", "500", "--json", "url")
		if err != nil {
			return nil, fmt.Errorf("gh pr list: %w", err)
		}
		var pulls []struct{ URL string }
		if err := json.Unmarshal([]byte(out), &pulls); err != nil {
			return nil, err
		}
		for _, p := range pulls {
			open[p.URL] = true
		}
	}
	result := map[string]bool{}
	for _, url := range urls {
		result[url] = open[url]
	}
	return result, nil
}
