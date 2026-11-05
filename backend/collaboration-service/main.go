package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5/pgxpool"
)

type config struct {
	port, databaseURL, jwtSecret, projectServiceURL, projectServiceKey, workspaceRoot string
	origins                                                                           []string
}

type app struct {
	cfg      config
	db       *pgxpool.Pool
	projects *projectClient
	rooms    *roomHub
	voice    *voiceHub
	theia    *theiaHub
}

func main() {
	loadDotEnv(filepath.Join(".", ".env"))
	cfg := config{
		port:              env("PORT", "8090"),
		databaseURL:       env("DATABASE_URL", "postgres://postgres@localhost:5432/colaby?sslmode=disable"),
		jwtSecret:         os.Getenv("JWT_SECRET"),
		projectServiceURL: env("PROJECT_SERVICE_URL", "http://localhost:8084"),
		projectServiceKey: os.Getenv("PROJECT_SERVICE_KEY"),
		workspaceRoot:     env("WORKSPACE_ROOT_DIR", filepath.Join(os.Getenv("HOME"), ".local", "share", "colaby", "workspaces")),
		origins:           splitCSV(env("THEIA_PARENT_ORIGINS", "http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:5173")),
	}
	if cfg.jwtSecret == "" || cfg.projectServiceKey == "" {
		slog.Error("JWT_SECRET and PROJECT_SERVICE_KEY are required")
		os.Exit(1)
	}
	if err := os.MkdirAll(cfg.workspaceRoot, 0o755); err != nil {
		slog.Error("create workspace root", "error", err)
		os.Exit(1)
	}
	ctx := context.Background()
	db, err := pgxpool.New(ctx, cfg.databaseURL)
	if err != nil {
		slog.Error("connect PostgreSQL", "error", err)
		os.Exit(1)
	}
	defer db.Close()
	if err := db.Ping(ctx); err != nil {
		slog.Error("ping PostgreSQL", "error", err)
		os.Exit(1)
	}
	if err := migrate(ctx, db); err != nil {
		slog.Error("migrate PostgreSQL", "error", err)
		os.Exit(1)
	}
	a := &app{cfg: cfg, db: db, projects: newProjectClient(cfg), rooms: newRoomHub(), voice: newVoiceHub(), theia: newTheiaHub()}
	server := &http.Server{Addr: ":" + cfg.port, Handler: a.routes(), ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 90 * time.Second}
	slog.Info("Go collaboration service listening", "port", cfg.port, "database", "PostgreSQL")
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("HTTP server", "error", err)
		os.Exit(1)
	}
}

func (a *app) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		if err := a.db.Ping(r.Context()); err != nil {
			writeError(w, 503, "DATABASE_UNAVAILABLE", "PostgreSQL unavailable")
			return
		}
		writeJSON(w, 200, map[string]any{"status": "ok", "service": "collaboration-service", "database": "postgresql", "timestamp": time.Now().UTC()})
	})
	mux.HandleFunc("/api/workspaces/", a.workspaceRoute)
	mux.HandleFunc("/collaboration/api/workspaces/", a.workspaceRoute)
	mux.HandleFunc("/ws/workspace/", a.workspaceWS)
	mux.HandleFunc("/terminal-pty", a.terminalWS)
	mux.HandleFunc("/terminal/", a.terminalWS)
	return a.securityHeaders(a.cors(mux))
}

func (a *app) cors(next http.Handler) http.Handler {
	allowed := map[string]bool{}
	for _, o := range a.cfg.origins {
		allowed[o] = true
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		behindGateway := r.Header.Get("X-Forwarded-Host") != "" || r.Header.Get("X-Forwarded-For") != "" || r.Header.Get("X-User-Id") != ""
		if origin != "" && !behindGateway && allowed[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Add("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Requested-With")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *app) securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "SAMEORIGIN")
		w.Header().Set("Referrer-Policy", "no-referrer")
		next.ServeHTTP(w, r)
	})
}

func (a *app) workspaceRoute(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/collaboration")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) < 3 || parts[0] != "api" || parts[1] != "workspaces" {
		http.NotFound(w, r)
		return
	}
	projectID := parts[2]
	if !validProjectID(projectID) {
		writeError(w, 400, "INVALID_PROJECT_ID", "Invalid project ID format")
		return
	}
	userID, ok := a.authenticate(w, r)
	if !ok {
		return
	}
	role, err := a.projects.memberRole(r.Context(), projectID, userID)
	if err != nil {
		writeError(w, 503, "PROJECT_SERVICE_UNAVAILABLE", "Project Service unavailable")
		return
	}
	if role == "" {
		writeError(w, 403, "PROJECT_ACCESS_DENIED", "User is not a member of this project")
		return
	}
	if err := a.ensureWorkspace(r.Context(), projectID); err != nil {
		internalError(w, err)
		return
	}
	resource := parts[3:]
	if len(resource) == 0 {
		a.workspaceInfo(w, r, projectID)
		return
	}
	switch resource[0] {
	case "chat":
		if len(resource) > 1 {
			http.NotFound(w, r)
			return
		}
		a.chatRoute(w, r, projectID, userID)
	case "whiteboard":
		if len(resource) > 1 {
			http.NotFound(w, r)
			return
		}
		a.whiteboardRoute(w, r, projectID, userID)
	case "initialize":
		if r.Method != http.MethodPost {
			methodNotAllowed(w)
			return
		}
		if len(resource) > 1 && resource[1] == "clone" {
			a.cloneWorkspace(w, r, projectID, userID)
		} else {
			a.initializeWorkspace(w, r, projectID, userID)
		}
	case "clone":
		if r.Method != http.MethodPost {
			methodNotAllowed(w)
			return
		}
		a.cloneWorkspace(w, r, projectID, userID)
	case "tree":
		if r.Method != http.MethodGet {
			methodNotAllowed(w)
			return
		}
		tree, err := a.fileTree(projectID)
		if err != nil {
			internalError(w, err)
			return
		}
		writeJSON(w, 200, map[string]any{"success": true, "data": tree})
	case "file":
		a.fileRoute(w, r, projectID, userID)
	case "files":
		if len(resource) < 2 || resource[1] != "operation" || r.Method != http.MethodPost {
			http.NotFound(w, r)
			return
		}
		a.fileOperation(w, r, projectID, userID)
	case "members":
		if r.Method != http.MethodGet {
			methodNotAllowed(w)
			return
		}
		members, err := a.projects.members(r.Context(), projectID)
		if err != nil {
			internalError(w, err)
			return
		}
		writeJSON(w, 200, map[string]any{"success": true, "data": members})
	case "theia":
		a.theiaRoute(w, r, projectID)
	case "terminal":
		if len(resource) < 2 || resource[1] != "exec" || r.Method != http.MethodPost {
			http.NotFound(w, r)
			return
		}
		a.execCommand(w, r, projectID)
	case "terminal-token":
		if r.Method != http.MethodGet {
			methodNotAllowed(w)
			return
		}
		token := signTerminalToken(a.cfg.jwtSecret, userID, projectID)
		writeJSON(w, 200, map[string]any{"success": true, "data": map[string]any{"token": token, "projectId": projectID, "userId": userID}})
	default:
		http.NotFound(w, r)
	}
}

func (a *app) authenticate(w http.ResponseWriter, r *http.Request) (string, bool) {
	header := r.Header.Get("Authorization")
	if !strings.HasPrefix(header, "Bearer ") {
		writeError(w, 401, "UNAUTHORIZED", "Missing user identity or authentication token")
		return "", false
	}
	claims, err := parseJWT(strings.TrimPrefix(header, "Bearer "), a.cfg.jwtSecret)
	if err != nil {
		writeError(w, 401, "UNAUTHORIZED", "Invalid or expired token")
		return "", false
	}
	userID := firstString(claims["sub"], claims["userId"], claims["id"])
	if userID == "" {
		writeError(w, 401, "UNAUTHORIZED", "Missing user identity or authentication token")
		return "", false
	}
	return strings.ToLower(userID), true
}

func (a *app) workspaceWS(w http.ResponseWriter, r *http.Request) {
	projectID := strings.Trim(strings.TrimPrefix(r.URL.Path, "/ws/workspace/"), "/")
	if !validProjectID(projectID) {
		http.Error(w, "invalid project", 400)
		return
	}
	token := r.URL.Query().Get("token")
	if token == "" && strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ") {
		token = strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	}
	claims, err := parseJWT(token, a.cfg.jwtSecret)
	if err != nil {
		http.Error(w, "unauthorized", 401)
		return
	}
	userID := strings.ToLower(firstString(claims["sub"], claims["userId"], claims["id"]))
	if userID == "" {
		http.Error(w, "unauthorized", 401)
		return
	}
	role, err := a.projects.memberRole(r.Context(), projectID, userID)
	if err != nil {
		http.Error(w, "project service unavailable", 503)
		return
	}
	if role == "" {
		http.Error(w, "project access denied", 403)
		return
	}
	if err := a.ensureWorkspace(r.Context(), projectID); err != nil {
		http.Error(w, "workspace unavailable", 500)
		return
	}
	upgrader := websocket.Upgrader{CheckOrigin: func(req *http.Request) bool {
		origin := req.Header.Get("Origin")
		if origin == "" {
			return true
		}
		for _, allowed := range a.cfg.origins {
			if origin == allowed {
				return true
			}
		}
		return false
	}}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	a.rooms.serve(a, conn, projectID, userID)
}

func env(key, fallback string) string {
	if s := os.Getenv(key); s != "" {
		return s
	}
	return fallback
}
func loadDotEnv(path string) {
	b, err := os.ReadFile(path)
	if err != nil {
		return
	}
	for _, line := range strings.Split(string(b), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.Trim(strings.TrimSpace(value), "\"'")
		if _, exists := os.LookupEnv(key); !exists {
			_ = os.Setenv(key, value)
		}
	}
}
func splitCSV(s string) []string {
	var out []string
	for _, x := range strings.Split(s, ",") {
		if x = strings.TrimSpace(x); x != "" {
			out = append(out, x)
		}
	}
	return out
}
func firstString(values ...any) string {
	for _, v := range values {
		if s, ok := v.(string); ok && s != "" {
			return s
		}
	}
	return ""
}
func validProjectID(s string) bool {
	if s == "" || len(s) > 128 {
		return false
	}
	for _, c := range s {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '_' || c == '-') {
			return false
		}
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{"success": false, "error": map[string]string{"code": code, "message": message}})
}
func internalError(w http.ResponseWriter, err error) {
	slog.Error("request failed", "error", err)
	writeError(w, 500, "INTERNAL_ERROR", "Internal server error")
}
func methodNotAllowed(w http.ResponseWriter) {
	writeError(w, 405, "METHOD_NOT_ALLOWED", "Method not allowed")
}

func migrate(ctx context.Context, db *pgxpool.Pool) error {
	contents, err := os.ReadFile("migrations/001_init.sql")
	if err != nil {
		return fmt.Errorf("read database migration: %w", err)
	}
	for _, statement := range strings.Split(string(contents), ";") {
		statement = strings.TrimSpace(statement)
		if statement == "" {
			continue
		}
		if _, err = db.Exec(ctx, statement); err != nil {
			return err
		}
	}
	return nil
}
