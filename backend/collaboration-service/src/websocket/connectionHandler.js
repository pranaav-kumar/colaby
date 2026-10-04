const EVENT_TYPES = require('./eventTypes');

const connections = new WeakMap();

function initConnection(ws, userId, projectId) {
  const state = {
    userId,
    projectId,
    connectedAt: Date.now(),
    lastHeartbeat: Date.now(),
    lastEventId: null
  };
  connections.set(ws, state);

  const pingInterval = setInterval(() => {
    const currentState = connections.get(ws);
    if (!currentState) {
      clearInterval(pingInterval);
      return;
    }
    
    if (Date.now() - currentState.lastHeartbeat > 40000) {
      clearInterval(pingInterval);
      ws.terminate();
      return;
    }
    
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: EVENT_TYPES.HEARTBEAT }));
    }
  }, 30000);

  state.pingInterval = pingInterval;
}

function updateHeartbeat(ws) {
  const state = connections.get(ws);
  if (state) state.lastHeartbeat = Date.now();
}

function cleanup(ws) {
  const state = connections.get(ws);
  if (state && state.pingInterval) clearInterval(state.pingInterval);
  connections.delete(ws);
}

module.exports = {
  initConnection,
  updateHeartbeat,
  cleanup
};
