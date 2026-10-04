class WebSocketRateLimiter {
  constructor() {
    this.requests = new Map();
    this.limits = {
      cursor: { limit: 20, window: 1000 },
      chat: { limit: 2, window: 1000 },
      whiteboard: { limit: 30, window: 1000 },
      code: { limit: 50, window: 1000 },
      voice: { limit: 10, window: 1000 },
      default: { limit: 10, window: 1000 }
    };
  }

  isAllowed(connectionId, category) {
    const config = this.limits[category] || this.limits.default;
    const now = Date.now();

    if (!this.requests.has(connectionId)) {
      this.requests.set(connectionId, new Map());
    }
    const connRequests = this.requests.get(connectionId);
    
    if (!connRequests.has(category)) {
      connRequests.set(category, []);
    }
    const timestamps = connRequests.get(category);

    while (timestamps.length > 0 && timestamps[0] <= now - config.window) {
      timestamps.shift();
    }

    if (timestamps.length >= config.limit) return false;
    
    timestamps.push(now);
    return true;
  }
}

module.exports = new WebSocketRateLimiter();
