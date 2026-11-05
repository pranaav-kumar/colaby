package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type workspace struct {
	ProjectID     string    `json:"projectId"`
	SourceType    string    `json:"sourceType"`
	RepositoryURL *string   `json:"repositoryUrl"`
	Initialized   bool      `json:"initialized"`
	RepoCloned    bool      `json:"repoCloned"`
	RepoPath      string    `json:"repoPath"`
	RootNodeID    string    `json:"rootNodeId"`
	Status        string    `json:"status"`
	Version       int64     `json:"version"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

func (a *app) ensureWorkspace(ctx context.Context, projectID string) error {
	p := filepath.Join(a.cfg.workspaceRoot, projectID)
	_, e := a.db.Exec(ctx, `INSERT INTO collaboration_workspaces(project_id,repo_path) VALUES($1,$2) ON CONFLICT(project_id) DO NOTHING`, projectID, p)
	return e
}
func (a *app) getWorkspace(ctx context.Context, id string) (workspace, error) {
	var w workspace
	e := a.db.QueryRow(ctx, `SELECT project_id,source_type,repository_url,initialized,repo_cloned,repo_path,root_node_id,status,version,created_at,updated_at FROM collaboration_workspaces WHERE project_id=$1`, id).Scan(&w.ProjectID, &w.SourceType, &w.RepositoryURL, &w.Initialized, &w.RepoCloned, &w.RepoPath, &w.RootNodeID, &w.Status, &w.Version, &w.CreatedAt, &w.UpdatedAt)
	return w, e
}
func (a *app) workspaceInfo(w http.ResponseWriter, r *http.Request, id string) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	item, e := a.getWorkspace(r.Context(), id)
	if e != nil {
		internalError(w, e)
		return
	}
	project, err := a.projects.project(r.Context(), id)
	repo := firstString(project["githubRepoUrl"], stringValue(item.RepositoryURL))
	if err != nil {
		repo = stringValue(item.RepositoryURL)
	}
	writeJSON(w, 200, map[string]any{"success": true, "data": map[string]any{"projectId": item.ProjectID, "sourceType": item.SourceType, "repositoryUrl": nullable(repo), "githubRepoUrl": nullable(repo), "initialized": item.Initialized, "repoCloned": item.RepoCloned, "repoPath": item.RepoPath, "rootNodeId": item.RootNodeID, "status": item.Status, "version": item.Version, "createdAt": item.CreatedAt, "updatedAt": item.UpdatedAt}})
}
func (a *app) initializeWorkspace(w http.ResponseWriter, r *http.Request, id, user string) {
	item, e := a.getWorkspace(r.Context(), id)
	if e != nil {
		internalError(w, e)
		return
	}
	if item.Initialized || item.RepoCloned {
		writeJSON(w, 200, map[string]any{"success": true, "data": item})
		return
	}
	root := a.workspacePath(item)
	if e = os.MkdirAll(root, 0o755); e != nil {
		internalError(w, e)
		return
	}
	for _, f := range []struct{ name, content string }{{"README.md", fmt.Sprintf("# %s\n\nCollaborative project workspace created with Colaby.\n\n- Create, edit, and organize files in real-time.\n- Changes sync across all project members.\n", id)}, {"index.js", "// Colaby Collaborative Workspace\nconsole.log('Hello from Colaby IDE!');\n\nfunction main() {\n  console.log('Real-time pair programming ready.');\n}\n\nmain();\n"}} {
		p := filepath.Join(root, f.name)
		if _, e = os.Stat(p); os.IsNotExist(e) {
			if e = os.WriteFile(p, []byte(f.content), 0o644); e != nil {
				internalError(w, e)
				return
			}
		}
	}
	_, e = a.db.Exec(r.Context(), `UPDATE collaboration_workspaces SET initialized=true,source_type='SCRATCH',updated_at=now(),version=version+1 WHERE project_id=$1`, id)
	if e != nil {
		internalError(w, e)
		return
	}
	item, e = a.getWorkspace(r.Context(), id)
	if e != nil {
		internalError(w, e)
		return
	}
	writeJSON(w, 200, map[string]any{"success": true, "data": item})
}
func (a *app) cloneWorkspace(w http.ResponseWriter, r *http.Request, id, user string) {
	var in struct {
		RepoURL string `json:"repoUrl"`
		Token   string `json:"token"`
	}
	if decodeJSON(r, &in) != nil {
		writeError(w, 400, "INVALID_REQUEST", "Invalid repository request")
		return
	}
	repo := strings.TrimSpace(in.RepoURL)
	if repo == "" {
		p, e := a.projects.project(r.Context(), id)
		if e != nil {
			writeError(w, 503, "PROJECT_SERVICE_UNAVAILABLE", "Project Service unavailable")
			return
		}
		repo = firstString(p["githubRepoUrl"])
	}
	if !validGitURL(repo) {
		writeError(w, 400, "INVALID_REPO_URL", "Project has no valid repository URL configured")
		return
	}
	item, e := a.getWorkspace(r.Context(), id)
	if e != nil {
		internalError(w, e)
		return
	}
	root := a.workspacePath(item)
	if _, e = os.Stat(filepath.Join(root, ".git")); e == nil {
		writeError(w, 409, "REPOSITORY_EXISTS", "Workspace already contains a repository")
		return
	}
	if e = os.MkdirAll(root, 0o755); e != nil {
		internalError(w, e)
		return
	}
	// Git clone refuses a pre-existing non-empty directory. Theia creates
	// .theia/settings.json as soon as it opens a workspace, so clone to a
	// sibling staging directory and merge the checkout without overwriting
	// files the user already has in the workspace.
	stage, e := os.MkdirTemp(filepath.Dir(root), ".colaby-clone-"+id+"-")
	if e != nil {
		internalError(w, e)
		return
	}
	defer os.RemoveAll(stage)
	checkout := filepath.Join(stage, "checkout")
	args := []string{"clone", "--", repo, checkout}
	cmd := exec.CommandContext(r.Context(), "git", args...)
	cmd.Env = os.Environ()
	if in.Token != "" && strings.HasPrefix(repo, "https://") {
		cmd.Env = append(cmd.Env, "GIT_CONFIG_COUNT=1", "GIT_CONFIG_KEY_0=http.extraheader", "GIT_CONFIG_VALUE_0=AUTHORIZATION: bearer "+in.Token)
	}
	out, e := cmd.CombinedOutput()
	if e != nil {
		writeError(w, 400, "CLONE_FAILED", truncate(string(out), 300))
		return
	}
	if conflicts, err := mergeClonedWorkspace(checkout, root); err != nil {
		internalError(w, err)
		return
	} else if len(conflicts) > 0 {
		writeError(w, 409, "WORKSPACE_FILE_CONFLICT", "Clone would overwrite existing workspace files: "+strings.Join(conflicts, ", "))
		return
	}
	_, e = a.db.Exec(r.Context(), `UPDATE collaboration_workspaces SET source_type='GITHUB',repository_url=$2,repo_cloned=true,initialized=true,updated_at=now(),version=version+1 WHERE project_id=$1`, id, repo)
	if e != nil {
		internalError(w, e)
		return
	}
	tree, e := a.fileTree(id)
	if e != nil {
		internalError(w, e)
		return
	}
	item, e = a.getWorkspace(r.Context(), id)
	if e != nil {
		internalError(w, e)
		return
	}
	data := workspaceJSON(item)
	data["tree"] = tree
	writeJSON(w, 200, map[string]any{"success": true, "data": data})
}

// mergeClonedWorkspace preserves existing workspace files (including Theia's
// local settings), while allowing git to populate an initialized directory.
// It checks all conflicts before moving any checkout files into the workspace.
func mergeClonedWorkspace(checkout, root string) ([]string, error) {
	var conflicts []string
	err := filepath.WalkDir(checkout, func(src string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if src == checkout {
			return nil
		}
		rel, err := filepath.Rel(checkout, src)
		if err != nil {
			return err
		}
		if rel == ".theia/settings.json" {
			return nil
		}
		dst := filepath.Join(root, rel)
		info, err := os.Lstat(dst)
		if os.IsNotExist(err) {
			return nil
		}
		if err != nil {
			return err
		}
		sourceInfo, err := entry.Info()
		if err != nil {
			return err
		}
		if entry.IsDir() && info.IsDir() {
			return nil
		}
		if sourceInfo.Mode().IsRegular() && info.Mode().IsRegular() {
			conflicts = append(conflicts, filepath.ToSlash(rel))
			return nil
		}
		conflicts = append(conflicts, filepath.ToSlash(rel))
		return nil
	})
	if err != nil {
		return nil, err
	}
	if len(conflicts) > 0 {
		sort.Strings(conflicts)
		return conflicts, nil
	}
	return conflicts, filepath.WalkDir(checkout, func(src string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if src == checkout {
			return nil
		}
		rel, err := filepath.Rel(checkout, src)
		if err != nil {
			return err
		}
		if rel == ".theia/settings.json" {
			return nil
		}
		dst := filepath.Join(root, rel)
		if entry.IsDir() {
			return os.MkdirAll(dst, 0o755)
		}
		if _, err := os.Lstat(dst); err == nil {
			return nil
		} else if !os.IsNotExist(err) {
			return err
		}
		return os.Rename(src, dst)
	})
}

func (a *app) fileRoute(w http.ResponseWriter, r *http.Request, id, user string) {
	switch r.Method {
	case http.MethodGet:
		p, e := a.safeWorkspaceFile(id, r.URL.Query().Get("path"))
		if e != nil {
			writeError(w, 400, "INVALID_PATH", e.Error())
			return
		}
		b, e := os.ReadFile(p)
		if e != nil {
			if os.IsNotExist(e) {
				writeError(w, 404, "FILE_NOT_FOUND", "File not found")
			} else {
				internalError(w, e)
			}
			return
		}
		writeJSON(w, 200, map[string]any{"success": true, "data": map[string]any{"path": r.URL.Query().Get("path"), "content": string(b)}})
	case http.MethodPost:
		var in struct {
			Path    string `json:"path"`
			Content string `json:"content"`
		}
		if decodeJSON(r, &in) != nil || in.Path == "" {
			writeError(w, 400, "INVALID_REQUEST", "File path and content are required")
			return
		}
		p, e := a.safeWorkspaceFile(id, in.Path)
		if e != nil {
			writeError(w, 400, "INVALID_PATH", e.Error())
			return
		}
		if e = os.MkdirAll(filepath.Dir(p), 0o755); e != nil {
			internalError(w, e)
			return
		}
		if e = os.WriteFile(p, []byte(in.Content), 0o644); e != nil {
			internalError(w, e)
			return
		}
		_, e = a.db.Exec(r.Context(), `INSERT INTO collaboration_code_documents(project_id,file_path,content,last_edited_by,version,updated_at) VALUES($1,$2,$3,$4,1,now()) ON CONFLICT(project_id,file_path) DO UPDATE SET content=EXCLUDED.content,last_edited_by=EXCLUDED.last_edited_by,version=collaboration_code_documents.version+1,updated_at=now()`, id, cleanRelative(in.Path), in.Content, user)
		if e != nil {
			internalError(w, e)
			return
		}
		writeJSON(w, 200, map[string]any{"success": true, "data": map[string]any{"path": in.Path, "saved": true}})
	default:
		methodNotAllowed(w)
	}
}

func (a *app) fileTree(id string) (map[string]any, error) {
	item, e := a.getWorkspace(context.Background(), id)
	if e != nil {
		return nil, e
	}
	root := a.workspacePath(item)
	if e = os.MkdirAll(root, 0o755); e != nil {
		return nil, e
	}
	return a.treeNode(root, root, "root", nil)
}
func (a *app) treeNode(root, dir, nodeID string, parent any) (map[string]any, error) {
	ents, e := os.ReadDir(dir)
	if e != nil {
		return nil, e
	}
	sort.Slice(ents, func(i, j int) bool {
		if ents[i].IsDir() != ents[j].IsDir() {
			return ents[i].IsDir()
		}
		return ents[i].Name() < ents[j].Name()
	})
	children := make([]any, 0)
	for _, ent := range ents {
		n := ent.Name()
		if n == ".git" || n == "node_modules" || n == ".theia" || n == ".DS_Store" || n == ".idea" {
			continue
		}
		full := filepath.Join(dir, n)
		rel, _ := filepath.Rel(root, full)
		id := nodeHash(rel)
		typ := "file"
		if ent.IsDir() {
			typ = "directory"
		}
		node := map[string]any{"nodeId": id, "parentId": nodeID, "name": n, "type": typ, "path": "/" + filepath.ToSlash(rel), "deleted": false, "logicalTimestamp": 0, "metadata": map[string]any{}}
		if ent.IsDir() {
			kids, e := a.treeNode(root, full, id, nodeID)
			if e != nil {
				return nil, e
			}
			node["children"] = kids["children"]
		}
		children = append(children, node)
	}
	if nodeID == "root" {
		return map[string]any{"nodeId": "root", "parentId": nil, "name": "root", "type": "directory", "path": "/", "deleted": false, "logicalTimestamp": 0, "metadata": map[string]any{}, "children": children}, nil
	}
	return map[string]any{"children": children}, nil
}
func (a *app) safeWorkspaceFile(id, requested string) (string, error) {
	if requested == "" {
		return "", fmt.Errorf("File path required")
	}
	rel := cleanRelative(requested)
	if rel == "." || rel == "" || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("Path escapes workspace")
	}
	w, e := a.getWorkspace(context.Background(), id)
	if e != nil {
		return "", e
	}
	root := a.workspacePath(w)
	full := filepath.Join(root, rel)
	current := root
	for _, part := range strings.Split(rel, string(filepath.Separator)) {
		current = filepath.Join(current, part)
		st, statErr := os.Lstat(current)
		if statErr == nil && st.Mode()&os.ModeSymlink != 0 {
			return "", fmt.Errorf("Symbolic links are not allowed in workspace paths")
		}
		if statErr != nil && !os.IsNotExist(statErr) {
			return "", statErr
		}
	}
	return full, nil
}
func (a *app) workspacePath(w workspace) string {
	p := w.RepoPath
	if p == "" {
		p = filepath.Join(a.cfg.workspaceRoot, w.ProjectID)
	}
	root, _ := filepath.Abs(a.cfg.workspaceRoot)
	abs, _ := filepath.Abs(p)
	if abs != root && !strings.HasPrefix(abs, root+string(filepath.Separator)) {
		return filepath.Join(root, w.ProjectID)
	}
	return abs
}

func (a *app) fileOperation(w http.ResponseWriter, r *http.Request, project, user string) {
	var op map[string]any
	if decodeJSON(r, &op) != nil {
		writeError(w, 400, "INVALID_REQUEST", "Invalid file operation")
		return
	}
	payload := op
	if p, ok := op["payload"].(map[string]any); ok {
		payload = p
	}
	typ := firstString(op["type"])
	name := firstString(payload["name"])
	oldPath := firstString(payload["path"])
	nodeID := firstString(payload["nodeId"])
	if oldPath == "" && name != "" {
		oldPath = name
	}
	target, e := a.safeWorkspaceFile(project, oldPath)
	if e != nil && typ != "FILE_CREATE" && typ != "FOLDER_CREATE" {
		writeError(w, 400, "INVALID_PATH", e.Error())
		return
	}
	result := map[string]any{"type": typ, "userId": user}
	switch typ {
	case "FILE_CREATE", "FOLDER_CREATE":
		if name == "" {
			name = oldPath
		}
		target, e = a.safeWorkspaceFile(project, name)
		if e != nil {
			writeError(w, 400, "INVALID_PATH", e.Error())
			return
		}
		isDir := typ == "FOLDER_CREATE" || firstString(payload["nodeType"]) == "directory"
		if isDir {
			e = os.MkdirAll(target, 0o755)
		} else {
			e = os.MkdirAll(filepath.Dir(target), 0o755)
			if e == nil {
				f, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
				if err != nil && !os.IsExist(err) {
					e = err
				} else if f != nil {
					_ = f.Close()
				}
			}
		}
		if e != nil {
			internalError(w, e)
			return
		}
		result["path"] = "/" + filepath.ToSlash(cleanRelative(name))
		result["nodeId"] = nodeHash(cleanRelative(name))
	case "FILE_DELETE", "FOLDER_DELETE":
		e = os.RemoveAll(target)
		result["path"] = oldPath
		result["nodeId"] = nodeID
	case "FILE_RENAME", "FOLDER_RENAME":
		newName := firstString(payload["newName"])
		if newName == "" {
			writeError(w, 400, "INVALID_REQUEST", "newName is required")
			return
		}
		if strings.ContainsAny(newName, "/\\") {
			writeError(w, 400, "INVALID_NAME", "newName must be a file or directory name")
			return
		}
		newPath := filepath.Join(filepath.Dir(target), newName)
		e = os.Rename(target, newPath)
		result["path"] = oldPath
		result["newPath"] = "/" + filepath.ToSlash(filepath.Join(filepath.Dir(cleanRelative(oldPath)), newName))
	case "FILE_MOVE", "FOLDER_MOVE":
		parent := firstString(payload["newParentId"])
		destDir := a.workspacePathFor(project)
		if parent != "" && parent != "root" && parent != "/" {
			if strings.HasPrefix(parent, "node-") {
				tree, treeErr := a.fileTree(project)
				if treeErr != nil {
					writeError(w, 500, "TREE_UNAVAILABLE", "Could not load file tree")
					return
				}
				parentPath := findTreeNodePath(tree, parent)
				if parentPath == "" {
					e = fmt.Errorf("Destination folder was not found")
				} else {
					destDir, e = a.safeWorkspaceFile(project, parentPath)
				}
			} else {
				destDir, e = a.safeWorkspaceFile(project, parent)
			}
			if e == nil {
				st, err := os.Stat(destDir)
				if err != nil || !st.IsDir() {
					e = fmt.Errorf("Destination must be a directory")
				}
			}
		}
		if e == nil {
			e = os.MkdirAll(destDir, 0o755)
		}
		if e == nil {
			e = os.Rename(target, filepath.Join(destDir, filepath.Base(target)))
		}
	default:
		writeError(w, 400, "UNSUPPORTED_OPERATION", "Unsupported file operation")
		return
	}
	if e != nil {
		writeError(w, 400, "FILE_OPERATION_FAILED", e.Error())
		return
	}
	opID := fmt.Sprintf("%x", time.Now().UnixNano())
	b, _ := json.Marshal(op)
	_, e = a.db.Exec(r.Context(), `INSERT INTO collaboration_file_operations(operation_id,project_id,user_id,operation_type,node_id,operation,logical_timestamp) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)`, opID, project, user, typ, firstString(result["nodeId"], nodeID, "unknown"), string(b), time.Now().UnixMilli())
	if e != nil {
		internalError(w, e)
		return
	}
	tree, e := a.fileTree(project)
	if e != nil {
		internalError(w, e)
		return
	}
	result["tree"] = tree
	writeJSON(w, 200, map[string]any{"success": true, "data": result})
}

func findTreeNodePath(node map[string]any, nodeID string) string {
	if node == nil {
		return ""
	}
	if node["nodeId"] == nodeID {
		p, _ := node["path"].(string)
		return p
	}
	children, _ := node["children"].([]any)
	for _, child := range children {
		if m, ok := child.(map[string]any); ok {
			if p := findTreeNodePath(m, nodeID); p != "" {
				return p
			}
		}
	}
	return ""
}

func (a *app) workspacePathFor(id string) string {
	w, e := a.getWorkspace(context.Background(), id)
	if e != nil {
		return filepath.Join(a.cfg.workspaceRoot, id)
	}
	return a.workspacePath(w)
}
func nodeHash(rel string) string {
	h := sha256.Sum256([]byte(filepath.ToSlash(rel)))
	return "node-" + hex.EncodeToString(h[:8])
}
func cleanRelative(p string) string {
	p = strings.ReplaceAll(p, "\\", "/")
	return filepath.Clean(strings.TrimPrefix(p, "/"))
}
func validGitURL(u string) bool {
	u = strings.TrimSpace(u)
	return strings.HasPrefix(u, "https://") || strings.HasPrefix(u, "http://") || strings.HasPrefix(u, "git@")
}
func stringValue(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}
func workspaceJSON(w workspace) map[string]any {
	return map[string]any{"projectId": w.ProjectID, "sourceType": w.SourceType, "repositoryUrl": w.RepositoryURL, "initialized": w.Initialized, "repoCloned": w.RepoCloned, "repoPath": w.RepoPath, "rootNodeId": w.RootNodeID, "status": w.Status, "version": w.Version, "createdAt": w.CreatedAt, "updatedAt": w.UpdatedAt}
}
func decodeJSON(r *http.Request, v any) error {
	defer r.Body.Close()
	return json.NewDecoder(http.MaxBytesReader(discardWriter{}, r.Body, 2<<20)).Decode(v)
}
func truncate(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) > n {
		return s[:n]
	}
	return s
}

type discardWriter struct{}

func (discardWriter) Header() http.Header       { return http.Header{} }
func (discardWriter) Write([]byte) (int, error) { return 0, nil }
func (discardWriter) WriteHeader(int)           {}
