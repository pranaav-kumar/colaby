package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type chatMessage struct {
	MessageID string    `json:"messageId"`
	ProjectID string    `json:"projectId"`
	SenderID  string    `json:"senderId"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"createdAt"`
}

func (a *app) chatRoute(w http.ResponseWriter, r *http.Request, project, user string) {
	switch r.Method {
	case http.MethodGet:
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if limit <= 0 {
			limit = 50
		}
		if limit > 100 {
			limit = 100
		}
		before := r.URL.Query().Get("before")
		var rows pgx.Rows
		var err error
		if before != "" {
			var t time.Time
			t, err = time.Parse(time.RFC3339Nano, before)
			if err != nil {
				writeError(w, 400, "INVALID_CURSOR", "Invalid before timestamp")
				return
			}
			rows, err = a.db.Query(r.Context(), `SELECT message_id,project_id,sender_id,content,created_at FROM collaboration_chat_messages WHERE project_id=$1 AND created_at<$2 ORDER BY created_at DESC LIMIT $3`, project, t, limit)
		} else {
			rows, err = a.db.Query(r.Context(), `SELECT message_id,project_id,sender_id,content,created_at FROM collaboration_chat_messages WHERE project_id=$1 ORDER BY created_at DESC LIMIT $2`, project, limit)
		}
		if err != nil {
			internalError(w, err)
			return
		}
		defer rows.Close()
		items := []chatMessage{}
		for rows.Next() {
			var m chatMessage
			if err = rows.Scan(&m.MessageID, &m.ProjectID, &m.SenderID, &m.Content, &m.CreatedAt); err != nil {
				internalError(w, err)
				return
			}
			items = append(items, m)
		}
		if err = rows.Err(); err != nil {
			internalError(w, err)
			return
		}
		writeJSON(w, 200, map[string]any{"success": true, "data": items})
	case http.MethodPost:
		var in struct {
			Content string `json:"content"`
		}
		if decodeJSON(r, &in) != nil || len(strings.TrimSpace(in.Content)) == 0 || len(in.Content) > 5000 {
			writeError(w, 400, "INVALID_MESSAGE", "Invalid message content")
			return
		}
		m := chatMessage{MessageID: randomID(), ProjectID: project, SenderID: user, Content: in.Content, CreatedAt: time.Now().UTC()}
		if _, err := a.db.Exec(r.Context(), `INSERT INTO collaboration_chat_messages(message_id,project_id,sender_id,content,created_at) VALUES($1,$2,$3,$4,$5)`, m.MessageID, m.ProjectID, m.SenderID, m.Content, m.CreatedAt); err != nil {
			internalError(w, err)
			return
		}
		a.rooms.broadcast(project, map[string]any{"type": "CHAT_MESSAGE", "payload": map[string]any{"messageId": m.MessageID, "projectId": project, "senderId": user, "userId": user, "content": m.Content, "createdAt": m.CreatedAt}}, "")
		writeJSON(w, 201, map[string]any{"success": true, "data": m})
	default:
		methodNotAllowed(w)
	}
}

func (a *app) whiteboardRoute(w http.ResponseWriter, r *http.Request, project, user string) {
	switch r.Method {
	case http.MethodGet:
		objects, version, err := a.whiteboardState(r.Context(), project)
		if err != nil {
			internalError(w, err)
			return
		}
		writeJSON(w, 200, map[string]any{"success": true, "data": map[string]any{"objects": objects, "cursors": a.rooms.cursorsFor(project), "version": version}})
	case http.MethodDelete:
		if err := a.applyWhiteboard(r.Context(), project, user, "CLEAR", nil); err != nil {
			internalError(w, err)
			return
		}
		payload := map[string]any{"projectId": project, "userId": user}
		a.rooms.broadcast(project, map[string]any{"type": "WHITEBOARD_CLEAR", "payload": payload}, "")
		writeJSON(w, 200, map[string]any{"success": true, "message": "Whiteboard cleared successfully"})
	default:
		methodNotAllowed(w)
	}
}

func (a *app) whiteboardState(ctx context.Context, project string) ([]map[string]any, int64, error) {
	_, err := a.db.Exec(ctx, `INSERT INTO collaboration_whiteboards(project_id) VALUES($1) ON CONFLICT(project_id) DO NOTHING`, project)
	if err != nil {
		return nil, 0, err
	}
	var raw []byte
	var version int64
	err = a.db.QueryRow(ctx, `SELECT objects,version FROM collaboration_whiteboards WHERE project_id=$1`, project).Scan(&raw, &version)
	if err != nil {
		return nil, 0, err
	}
	var all []map[string]any
	if err = json.Unmarshal(raw, &all); err != nil {
		return nil, 0, err
	}
	visible := make([]map[string]any, 0, len(all))
	for _, obj := range all {
		if deleted, _ := obj["deleted"].(bool); !deleted {
			visible = append(visible, obj)
		}
	}
	return visible, version, nil
}

func (a *app) applyWhiteboard(ctx context.Context, project, user, opType string, payload map[string]any) error {
	tx, err := a.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `INSERT INTO collaboration_whiteboards(project_id) VALUES($1) ON CONFLICT(project_id) DO NOTHING`, project); err != nil {
		return err
	}
	var raw []byte
	var version int64
	if err = tx.QueryRow(ctx, `SELECT objects,version FROM collaboration_whiteboards WHERE project_id=$1 FOR UPDATE`, project).Scan(&raw, &version); err != nil {
		return err
	}
	var objects []map[string]any
	if err = json.Unmarshal(raw, &objects); err != nil {
		return err
	}
	idx := -1
	objectID := firstString(payload["objectId"])
	for i, o := range objects {
		if firstString(o["objectId"]) == objectID {
			idx = i
			break
		}
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	switch opType {
	case "CREATE":
		if objectID == "" || firstString(payload["type"]) == "" {
			return errInvalidOperation
		}
		item := cloneMap(payload)
		item["createdBy"] = user
		item["createdAt"] = now
		item["updatedAt"] = now
		item["version"] = 1
		item["deleted"] = false
		if idx < 0 {
			objects = append(objects, item)
		} else {
			objects[idx] = item
		}
	case "UPDATE":
		if idx < 0 {
			return errInvalidOperation
		}
		item := objects[idx]
		for k, v := range payload {
			if k == "style" {
				old, _ := item[k].(map[string]any)
				patch, _ := v.(map[string]any)
				merged := cloneMap(old)
				for a, b := range patch {
					merged[a] = b
				}
				item[k] = merged
			} else {
				item[k] = v
			}
		}
		item["updatedAt"] = now
		item["version"] = number(item["version"]) + 1
		objects[idx] = item
	case "DELETE":
		if idx >= 0 {
			objects[idx]["deleted"] = true
			objects[idx]["updatedAt"] = now
		}
	case "CLEAR":
		for _, item := range objects {
			item["deleted"] = true
			item["updatedAt"] = now
		}
	default:
		return errInvalidOperation
	}
	b, err := json.Marshal(objects)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `UPDATE collaboration_whiteboards SET objects=$2::jsonb,version=$3,updated_at=now() WHERE project_id=$1`, project, string(b), version+1)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

var errInvalidOperation = &validationError{message: "Invalid collaboration operation"}

type validationError struct{ message string }

func (e *validationError) Error() string { return e.message }
func cloneMap(src map[string]any) map[string]any {
	dst := map[string]any{}
	for k, v := range src {
		dst[k] = v
	}
	return dst
}
func number(v any) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	case int64:
		return int(n)
	}
	return 0
}
