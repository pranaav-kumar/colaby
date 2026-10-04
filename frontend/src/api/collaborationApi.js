import api from './axios';
import { collabDirect } from './axios';

const COLLAB_PREFIX = '/collaboration/api/workspaces';
const DIRECT_PREFIX = '/api/workspaces'; // direct to port 8090, no gateway prefix

export const getWorkspace = (projectId) => api.get(`${COLLAB_PREFIX}/${projectId}`);
export const initializeWorkspace = (projectId) => api.post(`${COLLAB_PREFIX}/${projectId}/initialize`);
export const initializeEmptyWorkspace = (projectId) => api.post(`${COLLAB_PREFIX}/${projectId}/initialize/empty`);
// Cloning can take longer than the gateway's response timeout. Call the
// collaboration service directly and allow enough time for larger repos.
export const cloneRepository = (projectId, token, repoUrl) =>
  collabDirect.post(`${DIRECT_PREFIX}/${projectId}/clone`, { token, repoUrl }, { timeout: 10 * 60 * 1000 });
export const getFileTree = (projectId) => api.get(`${COLLAB_PREFIX}/${projectId}/tree`);
export const getFileContent = (projectId, path) => api.get(`${COLLAB_PREFIX}/${projectId}/file`, { params: { path } });
export const saveFileContent = (projectId, path, content) => api.post(`${COLLAB_PREFIX}/${projectId}/file`, { path, content });
export const performFileOperation = (projectId, operation) => api.post(`${COLLAB_PREFIX}/${projectId}/files/operation`, operation);
export const getChatHistory = (projectId, params) => api.get(`${COLLAB_PREFIX}/${projectId}/chat`, { params });
export const getWhiteboardState = (projectId) => api.get(`${COLLAB_PREFIX}/${projectId}/whiteboard`);
export const clearWhiteboardState = (projectId) => api.delete(`${COLLAB_PREFIX}/${projectId}/whiteboard`);
export const getWorkspaceMembers = (projectId) => api.get(`${COLLAB_PREFIX}/${projectId}/members`);

// Eclipse Theia IDE container management with automatic Gateway -> Direct fallback
export const startTheiaIDE = async (projectId) => {
  try {
    return await api.post(`${COLLAB_PREFIX}/${projectId}/theia/start`);
  } catch (err) {
    if (!err.response || err.response.status === 401 || err.response.status >= 500) {
      return await collabDirect.post(`${DIRECT_PREFIX}/${projectId}/theia/start`);
    }
    throw err;
  }
};

export const getTheiaIDE = async (projectId) => {
  try {
    return await api.get(`${COLLAB_PREFIX}/${projectId}/theia`);
  } catch (err) {
    if (!err.response || err.response.status === 401 || err.response.status >= 500) {
      return await collabDirect.get(`${DIRECT_PREFIX}/${projectId}/theia`);
    }
    throw err;
  }
};

export const stopTheiaIDE = async (projectId) => {
  try {
    return await api.post(`${COLLAB_PREFIX}/${projectId}/theia/stop`);
  } catch (err) {
    if (!err.response || err.response.status === 401 || err.response.status >= 500) {
      return await collabDirect.post(`${DIRECT_PREFIX}/${projectId}/theia/stop`);
    }
    throw err;
  }
};

// Terminal command execution — calls collaboration-service DIRECTLY (bypass API Gateway)
export const executeTerminalCommand = (projectId, command) =>
  collabDirect.post(`${DIRECT_PREFIX}/${projectId}/terminal/exec`, { command });

// Windows PTY terminal — fetch a short-lived WebSocket session token
export const getTerminalToken = async (projectId) => {
  try {
    return await api.get(`${COLLAB_PREFIX}/${projectId}/terminal-token`);
  } catch (err) {
    if (!err.response || err.response.status === 401 || err.response.status >= 500) {
      return await collabDirect.get(`${DIRECT_PREFIX}/${projectId}/terminal-token`);
    }
    throw err;
  }
};
