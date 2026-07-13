package api

import "sync"

// Hub fans run-state payloads out to SSE subscribers, keyed by run ID.
type Hub struct {
	mu   sync.Mutex
	subs map[int64]map[chan []byte]struct{}
}

func NewHub() *Hub {
	return &Hub{subs: map[int64]map[chan []byte]struct{}{}}
}

func (h *Hub) Subscribe(runID int64) (<-chan []byte, func()) {
	ch := make(chan []byte, 16)
	h.mu.Lock()
	if h.subs[runID] == nil {
		h.subs[runID] = map[chan []byte]struct{}{}
	}
	h.subs[runID][ch] = struct{}{}
	h.mu.Unlock()

	cancel := func() {
		h.mu.Lock()
		if subs, ok := h.subs[runID]; ok {
			delete(subs, ch)
			if len(subs) == 0 {
				delete(h.subs, runID)
			}
		}
		h.mu.Unlock()
		close(ch)
	}
	return ch, cancel
}

// Publish never blocks: a slow subscriber just misses an event, which is fine
// because every payload is a full snapshot.
func (h *Hub) Publish(runID int64, payload []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.subs[runID] {
		select {
		case ch <- payload:
		default:
		}
	}
}
