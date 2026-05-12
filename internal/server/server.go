package server

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"gap/internal/approval"
	"gap/internal/protocol"
	"gap/internal/puterbridge"

	"github.com/gorilla/websocket"
)

type Server struct {
	approvals *approval.Manager
	hub       *Hub
	puter     *puterbridge.Bridge
	upgrader  websocket.Upgrader
}

func New(timeout time.Duration) *Server {
	return &Server{
		approvals: approval.NewManager(timeout),
		hub:       NewHub(),
		puter:     puterbridge.New(),
		upgrader: websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }},
	}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/ws", s.handleWS)
	mux.HandleFunc("/puter-bridge", s.handlePuterBridgePage)
	mux.HandleFunc("/puter-ws", s.handlePuterWS)
	mux.HandleFunc("/chat", s.handleChat)
	mux.HandleFunc("/git/pre-push", s.handleGitPrePush)
	mux.HandleFunc("/agent/status", s.handleAgentStatus)
	mux.HandleFunc("/agent/push-request", s.handleAgentPushRequest)
	return mux
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handlePuterBridgePage(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("content-type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(puterbridge.PageHTML()))
}

func (s *Server) handlePuterWS(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("puter websocket upgrade failed: %v", err)
		return
	}

	s.puter.Attach(conn)
	s.hub.Broadcast(protocol.ConnectionStatus{Type: protocol.TypeConnectionStatus, Status: "puter_bridge_connected"})

	go func() {
		defer s.puter.Detach(conn)
		defer conn.Close()
		for {
			_, payload, err := conn.ReadMessage()
			if err != nil {
				return
			}
			s.puter.HandleMessage(payload)
		}
	}()
}

func (s *Server) handleChat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}

	var request protocol.ChatHTTPrequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeJSON(w, http.StatusBadRequest, protocol.ChatHTTPResponse{Error: "invalid chat request"})
		return
	}

	if request.Message == "" {
		writeJSON(w, http.StatusBadRequest, protocol.ChatHTTPResponse{Error: "message is required"})
		return
	}

	response, err := s.puter.Chat(request.Message)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, protocol.ChatHTTPResponse{Error: err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, protocol.ChatHTTPResponse{Response: response})
}

func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("websocket upgrade failed: %v", err)
		return
	}

	s.hub.Add(conn)
	s.hub.Broadcast(protocol.ConnectionStatus{Type: protocol.TypeConnectionStatus, Status: "connected"})

	go func() {
		defer s.hub.Remove(conn)
		for {
			_, payload, err := conn.ReadMessage()
			if err != nil {
				return
			}
			s.handleWSMessage(payload)
		}
	}()
}

func (s *Server) handleWSMessage(payload []byte) {
	var raw struct {
		Type     string `json:"type"`
		ID       string `json:"id"`
		Decision string `json:"decision"`
	}
	if err := json.Unmarshal(payload, &raw); err != nil {
		s.hub.Broadcast(protocol.ErrorMessage{Type: protocol.TypeError, Error: "invalid websocket json"})
		return
	}

	switch raw.Type {
	case "git_push_response":
		result, _ := s.approvals.Resolve(raw.ID, raw.Decision)
		s.hub.Broadcast(protocol.ApprovalResult{
			Type:        protocol.TypeGitPushResult,
			ID:          result.ID,
			Decision:    string(result.Decision),
			Approved:    result.Approved,
			CompletedAt: time.Now(),
		})
	case "agent_push_response":
		result, _ := s.approvals.Resolve(raw.ID, raw.Decision)
		s.hub.Broadcast(protocol.ApprovalResult{
			Type:        protocol.TypeAgentPushResult,
			ID:          result.ID,
			Decision:    string(result.Decision),
			Approved:    result.Approved,
			CompletedAt: time.Now(),
		})
	default:
		s.hub.Broadcast(protocol.ErrorMessage{Type: protocol.TypeError, Error: "unknown websocket message type"})
	}
}

func (s *Server) handleGitPrePush(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}

	var request protocol.GitPushRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid git request"})
		return
	}

	request.Type = protocol.TypeGitPushRequest
	request.ID = newID()
	request.Timestamp = time.Now()

	s.hub.Broadcast(request)
	result := s.approvals.Wait(request.ID)

	approvalResult := protocol.ApprovalResult{
		Type:        protocol.TypeGitPushResult,
		ID:          request.ID,
		Decision:    string(result.Decision),
		Approved:    result.Approved,
		Branch:      request.Branch,
		RepoPath:    request.RepoPath,
		CompletedAt: time.Now(),
	}
	s.hub.Broadcast(approvalResult)
	writeJSON(w, http.StatusOK, map[string]bool{"approved": result.Approved})
}

func (s *Server) handleAgentStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}

	var status protocol.AgentStatus
	if err := json.NewDecoder(r.Body).Decode(&status); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid agent status"})
		return
	}

	status.Type = protocol.TypeAgentStatus
	status.Timestamp = time.Now()
	s.hub.Broadcast(status)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleAgentPushRequest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}

	var request protocol.AgentPushRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid agent push request"})
		return
	}

	request.Type = protocol.TypeAgentPushRequest
	request.ID = newID()
	request.Timestamp = time.Now()

	s.hub.Broadcast(request)
	result := s.approvals.Wait(request.ID)

	approvalResult := protocol.ApprovalResult{
		Type:        protocol.TypeAgentPushResult,
		ID:          request.ID,
		Decision:    string(result.Decision),
		Approved:    result.Approved,
		RepoPath:    request.RepoPath,
		Goal:        request.Goal,
		Summary:     request.Summary,
		CompletedAt: time.Now(),
	}
	s.hub.Broadcast(approvalResult)
	writeJSON(w, http.StatusOK, map[string]bool{"approved": result.Approved})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func newID() string {
	return time.Now().UTC().Format("20060102150405.000000000")
}
