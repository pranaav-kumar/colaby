const chatService = require('../services/chatService');

async function getChatHistory(req, res, next) {
  try {
    const { projectId } = req.params;
    const { before, limit } = req.query;
    const history = await chatService.getHistory(projectId, { before, limit });
    res.json({ success: true, data: history });
  } catch (error) {
    next(error);
  }
}

async function sendChatMessage(req, res, next) {
  try {
    const { projectId } = req.params;
    const { content } = req.body;
    const message = await chatService.sendMessage(projectId, req.userId, content);

    // Broadcast to WebSocket clients in the workspace
    try {
      const websocketServer = require('../websocket/websocketServer');
      websocketServer.broadcast(projectId, {
        type: 'CHAT_MESSAGE',
        payload: {
          messageId: message.messageId,
          projectId: message.projectId,
          senderId: message.senderId,
          userId: message.senderId,
          content: message.content,
          createdAt: message.createdAt
        }
      });
    } catch (wsErr) {
      // Non-critical if ws broadcast fails
    }

    res.json({ success: true, data: message });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getChatHistory,
  sendChatMessage
};
