package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"gap/internal/server"
)

func main() {
	addr := getenv("GAP_ADDR", "127.0.0.1:3000")
	timeout := getenvDuration("GAP_APPROVAL_TIMEOUT", 5*time.Minute)

	srv := server.New(timeout)

	log.Printf("gapd listening on http://%s", addr)
	log.Printf("approval timeout: %s", timeout)

	if err := http.ListenAndServe(addr, srv.Routes()); err != nil {
		log.Fatalf("gapd failed: %v", err)
	}
}

func getenv(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func getenvDuration(key string, fallback time.Duration) time.Duration {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	parsed, err := time.ParseDuration(value)
	if err != nil {
		return fallback
	}
	return parsed
}
