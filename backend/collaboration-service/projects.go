package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

type projectClient struct {
	baseURL, key string
	http         *http.Client
	mu           sync.Mutex
	cache        map[string]projectCacheEntry
}
type projectCacheEntry struct {
	value   any
	expires time.Time
}

func newProjectClient(c config) *projectClient {
	return &projectClient{baseURL: strings.TrimRight(c.projectServiceURL, "/"), key: c.projectServiceKey, http: &http.Client{Timeout: 5 * time.Second}, cache: map[string]projectCacheEntry{}}
}
func (p *projectClient) get(ctx context.Context, path string) (any, error) {
	p.mu.Lock()
	entry, ok := p.cache[path]
	if ok && time.Now().Before(entry.expires) {
		p.mu.Unlock()
		return entry.value, nil
	}
	p.mu.Unlock()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.baseURL+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Service-Key", p.key)
	resp, err := p.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("project service returned %s", resp.Status)
	}
	var value any
	if err = json.NewDecoder(resp.Body).Decode(&value); err != nil {
		return nil, err
	}
	p.mu.Lock()
	p.cache[path] = projectCacheEntry{value: value, expires: time.Now().Add(30 * time.Second)}
	p.mu.Unlock()
	return value, nil
}
func (p *projectClient) members(ctx context.Context, project string) ([]any, error) {
	v, e := p.get(ctx, "/projects/internal/"+project+"/members")
	if e != nil {
		return nil, e
	}
	items, ok := v.([]any)
	if !ok {
		return nil, fmt.Errorf("invalid project members response")
	}
	return items, nil
}
func (p *projectClient) memberRole(ctx context.Context, project, user string) (string, error) {
	items, e := p.members(ctx, project)
	if e != nil {
		return "", e
	}
	for _, item := range items {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		id := firstString(m["userId"], m["user_id"])
		if nested, ok := m["id"].(map[string]any); ok {
			id = firstString(nested["userId"], nested["user_id"])
		}
		if nested, ok := m["id"].(string); ok {
			id = nested
		}
		if strings.EqualFold(id, user) {
			return firstString(m["role"]), nil
		}
	}
	return "", nil
}
func (p *projectClient) project(ctx context.Context, id string) (map[string]any, error) {
	v, e := p.get(ctx, "/projects/internal/"+id)
	if e != nil {
		return nil, e
	}
	m, ok := v.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("invalid project response")
	}
	return m, nil
}
