package main

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/creack/pty"
	"github.com/gorilla/websocket"
)

type theiaInfo struct {
	Port          int    `json:"port"`
	Status        string `json:"status"`
	ContainerName string `json:"containerName"`
}
type theiaHub struct {
	mu    sync.Mutex
	items map[string]theiaInfo
}

//go:embed theia-bridge.js.tmpl
var theiaBridgeTemplate string

//go:embed theia-terminal.js.tmpl
var theiaTerminalTemplate string

func newTheiaHub() *theiaHub { return &theiaHub{items: map[string]theiaInfo{}} }
func (a *app) theiaRoute(w http.ResponseWriter, r *http.Request, project string) {
	resource := strings.TrimPrefix(r.URL.Path, "/collaboration")
	if strings.Contains(resource, "/theia/") {
		resource = strings.TrimPrefix(resource, "/api/workspaces/"+project)
	} else {
		resource = strings.TrimPrefix(resource, "/api/workspaces/"+project)
	}
	switch {
	case r.Method == http.MethodGet:
		a.theia.mu.Lock()
		info, ok := a.theia.items[project]
		a.theia.mu.Unlock()
		if !ok {
			info, ok = a.findTheia(r.Context(), project)
		}
		if !ok {
			writeJSON(w, 200, map[string]any{"success": true, "data": map[string]any{"status": "not_started"}})
			return
		}
		writeJSON(w, 200, map[string]any{"success": true, "data": map[string]any{"port": info.Port, "url": fmt.Sprintf("http://localhost:%d", info.Port), "status": info.Status, "containerName": info.ContainerName}})
	case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/theia/start"):
		item, e := a.getWorkspace(r.Context(), project)
		if e != nil {
			internalError(w, e)
			return
		}
		// Starting Docker and pulling the Theia image can take longer than the
		// API Gateway's request timeout. Kick it off in the background and let
		// the UI poll this route for the ready/error state.
		info := a.queueTheiaStart(project, a.workspacePath(item))
		writeJSON(w, 200, map[string]any{"success": true, "data": map[string]any{"port": info.Port, "url": fmt.Sprintf("http://localhost:%d", info.Port), "status": info.Status, "containerName": info.ContainerName}})
	case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/theia/stop"):
		if e := a.stopTheia(r.Context(), project); e != nil {
			writeError(w, 503, "THEIA_UNAVAILABLE", e.Error())
			return
		}
		writeJSON(w, 200, map[string]any{"success": true, "data": map[string]any{"status": "stopped"}})
	default:
		methodNotAllowed(w)
	}
}

func (a *app) queueTheiaStart(project, workspace string) theiaInfo {
	a.theia.mu.Lock()
	if info, ok := a.theia.items[project]; ok {
		if info.Status == "starting" {
			a.theia.mu.Unlock()
			return info
		}
		info.Status = "starting"
		a.theia.items[project] = info
		go a.startTheiaInBackground(project, workspace)
		a.theia.mu.Unlock()
		return info
	}
	info := theiaInfo{Port: 9100, Status: "starting", ContainerName: theiaContainerName(project)}
	a.theia.items[project] = info
	a.theia.mu.Unlock()
	a.startTheiaInBackground(project, workspace)
	return info
}

func (a *app) startTheiaInBackground(project, workspace string) {
	go func() {
		_, err := a.startTheia(context.Background(), project, workspace)
		if err == nil {
			return
		}
		a.theia.mu.Lock()
		failed := a.theia.items[project]
		failed.Status = "error"
		a.theia.items[project] = failed
		a.theia.mu.Unlock()
		slog.Error("Theia startup failed", "project", project, "error", err)
	}()
}

func (a *app) startTheia(ctx context.Context, project, workspace string) (theiaInfo, error) {
	if _, e := exec.LookPath("docker"); e != nil {
		return theiaInfo{}, fmt.Errorf("Docker CLI is not installed")
	}
	if _, e := runDocker(ctx, "ps", "-q"); e != nil {
		return theiaInfo{}, fmt.Errorf("Docker is not accessible: %s", truncate(e.Error(), 200))
	}
	name := theiaContainerName(project)
	if existing, ok := inspectTheia(ctx, project); ok {
		matches, err := theiaWorkspaceMountMatches(ctx, name, workspace)
		if err != nil {
			return theiaInfo{}, fmt.Errorf("could not verify Theia workspace mount: %w", err)
		}
		if !matches {
			recovery, err := preserveStaleTheiaWorkspace(ctx, name, a.cfg.workspaceRoot, project)
			if err != nil {
				return theiaInfo{}, err
			}
			slog.Warn("Theia was mounted to a stale workspace directory; restarting it on the current workspace", "project", project, "recoveredFiles", recovery)
		} else {
			if err := a.injectTheiaBridge(name, project); err != nil {
				return theiaInfo{}, fmt.Errorf("could not prepare existing Theia workspace: %w", err)
			}
			a.theia.mu.Lock()
			a.theia.items[project] = existing
			a.theia.mu.Unlock()
			return existing, nil
		}
	}
	for port := 9100; port <= 9199; port++ {
		ln, e := net.Listen("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(port)))
		if e != nil {
			continue
		}
		_ = ln.Close()
		_, _ = runDocker(ctx, "rm", "-f", name)
		args := []string{"run", "-d", "--name", name, "--label", "colaby.project=" + project}
		if runtime.GOOS == "linux" {
			args = append(args, "--user", fmt.Sprintf("%d:%d", os.Getuid(), os.Getgid()), "-e", "HOME=/tmp", "--network", "host")
		} else {
			args = append(args, "-p", fmt.Sprintf("%d:3000", port))
		}
		args = append(args, "-v", workspace+":/home/project:cached", "-e", "THEIA_DEFAULT_WORKSPACE=file:///home/project", "-e", "DEFAULT_WORKSPACE=/home/project", "-e", "COLABY_PROJECT_ID="+project, "-e", "THEIA_SHELL=/usr/local/bin/colaby-win-shell", "-e", "SHELL=/usr/local/bin/colaby-win-shell", "--restart", "unless-stopped", "ghcr.io/eclipse-theia/theia-ide/theia-ide:latest", "/home/project", "--hostname", "0.0.0.0")
		if runtime.GOOS == "linux" {
			args = append(args, fmt.Sprintf("--port=%d", port))
		}
		if b, e := runDocker(ctx, args...); e != nil {
			return theiaInfo{}, fmt.Errorf("could not start Theia container: %s", truncate(string(b), 250))
		}
		if err := waitForTheia(ctx, port); err != nil {
			return theiaInfo{}, err
		}
		if err := a.injectTheiaBridge(name, project); err != nil {
			return theiaInfo{}, fmt.Errorf("could not prepare Theia workspace: %w", err)
		}
		x := theiaInfo{Port: port, Status: "ready", ContainerName: name}
		a.theia.mu.Lock()
		a.theia.items[project] = x
		a.theia.mu.Unlock()
		return x, nil
	}
	return theiaInfo{}, fmt.Errorf("no available Theia ports")
}

func theiaWorkspaceMountMatches(ctx context.Context, container, workspace string) (bool, error) {
	if err := os.MkdirAll(workspace, 0o755); err != nil {
		return false, err
	}
	markerName := ".colaby-mount-check-" + randomID()
	markerPath := filepath.Join(workspace, markerName)
	markerValue := randomID()
	if err := os.WriteFile(markerPath, []byte(markerValue), 0o644); err != nil {
		return false, err
	}
	defer os.Remove(markerPath)
	containerPath := "/home/project/" + markerName
	out, err := runDocker(ctx, "exec", container, "sh", "-c", "cat "+containerPath+" 2>/dev/null || true")
	if err != nil {
		return false, err
	}
	return string(out) == markerValue, nil
}

func preserveStaleTheiaWorkspace(ctx context.Context, container, workspaceRoot, project string) (string, error) {
	recoveryRoot := filepath.Join(workspaceRoot, ".stale-theia-workspaces")
	if err := os.MkdirAll(recoveryRoot, 0o755); err != nil {
		return "", err
	}
	recovery, err := os.MkdirTemp(recoveryRoot, project+"-")
	if err != nil {
		return "", err
	}
	archive := filepath.Join(recovery, "stale-workspace.tar")
	if err := archiveTheiaWorkspace(ctx, container, archive); err != nil {
		_ = os.RemoveAll(recovery)
		return "", fmt.Errorf("could not preserve files from the old Theia mount: %w", err)
	}
	if out, err := runDocker(ctx, "rm", "-f", container); err != nil && !strings.Contains(string(out), "No such container") {
		return "", fmt.Errorf("could not replace stale Theia container: %s", truncate(string(out), 250))
	}
	return recovery, nil
}

func archiveTheiaWorkspace(ctx context.Context, container, archive string) error {
	f, err := os.OpenFile(archive, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	defer f.Close()
	args := []string{"exec", container, "tar", "-C", "/home/project", "-cf", "-", "."}
	cmd := exec.CommandContext(ctx, "docker", args...)
	var stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = f, &stderr
	err = cmd.Run()
	if err == nil {
		return f.Sync()
	}
	if _, sudoErr := exec.LookPath("sudo"); sudoErr != nil {
		return fmt.Errorf("docker tar failed: %s", truncate(stderr.String(), 250))
	}
	if err = f.Truncate(0); err != nil {
		return err
	}
	if _, err = f.Seek(0, 0); err != nil {
		return err
	}
	stderr.Reset()
	sudoArgs := append([]string{"-n", "docker"}, args...)
	cmd = exec.CommandContext(ctx, "sudo", sudoArgs...)
	cmd.Stdout, cmd.Stderr = f, &stderr
	if err = cmd.Run(); err != nil {
		return fmt.Errorf("docker tar failed: %s", truncate(stderr.String(), 250))
	}
	return f.Sync()
}

func theiaContainerName(project string) string {
	compact := strings.ReplaceAll(project, "-", "")
	if len(compact) > 12 {
		compact = compact[:12]
	}
	return "colaby-theia-" + compact
}

func (a *app) findTheia(ctx context.Context, project string) (theiaInfo, bool) {
	item, ok := inspectTheia(ctx, project)
	if !ok {
		return theiaInfo{}, false
	}
	a.theia.mu.Lock()
	a.theia.items[project] = item
	a.theia.mu.Unlock()
	return item, true
}

func inspectTheia(ctx context.Context, project string) (theiaInfo, bool) {
	name := theiaContainerName(project)
	running, err := runDocker(ctx, "inspect", "--format", "{{.State.Running}}", name)
	if err != nil || strings.TrimSpace(string(running)) != "true" {
		return theiaInfo{}, false
	}
	port := 0
	if runtime.GOOS == "linux" {
		out, e := runDocker(ctx, "inspect", "--format", "{{ index .Config.Cmd 3 }}", name)
		if e == nil {
			fmt.Sscanf(strings.TrimSpace(string(out)), "--port=%d", &port)
		}
	} else {
		out, e := runDocker(ctx, "port", name, "3000/tcp")
		if e == nil {
			for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
				idx := strings.LastIndex(line, ":")
				if idx >= 0 {
					port, _ = strconv.Atoi(line[idx+1:])
					if port > 0 {
						break
					}
				}
			}
		}
	}
	if port == 0 {
		return theiaInfo{}, false
	}
	return theiaInfo{Port: port, Status: "ready", ContainerName: name}, true
}

func waitForTheia(ctx context.Context, port int) error {
	client := &http.Client{Timeout: 2 * time.Second}
	deadline := time.Now().Add(120 * time.Second)
	url := fmt.Sprintf("http://127.0.0.1:%d", port)
	for time.Now().Before(deadline) {
		req, e := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if e == nil {
			resp, e := client.Do(req)
			if e == nil {
				_ = resp.Body.Close()
				if resp.StatusCode >= 200 && resp.StatusCode < 500 {
					return nil
				}
			}
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(2 * time.Second):
		}
	}
	return fmt.Errorf("Theia did not become ready within 120 seconds")
}

func (a *app) injectTheiaBridge(container, project string) error {
	origins, _ := json.Marshal(a.cfg.origins)
	bridge := strings.ReplaceAll(theiaBridgeTemplate, "__COLABY_ALLOWED_PARENT_ORIGINS__", string(origins))
	bridgeB64 := base64.StdEncoding.EncodeToString([]byte(bridge))
	host := "host.docker.internal"
	if runtime.GOOS == "linux" {
		host = "127.0.0.1"
	}
	terminal := strings.ReplaceAll(theiaTerminalTemplate, "__COLABY_TERMINAL_HOST__", host)
	terminal = strings.ReplaceAll(terminal, "__COLABY_TERMINAL_PORT__", a.cfg.port)
	terminal = strings.ReplaceAll(terminal, "__COLABY_TERMINAL_TOKEN__", signTerminalToken(a.cfg.jwtSecret, "container", project))
	terminalB64 := base64.StdEncoding.EncodeToString([]byte(terminal))
	runner := `const fs=require('fs');
const bridge=Buffer.from(process.argv[1],'base64').toString('utf8');
const terminal=Buffer.from(process.argv[2],'base64').toString('utf8');
const token=terminal.match(/const token = '([^']+)'/)[1];
fs.writeFileSync('/tmp/colaby-terminal-token',token,'utf8');fs.writeFileSync('/tmp/colaby-project-id',process.env.COLABY_PROJECT_ID||'','utf8');
fs.writeFileSync('/usr/local/bin/colaby-win-shell',terminal,'utf8');fs.chmodSync('/usr/local/bin/colaby-win-shell',0o755);
try{if(!fs.existsSync('/bin/bash.real'))fs.copyFileSync('/bin/bash','/bin/bash.real');const wrapper='#!/bin/sh\nfor arg in "$@"; do\n if [ "$arg" = "-c" ]; then exec /bin/bash.real "$@"; fi\ndone\nexec /usr/local/bin/colaby-win-shell "$@"\n';fs.writeFileSync('/bin/bash',wrapper,'utf8');fs.chmodSync('/bin/bash',0o755)}catch(e){console.error('[Colaby] bash wrapper:',e.message)}
for(const p of ['/home/project/.theia/settings.json','/home/theia/.theia/settings.json']){try{fs.mkdirSync(require('path').dirname(p),{recursive:true});let settings={};if(fs.existsSync(p))try{settings=JSON.parse(fs.readFileSync(p,'utf8'))}catch(_){}settings['files.autoSave']='off';settings['terminal.integrated.shell.linux']='/usr/local/bin/colaby-win-shell';fs.writeFileSync(p,JSON.stringify(settings,null,2),'utf8')}catch(e){console.error('[Colaby] settings:',e.message)}}
try{const p='/home/theia/applications/browser/lib/frontend/bundle.js';let s=fs.readFileSync(p,'utf8');const t='var monaco = (init_editor_main(), __toCommonJS(editor_main_exports));';if(s.includes(t)&&!s.includes('window.monaco = monaco'))fs.writeFileSync(p,s.replace(t,t+' window.monaco = monaco;'));}catch(e){console.error('[Colaby] Monaco export patch:',e.message)}
const target='/home/theia/applications/browser/lib/frontend/index.html';const fallback='/home/theia/applications/browser/src-gen/frontend/index.html';let html=fs.readFileSync(fs.existsSync(fallback)?fallback:target,'utf8');const start=html.indexOf('<script id="colaby-theia-bridge">');if(start>=0){const end=html.indexOf('</script>',start);if(end>=0)html=html.slice(0,start)+html.slice(end+9)}const at=html.lastIndexOf('</body>');html=at>=0?html.slice(0,at)+bridge+'\n</body>'+html.slice(at+7):html+'\n'+bridge;fs.writeFileSync(target,html,'utf8');`
	out, err := runDocker(context.Background(), "exec", "-u", "0", container, "node", "-e", runner, bridgeB64, terminalB64)
	if err != nil {
		return fmt.Errorf("docker collaboration bridge injection failed: %s", truncate(string(out), 250))
	}
	// Docker creates a missing bind-mount directory as root, and the bridge is
	// installed with docker exec -u 0. The IDE process runs as the collaboration
	// service UID/GID, so hand the workspace back to that identity before users
	// create or save files in Theia.
	owner := fmt.Sprintf("%d:%d", os.Getuid(), os.Getgid())
	if out, err = runDocker(context.Background(), "exec", "-u", "0", container, "chown", "-R", owner, "/home/project"); err != nil {
		return fmt.Errorf("could not make Theia workspace writable: %s", truncate(string(out), 250))
	}
	return nil
}
func (a *app) stopTheia(ctx context.Context, project string) error {
	a.theia.mu.Lock()
	defer a.theia.mu.Unlock()
	x, ok := a.theia.items[project]
	name := theiaContainerName(project)
	if ok {
		name = x.ContainerName
	}
	b, e := runDocker(ctx, "rm", "-f", name)
	if e != nil {
		if strings.Contains(string(b), "No such container") {
			delete(a.theia.items, project)
			return nil
		}
		return fmt.Errorf("could not stop Theia container: %s", truncate(string(b), 250))
	}
	delete(a.theia.items, project)
	return nil
}

// runDocker uses the current user's Docker access first and falls back to
// passwordless sudo when the Docker socket is restricted, as in the Node
// service's previous runtime.
func runDocker(ctx context.Context, args ...string) ([]byte, error) {
	out, err := exec.CommandContext(ctx, "docker", args...).CombinedOutput()
	if err == nil {
		return out, nil
	}
	if _, sudoErr := exec.LookPath("sudo"); sudoErr == nil {
		sudoArgs := append([]string{"-n", "docker"}, args...)
		if sudoOut, sudoErr := exec.CommandContext(ctx, "sudo", sudoArgs...).CombinedOutput(); sudoErr == nil {
			return sudoOut, nil
		} else {
			return sudoOut, sudoErr
		}
	}
	return out, err
}

func (a *app) execCommand(w http.ResponseWriter, r *http.Request, project string) {
	var in struct {
		Command string `json:"command"`
	}
	if decodeJSON(r, &in) != nil || strings.TrimSpace(in.Command) == "" {
		writeError(w, 400, "INVALID_COMMAND", "Command is required")
		return
	}
	item, e := a.getWorkspace(r.Context(), project)
	if e != nil {
		internalError(w, e)
		return
	}
	root := a.workspacePath(item)
	shell := env("COLABY_TERMINAL_SHELL", "/bin/bash")
	cmd := exec.CommandContext(r.Context(), shell, "-lc", in.Command)
	cmd.Dir = root
	cmd.Env = append(os.Environ(), "COLABY_WORKSPACE="+root, "COLABY_PROJECT_ID="+project)
	out, e := cmd.CombinedOutput()
	exit := 0
	if e != nil {
		if ee, ok := e.(*exec.ExitError); ok {
			exit = ee.ExitCode()
		} else {
			writeError(w, 500, "COMMAND_FAILED", e.Error())
			return
		}
	}
	writeJSON(w, 200, map[string]any{"success": true, "data": map[string]any{"stdout": string(out), "stderr": "", "exitCode": exit}})
}

func (a *app) terminalWS(w http.ResponseWriter, r *http.Request) {
	project := r.URL.Query().Get("projectId")
	token := r.URL.Query().Get("token")
	if token == "" && strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ") {
		token = strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	}
	claims, e := parseJWT(token, a.cfg.jwtSecret)
	if e != nil {
		http.Error(w, "unauthorized", 401)
		return
	}
	user := strings.ToLower(firstString(claims["sub"], claims["userId"], claims["id"]))
	if user == "" || project == "" {
		http.Error(w, "unauthorized", 401)
		return
	}
	if tokenProject := firstString(claims["projectId"]); tokenProject != "" && tokenProject != project {
		http.Error(w, "forbidden", 403)
		return
	}
	if user != "container" {
		role, roleErr := a.projects.memberRole(r.Context(), project, user)
		if roleErr != nil {
			http.Error(w, "project service unavailable", 503)
			return
		}
		if role == "" {
			http.Error(w, "project access denied", 403)
			return
		}
	}
	item, e := a.getWorkspace(r.Context(), project)
	if e != nil {
		http.Error(w, "workspace unavailable", 500)
		return
	}
	up := websocket.Upgrader{CheckOrigin: func(req *http.Request) bool {
		origin := req.Header.Get("Origin")
		if origin == "" {
			return true
		}
		for _, o := range a.cfg.origins {
			if o == origin {
				return true
			}
		}
		return false
	}}
	conn, e := up.Upgrade(w, r, nil)
	if e != nil {
		return
	}
	defer conn.Close()
	root := a.workspacePath(item)
	_ = os.MkdirAll(root, 0o755)
	shell := env("COLABY_TERMINAL_SHELL", "/bin/bash")
	cmd := exec.Command(shell, "-i")
	cmd.Dir = root
	cmd.Env = append(os.Environ(), "TERM=xterm-256color", "COLABY_WORKSPACE="+root, "COLABY_PROJECT_ID="+project, "COLABY_USER_ID="+user)
	pt, e := pty.Start(cmd)
	if e != nil {
		_ = conn.WriteJSON(map[string]any{"type": "output", "data": "\r\n[Colaby] Failed to start terminal: " + e.Error() + "\r\n"})
		return
	}
	defer func() { _ = pt.Close(); _ = cmd.Process.Kill() }()
	done := make(chan struct{})
	go func() {
		defer close(done)
		buf := make([]byte, 4096)
		for {
			n, e := pt.Read(buf)
			if n > 0 {
				_ = conn.WriteJSON(map[string]any{"type": "output", "data": string(buf[:n])})
			}
			if e != nil {
				return
			}
		}
	}()
	go func() {
		for {
			var m map[string]any
			if conn.ReadJSON(&m) != nil {
				return
			}
			switch m["type"] {
			case "input":
				if s, ok := m["data"].(string); ok {
					_, _ = pt.Write([]byte(s))
				}
			case "resize":
				cols := boundedInt(m["cols"], 120, 1, 500)
				rows := boundedInt(m["rows"], 30, 1, 200)
				_ = pty.Setsize(pt, &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)})
			}
		}
	}()
	select {
	case <-done:
	}
	_ = conn.WriteJSON(map[string]any{"type": "exit", "code": 0})
}
func safeName(s string) string {
	var b strings.Builder
	for _, c := range s {
		if c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '-' {
			b.WriteRune(c)
		} else {
			b.WriteByte('-')
		}
	}
	return b.String()
}
func boundedInt(v any, fallback, minimum, maximum int) int {
	n, ok := v.(float64)
	if !ok {
		return fallback
	}
	x := int(n)
	if x < minimum {
		x = minimum
	}
	if x > maximum {
		x = maximum
	}
	return x
}
