const workspaceService = require('../services/workspaceService');
const fileSystemManager = require('../collaboration/filesystem/fileSystemManager');
const projectServiceClient = require('../integrations/projectService/projectServiceClient');
const theiaManager = require('../services/theiaManager');
const logger = require('../utils/logger');
const path = require('path');
const { WORKSPACE_ROOT_DIR } = require('../config/env');

async function getWorkspace(req, res, next) {
  try {
    const { projectId } = req.params;
    const workspace = await workspaceService.getOrCreateWorkspace(projectId);
    
    // Fetch project info to get latest githubRepoUrl if available
    let githubRepoUrl = workspace.repositoryUrl;
    try {
      const project = await projectServiceClient.getProject(projectId);
      if (project?.githubRepoUrl) {
        githubRepoUrl = project.githubRepoUrl;
      }
    } catch (_) {}

    res.json({
      success: true,
      data: {
        ...workspace.toObject(),
        githubRepoUrl: githubRepoUrl || workspace.repositoryUrl,
        repositoryUrl: githubRepoUrl || workspace.repositoryUrl
      }
    });
  } catch (error) {
    next(error);
  }
}

async function initializeWorkspace(req, res, next) {
  try {
    const { projectId } = req.params;
    const userId = req.user?.userId || 'system';
    const workspace = await workspaceService.getOrCreateWorkspace(projectId);
    if (workspace.initialized || workspace.repoCloned) {
      return res.json({ success: true, data: workspace });
    }
    const initialized = await workspaceService.initializeEmptyWorkspace(projectId, userId);
    res.json({ success: true, data: initialized });
  } catch (error) {
    next(error);
  }
}

async function cloneRepository(req, res, next) {
  try {
    const { projectId } = req.params;
    const { token, repoUrl: customUrl } = req.body || {};
    const userId = req.user?.userId || 'system';

    let repoUrl = customUrl;
    if (!repoUrl) {
      const project = await projectServiceClient.getProject(projectId);
      repoUrl = project?.githubRepoUrl;
    }

    if (!repoUrl) {
      return res.status(400).json({ 
        success: false, 
        error: { code: 'NO_REPO_URL', message: 'Project has no repository URL configured' } 
      });
    }

    const workspace = await workspaceService.cloneRepository(projectId, repoUrl, token, userId);
    const tree = await fileSystemManager.getFileTree(projectId);
    res.json({ success: true, data: { ...workspace.toObject(), tree } });
  } catch (error) {
    next(error);
  }
}

async function getFileTree(req, res, next) {
  try {
    const { projectId } = req.params;
    const tree = await fileSystemManager.getFileTree(projectId);
    res.json({ success: true, data: tree });
  } catch (error) {
    next(error);
  }
}

async function getFileContent(req, res, next) {
  try {
    const { projectId } = req.params;
    const filePath = req.query.path || req.body?.path;
    if (!filePath) {
      return res.status(400).json({ success: false, error: { message: 'File path required' } });
    }
    const content = await workspaceService.getFileContent(projectId, filePath);
    res.json({ success: true, data: { path: filePath, content } });
  } catch (error) {
    next(error);
  }
}

async function saveFileContent(req, res, next) {
  try {
    const { projectId } = req.params;
    const { path: filePath, content } = req.body || {};
    const userId = req.user?.userId || 'system';
    if (!filePath) {
      return res.status(400).json({ success: false, error: { message: 'File path required' } });
    }
    await workspaceService.saveFileContent(projectId, filePath, content ?? '', userId);
    res.json({ success: true, data: { path: filePath, saved: true } });
  } catch (error) {
    next(error);
  }
}

async function handleFileOperation(req, res, next) {
  try {
    const { projectId } = req.params;
    const userId = req.user?.userId || 'system';
    const operation = req.body;
    const result = await fileSystemManager.handleFileOperation(projectId, userId, operation);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function getMembers(req, res, next) {
  try {
    const { projectId } = req.params;
    const members = await projectServiceClient.getProjectMembers(projectId);
    res.json({ success: true, data: members });
  } catch (error) {
    next(error);
  }
}

function getWorkspaceDir(projectId) {
  const root = WORKSPACE_ROOT_DIR || path.join(process.cwd(), 'workspaces');
  return path.resolve(root, projectId);
}

async function startTheiaIDE(req, res, next) {
  try {
    const { projectId } = req.params;
    const workspace = await workspaceService.getOrCreateWorkspace(projectId);
    const workspaceDir = workspace.repoPath || workspaceService.getWorkspaceDir(projectId);
    const info = await theiaManager.startTheia(projectId, workspaceDir);
    res.json({
      success: true,
      data: {
        port: info.port,
        url: `http://localhost:${info.port}`,
        status: info.status,
        containerName: info.containerName,
      }
    });
  } catch (error) {
    next(error);
  }
}

async function getTheiaIDE(req, res, next) {
  try {
    const { projectId } = req.params;
    const info = await theiaManager.getTheia(projectId);
    if (!info) {
      return res.json({ success: true, data: { status: 'not_started' } });
    }
    res.json({
      success: true,
      data: {
        port: info.port,
        url: `http://localhost:${info.port}`,
        status: info.status,
        containerName: info.containerName,
      }
    });
  } catch (error) {
    next(error);
  }
}

async function stopTheiaIDE(req, res, next) {
  try {
    const { projectId } = req.params;
    const result = await theiaManager.stopTheia(projectId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function executeTerminalCommand(req, res, next) {
  try {
    const { projectId } = req.params;
    const { command } = req.body || {};
    if (!command || typeof command !== 'string') {
      return res.status(400).json({ success: false, error: { message: 'Command is required' } });
    }
    const result = await workspaceService.executeCommand(projectId, command.trim());
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function getTerminalToken(req, res, next) {
  try {
    const { projectId } = req.params;
    const userId = req.user?.userId || 'system';
    const terminalServer = require('../services/terminalServer');
    const token = terminalServer.createTerminalToken(userId, projectId);
    res.json({ success: true, data: { token, projectId, userId } });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getWorkspace,
  initializeWorkspace,
  cloneRepository,
  getFileTree,
  getFileContent,
  saveFileContent,
  handleFileOperation,
  getMembers,
  startTheiaIDE,
  getTheiaIDE,
  stopTheiaIDE,
  executeTerminalCommand,
  getTerminalToken
};
