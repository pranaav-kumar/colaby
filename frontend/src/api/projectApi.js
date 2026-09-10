import api from './axios';
import { extractErrorMessage } from './axios';

// ─── Error helper ────────────────────────────────────────────
// The Project Service returns { error, status, timestamp } while
// the shared extractErrorMessage() primarily checks data.message.
// This wrapper checks `data.error` first, then falls back.

export function extractProjectError(err) {
  if (err.response?.data?.error) {
    return err.response.data.error;
  }
  return extractErrorMessage(err);
}

// ─── Projects ────────────────────────────────────────────────

/**
 * POST /projects
 * Creates a new project. Creator automatically becomes a CREATOR-role member.
 * @param {{ name: string, description?: string, githubRepoUrl?: string, techStack?: string }} data
 * @returns {Promise<ProjectResponse>} 201
 */
export function createProject(data) {
  return api.post('/projects', data);
}

/**
 * GET /projects
 * Returns all projects with memberCount and isMember flag.
 * @returns {Promise<ProjectResponse[]>}
 */
export function getAllProjects() {
  return api.get('/projects');
}

/**
 * GET /projects/my
 * Returns projects where the authenticated user is a member.
 * @returns {Promise<ProjectResponse[]>}
 */
export function getMyProjects() {
  return api.get('/projects/my');
}

/**
 * GET /projects/{projectId}
 * @param {string} projectId
 * @returns {Promise<ProjectResponse>}
 */
export function getProjectById(projectId) {
  return api.get(`/projects/${projectId}`);
}

/**
 * PUT /projects/{projectId}
 * Updates a project. Only the creator can perform this action.
 * @param {string} projectId
 * @param {{ name?: string, description?: string, githubRepoUrl?: string, techStack?: string, status?: string }} data
 * @returns {Promise<ProjectResponse>}
 */
export function updateProject(projectId, data) {
  return api.put(`/projects/${projectId}`, data);
}

/**
 * DELETE /projects/{projectId}
 * Deletes a project. Only the creator can perform this action.
 * @param {string} projectId
 * @returns {Promise<void>} 204
 */
export function deleteProject(projectId) {
  return api.delete(`/projects/${projectId}`);
}

/**
 * GET /projects/{projectId}/members
 * Returns all members of a project. Only members can view.
 * @param {string} projectId
 * @returns {Promise<ProjectMember[]>}
 */
export function getProjectMembers(projectId) {
  return api.get(`/projects/${projectId}/members`);
}

// ─── Invitations ─────────────────────────────────────────────

/**
 * POST /projects/{projectId}/invitations/request
 * Non-member requests to join a project.
 * @param {string} projectId
 * @returns {Promise<ProjectInvitationResponse>} 201
 */
export function requestToJoinProject(projectId) {
  return api.post(`/projects/${projectId}/invitations/request`);
}

/**
 * POST /projects/{projectId}/invitations/invite/{targetUserId}
 * Creator invites a specific user to the project.
 * @param {string} projectId
 * @param {string} targetUserId
 * @returns {Promise<ProjectInvitationResponse>} 201
 */
export function inviteUserToProject(projectId, targetUserId) {
  return api.post(`/projects/${projectId}/invitations/invite/${targetUserId}`);
}

/**
 * GET /projects/{projectId}/invitations
 * Creator views all pending invitations for their project.
 * @param {string} projectId
 * @returns {Promise<ProjectInvitationResponse[]>}
 */
export function getProjectInvitations(projectId) {
  return api.get(`/projects/${projectId}/invitations`);
}

/**
 * GET /projects/invitations/my
 * Authenticated user views invitations sent to them (INVITE type only).
 * @returns {Promise<ProjectInvitationResponse[]>}
 */
export function getMyInvitations() {
  return api.get('/projects/invitations/my');
}

/**
 * POST /projects/invitations/{invitationId}/accept
 * Accept an invitation (invitee for INVITE; creator for JOIN_REQUEST).
 * @param {string} invitationId
 * @returns {Promise<ProjectInvitationResponse>}
 */
export function acceptInvitation(invitationId) {
  return api.post(`/projects/invitations/${invitationId}/accept`);
}

/**
 * POST /projects/invitations/{invitationId}/decline
 * Decline an invitation (invitee for INVITE; creator for JOIN_REQUEST).
 * @param {string} invitationId
 * @returns {Promise<ProjectInvitationResponse>}
 */
export function declineInvitation(invitationId) {
  return api.post(`/projects/invitations/${invitationId}/decline`);
}

// ─── Tasks ───────────────────────────────────────────────────

/**
 * POST /projects/{projectId}/tasks
 * Creator assigns a task to a project member.
 * @param {string} projectId
 * @param {{ assignedTo: string, title: string, description?: string }} data
 * @returns {Promise<TaskResponse>} 201
 */
export function assignTask(projectId, data) {
  return api.post(`/projects/${projectId}/tasks`, data);
}

/**
 * GET /projects/{projectId}/tasks
 * Get all tasks for a project. Members only.
 * @param {string} projectId
 * @returns {Promise<TaskResponse[]>}
 */
export function getAllTasks(projectId) {
  return api.get(`/projects/${projectId}/tasks`);
}

/**
 * GET /projects/{projectId}/tasks/my
 * Get only the tasks assigned to the authenticated user.
 * @param {string} projectId
 * @returns {Promise<TaskResponse[]>}
 */
export function getMyTasks(projectId) {
  return api.get(`/projects/${projectId}/tasks/my`);
}

/**
 * PATCH /projects/{projectId}/tasks/{taskId}/progress
 * Assignee updates their task's progress.
 * @param {string} projectId
 * @param {string} taskId
 * @param {{ progressPercent: number, progressNote?: string }} data
 * @returns {Promise<TaskResponse>}
 */
export function updateTaskProgress(projectId, taskId, data) {
  return api.patch(`/projects/${projectId}/tasks/${taskId}/progress`, data);
}

/**
 * DELETE /projects/{projectId}/tasks/{taskId}
 * Creator removes a task from the project.
 * @param {string} projectId
 * @param {string} taskId
 * @returns {Promise<void>} 204
 */
export function deleteTask(projectId, taskId) {
  return api.delete(`/projects/${projectId}/tasks/${taskId}`);
}

// ─── Documentation ───────────────────────────────────────────

/**
 * PUT /projects/{projectId}/docs
 * Creator creates or fully replaces the project documentation.
 * @param {string} projectId
 * @param {{ content: string }} data
 * @returns {Promise<DocResponse>}
 */
export function upsertDoc(projectId, data) {
  return api.put(`/projects/${projectId}/docs`, data);
}

/**
 * GET /projects/{projectId}/docs
 * Any project member reads the documentation.
 * @param {string} projectId
 * @returns {Promise<DocResponse>}
 */
export function getDoc(projectId) {
  return api.get(`/projects/${projectId}/docs`);
}
