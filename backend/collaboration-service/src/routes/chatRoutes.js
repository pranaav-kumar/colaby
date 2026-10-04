const express = require('express');
const chatController = require('../controllers/chatController');
const authMiddleware = require('../middleware/authMiddleware');
const workspaceAccessMiddleware = require('../middleware/workspaceAccessMiddleware');
const { chatLimiter } = require('../middleware/rateLimitMiddleware');

const router = express.Router({ mergeParams: true });

router.use(authMiddleware, workspaceAccessMiddleware);

router.get('/', chatLimiter, chatController.getChatHistory);
router.post('/', chatLimiter, chatController.sendChatMessage);

module.exports = router;
