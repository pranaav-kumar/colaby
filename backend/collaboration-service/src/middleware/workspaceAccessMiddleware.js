const projectServiceClient = require('../integrations/projectService/projectServiceClient');
const { AuthorizationError, ServiceUnavailableError } = require('../utils/errors');
const logger = require('../utils/logger');

/**
 * Workspace access authorization middleware
 */
async function workspaceAccessMiddleware(req, res, next) {
  const { projectId } = req.params;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const alphanumericRegex = /^[a-zA-Z0-9_-]+$/;
  
  if (!projectId || (!uuidRegex.test(projectId) && !alphanumericRegex.test(projectId))) {
    return next(new AuthorizationError('Invalid project ID format'));
  }

  try {
    const role = await projectServiceClient.getMemberRole(projectId, req.userId);
    if (!role) {
      logger.warn(`Workspace access denied: User ${req.userId} is not a member of project ${projectId}`);
      return res.status(403).json({
        success: false,
        error: { code: 'PROJECT_ACCESS_DENIED', message: 'User is not a member of this project' }
      });
    }
    req.memberRole = role;
    next();
  } catch (error) {
    if (error instanceof ServiceUnavailableError) return next(error);
    logger.error('Workspace access verification error:', error);
    return next(new AuthorizationError('Failed to verify project access'));
  }
}

module.exports = workspaceAccessMiddleware;
