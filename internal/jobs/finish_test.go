package jobs

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func finishFixture(t *testing.T) (string, Job) {
	t.Helper()
	root := t.TempDir()
	dir := filepath.Join(root, ".trellis", "departments", "engineering", "agents")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(filepath.Dir(dir), "department.yaml"), []byte("name: Engineering\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "agent.md"), []byte("---\nname: Agent\n---\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	job := Job{ID: "job-1", Department: "engineering", Agent: "agent", State: Working, Branch: "branch", Worktree: filepath.Join(root, "missing")}
	if err := Save(root, job); err != nil {
		t.Fatal(err)
	}
	return root, job
}

func TestSuccessfulFinishExcludesConcurrentCancelAndReply(t *testing.T) {
	root, job := finishFixture(t)
	job.Branch, job.Worktree = "", ""
	if err := Save(root, job); err != nil {
		t.Fatal(err)
	}
	entered, unblock := make(chan struct{}), make(chan struct{})
	var once sync.Once
	m := &Manager{Changed: func(_, _ string) { once.Do(func() { close(entered); <-unblock }) }}
	done := make(chan error, 1)
	go func() { done <- m.Finish(root, job.ID, "") }()
	select {
	case <-entered:
	case <-time.After(5 * time.Second):
		t.Fatal("finish did not begin")
	}
	if err := m.Cancel(root, job.ID); err != nil {
		t.Fatal(err)
	}
	if err := m.Finish(root, job.ID, ""); err != nil {
		t.Fatal(err)
	}
	if err := m.Send(root, job.ID, "late reply"); err == nil {
		t.Fatal("reply was accepted")
	}
	close(unblock)
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("finish did not complete")
	}
	got, err := Load(root, job.ID)
	if err != nil || got.State != Done {
		t.Fatalf("finish: %+v, %v", got, err)
	}
	thread, err := Thread(root, job.ID)
	if err != nil {
		t.Fatal(err)
	}
	var count int
	for _, entry := range thread {
		if entry.Kind == "done" {
			count++
		}
		if entry.Kind == "cancelled" || entry.Kind == "message" {
			t.Fatalf("unexpected entry: %+v", entry)
		}
	}
	if count != 1 {
		t.Fatalf("done entries: %d", count)
	}
}

func TestFinishingRejectsConcurrentOperationsAndFailureCanRetry(t *testing.T) {
	root, job := finishFixture(t)
	entered, unblock := make(chan struct{}), make(chan struct{})
	m := &Manager{Changed: func(_, _ string) { close(entered); <-unblock }}
	result := make(chan error, 1)
	go func() { result <- m.Finish(root, job.ID, "") }()
	select {
	case <-entered:
	case <-time.After(5 * time.Second):
		t.Fatal("finish did not reach PR failure")
	}
	if err := m.Send(root, job.ID, "reply"); err == nil || !strings.Contains(err.Error(), "finishing") {
		t.Fatalf("reply during finish: %v", err)
	}
	if err := m.Cancel(root, job.ID); err != nil {
		t.Fatal(err)
	}
	if err := m.Finish(root, job.ID, ""); err != nil {
		t.Fatal(err)
	}
	close(unblock)
	if err := <-result; err == nil {
		t.Fatal("expected PR failure")
	}
	m.Changed = nil
	if _, err := m.update(root, job.ID, func(j *Job) { j.Branch, j.Worktree = "", "" }); err != nil {
		t.Fatal(err)
	}
	if err := m.Finish(root, job.ID, ""); err != nil {
		t.Fatal(err)
	}
	got, err := Load(root, job.ID)
	if err != nil || got.State != Done {
		t.Fatalf("retry: %+v, %v", got, err)
	}
	thread, err := Thread(root, job.ID)
	if err != nil {
		t.Fatal(err)
	}
	done := 0
	for _, entry := range thread {
		if entry.Kind == "done" {
			done++
		}
		if entry.Kind == "cancelled" || entry.Kind == "message" {
			t.Fatalf("unexpected entry: %+v", entry)
		}
	}
	if done != 1 {
		t.Fatalf("done entries: %d", done)
	}
}

func TestCancelReportsWorktreeRemovalFailureOnce(t *testing.T) {
	root, job := finishFixture(t)
	m := &Manager{}
	if err := m.Cancel(root, job.ID); err != nil {
		t.Fatal(err)
	}
	if err := m.Cancel(root, job.ID); err != nil {
		t.Fatal(err)
	}
	thread, err := Thread(root, job.ID)
	if err != nil {
		t.Fatal(err)
	}
	var notes, cancelled int
	for _, entry := range thread {
		if strings.Contains(entry.Text, "Couldn't remove the worktree") {
			notes++
		}
		if entry.Kind == "cancelled" {
			cancelled++
		}
	}
	if notes != 1 || cancelled != 1 {
		t.Fatalf("notes=%d cancelled=%d", notes, cancelled)
	}
}

func TestCancelWaitsForExistingOperationAndBlocksWake(t *testing.T) {
	root, job := finishFixture(t)
	job.Branch, job.Worktree, job.State = "", "", Waiting
	if err := Save(root, job); err != nil {
		t.Fatal(err)
	}
	release, ok := beginOperation(root, job.ID, false)
	if !ok {
		t.Fatal("could not start operation")
	}
	m := &Manager{}
	done := make(chan error, 1)
	go func() { done <- m.Cancel(root, job.ID) }()
	deadline := time.Now().Add(5 * time.Second)
	for {
		operationMu.Lock()
		op := operations[filepath.Join(root, job.ID)]
		closing := op != nil && op.closing
		operationMu.Unlock()
		if closing {
			break
		}
		if time.Now().After(deadline) {
			release()
			t.Fatal("cancel did not claim job")
		}
		time.Sleep(time.Millisecond)
	}
	m.wake(root, job, "")
	m.freshSession(root, job.ID, "")
	m.rest(root, job.ID, "")
	select {
	case err := <-done:
		release()
		t.Fatalf("cancel returned early: %v", err)
	default:
	}
	release()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("cancel did not complete")
	}
	got, err := Load(root, job.ID)
	if err != nil || got.State != Cancelled {
		t.Fatalf("cancel: %+v, %v", got, err)
	}
}

func TestLateSessionResultKeepsTerminalState(t *testing.T) {
	for _, state := range []string{Done, Cancelled, Failed} {
		t.Run(state, func(t *testing.T) {
			root, job := finishFixture(t)
			job.State = state
			if err := Save(root, job); err != nil {
				t.Fatal(err)
			}
			m := &Manager{}
			m.line(&live{root: root, id: job.ID}, []byte(`{"type":"result"}`))
			got, err := Load(root, job.ID)
			if err != nil || got.State != state {
				t.Fatalf("late result: %+v, %v", got, err)
			}
		})
	}
}
