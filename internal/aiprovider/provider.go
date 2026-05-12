package aiprovider

import (
	"errors"
	"strings"
)

type Provider interface {
	Name() string
	Available() bool
	Chat(message string) (string, error)
}

type Status struct {
	Name      string `json:"name"`
	Available bool   `json:"available"`
	Selected  bool   `json:"selected"`
}

type Router struct {
	providers []Provider
}

func NewRouter(providers ...Provider) *Router {
	return &Router{providers: providers}
}

func (r *Router) Chat(message string) (string, string, error) {
	var failures []string

	for _, provider := range r.providers {
		if !provider.Available() {
			failures = append(failures, provider.Name()+": unavailable")
			continue
		}

		response, err := provider.Chat(message)
		if err == nil {
			return response, provider.Name(), nil
		}
		failures = append(failures, provider.Name()+": "+err.Error())
	}

	if len(failures) == 0 {
		return "", "", errors.New("no AI providers configured")
	}
	return "", "", errors.New(strings.Join(failures, "; "))
}

func (r *Router) Statuses() []Status {
	statuses := make([]Status, 0, len(r.providers))
	for i, provider := range r.providers {
		statuses = append(statuses, Status{
			Name:      provider.Name(),
			Available: provider.Available(),
			Selected:  i == 0,
		})
	}
	return statuses
}
