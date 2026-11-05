package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestJWTVerification(t *testing.T) {
	secret := "test-secret-that-is-long-enough-to-sign-a-token"
	claims := map[string]any{"sub": "user-1", "exp": time.Now().Add(time.Minute).Unix()}
	token := testJWT(t, secret, claims)
	got, err := parseJWT(token, secret)
	if err != nil || got["sub"] != "user-1" {
		t.Fatalf("expected valid token, got claims=%v err=%v", got, err)
	}
	if _, err = parseJWT(token, secret+"wrong"); err == nil {
		t.Fatal("expected signature mismatch to fail")
	}
	claims["exp"] = time.Now().Add(-time.Minute).Unix()
	if _, err = parseJWT(testJWT(t, secret, claims), secret); err == nil {
		t.Fatal("expected expired token to fail")
	}
}

func TestProjectIDAndWebSocketValidation(t *testing.T) {
	for _, id := range []string{"123e4567-e89b-12d3-a456-426614174000", "project_42"} {
		if !validProjectID(id) {
			t.Errorf("valid project ID rejected: %q", id)
		}
	}
	for _, id := range []string{"", "../etc", "project/path", strings.Repeat("x", 129)} {
		if validProjectID(id) {
			t.Errorf("invalid project ID accepted: %q", id)
		}
	}
	if got := validateWSEvent("CHAT_MESSAGE", map[string]any{"content": "hello"}); got != "" {
		t.Fatalf("valid chat rejected: %s", got)
	}
	if got := validateWSEvent("CHAT_MESSAGE", map[string]any{"content": ""}); got == "" {
		t.Fatal("empty chat accepted")
	}
}

func TestPostgresWorkspaceChatAndWhiteboard(t *testing.T) {
	loadDotEnv(".env")
	dsn := os.Getenv("COLABY_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set COLABY_TEST_DATABASE_URL to run PostgreSQL integration checks")
	}
	ctx := context.Background()
	db, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err = migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	project := fmt.Sprintf("go-integration-%d", time.Now().UnixNano())
	root := t.TempDir()
	projectService := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Header.Get("X-Service-Key") != "integration-key" {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		if strings.HasSuffix(r.URL.Path, "/members") {
			_, _ = w.Write([]byte(`[ {"userId":"integration-user","role":"MEMBER"} ]`))
			return
		}
		_, _ = w.Write([]byte(`{"githubRepoUrl":"https://example.invalid/repo.git"}`))
	}))
	defer projectService.Close()
	secret := "integration-secret-with-enough-length-for-hs512-testing"
	cfg := config{workspaceRoot: root, jwtSecret: secret, projectServiceURL: projectService.URL, projectServiceKey: "integration-key"}
	a := &app{cfg: cfg, db: db, projects: newProjectClient(cfg), rooms: newRoomHub(), voice: newVoiceHub(), theia: newTheiaHub()}
	if err = a.ensureWorkspace(ctx, project); err != nil {
		t.Fatal(err)
	}
	defer func() {
		for _, table := range []string{"collaboration_chat_messages", "collaboration_whiteboards", "collaboration_file_operations", "collaboration_code_documents", "collaboration_events", "collaboration_snapshots", "collaboration_file_nodes", "collaboration_workspaces"} {
			_, _ = db.Exec(ctx, "DELETE FROM "+table+" WHERE project_id=$1", project)
		}
		_ = os.RemoveAll(filepath.Join(root, project))
	}()
	init := httptest.NewRecorder()
	a.initializeWorkspace(init, httptest.NewRequest(http.MethodPost, "/", nil), project, "integration-user")
	if init.Code != http.StatusOK {
		t.Fatalf("workspace initialization: status %d body %s", init.Code, init.Body.String())
	}
	apiToken := testJWT(t, secret, map[string]any{"sub": "integration-user", "exp": time.Now().Add(time.Minute).Unix()})
	apiReq := httptest.NewRequest(http.MethodGet, "/api/workspaces/"+project+"/tree", nil)
	apiReq.Header.Set("Authorization", "Bearer "+apiToken)
	apiResp := httptest.NewRecorder()
	a.routes().ServeHTTP(apiResp, apiReq)
	if apiResp.Code != http.StatusOK {
		t.Fatalf("authenticated workspace API: status %d body %s", apiResp.Code, apiResp.Body.String())
	}
	w, err := a.getWorkspace(ctx, project)
	if err != nil || !w.Initialized {
		t.Fatalf("workspace metadata not persisted: %+v %v", w, err)
	}
	tree, err := a.fileTree(project)
	if err != nil {
		t.Fatal(err)
	}
	children, _ := tree["children"].([]any)
	if len(children) < 2 {
		t.Fatalf("starter tree missing files: %#v", tree)
	}
	fileReq := httptest.NewRequest(http.MethodPost, "/file", strings.NewReader(`{"path":"notes/test.txt","content":"persisted"}`))
	fileReq.Header.Set("Content-Type", "application/json")
	fileResp := httptest.NewRecorder()
	a.fileRoute(fileResp, fileReq, project, "integration-user")
	if fileResp.Code != 200 {
		t.Fatalf("save file: %d %s", fileResp.Code, fileResp.Body.String())
	}
	if data, err := os.ReadFile(filepath.Join(root, project, "notes", "test.txt")); err != nil || string(data) != "persisted" {
		t.Fatalf("file not written: %q %v", data, err)
	}
	chatReq := httptest.NewRequest(http.MethodPost, "/chat", strings.NewReader(`{"content":"hello from Go"}`))
	chatReq.Header.Set("Content-Type", "application/json")
	chatResp := httptest.NewRecorder()
	a.chatRoute(chatResp, chatReq, project, "integration-user")
	if chatResp.Code != 201 {
		t.Fatalf("save chat: %d %s", chatResp.Code, chatResp.Body.String())
	}
	chatHistory := httptest.NewRecorder()
	a.chatRoute(chatHistory, httptest.NewRequest(http.MethodGet, "/chat", nil), project, "integration-user")
	var history struct {
		Data []chatMessage `json:"data"`
	}
	if err = json.Unmarshal(chatHistory.Body.Bytes(), &history); err != nil || len(history.Data) != 1 || history.Data[0].Content != "hello from Go" {
		t.Fatalf("chat history not persisted: %s (%v)", chatHistory.Body.String(), err)
	}
	if err = a.applyWhiteboard(ctx, project, "integration-user", "CREATE", map[string]any{"objectId": "shape-1", "type": "rectangle", "x": 12.0, "y": 15.0}); err != nil {
		t.Fatal(err)
	}
	objects, version, err := a.whiteboardState(ctx, project)
	if err != nil || len(objects) != 1 || version != 1 {
		t.Fatalf("whiteboard state: %#v version=%d err=%v", objects, version, err)
	}
	if err = a.applyWhiteboard(ctx, project, "integration-user", "UPDATE", map[string]any{"objectId": "shape-1", "x": 22.0}); err != nil {
		t.Fatal(err)
	}
	objects, version, err = a.whiteboardState(ctx, project)
	if err != nil || version != 2 || objects[0]["x"] != float64(22) {
		t.Fatalf("whiteboard update not persisted: %#v version=%d err=%v", objects, version, err)
	}
	client := &wsClient{send: make(chan []byte, 4), project: project, user: "integration-user"}
	update := base64.StdEncoding.EncodeToString([]byte{0, 1, 2, 3})
	a.codeOperation(client, map[string]any{"filePath": "notes/test.txt", "update": update, "content": "current collaborative text"})
	a.handleWSEvent(client, "CODE_SYNC", map[string]any{"filePath": "notes/test.txt"})
	var syncMessage map[string]any
	if err = json.Unmarshal(<-client.send, &syncMessage); err != nil {
		t.Fatal(err)
	}
	syncPayload, _ := syncMessage["payload"].(map[string]any)
	updates, _ := syncPayload["updates"].([]any)
	if syncMessage["type"] != "CODE_SYNC" || len(updates) != 1 || updates[0] != update || syncPayload["content"] != "current collaborative text" {
		t.Fatalf("code sync did not replay persisted Yjs update history: %#v", syncMessage)
	}
}

func testJWT(t *testing.T, secret string, claims map[string]any) string {
	t.Helper()
	enc := base64.RawURLEncoding.EncodeToString
	header := enc([]byte(`{"alg":"HS512","typ":"JWT"}`))
	body, err := json.Marshal(claims)
	if err != nil {
		t.Fatal(err)
	}
	bodyPart := enc(body)
	data := header + "." + bodyPart
	mac := hmac.New(sha512.New, []byte(secret))
	_, _ = mac.Write([]byte(data))
	return data + "." + enc(mac.Sum(nil))
}
