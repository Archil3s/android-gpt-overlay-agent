package aiprovider

import "gap/internal/puterbridge"

type PuterProvider struct {
	bridge *puterbridge.Bridge
}

func NewPuterProvider(bridge *puterbridge.Bridge) *PuterProvider {
	return &PuterProvider{bridge: bridge}
}

func (p *PuterProvider) Name() string {
	return "puter"
}

func (p *PuterProvider) Available() bool {
	return p.bridge != nil && p.bridge.Available()
}

func (p *PuterProvider) Chat(message string) (string, error) {
	return p.bridge.Chat(message)
}
