package approval

import (
	"errors"
	"sync"
	"time"
)

var ErrTimeout = errors.New("approval timed out")

type Decision string

const (
	DecisionApproved Decision = "approved"
	DecisionRejected Decision = "rejected"
	DecisionTimeout  Decision = "timeout"
)

type Result struct {
	ID       string
	Decision Decision
	Approved bool
}

type pendingRequest struct {
	id string
	ch chan Result
}

type Manager struct {
	mu      sync.Mutex
	pending map[string]pendingRequest
	timeout time.Duration
}

func NewManager(timeout time.Duration) *Manager {
	return &Manager{
		pending: make(map[string]pendingRequest),
		timeout: timeout,
	}
}

func (m *Manager) Wait(id string) Result {
	request := pendingRequest{id: id, ch: make(chan Result, 1)}

	m.mu.Lock()
	m.pending[id] = request
	m.mu.Unlock()

	timer := time.NewTimer(m.timeout)
	defer timer.Stop()

	select {
	case result := <-request.ch:
		return result
	case <-timer.C:
		m.mu.Lock()
		delete(m.pending, id)
		m.mu.Unlock()
		return Result{ID: id, Decision: DecisionTimeout, Approved: false}
	}
}

func (m *Manager) Resolve(id string, decision string) (Result, bool) {
	m.mu.Lock()
	request, ok := m.pending[id]
	if ok {
		delete(m.pending, id)
	}
	m.mu.Unlock()

	if !ok {
		return Result{ID: id, Decision: DecisionRejected, Approved: false}, false
	}

	result := normalize(id, decision)
	request.ch <- result
	return result, true
}

func normalize(id string, decision string) Result {
	if decision == "approve" || decision == string(DecisionApproved) {
		return Result{ID: id, Decision: DecisionApproved, Approved: true}
	}

	return Result{ID: id, Decision: DecisionRejected, Approved: false}
}
