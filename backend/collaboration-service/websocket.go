package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5"
)

type wsClient struct {
	conn          *websocket.Conn
	send          chan []byte
	project, user string
}
type roomHub struct {
	mu      sync.RWMutex
	rooms   map[string]map[*wsClient]bool
	cursors map[string]map[string]map[string]any
}

func newRoomHub() *roomHub {
	return &roomHub{rooms: map[string]map[*wsClient]bool{}, cursors: map[string]map[string]map[string]any{}}
}
func (h *roomHub) members(project string) []string {
	h.mu.RLock()
	defer h.mu.RUnlock()
	set := map[string]bool{}
	for c := range h.rooms[project] {
		set[c.user] = true
	}
	out := make([]string, 0, len(set))
	for u := range set {
		out = append(out, u)
	}
	sort.Strings(out)
	return out
}
func (h *roomHub) broadcast(project string, msg any, exclude string) {
	b, e := json.Marshal(msg)
	if e != nil {
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.rooms[project] {
		if exclude != "" && c.user == exclude {
			continue
		}
		select {
		case c.send <- b:
		default:
			go c.conn.Close()
		}
	}
}
func (h *roomHub) sendTo(project, user string, msg any) {
	b, _ := json.Marshal(msg)
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.rooms[project] {
		if c.user == user {
			select {
			case c.send <- b:
			default:
				go c.conn.Close()
			}
		}
	}
}
func (h *roomHub) cursorsFor(project string) []any {
	h.mu.RLock()
	defer h.mu.RUnlock()
	out := []any{}
	for _, c := range h.cursors[project] {
		out = append(out, c)
	}
	return out
}
func (h *roomHub) serve(a *app, conn *websocket.Conn, project, user string) {
	c := &wsClient{conn: conn, send: make(chan []byte, 64), project: project, user: user}
	h.mu.Lock()
	if h.rooms[project] == nil {
		h.rooms[project] = map[*wsClient]bool{}
	}
	h.rooms[project][c] = true
	h.mu.Unlock()
	members := h.members(project)
	h.write(c)
	h.enqueue(c, map[string]any{"type": "CONNECTION_ACK", "payload": map[string]any{"userId": user, "projectId": project, "onlineUsers": members}})
	h.broadcast(project, map[string]any{"type": "USER_JOINED", "payload": map[string]any{"userId": user, "projectId": project, "onlineUsers": members}}, "")
	defer func() {
		h.mu.Lock()
		delete(h.rooms[project], c)
		if len(h.rooms[project]) == 0 {
			delete(h.rooms, project)
		}
		if curs := h.cursors[project]; curs != nil {
			delete(curs, user)
		}
		h.mu.Unlock()
		_ = conn.Close()
		if state := a.voice.leave(project, user); state != nil {
			h.broadcast(project, map[string]any{"type": "VOICE_STATE", "payload": state}, "")
		}
		left := h.members(project)
		h.broadcast(project, map[string]any{"type": "USER_LEFT", "payload": map[string]any{"userId": user, "projectId": project, "onlineUsers": left}}, "")
	}()
	conn.SetReadLimit(2 << 20)
	_ = conn.SetReadDeadline(time.Now().Add(70 * time.Second))
	conn.SetPongHandler(func(string) error { _ = conn.SetReadDeadline(time.Now().Add(70 * time.Second)); return nil })
	go func() {
		ticker := time.NewTicker(25 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case data, ok := <-c.send:
				if !ok {
					return
				}
				_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
				if conn.WriteMessage(websocket.TextMessage, data) != nil {
					return
				}
			case <-ticker.C:
				_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
				if conn.WriteMessage(websocket.PingMessage, nil) != nil {
					return
				}
			}
		}
	}()
	for {
		_, b, e := conn.ReadMessage()
		if e != nil {
			break
		}
		var m struct {
			Type    string         `json:"type"`
			Payload map[string]any `json:"payload"`
		}
		if json.Unmarshal(b, &m) != nil {
			h.enqueue(c, map[string]any{"type": "ERROR", "payload": map[string]any{"message": "Invalid message format"}})
			continue
		}
		a.handleWSEvent(c, m.Type, m.Payload)
	}
}
func (h *roomHub) write(c *wsClient) { c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second)) }
func (h *roomHub) enqueue(c *wsClient, msg any) {
	b, e := json.Marshal(msg)
	if e != nil {
		return
	}
	select {
	case c.send <- b:
	default:
	}
}

func (a *app) handleWSEvent(c *wsClient, typ string, payload map[string]any) {
	if payload == nil {
		payload = map[string]any{}
	}
	if typ == "HEARTBEAT" {
		a.rooms.enqueue(c, map[string]any{"type": "HEARTBEAT_ACK"})
		return
	}
	if typ == "HEARTBEAT_ACK" {
		return
	}
	if validation := validateWSEvent(typ, payload); validation != "" {
		a.wsError(c, validation)
		return
	}
	p := cloneMap(payload)
	p["userId"] = c.user
	p["projectId"] = c.project
	safe := map[string]any{"type": typ, "payload": p}
	switch typ {
	case "CHAT_MESSAGE":
		content, _ := p["content"].(string)
		if strings.TrimSpace(content) == "" || len(content) > 5000 {
			a.wsError(c, "Content must be a string between 1 and 5000 characters")
			return
		}
		m := chatMessage{MessageID: randomID(), ProjectID: c.project, SenderID: c.user, Content: content, CreatedAt: time.Now().UTC()}
		_, e := a.db.Exec(context.Background(), `INSERT INTO collaboration_chat_messages(message_id,project_id,sender_id,content,created_at) VALUES($1,$2,$3,$4,$5)`, m.MessageID, m.ProjectID, m.SenderID, m.Content, m.CreatedAt)
		if e != nil {
			a.wsError(c, "Failed to save chat message")
			return
		}
		a.rooms.broadcast(c.project, map[string]any{"type": typ, "payload": map[string]any{"messageId": m.MessageID, "projectId": m.ProjectID, "senderId": m.SenderID, "userId": m.SenderID, "content": m.Content, "createdAt": m.CreatedAt}}, "")
	case "WHITEBOARD_OBJECT_CREATE", "WHITEBOARD_OBJECT_UPDATE", "WHITEBOARD_OBJECT_DELETE", "WHITEBOARD_CLEAR":
		op := map[string]string{"WHITEBOARD_OBJECT_CREATE": "CREATE", "WHITEBOARD_OBJECT_UPDATE": "UPDATE", "WHITEBOARD_OBJECT_DELETE": "DELETE", "WHITEBOARD_CLEAR": "CLEAR"}[typ]
		if e := a.applyWhiteboard(context.Background(), c.project, c.user, op, p); e != nil {
			a.wsError(c, e.Error())
			return
		}
		a.persistEvent(c.project, c.user, typ, p)
		a.rooms.broadcast(c.project, safe, "")
	case "WHITEBOARD_CURSOR_MOVE":
		a.rooms.mu.Lock()
		if a.rooms.cursors[c.project] == nil {
			a.rooms.cursors[c.project] = map[string]map[string]any{}
		}
		a.rooms.cursors[c.project][c.user] = p
		a.rooms.mu.Unlock()
		a.rooms.broadcast(c.project, safe, c.user)
	case "FILE_CREATE", "FOLDER_CREATE", "FILE_DELETE", "FOLDER_DELETE", "FILE_RENAME", "FOLDER_RENAME", "FILE_MOVE", "FOLDER_MOVE":
		op := map[string]any{"type": typ, "payload": p}
		w := fakeResponseWriter{}
		req := fakeRequest(op)
		a.fileOperation(&w, req, c.project, c.user)
		if w.status >= 400 {
			a.wsError(c, w.body)
			return
		}
		var response map[string]any
		_ = json.Unmarshal([]byte(w.body), &response)
		data, _ := response["data"].(map[string]any)
		a.persistEvent(c.project, c.user, typ, p)
		a.rooms.broadcast(c.project, map[string]any{"type": typ, "payload": mergeMaps(p, data)}, "")
	case "FILE_SAVE":
		filePath := firstString(p["path"], p["filePath"])
		content, _ := p["content"].(string)
		target, e := a.safeWorkspaceFile(c.project, filePath)
		if e != nil {
			a.wsError(c, e.Error())
			return
		}
		if e = os.MkdirAll(filepath.Dir(target), 0o755); e == nil {
			e = os.WriteFile(target, []byte(content), 0o644)
		}
		if e != nil {
			a.wsError(c, "Could not save file")
			return
		}
		_, _ = a.db.Exec(context.Background(), `INSERT INTO collaboration_code_documents(project_id,file_path,content,last_edited_by,version,updated_at) VALUES($1,$2,$3,$4,1,now()) ON CONFLICT(project_id,file_path) DO UPDATE SET content=EXCLUDED.content,last_edited_by=EXCLUDED.last_edited_by,version=collaboration_code_documents.version+1,updated_at=now()`, c.project, cleanRelative(filePath), content, c.user)
		a.rooms.broadcast(c.project, safe, c.user)
	case "CODE_OPERATION":
		a.codeOperation(c, p)
	case "CODE_SNAPSHOT":
		a.codeOperation(c, p)
	case "CODE_SYNC":
		filePath := firstString(p["filePath"], p["path"])
		if filePath == "" {
			a.wsError(c, "Missing filePath")
			return
		}
		if _, pathErr := a.safeWorkspaceFile(c.project, filePath); pathErr != nil {
			a.wsError(c, pathErr.Error())
			return
		}
		var content string
		var update []byte
		err := a.db.QueryRow(context.Background(), `SELECT content,yjs_update FROM collaboration_code_documents WHERE project_id=$1 AND file_path=$2`, c.project, cleanRelative(filePath)).Scan(&content, &update)
		if err != nil && err != pgx.ErrNoRows {
			a.wsError(c, "Could not load document")
			return
		}
		if content == "" {
			content, _ = p["clientContent"].(string)
		}
		updates := []string{}
		rows, queryErr := a.db.Query(context.Background(), `SELECT update_payload FROM collaboration_code_updates WHERE project_id=$1 AND file_path=$2 ORDER BY id`, c.project, cleanRelative(filePath))
		if queryErr != nil {
			a.wsError(c, "Could not load document updates")
			return
		}
		for rows.Next() {
			var item []byte
			if queryErr = rows.Scan(&item); queryErr != nil {
				break
			}
			updates = append(updates, base64.StdEncoding.EncodeToString(item))
		}
		if queryErr == nil {
			queryErr = rows.Err()
		}
		rows.Close()
		if queryErr != nil {
			a.wsError(c, "Could not load document updates")
			return
		}
		a.rooms.enqueue(c, map[string]any{"type": "CODE_SYNC", "payload": map[string]any{"filePath": filePath, "encodedState": base64.StdEncoding.EncodeToString(update), "updates": updates, "content": content}})
	case "CODE_CURSOR_MOVE", "CODE_SELECTION_CHANGE":
		a.rooms.broadcast(c.project, safe, c.user)
	case "WORKSPACE_SYNC", "WORKSPACE_INITIALIZED":
		tree, e := a.fileTree(c.project)
		if e != nil {
			a.wsError(c, "Could not load workspace tree")
			return
		}
		a.rooms.enqueue(c, map[string]any{"type": "WORKSPACE_SYNC", "payload": map[string]any{"tree": tree}})
	case "JOIN_VOICE":
		state := a.voice.join(c.project, c.user)
		if state == nil {
			a.wsError(c, "Voice session is full")
			return
		}
		a.rooms.broadcast(c.project, map[string]any{"type": "VOICE_STATE", "payload": state}, "")
	case "LEAVE_VOICE":
		state := a.voice.leave(c.project, c.user)
		if state != nil {
			a.rooms.broadcast(c.project, map[string]any{"type": "VOICE_STATE", "payload": state}, "")
		}
	case "VOICE_MUTE_STATE":
		a.voice.mute(c.project, c.user, p)
		a.rooms.broadcast(c.project, map[string]any{"type": typ, "payload": map[string]any{"userId": c.user, "isMuted": p["isMuted"], "isDeafened": p["isDeafened"], "isScreenSharing": p["isScreenSharing"]}}, "")
	case "WEBRTC_OFFER", "WEBRTC_ANSWER", "WEBRTC_ICE_CANDIDATE":
		target := strings.ToLower(firstString(p["targetUserId"]))
		if target == "" || !a.voice.canSignal(c.project, c.user, target) {
			return
		}
		forward := cloneMap(p)
		forward["fromUserId"] = c.user
		forward["userId"] = c.user
		a.rooms.sendTo(c.project, target, map[string]any{"type": typ, "payload": forward})
	default:
		a.rooms.broadcast(c.project, safe, c.user)
	}
}

func (a *app) codeOperation(c *wsClient, p map[string]any) {
	file := cleanRelative(firstString(p["filePath"], p["path"]))
	if file == "" || file == "." {
		a.wsError(c, "Missing filePath")
		return
	}
	encoded, _ := p["update"].(string)
	raw, decodeErr := base64.StdEncoding.DecodeString(encoded)
	if decodeErr != nil {
		a.wsError(c, "Invalid Yjs update encoding")
		return
	}
	content, _ := p["content"].(string)
	tx, err := a.db.Begin(context.Background())
	if err != nil {
		a.wsError(c, "Failed to persist code update")
		return
	}
	_, err = tx.Exec(context.Background(), `INSERT INTO collaboration_code_documents(project_id,file_path,content,yjs_update,last_edited_by,version,updated_at) VALUES($1,$2,$3,$4,$5,1,now()) ON CONFLICT(project_id,file_path) DO UPDATE SET content=EXCLUDED.content,yjs_update=CASE WHEN EXCLUDED.yjs_update IS NULL THEN collaboration_code_documents.yjs_update ELSE EXCLUDED.yjs_update END,last_edited_by=EXCLUDED.last_edited_by,version=collaboration_code_documents.version+1,updated_at=now()`, c.project, file, content, raw, c.user)
	if err != nil {
		_ = tx.Rollback(context.Background())
		a.wsError(c, "Failed to persist code update")
		return
	}
	if len(raw) > 0 {
		if _, err = tx.Exec(context.Background(), `INSERT INTO collaboration_code_updates(project_id,file_path,update_payload,user_id) VALUES($1,$2,$3,$4)`, c.project, file, raw, c.user); err != nil {
			_ = tx.Rollback(context.Background())
			a.wsError(c, "Failed to persist code update")
			return
		}
	}
	if err = tx.Commit(context.Background()); err != nil {
		a.wsError(c, "Failed to persist code update")
		return
	}
	p["updateId"] = firstString(p["updateId"], randomID())
	p["serverReceiveTimestamp"] = time.Now().UnixMilli()
	a.rooms.broadcast(c.project, map[string]any{"type": "CODE_OPERATION", "payload": p}, c.user)
}

func validateWSEvent(typ string, p map[string]any) string {
	needString := func(key string) bool { v, ok := p[key].(string); return ok && strings.TrimSpace(v) != "" }
	needNumber := func(key string) bool { v, ok := p[key].(float64); return ok && !math.IsNaN(v) && !math.IsInf(v, 0) }
	switch typ {
	case "CHAT_MESSAGE":
		if !needString("content") || len(p["content"].(string)) > 5000 {
			return "Content must be a string between 1 and 5000 characters"
		}
	case "WHITEBOARD_OBJECT_CREATE":
		if !needString("objectId") || !needString("type") {
			return "Missing or invalid objectId or type"
		}
		shape := p["type"].(string)
		if shape == "path" || shape == "freehand" {
			if _, ok := p["points"].([]any); !ok {
				return "Missing points array for freehand drawing"
			}
		} else if !needNumber("x") || !needNumber("y") {
			return "Missing or invalid x or y"
		}
	case "WHITEBOARD_OBJECT_UPDATE", "WHITEBOARD_OBJECT_DELETE":
		if !needString("objectId") {
			return "Missing or invalid objectId"
		}
		if typ == "WHITEBOARD_OBJECT_UPDATE" && len(p) < 2 {
			return "Missing updated whiteboard fields"
		}
	case "WHITEBOARD_CURSOR_MOVE":
		if !needNumber("x") || !needNumber("y") {
			return "Missing or invalid x or y"
		}
	case "FILE_CREATE", "FOLDER_CREATE":
		if !needString("name") && !needString("path") {
			return "Missing name or path for file creation"
		}
	case "FILE_DELETE", "FOLDER_DELETE", "FILE_MOVE", "FOLDER_MOVE":
		if !needString("nodeId") && !needString("path") {
			return "Missing nodeId or path"
		}
	case "FILE_RENAME", "FOLDER_RENAME":
		if !needString("nodeId") && !needString("path") {
			return "Missing nodeId or path"
		}
		if !needString("newName") {
			return "Missing newName"
		}
	case "FILE_SAVE":
		if !needString("path") && !needString("filePath") {
			return "Missing path for file save"
		}
	case "CODE_OPERATION", "CODE_SNAPSHOT", "CODE_SYNC", "CODE_CURSOR_MOVE", "CODE_SELECTION_CHANGE":
		if !needString("filePath") && !needString("path") && !needString("fileId") {
			return "Missing filePath"
		}
	case "WEBRTC_OFFER", "WEBRTC_ANSWER":
		if !needString("targetUserId") {
			return "Missing targetUserId"
		}
		if p["sdp"] == nil && p["offer"] == nil && p["answer"] == nil {
			return "Missing SDP offer or answer"
		}
	case "WEBRTC_ICE_CANDIDATE":
		if !needString("targetUserId") || p["candidate"] == nil {
			return "Missing targetUserId or ICE candidate"
		}
	}
	return ""
}

func (a *app) persistEvent(project, user, typ string, p map[string]any) {
	b, _ := json.Marshal(p)
	_, e := a.db.Exec(context.Background(), `INSERT INTO collaboration_events(event_id,project_id,user_id,event_type,logical_timestamp,payload) VALUES($1,$2,$3,$4,$5,$6::jsonb)`, randomID(), project, user, typ, time.Now().UnixMilli(), string(b))
	if e != nil {
		slog.Warn("persist collaboration event", "error", e)
	}
}
func (a *app) wsError(c *wsClient, message string) {
	a.rooms.enqueue(c, map[string]any{"type": "ERROR", "payload": map[string]any{"message": message}})
}

type voiceHub struct {
	mu       sync.Mutex
	sessions map[string]map[string]map[string]any
}

func newVoiceHub() *voiceHub { return &voiceHub{sessions: map[string]map[string]map[string]any{}} }
func (v *voiceHub) join(project, user string) map[string]any {
	v.mu.Lock()
	defer v.mu.Unlock()
	if v.sessions[project] == nil {
		v.sessions[project] = map[string]map[string]any{}
	}
	s := v.sessions[project]
	if len(s) >= 8 && s[user] == nil {
		return nil
	}
	if s[user] == nil {
		s[user] = map[string]any{"userId": user, "joinedAt": time.Now().UnixMilli(), "muted": false}
	}
	return map[string]any{"participants": voiceParticipants(s), "joined": user}
}
func (v *voiceHub) leave(project, user string) map[string]any {
	v.mu.Lock()
	defer v.mu.Unlock()
	s := v.sessions[project]
	if s == nil || s[user] == nil {
		return nil
	}
	delete(s, user)
	if len(s) == 0 {
		delete(v.sessions, project)
	}
	return map[string]any{"participants": voiceParticipants(s), "left": user}
}
func (v *voiceHub) mute(project, user string, p map[string]any) {
	v.mu.Lock()
	defer v.mu.Unlock()
	if x := v.sessions[project][user]; x != nil {
		for _, k := range []string{"isMuted", "isDeafened", "isScreenSharing"} {
			if value, ok := p[k]; ok {
				x[k] = value
			}
		}
	}
}
func (v *voiceHub) canSignal(project, from, to string) bool {
	v.mu.Lock()
	defer v.mu.Unlock()
	s := v.sessions[project]
	return s[from] != nil && s[to] != nil
}
func voiceParticipants(s map[string]map[string]any) []any {
	out := []any{}
	for _, p := range s {
		out = append(out, p)
	}
	return out
}

func mergeMaps(a, b map[string]any) map[string]any {
	out := cloneMap(a)
	for k, v := range b {
		out[k] = v
	}
	return out
}
func randomID() string {
	return fmt.Sprintf("%d-%d", time.Now().UnixNano(), time.Now().UnixNano()%100000)
}

// HTTP request adapter used to apply file operations from the WebSocket handler.
type fakeResponseWriter struct {
	header http.Header
	status int
	body   string
}

func (f *fakeResponseWriter) Header() http.Header {
	if f.header == nil {
		f.header = http.Header{}
	}
	return f.header
}
func (f *fakeResponseWriter) WriteHeader(n int)           { f.status = n }
func (f *fakeResponseWriter) Write(b []byte) (int, error) { f.body += string(b); return len(b), nil }

type fakeBody struct{ s string }

func (f *fakeBody) Read(b []byte) (int, error) {
	if f.s == "" {
		return 0, io.EOF
	}
	n := copy(b, f.s)
	f.s = f.s[n:]
	return n, nil
}
func (f *fakeBody) Close() error { return nil }
func fakeRequest(v any) *http.Request {
	b, _ := json.Marshal(v)
	return &http.Request{Method: http.MethodPost, Body: &fakeBody{s: string(b)}, Header: make(http.Header)}
}
