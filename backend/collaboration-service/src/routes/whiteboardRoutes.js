const express = require('express');
const whiteboardController = require('../controllers/whiteboardController');
const authMiddleware = require('../middleware/authMiddleware');
const workspaceAccessMiddleware = require('../middleware/workspaceAccessMiddleware');

const router = express.Router({ mergeParams: true });

// Mounted at /api/workspaces/:projectId/whiteboard
router.use(authMiddleware);
router.use(workspaceAccessMiddleware);

router.get('/', whiteboardController.getWhiteboard.bind(whiteboardController));
router.delete('/', whiteboardController.clearWhiteboard.bind(whiteboardController));

module.exports = router;
