package aiprovider

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"time"
)

type OllamaProvider struct {
	baseURL string
	model   string
	client  *http.Client
}

func NewOllamaProvider() *OllamaProvider {
	baseURL := os.Getenv("GAP_OLLAMA_URL")
	if baseURL == "" {
		baseURL = "http://127.0.0.1:11434"
	}

	model := os.Getenv("GAP_OLLAMA_MODEL")
	if model == "" {
		model = "llama3.2"
	}

	return &OllamaProvider{
		baseURL: baseURL,
		model:   model,
		client:  &http.Client{Timeout: 2 * time.Minute},
	}
}

func (p *OllamaProvider) Name() string {
	return "ollama"
}

func (p *OllamaProvider) Available() bool {
	request, err := http.NewRequest(http.MethodGet, p.baseURL+"/api/tags", nil)
	if err != nil {
		return false
	}
	response, err := p.client.Do(request)
	if err != nil {
		return false
	}
	defer response.Body.Close()
	return response.StatusCode >= 200 && response.StatusCode < 300
}

func (p *OllamaProvider) Chat(message string) (string, error) {
	payload := map[string]any{
		"model":  p.model,
		"prompt": message,
		"stream": false,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	request, err := http.NewRequest(http.MethodPost, p.baseURL+"/api/generate", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	request.Header.Set("content-type", "application/json")

	response, err := p.client.Do(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()

	var decoded struct {
		Response string `json:"response"`
		Error    string `json:"error"`
	}
	if err := json.NewDecoder(response.Body).Decode(&decoded); err != nil {
		return "", err
	}
	if response.StatusCode >= 400 {
		if decoded.Error != "" {
			return "", errors.New(decoded.Error)
		}
		return "", errors.New(response.Status)
	}
	return decoded.Response, nil
}
