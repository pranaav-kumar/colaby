const path = require('path');
const fs = require('fs');
const util = require('util');
const { execFile, exec } = require('child_process');
const execFileAsync = util.promisify(execFile);
const execAsync = util.promisify(exec);

const Workspace = require('../models/Workspace');
const CodeDocument = require('../models/CodeDocument');
const FileOperation = require('../models/FileOperation');
const { WORKSPACE_ROOT_DIR } = require('../config/env');
const fileSystemManager = require('../collaboration/filesystem/fileSystemManager');
const codeSessionManager = require('../collaboration/code/codeSessionManager');
const logger = require('../utils/logger');
const { ConflictError, ValidationError, NotFoundError } = require('../utils/errors');
const { sanitizePath } = require('../utils/pathSecurity');



/**
 * Gets or creates a workspace for a project
 */
async function getOrCreateWorkspace(projectId) {
  let workspace = await Workspace.findOne({ projectId });
  if (!workspace) {
    workspace = await Workspace.create({
      projectId,
      initialized: false,
      repoCloned: false,
      sourceType: 'SCRATCH',
      repoPath: getWorkspaceDir(projectId)
    });
  }
  return workspace;
}

/**
 * Gets local directory path for workspace
 */
function getWorkspaceDir(projectId) {
  const root = WORKSPACE_ROOT_DIR || path.join(process.cwd(), 'workspaces');
  return path.resolve(root, projectId);
}

function removePathRecursively(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  const stat = fs.lstatSync(targetPath);
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    try { fs.chmodSync(targetPath, 0o777); } catch (_) {}
    for (const entry of fs.readdirSync(targetPath)) {
      removePathRecursively(path.join(targetPath, entry));
    }
    fs.rmdirSync(targetPath);
    return;
  }

  if (!stat.isSymbolicLink()) {
    try { fs.chmodSync(targetPath, 0o666); } catch (_) {}
  }
  fs.unlinkSync(targetPath);
}

/**
 * Normalizes and validates a Git repository URL
 */
function normalizeGitUrl(url) {
  if (!url || typeof url !== 'string') return null;
  let trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed || trimmed.startsWith('-')) return null;
  if (!/^https?:\/\/|^git@/i.test(trimmed)) {
    trimmed = 'https://' + trimmed;
  }
  return trimmed;
}

function validateGitUrl(url) {
  const normalized = normalizeGitUrl(url);
  if (!normalized) return false;
  const gitUrlRegex = /^(https?:\/\/|git@)([a-zA-Z0-9_\-\.]+)(:[0-9]+)?(\/|:)([a-zA-Z0-9_\-\.\/]+)(\.git)?$/i;
  return gitUrlRegex.test(normalized);
}

/**
 * Initializes an empty/scratch workspace (Mode B)
 */
async function initializeEmptyWorkspace(projectId, userId = 'system') {
  const workspace = await getOrCreateWorkspace(projectId);
  const targetDir = path.resolve(workspace.repoPath || getWorkspaceDir(projectId));
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });

  fs.mkdirSync(targetDir, { recursive: true });

  // Preserve files if the workspace metadata was lost or reset. Only seed the
  // default files when both disk and the recovered CRDT tree are empty.
  const tree = await fileSystemManager.getOrCreateTree(projectId);

  const hasUserFiles = fs.readdirSync(targetDir).some((name) => name !== '.theia');
  const hasTreeNodes = tree.nodes && tree.nodes.size > 1;
  if (!hasUserFiles && !hasTreeNodes) {
    const starterFiles = [
      {
        name: 'README.md',
        content: `# ${projectId}\n\nCollaborative project workspace created with Colaby.\n\n- Create, edit, and organize files in real-time.\n- Changes sync across all project members.\n`
      },
      {
        name: 'index.js',
        content: `// Colaby Collaborative Workspace\nconsole.log('Hello from Colaby IDE!');\n\nfunction main() {\n  console.log('Real-time pair programming ready.');\n}\n\nmain();\n`
      }
    ];

    for (const file of starterFiles) {
      try {
        await fileSystemManager.handleFileOperation(projectId, userId, {
          type: 'FILE_CREATE',
          payload: { name: file.name, parentId: 'root', type: 'file' }
        });
        await saveFileContent(projectId, `/${file.name}`, file.content, userId);
      } catch (err) {
        logger.warn(`Could not create starter ${file.name}:`, err.message);
      }
    }
  }

  workspace.initialized = true;
  workspace.sourceType = 'SCRATCH';
  workspace.repoPath = targetDir;
  await workspace.save();

  return workspace;
}

/**
 * Clones repository into workspace directory (Mode A)
 */
async function cloneRepository(projectId, rawRepoUrl, token = null, userId = 'system') {
  const workspace = await getOrCreateWorkspace(projectId);

  const repoUrl = normalizeGitUrl(rawRepoUrl);
  if (!repoUrl || !validateGitUrl(repoUrl)) {
    throw new ValidationError('Invalid Git repository URL. Please enter a valid URL (e.g. https://github.com/owner/repository).');
  }

  const targetDir = path.resolve(workspace.repoPath || getWorkspaceDir(projectId));
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  
  // Keep the workspace root itself in place: Theia bind-mounts this directory
  // when its container starts. Removing and recreating it leaves Docker
  // attached to the old directory, so subsequent files appear to vanish.
  const stagingDir = fs.mkdtempSync(path.join(path.dirname(targetDir), `${path.basename(targetDir)}-clone-`));

  let cloneUrl = repoUrl.trim();
  if (token && token.trim()) {
    cloneUrl = cloneUrl.replace('https://', `https://${encodeURIComponent(token.trim())}@`);
  }
  
  try {
    logger.info(`Cloning repo ${repoUrl} for project ${projectId} into ${stagingDir}`);
    await execFileAsync('git', ['clone', '--depth', '1', cloneUrl, stagingDir]);

    // Flush and discard stale in-memory documents before replacing the files.
    // Otherwise the next editor open can load text from the pre-clone session.
    await codeSessionManager.cleanup(projectId);

    // Replace the files only after a successful clone, preserving the mounted
    // workspace directory itself and therefore the live Theia bind mount.
    fs.mkdirSync(targetDir, { recursive: true });
    for (const entry of fs.readdirSync(targetDir)) {
      removePathRecursively(path.join(targetDir, entry));
    }
    for (const entry of fs.readdirSync(stagingDir)) {
      fs.renameSync(path.join(stagingDir, entry), path.join(targetDir, entry));
    }
    removePathRecursively(stagingDir);

    fileSystemManager.cleanup(projectId);
    try {
      await FileOperation.deleteMany({ projectId });
      await CodeDocument.deleteMany({ projectId });
    } catch (_) {}
    
    // Populate Tree-CRDT recursively from cloned directory
    await fileSystemManager.loadFromDisk(projectId, targetDir, userId);

    workspace.initialized = true;
    workspace.repoCloned = true;
    workspace.sourceType = 'GITHUB';
    workspace.repositoryUrl = repoUrl;
    workspace.repoPath = targetDir;
    await workspace.save();
    return workspace;
  } catch (error) {
    try { removePathRecursively(stagingDir); } catch (_) {}
    logger.error('Failed to clone repository:', error.message);
    throw new Error(`Failed to clone repository: ${error.message}`);
  }
}

/**
 * Gets file content by path
 */
async function getFileContent(projectId, filePath) {
  // First check in-memory code session
  try {
    const session = await codeSessionManager.getOrCreateSession(projectId, filePath);
    if (session) {
      const content = session.getContent();
      if (content) return content;
    }
  } catch (_) {}

  // Next check MongoDB CodeDocument
  const doc = await CodeDocument.findOne({ projectId, filePath });
  if (doc && doc.content !== undefined) {
    return doc.content;
  }

  // Next check physical file on disk
  const workspace = await getOrCreateWorkspace(projectId);
  if (workspace.repoPath) {
    const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    const diskPath = path.join(workspace.repoPath, cleanPath);
    if (fs.existsSync(diskPath) && fs.statSync(diskPath).isFile()) {
      return fs.readFileSync(diskPath, 'utf8');
    }
  }

  return '';
}

// Debounce timers map for background disk & DB writes
const saveDebounceTimers = new Map();

/**
 * Debounced save of file content to in-memory session immediately and DB/disk after delay
 */
function saveFileContentDebounced(projectId, filePath, content, userId = 'system', delayMs = 1500) {
  const key = `${projectId}:${filePath}`;

  // 1. Immediately update in-memory session
  codeSessionManager.getOrCreateSession(projectId, filePath).then(session => {
    if (session) {
      session.loadContent(content);
      session.dirty = true;
    }
  }).catch(() => {});

  // 2. Debounce DB & disk writes
  if (saveDebounceTimers.has(key)) {
    clearTimeout(saveDebounceTimers.get(key));
  }

  const timer = setTimeout(async () => {
    saveDebounceTimers.delete(key);
    try {
      await saveFileContent(projectId, filePath, content, userId);
    } catch (err) {
      logger.warn(`Debounced file save failed for ${key}:`, err.message);
    }
  }, delayMs);

  saveDebounceTimers.set(key, timer);
}

/**
 * Saves file content
 */
async function saveFileContent(projectId, filePath, content, userId = 'system') {
  const key = `${projectId}:${filePath}`;
  if (saveDebounceTimers.has(key)) {
    clearTimeout(saveDebounceTimers.get(key));
    saveDebounceTimers.delete(key);
  }

  // 1. Update in-memory session
  try {
    const session = await codeSessionManager.getOrCreateSession(projectId, filePath);
    if (session) {
      session.loadContent(content);
      session.dirty = false;
    }
  } catch (_) {}

  // 2. Update MongoDB CodeDocument
  await CodeDocument.findOneAndUpdate(
    { projectId, filePath },
    {
      content,
      lastEditedBy: userId,
      updatedAt: new Date()
    },
    { upsert: true, new: true }
  );

  // 3. Write to disk if workspace exists
  try {
    const workspace = await getOrCreateWorkspace(projectId);
    if (workspace.repoPath) {
      const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
      const diskPath = path.join(workspace.repoPath, cleanPath);
      const dir = path.dirname(diskPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      logger.info(`[COLABY_FS_WRITE]`, {
        timestamp: new Date().toISOString(),
        workspaceId: projectId,
        filePath,
        caller: 'workspaceService.saveFileContent',
        origin: 'EXPLICIT_SAVE',
        contentLength: content ? content.length : 0
      });
      fs.writeFileSync(diskPath, content, 'utf8');
    }
  } catch (err) {
    logger.warn(`Could not sync file save to disk for ${filePath}:`, err.message);
  }

  return { success: true, filePath };
}

async function executeCommand(projectId, command) {
  const workspaceDir = getWorkspaceDir(projectId);
  if (!fs.existsSync(workspaceDir)) {
    fs.mkdirSync(workspaceDir, { recursive: true });
  }

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: workspaceDir,
      timeout: 30000,
      maxBuffer: 1024 * 1024 * 2
    });
    return { stdout: stdout || '', stderr: stderr || '', exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || err.message,
      exitCode: err.code || 1
    };
  }
}

module.exports = {
  getOrCreateWorkspace,
  getWorkspaceDir,
  initializeEmptyWorkspace,
  cloneRepository,
  getFileContent,
  saveFileContent,
  saveFileContentDebounced,
  executeCommand
};
