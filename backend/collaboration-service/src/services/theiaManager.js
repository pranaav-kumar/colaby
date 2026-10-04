'use strict';

const { execFile, exec, spawn } = require('child_process');
const util = require('util');
const http = require('http');
const net = require('net');
const path = require('path');
const fs = require('fs');

const execFileAsync = util.promisify(execFile);
const execAsync = util.promisify(exec);
const { PORT } = require('../config/env');

const logger = require('../utils/logger');

// Detect whether we need `sudo docker` or just `docker`
// This is needed when the process user is not yet in the `docker` group
// (group membership requires a new login session to take effect)
let _dockerCmd = null;
async function getDockerCmd() {
  if (_dockerCmd) return _dockerCmd;
  try {
    await execAsync('docker ps -q', { timeout: 5000 });
    _dockerCmd = 'docker';
  } catch (err) {
    if (err.message && err.message.includes('permission denied')) {
      logger.warn('[Theia] docker permission denied for current user — trying sudo docker');
      try {
        await execAsync('sudo docker ps -q', { timeout: 5000 });
        _dockerCmd = 'sudo docker';
        logger.info('[Theia] Using sudo docker successfully');
      } catch {
        throw new Error('Docker is not accessible. Ensure docker is installed and the user is in the docker group (log out and back in after: sudo usermod -aG docker $USER)');
      }
    } else {
      throw new Error('Docker is not running or not installed: ' + err.message);
    }
  }
  return _dockerCmd;
}

// Check if the Theia image needs to be pulled
const _imagePullPromises = new Map();
const _imagePullDone = new Set();
async function ensureImagePulled(image) {
  if (_imagePullDone.has(image)) return;
  if (_imagePullPromises.has(image)) return _imagePullPromises.get(image);

  const pullPromise = (async () => {
    const dockerCmd = await getDockerCmd();
    try {
      const { stdout } = await execAsync(`${dockerCmd} image inspect ${image} --format "{{.Id}}"`, { timeout: 8000 });
      if (stdout.trim()) {
        _imagePullDone.add(image);
        return;
      }
    } catch {
      // Image is not present locally; pull it before starting a container.
    }

    logger.info(`[Theia] Pulling image ${image} — this may take several minutes on first run...`);
    try {
      await execAsync(`${dockerCmd} pull ${image}`, { timeout: 600000 });
      _imagePullDone.add(image);
      logger.info('[Theia] Image pulled successfully');
    } catch (err) {
      throw new Error(`Failed to pull Theia image: ${err.message}`);
    }
  })();

  _imagePullPromises.set(image, pullPromise);
  try {
    await pullPromise;
  } finally {
    _imagePullPromises.delete(image);
  }
}


// In-memory registry: projectId -> { port, containerId, containerName, status, workspaceDir, startedAt }
// status: 'starting' | 'ready' | 'error' | 'stopped'
const registry = new Map();
const startingPromises = new Map(); // projectId -> Promise<info> to prevent concurrent startup race conditions

const PORT_RANGE_START = 9100;
const PORT_RANGE_END = 9199;
const THEIA_IMAGE = 'ghcr.io/eclipse-theia/theia-ide/theia-ide:latest';
const HEALTH_TIMEOUT_MS = 120_000;
const HEALTH_POLL_INTERVAL_MS = 2_000;

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '0.0.0.0');
  });
}

async function getDockerUsedPorts() {
  const used = new Set();
  try {
    const dockerCmd = await getDockerCmd().catch(() => 'docker');
    const { stdout } = await execAsync(`${dockerCmd} ps --format "{{.Ports}}"`);
    const matches = stdout.matchAll(/:(\d+)->/g);
    for (const m of matches) {
      used.add(parseInt(m[1], 10));
    }
  } catch { }
  return used;
}


function getAllocatedPorts() {
  const ports = new Set();
  for (const info of registry.values()) {
    if (info.port) ports.add(info.port);
  }
  return ports;
}

async function findFreePort() {
  const allocated = getAllocatedPorts();
  const dockerPorts = await getDockerUsedPorts();

  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    if (!allocated.has(port) && !dockerPorts.has(port)) {
      const free = await isPortAvailable(port);
      if (free) {
        return port;
      }
    }
  }
  throw new Error('No free ports available in range 9100-9199');
}

function containerName(projectId) {
  return `colaby-theia-${projectId.replace(/-/g, '').slice(0, 12)}`;
}

function normalizeBindPath(value) {
  let normalized = String(value || '').replace(/\\/g, '/').replace(/\/$/, '');
  if (process.platform === 'win32') {
    normalized = normalized
      .replace(/^\/run\/desktop\/mnt\/host\/([a-z])\//i, '$1:/')
      .replace(/^\/host_mnt\/([a-z])\//i, '$1:/')
      .toLowerCase();
    if (!/^[a-z]:\//i.test(normalized)) normalized = path.resolve(normalized).replace(/\\/g, '/').toLowerCase();
    return normalized;
  }
  return path.resolve(normalized);
}

async function findExistingContainer(name) {
  try {
    const dockerCmd = await getDockerCmd();
    const { stdout } = await execAsync(`${dockerCmd} inspect ${name}`);
    const list = JSON.parse(stdout);
    if (!list || list.length === 0) return null;
    const c = list[0];
    const isRunning = Boolean(c.State && c.State.Running === true);
    const containerId = c.Id;
    const portBindings = c.NetworkSettings && c.NetworkSettings.Ports && c.NetworkSettings.Ports['3000/tcp'];
    const command = c.Config?.Cmd || [];
    const configuredPortArg = command.find((arg) => /^--port(?:=|$)/.test(arg));
    const configuredPortIndex = configuredPortArg === '--port' ? command.indexOf('--port') + 1 : -1;
    const configuredPort = configuredPortArg?.includes('=')
      ? Number(configuredPortArg.split('=')[1])
      : (configuredPortIndex > 0 ? Number(command[configuredPortIndex]) : null);
    const port = (portBindings && portBindings.length > 0)
      ? parseInt(portBindings[0].HostPort, 10)
      : (c.HostConfig?.NetworkMode === 'host' ? configuredPort : null);
    const workspaceMount = (c.Mounts || []).find((mount) => mount.Destination === '/home/project');
    const hasHostGateway = (c.HostConfig?.ExtraHosts || []).some((entry) => entry.startsWith('host.docker.internal:'));
    return {
      isRunning,
      containerId,
      port,
      networkMode: c.HostConfig?.NetworkMode || 'bridge',
      workspaceSource: workspaceMount?.Source || null,
      hasHostGateway
    };
  } catch {
    return null;
  }
}

function waitForTheia(port, timeoutMs = HEALTH_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      if (Date.now() > deadline) {
        return reject(new Error(`Theia on port ${port} did not become ready within ${timeoutMs / 1000}s`));
      }
      const req = http.get(`http://localhost:${port}`, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 500) {
          resolve();
        } else {
          setTimeout(check, HEALTH_POLL_INTERVAL_MS);
        }
        res.resume();
      });
      req.on('error', () => setTimeout(check, HEALTH_POLL_INTERVAL_MS));
      req.setTimeout(2000, () => { req.destroy(); setTimeout(check, HEALTH_POLL_INTERVAL_MS); });
    };
    check();
  });
}

async function startTheia(projectId, workspaceDir) {
  // Deduplicate before checking the registry: a startup already in progress
  // owns the current container lifecycle and must not be stopped mid-launch.
  if (startingPromises.has(projectId)) {
    return await startingPromises.get(projectId);
  }

  const existing = registry.get(projectId);
  if (existing && (existing.status === 'ready' || existing.status === 'starting')) {
    if (normalizeBindPath(existing.workspaceDir) === normalizeBindPath(workspaceDir)) return existing;
    await stopTheia(projectId);
  }

  const startPromise = (async () => {
    const name = containerName(projectId);
    const found = await findExistingContainer(name);

    const requestedWorkspace = normalizeBindPath(workspaceDir);
    // Linux bridge traffic to host-gateway is commonly filtered by the host
    // firewall. Host networking gives the in-container terminal bridge a
    // reliable loopback route to the collaboration service.
    const terminalHostAvailable = process.platform !== 'linux' || found?.networkMode === 'host';
    if (found && found.isRunning && found.port && terminalHostAvailable && found.workspaceSource &&
        normalizeBindPath(found.workspaceSource) === requestedWorkspace) {
      logger.info(`[Theia] Reusing existing container ${name} on port ${found.port}`);
      const info = { port: found.port, containerId: found.containerId, containerName: name, status: 'starting', workspaceDir, startedAt: new Date() };
      registry.set(projectId, info);
      waitForTheia(found.port)
        .then(async () => {
          await injectCollabBridge(name, projectId);
          const r = registry.get(projectId);
          if (r) r.status = 'ready';
          logger.info(`[Theia] ${name} ready and bridge active on port ${found.port}`);
        })
        .catch(() => { const r = registry.get(projectId); if (r) r.status = 'error'; });
      return info;
    }

    if (found?.isRunning && found.workspaceSource && normalizeBindPath(found.workspaceSource) !== requestedWorkspace) {
      logger.warn(`[Theia] Replacing ${name}: existing bind mount ${found.workspaceSource} does not match ${workspaceDir}`);
    }

    // Always cleanly remove any existing stopped/stale container with this name to prevent docker name conflicts
    const dockerCmd = await getDockerCmd();
    try { await execAsync(`${dockerCmd} rm -f ${name}`); } catch { }

    // Pull image if not present locally (blocking — needed before docker run)
    await ensureImagePulled(THEIA_IMAGE);

    const port = await findFreePort();
    const normalizedDir = path.resolve(workspaceDir).replace(/\\/g, '/');

    // Ensure workspace directory and files.autoSave off configured
    try {
      fs.mkdirSync(workspaceDir, { recursive: true });
      const theiaSettingsDir = path.join(workspaceDir, '.theia');
      fs.mkdirSync(theiaSettingsDir, { recursive: true });
      const theiaSettingsFile = path.join(theiaSettingsDir, 'settings.json');
      let settings = {};
      if (fs.existsSync(theiaSettingsFile)) {
        try { settings = JSON.parse(fs.readFileSync(theiaSettingsFile, 'utf8')); } catch { }
      }
      settings['files.autoSave'] = 'off';
      fs.writeFileSync(theiaSettingsFile, JSON.stringify(settings, null, 2), 'utf8');
    } catch (err) {
      logger.warn(`Could not write workspace .theia/settings.json: ${err.message}`);
    }

    logger.info(`[Theia] Starting container ${name} on port ${port} -> ${normalizedDir}`);

    let containerId;
    try {
      // Split sudo if needed (execFileAsync requires a single command)
      const [cmd, ...baseArgs] = dockerCmd.split(' ');
      const hostUserArgs = [];
      if (process.platform !== 'win32' && typeof process.getuid === 'function' && typeof process.getgid === 'function') {
        // Match the host workspace owner so Theia-created files remain writable
        // by the collaboration service. /tmp is writable by this UID and acts
        // as its per-container home for Theia cache/config writes.
        hostUserArgs.push('--user', `${process.getuid()}:${process.getgid()}`, '-e', 'HOME=/tmp');
      }
      const linuxHostNetwork = process.platform === 'linux';
      const allArgs = [...baseArgs, 'run', '-d',
        '--name', name,
        ...hostUserArgs,
        ...(linuxHostNetwork ? ['--network', 'host'] : ['-p', `${port}:3000`]),
        '-v', `${normalizedDir}:/home/project:cached`,
        '-e', 'THEIA_DEFAULT_WORKSPACE=file:///home/project',
        '-e', 'DEFAULT_WORKSPACE=/home/project',
        '-e', `COLABY_PROJECT_ID=${projectId}`,
        '-e', 'THEIA_SHELL=/usr/local/bin/colaby-win-shell',
        '-e', 'SHELL=/usr/local/bin/colaby-win-shell',
        '--restart', 'unless-stopped',
        THEIA_IMAGE,
        '/home/project',
        '--hostname', '0.0.0.0',
        ...(linuxHostNetwork ? [`--port=${port}`] : [])
      ];
      const { stdout } = await execFileAsync(cmd, allArgs);
      containerId = stdout.trim();
    } catch (err) {
      throw new Error(`Failed to start Theia container: ${err.message}`);
    }

    const info = { port, containerId, containerName: name, status: 'starting', workspaceDir, startedAt: new Date() };
    registry.set(projectId, info);

    waitForTheia(port)
      .then(async () => {
        await injectCollabBridge(name, projectId);
        const r = registry.get(projectId);
        if (r) r.status = 'ready';
        logger.info(`[Theia] ${name} ready on port ${port}`);
      })
      .catch((err) => {
        const r = registry.get(projectId);
        if (r) r.status = 'error';
        logger.error(`[Theia] health check failed:`, err.message);
      });

    return info;
  })();

  startingPromises.set(projectId, startPromise);
  try {
    return await startPromise;
  } finally {
    startingPromises.delete(projectId);
  }
}


async function injectCollabBridge(containerName, projectId) {
  const containerUid = process.platform === 'win32' ? 'theia' : String(process.getuid?.() ?? 100);
  const containerGid = process.platform === 'win32' ? 'theia' : String(process.getgid?.() ?? 101);

  // ─── Generate fresh terminal auth token (embedded in runner script) ────────
  const terminalSvc = require('./terminalServer');
  const termToken = terminalSvc.createTerminalToken('container', projectId || 'unknown');

  // ─── colaby-win-shell source (runs inside Docker, IS Theia's shell) ────────
  // Node 24 is confirmed in the container, so global WebSocket is available.
  // The script bridges Theia PTY stdin/stdout ↔ the host WS server ↔ node-pty.
  const winShellLines = [
    "#!/usr/bin/env node",
    "'use strict';",
    "// Colaby local shell — forwards Theia terminal input/output to the host PTY service.",
    "var fs = require('fs');",
    "var token = '';",
    "var projectId = process.env.COLABY_PROJECT_ID || '';",
    "try { token = fs.readFileSync('/tmp/colaby-terminal-token','utf8').trim(); } catch(e) {}",
    "if (!projectId) { try { projectId = fs.readFileSync('/tmp/colaby-project-id','utf8').trim(); } catch(e) {} }",
    "if (!token || !projectId) {",
    "  process.stderr.write('\\r\\n[colaby-win-shell] Config missing, using /bin/bash.real fallback\\r\\n');",
    "  var fallback = fs.existsSync('/bin/bash.real') ? '/bin/bash.real' : '/bin/sh';",
    "  require('child_process').spawn(fallback,[],{stdio:'inherit',env:process.env})",
    "    .on('exit',function(c){process.exit(c||0);});",
    "  return;",
    "}",
    `var terminalHost=${JSON.stringify(process.platform === 'linux' ? '127.0.0.1' : 'host.docker.internal')};`,
    `var wsUrl='ws://'+terminalHost+':${PORT}/terminal-pty?projectId='+`,
    "          encodeURIComponent(projectId)+'&token='+encodeURIComponent(token);",
    "var connected=false;",
    "var pendingInput=[];",
    "var ws=new WebSocket(wsUrl);",
    "var connectTimer=setTimeout(function(){",
    "  if(!connected){process.stderr.write('\\r\\n[Colaby] Timed out connecting to the local terminal service. Close this terminal and open a new one.\\r\\n',function(){try{ws.close();}catch(e){process.exit(1);}});}",
    "},8000);",
    "ws.addEventListener('open',function(){",
    "  connected=true;",
    "  clearTimeout(connectTimer);",
    "  ws.send(JSON.stringify({type:'resize',cols:process.stdout.columns||120,rows:process.stdout.rows||30}));",
    "  while(pendingInput.length&&ws.readyState===1){ws.send(JSON.stringify({type:'input',data:pendingInput.shift()}));}",
    "});",
    "ws.addEventListener('message',function(ev){",
    "  try{",
    "    var msg=JSON.parse(ev.data);",
    "    if(msg.type==='output'&&msg.data){process.stdout.write(msg.data);}",
    "    else if(msg.type==='exit'){process.exit(msg.code||0);}",
    "  }catch(e){}",
    "});",
    `ws.addEventListener('error',function(){process.stderr.write('\\r\\n[Colaby] Cannot reach the local terminal service at '+terminalHost+':${PORT}\\r\\n');});`,
    "ws.addEventListener('close',function(){",
    "  if(!connected){process.stderr.write('\\r\\n[Colaby] The local terminal connection closed before it was ready. Close this terminal and open a new one.\\r\\n');}",
    "  process.exitCode=connected?0:1;",
    "  process.exit();",
    "});",
    "if(process.stdin.isTTY){try{process.stdin.setRawMode(true);}catch(e){}}",
    "process.stdin.resume();",
    "process.stdin.on('data',function(chunk){",
    "  var data=chunk.toString();",
    "  if(connected&&ws.readyState===1){try{ws.send(JSON.stringify({type:'input',data:data}));}catch(e){pendingInput.push(data);}}",
    "  else if(pendingInput.length<128){pendingInput.push(data);}",
    "});",
    "process.on('SIGWINCH',function(){",
    "  if(ws&&ws.readyState===1){",
    "    try{ws.send(JSON.stringify({type:'resize',cols:process.stdout.columns||80,rows:process.stdout.rows||24}));}catch(e){}",
    "  }",
    "});",
    "process.on('SIGTERM',function(){try{ws.close(1000);}catch(e){}process.exit(0);});",
    "process.on('SIGHUP', function(){try{ws.close(1000);}catch(e){}process.exit(0);});"
  ];
  const winShellSrc = winShellLines.join('\n');
  const winShellB64 = Buffer.from(winShellSrc).toString('base64');

  // ─── Monaco collaboration bridge (injected into Theia's index.html) ────────
  const bridgeScript = `
<script id="colaby-theia-bridge">
(function() {
  console.log('[COLLAB-BRIDGE] VERSION = 2026-09-09-PROD-02');

  function normalizeCleanPath(p) {
    if (!p) return '';
    var s = (typeof p === 'object' && p.path) ? p.path : String(p);
    s = s.split('\\\\').join('/');
    if (s.indexOf('file://') === 0) { s = s.substring(7); }
    while (s.charAt(0) === '/') { s = s.substring(1); }
    if (s.indexOf('home/project') === 0) { s = s.substring(12); }
    while (s.charAt(0) === '/') { s = s.substring(1); }
    return s;
  }
  function getCleanPath(modelUri) { return normalizeCleanPath(modelUri); }

  var editorDecorations = new Map();
  var injectedStyles    = new Set();
  var modelBindings     = new Map();

  function injectUserStyle(cleanId, color) {
    if (injectedStyles.has(cleanId)) return;
    injectedStyles.add(cleanId);
    var style = document.createElement('style');
    style.id = 'colaby-style-' + cleanId;
    style.textContent = [
      '.colaby-caret-line-' + cleanId + ' { border-left:2px solid ' + color + ' !important; margin-left:-1px; height:100%; display:inline-block; }',
      '.colaby-label-' + cleanId + ' { background-color:' + color + ' !important; color:#fff !important; font-size:10px !important; font-weight:600 !important; border-radius:3px !important; padding:1px 4px !important; margin-left:2px !important; vertical-align:super !important; pointer-events:none !important; line-height:12px !important; display:inline-block !important; box-shadow:0 1px 3px rgba(0,0,0,0.3) !important; }',
      '.colaby-sel-' + cleanId + ' { background-color:' + color + '33 !important; }'
    ].join('\\n');
    document.head.appendChild(style);
  }

  function updateEditorPresence(editor, collaborators) {
    if (!editor || !editor.getModel) return;
    var model = editor.getModel();
    if (!model) return;
    var currentPath = getCleanPath(model.uri);
    if (!editorDecorations.has(editor)) { editorDecorations.set(editor, new Map()); }
    var userDecs = editorDecorations.get(editor);
    var activeUserIds = new Set();
    if (collaborators) {
      Object.keys(collaborators).forEach(function(uId) {
        var collab = collaborators[uId];
        if (!collab || collab.filePath !== currentPath) return;
        activeUserIds.add(uId);
        var cleanId = uId.replace(/[^a-zA-Z0-9]/g,'_');
        var color = collab.color || '#22D3EE';
        var userName = collab.userName || 'User';
        injectUserStyle(cleanId, color);
        var newDecs = [];
        if (collab.position && collab.position.lineNumber) {
          var line = collab.position.lineNumber, col = collab.position.column || 1;
          newDecs.push({ range: new window.monaco.Range(line,col,line,col), options: { className:'colaby-remote-caret colaby-caret-'+cleanId, beforeContentClassName:'colaby-caret-line colaby-caret-line-'+cleanId, hoverMessage:{value:'**'+userName+'** is editing here'} } });
          newDecs.push({ range: new window.monaco.Range(line,col,line,col), options: { after:{ content:'\\u00A0'+userName+'\\u00A0', inlineClassName:'colaby-label-'+cleanId } } });
        }
        if (collab.selection && collab.selection.startLineNumber) {
          var sel = collab.selection;
          if (sel.startLineNumber !== sel.endLineNumber || sel.startColumn !== sel.endColumn) {
            newDecs.push({ range: new window.monaco.Range(sel.startLineNumber,sel.startColumn,sel.endLineNumber,sel.endColumn), options:{ className:'colaby-remote-selection colaby-sel-'+cleanId } });
          }
        }
        var oldDecIds = userDecs.get(uId) || [];
        userDecs.set(uId, editor.deltaDecorations(oldDecIds, newDecs));
      });
    }
    userDecs.forEach(function(oldIds,uId) {
      if (!activeUserIds.has(uId)) { editor.deltaDecorations(oldIds,[]); userDecs.delete(uId); }
    });
  }

  function setupMonacoHooks() {
    if (!window.monaco || !window.monaco.editor || typeof window.monaco.editor.getModels !== 'function') {
      setTimeout(setupMonacoHooks, 200); return;
    }

    function hookModel(model) {
      if (!model || (typeof model.isDisposed === 'function' && model.isDisposed())) return;
      var rawUri    = model.uri ? model.uri.toString() : '';
      var canonical = getCleanPath(model.uri);
      if (!canonical || rawUri.startsWith('output:') || rawUri.startsWith('vscode:')) return;

      var existingBinding = modelBindings.get(canonical);
      if (existingBinding && existingBinding.model === model && (!model.isDisposed || !model.isDisposed())) return;
      if (existingBinding && existingBinding.listener && typeof existingBinding.listener.dispose === 'function') {
        try { existingBinding.listener.dispose(); } catch(e) {}
      }

      console.log('[COLLAB-FILE] MODEL_DISCOVERED', { workspaceId: window.__COLABY_PROJECT_ID||'', rawFilePath:rawUri, canonicalFilePath:canonical, roomId:(window.__COLABY_PROJECT_ID||'')+':'+canonical });

      var initialContent = typeof model.getValue === 'function' ? model.getValue() : '';
      window.parent.postMessage({ type:'COLABY_THEIA_FILE_OPENED', filePath:canonical, content:initialContent, modelUri:rawUri, modelVersionId:typeof model.getVersionId==='function'?model.getVersionId():1 }, '*');

      var contentListener = model.onDidChangeContent(function(e) {
        if (model._isApplyingCollabRemote) return;
        if (typeof model.isDisposed === 'function' && model.isDisposed()) return;
        var newContent = model.getValue();
        var change = e.changes && e.changes[0];
        var updateId = 'upd-'+(window.__COLABY_USER_ID||'user')+'-'+Date.now()+'-'+Math.random().toString(36).slice(2,7);
        var uId = window.__COLABY_USER_ID || 'user';
        var mVer = typeof model.getVersionId === 'function' ? model.getVersionId() : 1;
        console.log('[COLAB-LIVE] A_LOCAL_EDIT', { updateId:updateId, userId:uId, filePath:canonical, canonicalPath:canonical, ydocKey:(window.__COLABY_PROJECT_ID||'')+':'+canonical, modelUri:rawUri, modelVersionId:mVer, timestamp:new Date().toISOString() });
        window.parent.postMessage({
          type:'COLABY_THEIA_EDIT', filePath:canonical, content:newContent,
          updateId:updateId, modelUri:rawUri, modelVersionId:mVer,
          operation: change ? { range:{ startLineNumber:change.range.startLineNumber, startColumn:change.range.startColumn, endLineNumber:change.range.endLineNumber, endColumn:change.range.endColumn }, rangeOffset:change.rangeOffset, rangeLength:change.rangeLength, text:change.text } : null
        }, '*');
      });

      if (typeof model.onWillDispose === 'function') {
        model.onWillDispose(function() {
          if (contentListener && typeof contentListener.dispose === 'function') { try { contentListener.dispose(); } catch(e) {} }
          if (modelBindings.get(canonical) && modelBindings.get(canonical).model === model) { modelBindings.delete(canonical); }
        });
      }

      modelBindings.set(canonical, { model:model, modelUri:rawUri, modelId:typeof model.id==='string'?model.id:rawUri, listener:contentListener, boundAt:Date.now() });
      console.log('[COLLAB-FILE] MODEL_BOUND', { canonicalPath:'/'+canonical, modelUri:rawUri, status:'BOUND' });
    }

    window.monaco.editor.onDidCreateModel(hookModel);
    window.monaco.editor.getModels().forEach(hookModel);

    var boundEditors = new WeakSet();
    function hookEditor(editor) {
      if (!editor || boundEditors.has(editor)) return;
      boundEditors.add(editor);
      editor.onDidChangeModel(function() {
        var m = editor.getModel(); if (!m) return;
        hookModel(m);
        window.parent.postMessage({ type:'COLABY_THEIA_FILE_OPENED', filePath:getCleanPath(m.uri), content:typeof m.getValue==='function'?m.getValue():'' }, '*');
      });
      editor.onDidChangeCursorPosition(function(e) {
        var m = editor.getModel(); if (!m) return;
        window.parent.postMessage({ type:'COLABY_THEIA_CURSOR', filePath:getCleanPath(m.uri), position:e.position }, '*');
      });
      editor.onDidChangeCursorSelection(function(e) {
        var m = editor.getModel(); if (!m) return;
        window.parent.postMessage({ type:'COLABY_THEIA_SELECTION', filePath:getCleanPath(m.uri), selection:e.selection }, '*');
      });
      editor.onDidDispose(function() { editorDecorations.delete(editor); boundEditors.delete(editor); });
    }
    if (window.monaco.editor.onDidCreateEditor) { window.monaco.editor.onDidCreateEditor(hookEditor); }
    if (window.monaco.editor.getEditors) { window.monaco.editor.getEditors().forEach(hookEditor); }

    window.addEventListener('message', function(event) {
      var msg = event.data;
      if (!msg || !msg.type) return;

      if (msg.type === 'COLABY_USER_ROLE') {
        window.__COLABY_IS_CREATOR = (msg.role === 'CREATOR' || msg.isCreator === true);
        if (msg.projectId) window.__COLABY_PROJECT_ID = msg.projectId;
        if (msg.userId)    window.__COLABY_USER_ID    = msg.userId;

      } else if (msg.type === 'COLABY_REMOTE_PRESENCE') {
        var editors = window.monaco.editor.getEditors ? window.monaco.editor.getEditors() : [];
        editors.forEach(function(ed) { updateEditorPresence(ed, msg.collaborators); });

      } else if (msg.type === 'COLABY_REMOTE_EDIT') {
        var cleanTarget = normalizeCleanPath(msg.filePath);
        var updateId    = msg.updateId || 'unknown';
        var uId         = window.__COLABY_USER_ID || msg.userId || 'user';
        var models = window.monaco.editor.getModels();
        var targetModel = null;
        for (var i = 0; i < models.length; i++) {
          var m = models[i];
          if (typeof m.isDisposed === 'function' && m.isDisposed()) continue;
          if (normalizeCleanPath(m.uri) === cleanTarget) { targetModel = m; break; }
        }
        if (!targetModel && modelBindings.has(cleanTarget)) {
          var b = modelBindings.get(cleanTarget);
          if (b && b.model && (!b.model.isDisposed || !b.model.isDisposed())) { targetModel = b.model; }
        }
        if (targetModel) {
          console.log('[COLAB-LIVE] B_TARGET_MODEL_FOUND', { updateId:updateId, userId:uId, filePath:cleanTarget, canonicalPath:'/'+cleanTarget, timestamp:new Date().toISOString() });
          targetModel._isApplyingCollabRemote = true;
          try {
            if (targetModel.getValue() !== msg.content) {
              if (typeof targetModel.applyEdits === 'function' && typeof targetModel.getFullModelRange === 'function') {
                targetModel.applyEdits([{ range:targetModel.getFullModelRange(), text:msg.content, forceMoveMarkers:true }]);
              } else { targetModel.setValue(msg.content); }
            }
          } catch(e) { targetModel.setValue(msg.content); }
          finally { targetModel._isApplyingCollabRemote = false; }
        } else {
          console.warn('[COLAB-LIVE] B_TARGET_MODEL_NOT_FOUND', { updateId:updateId, canonicalPath:cleanTarget, openModelCount:models.length });
        }
      }
    });
  }

  setupMonacoHooks();
})();
</script>
`;

  try {
    const base64Script = Buffer.from(bridgeScript).toString('base64');

    // Runner script executes inside Docker via `docker exec node`
    const runnerScript = `
var fs = require('fs');
var cp = require('child_process');

// 1. Write terminal auth token + project ID (read by colaby-win-shell at spawn time)
try {
  fs.writeFileSync('/tmp/colaby-terminal-token', '${termToken}', 'utf8');
  fs.writeFileSync('/tmp/colaby-project-id',     '${projectId}', 'utf8');
} catch (e) { console.error('[Colaby] Token write error:', e.message); }

// 2. Install colaby-win-shell as the replacement shell for Theia's terminal
try {
  var shellSrc = Buffer.from('${winShellB64}', 'base64').toString('utf8');
  fs.writeFileSync('/usr/local/bin/colaby-win-shell', shellSrc, 'utf8');
  cp.execSync('chmod +x /usr/local/bin/colaby-win-shell');
  console.log('[Colaby] colaby-win-shell installed at /usr/local/bin/colaby-win-shell');
} catch (e) { console.error('[Colaby] Shell install error:', e.message); }

// 2b. Backup /bin/bash and install wrapper so any interactive bash terminal runs colaby-win-shell
try {
  if (!fs.existsSync('/bin/bash.real')) {
    fs.copyFileSync('/bin/bash', '/bin/bash.real');
  }
  var bashWrapper = '#!/bin/sh\\nfor arg in "$@"; do\\n  if [ "$arg" = "-c" ]; then\\n    exec /bin/bash.real "$@"\\n  fi\\ndone\\nif [ -x /usr/local/bin/colaby-win-shell ]; then\\n  exec /usr/local/bin/colaby-win-shell "$@"\\nfi\\nexec /bin/bash.real "$@"\\n';
  fs.writeFileSync('/bin/bash', bashWrapper, 'utf8');
  cp.execSync('chmod +x /bin/bash /bin/bash.real');
  console.log('[Colaby] /bin/bash wrapper installed');
} catch (e) { console.error('[Colaby] Bash wrapper error:', e.message); }

// 3. Write both settings.json files so Theia picks up the custom shell and profiles
var shellSettings = {
  'files.autoSave': 'off',
  'terminal.integrated.defaultProfile.linux': 'Colaby Local Shell',
  'terminal.integrated.profiles.linux': {
    'Colaby Local Shell': {
      'path': '/usr/local/bin/colaby-win-shell',
      'icon': 'terminal-bash'
    }
  },
  'terminal.integrated.shell.linux': '/usr/local/bin/colaby-win-shell'
};
try { fs.mkdirSync('/home/project/.theia', { recursive:true }); fs.writeFileSync('/home/project/.theia/settings.json', JSON.stringify(shellSettings,null,2)); } catch(e) {}
try { fs.mkdirSync('/home/theia/.theia',   { recursive:true }); fs.writeFileSync('/home/theia/.theia/settings.json',   JSON.stringify(shellSettings,null,2)); } catch(e) {}
try { cp.execSync('chown -R ${containerUid}:${containerGid} /home/project/.theia /home/theia/.theia /tmp/colaby-terminal-token /tmp/colaby-project-id'); } catch(e) {}

// 4. Expose window.monaco in the Theia JS bundle
try {
  var bundlePath = '/home/theia/applications/browser/lib/frontend/bundle.js';
  var bundle = fs.readFileSync(bundlePath, 'utf8');
  var monacoTarget = 'var monaco = (init_editor_main(), __toCommonJS(editor_main_exports));';
  if (bundle.includes(monacoTarget) && !bundle.includes('window.monaco = monaco')) {
    fs.writeFileSync(bundlePath, bundle.replace(monacoTarget, monacoTarget + ' window.monaco = monaco;'), 'utf8');
  }
} catch (e) { console.error('[Colaby] Bundle patch error:', e.message); }

// 5. Inject Monaco collaboration bridge into index.html
try {
  var templatePath = '/home/theia/applications/browser/src-gen/frontend/index.html';
  var targetPath   = '/home/theia/applications/browser/lib/frontend/index.html';
  var baseHtml = fs.existsSync(templatePath) ? fs.readFileSync(templatePath,'utf8') : fs.readFileSync(targetPath,'utf8');
  var oldStart = baseHtml.indexOf('<script id="colaby-theia-bridge">');
  if (oldStart !== -1) {
    var oldEnd = baseHtml.indexOf('</script>', oldStart);
    if (oldEnd !== -1) { baseHtml = baseHtml.substring(0,oldStart) + baseHtml.substring(oldEnd+9); }
  }
  var b = Buffer.from('${base64Script}','base64').toString('utf8');
  var bodyIdx = baseHtml.lastIndexOf('</body>');
  fs.writeFileSync(targetPath, bodyIdx !== -1
    ? baseHtml.substring(0,bodyIdx) + b + '\\n</body>' + baseHtml.substring(bodyIdx+7)
    : baseHtml + '\\n' + b, 'utf8');
  console.log('[Colaby] HTML bridge injected');
} catch (e) { console.error('[Colaby] HTML patch error:', e.message); }
`;

    await new Promise(async (resolve, reject) => {
      const dockerCmd = await getDockerCmd().catch(() => 'docker');
      const [cmd, ...cmdArgs] = dockerCmd.split(' ');
      const allArgs = [...cmdArgs, 'exec', '-u', '0', '-i', containerName, 'node'];
      const cp = require('child_process').spawn(cmd, allArgs, { shell: false });
      cp.stdin.write(runnerScript);
      cp.stdin.end();
      cp.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error('docker exec exited with code ' + code));
      });
      cp.on('error', reject);
    });

    logger.info(`[Theia] Injected collab bridge + colaby-win-shell in ${containerName}`);
  } catch (err) {
    logger.warn(`[Theia] Could not inject bridge into ${containerName}:`, err.message);
  }
}



async function getTheia(projectId) {
  let info = registry.get(projectId);
  if (info) return info;

  const name = containerName(projectId);
  const found = await findExistingContainer(name);
  if (found && found.isRunning && found.port) {
    info = { port: found.port, containerId: found.containerId, containerName: name, status: 'ready', workspaceDir: '', startedAt: new Date() };
    registry.set(projectId, info);
    return info;
  }
  return null;
}

async function stopTheia(projectId) {
  const info = registry.get(projectId);
  const name = info ? info.containerName : containerName(projectId);
  try {
    const dockerCmd = await getDockerCmd().catch(() => 'docker');
    await execAsync(`${dockerCmd} rm -f ${name}`);
  } catch { }
  registry.delete(projectId);
  return { stopped: true };
}

module.exports = { startTheia, getTheia, stopTheia, injectCollabBridge };
