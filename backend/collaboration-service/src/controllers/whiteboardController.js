const whiteboardService = require('../services/whiteboardService');
const { NotFoundError } = require('../utils/errors');
const logger = require('../utils/logger');

class WhiteboardController {
  /**
   * Gets the whiteboard state
   * @param {import('express').Request} req 
   * @param {import('express').Response} res 
   * @param {import('express').NextFunction} next 
   */
  async getWhiteboard(req, res, next) {
    try {
      const { projectId } = req.params;
      const state = await whiteboardService.getWhiteboardState(projectId);
      if (!state) {
        throw new NotFoundError('Whiteboard state not found');
      }
      res.json({
        success: true,
        data: state
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Clears the whiteboard state
   * @param {import('express').Request} req 
   * @param {import('express').Response} res 
   * @param {import('express').NextFunction} next 
   */
  async clearWhiteboard(req, res, next) {
    try {
      const { projectId } = req.params;
      await whiteboardService.applyOperation(projectId, req.userId, { type: 'CLEAR', payload: {} });
      try {
        const { broadcast } = require('../websocket/websocketServer');
        broadcast(projectId, { type: 'WHITEBOARD_CLEAR', payload: { projectId, userId: req.userId } });
      } catch (wsErr) {
        // ws broadcast is optional here
      }
      res.json({
        success: true,
        message: 'Whiteboard cleared successfully'
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new WhiteboardController();
