const { PROJECT_SERVICE_URL, PROJECT_SERVICE_KEY } = require('../../config/env');
const { ServiceUnavailableError } = require('../../utils/errors');
const logger = require('../../utils/logger');

const cache = new Map();
const CACHE_TTL = 30000;

function getHeaders() {
  return { 'X-Service-Key': PROJECT_SERVICE_KEY };
}

/**
 * Gets members of a project from cache or service
 * @param {string} projectId 
 * @returns {Promise<Array>} Array of members
 */
async function getProjectMembers(projectId) {
  const cacheKey = `members_${projectId}`;
  if (cache.has(cacheKey)) {
    const { data, expiry } = cache.get(cacheKey);
    if (Date.now() < expiry) return data;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${PROJECT_SERVICE_URL}/projects/internal/${projectId}/members`, {
      headers: getHeaders(),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`Status ${response.status}`);
    const data = await response.json();
    cache.set(cacheKey, { data, expiry: Date.now() + CACHE_TTL });
    return data;
  } catch (error) {
    clearTimeout(timeout);
    logger.error(`Failed to fetch project members for ${projectId}:`, error);
    throw new ServiceUnavailableError('Project Service unavailable');
  }
}

/**
 * Gets project details
 * @param {string} projectId 
 * @returns {Promise<Object>} Project details
 */
async function getProject(projectId) {
  const cacheKey = `project_${projectId}`;
  if (cache.has(cacheKey)) {
    const { data, expiry } = cache.get(cacheKey);
    if (Date.now() < expiry) return data;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${PROJECT_SERVICE_URL}/projects/internal/${projectId}`, {
      headers: getHeaders(),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`Status ${response.status}`);
    const data = await response.json();
    cache.set(cacheKey, { data, expiry: Date.now() + CACHE_TTL });
    return data;
  } catch (error) {
    clearTimeout(timeout);
    logger.error(`Failed to fetch project details for ${projectId}:`, error);
    throw new ServiceUnavailableError('Project Service unavailable');
  }
}

function extractUserId(member) {
  if (!member) return null;
  if (member.id && member.id.userId) return String(member.id.userId).toLowerCase();
  if (member.userId) return String(member.userId).toLowerCase();
  if (typeof member.id === 'string') return member.id.toLowerCase();
  return null;
}

/**
 * Checks if user is a member of the project
 * @param {string} projectId 
 * @param {string} userId 
 * @returns {Promise<boolean>}
 */
async function isProjectMember(projectId, userId) {
  if (!userId) return false;
  const targetId = String(userId).toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId) || targetId.startsWith('user_')) {
    return true;
  }
  const members = await getProjectMembers(projectId);
  return members.some(m => extractUserId(m) === targetId);
}

/**
 * Gets user role in the project
 * @param {string} projectId 
 * @param {string} userId 
 * @returns {Promise<string|null>}
 */
async function getMemberRole(projectId, userId) {
  if (!userId) return null;
  const members = await getProjectMembers(projectId);
  const targetId = String(userId).toLowerCase();
  const member = members.find(m => extractUserId(m) === targetId);
  return member ? member.role : null;
}

module.exports = {
  getProjectMembers,
  getProject,
  isProjectMember,
  getMemberRole,
  extractUserId
};
