package protocol

import "time"

const (
	TypeConnectionStatus  = "connection_status"
	TypeGitPushRequest   = "git_push_request"
	TypeGitPushResult    = "git_push_result"
	TypeAgentStatus      = "agent_status"
	TypeAgentPushRequest = "agent_push_request"
	TypeAgentPushResult  = "agent_push_result"
	TypeChatRequest      = "chat_request"
	TypeChatResponse     = "chat_response"
	TypePuterReady       = "puter_ready"
	TypeError            = "error"
)

type ConnectionStatus struct {
	Type   string `json:"type"`
	Status string `json:"status"`
}

type GitPushRequest struct {
	Type         string    `json:"type"`
	ID           string    `json:"id"`
	Branch       string    `json:"branch"`
	FilesChanged []string  `json:"filesChanged"`
	Commits      []string  `json:"commits"`
	RepoPath     string    `json:"repoPath"`
	Timestamp    time.Time `json:"timestamp"`
}

type ApprovalResponse struct {
	Type     string `json:"type"`
	ID       string `json:"id"`
	Decision string `json:"decision"`
}

type ApprovalResult struct {
	Type        string    `json:"type"`
	ID          string    `json:"id"`
	Decision    string    `json:"decision"`
	Approved    bool      `json:"approved"`
	Branch      string    `json:"branch,omitempty"`
	RepoPath    string    `json:"repoPath,omitempty"`
	Goal        string    `json:"goal,omitempty"`
	Summary     string    `json:"summary,omitempty"`
	CompletedAt time.Time `json:"completedAt"`
}

type AgentStatus struct {
	Type        string    `json:"type"`
	Status      string    `json:"status"`
	Goal        string    `json:"goal"`
	CurrentStep string    `json:"currentStep"`
	Logs        []string  `json:"logs"`
	RepoPath    string    `json:"repoPath"`
	Timestamp   time.Time `json:"timestamp"`
}

type AgentPushRequest struct {
	Type      string    `json:"type"`
	ID        string    `json:"id"`
	Goal      string    `json:"goal"`
	RepoPath  string    `json:"repoPath"`
	Summary   string    `json:"summary"`
	Logs      []string  `json:"logs"`
	Timestamp time.Time `json:"timestamp"`
}

type ChatHTTPrequest struct {
	Message string `json:"message"`
}

type ChatHTTPResponse struct {
	Response string `json:"response"`
	Provider string `json:"provider,omitempty"`
	Error    string `json:"error,omitempty"`
}

type ChatBridgeRequest struct {
	Type    string `json:"type"`
	ID      string `json:"id"`
	Message string `json:"message"`
}

type ChatBridgeResponse struct {
	Type     string `json:"type"`
	ID       string `json:"id"`
	Response string `json:"response"`
	Error    string `json:"error,omitempty"`
}

type ErrorMessage struct {
	Type  string `json:"type"`
	Error string `json:"error"`
}
