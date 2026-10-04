const express = require('express');
const workspaceController = require('../controllers/workspaceController');
const authMiddleware = require('../middleware/authMiddleware');
const workspaceAccessMiddleware = require('../middleware/workspaceAccessMiddleware');

const router = express.Router();

router.use('/:projectId', authMiddleware, workspaceAccessMiddleware);

router.get('/:projectId', workspaceController.getWorkspace);
router.post('/:projectId/initialize', workspaceController.initializeWorkspace);
router.post('/:projectId/initialize/empty', workspaceController.initializeWorkspace);
router.post('/:projectId/initialize/clone', workspaceController.cloneRepository);
router.post('/:projectId/clone', workspaceController.cloneRepository);
router.get('/:projectId/tree', workspaceController.getFileTree);
router.get('/:projectId/file', workspaceController.getFileContent);
router.post('/:projectId/file', workspaceController.saveFileContent);
router.post('/:projectId/files/operation', workspaceController.handleFileOperation);
router.get('/:projectId/members', workspaceController.getMembers);

// Eclipse Theia IDE container management
router.post('/:projectId/theia/start', workspaceController.startTheiaIDE);
router.get('/:projectId/theia', workspaceController.getTheiaIDE);
router.post('/:projectId/theia/stop', workspaceController.stopTheiaIDE);

// Terminal command execution
router.post('/:projectId/terminal/exec', workspaceController.executeTerminalCommand);

// Windows PTY terminal — issue a session-scoped WebSocket token
router.get('/:projectId/terminal-token', workspaceController.getTerminalToken);

module.exports = router;

