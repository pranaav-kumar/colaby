class HybridLogicalClock {
  constructor(nodeId) {
    this.wallTime = Date.now();
    this.counter = 0;
    this.nodeId = nodeId;
  }

  now() {
    const currentTime = Date.now();
    if (currentTime > this.wallTime) {
      this.wallTime = currentTime;
      this.counter = 0;
    } else {
      this.counter += 1;
    }
    return this.toString();
  }

  receive(remote) {
    const [remoteWallTimeStr, remoteCounterStr, remoteNodeId] = remote.split(':');
    const remoteWallTime = parseInt(remoteWallTimeStr, 10);
    const remoteCounter = parseInt(remoteCounterStr, 10);
    const currentTime = Date.now();

    if (currentTime > this.wallTime && currentTime > remoteWallTime) {
      this.wallTime = currentTime;
      this.counter = 0;
    } else if (this.wallTime === remoteWallTime) {
      this.counter = Math.max(this.counter, remoteCounter) + 1;
    } else if (this.wallTime > remoteWallTime) {
      this.counter += 1;
    } else {
      this.wallTime = remoteWallTime;
      this.counter = remoteCounter + 1;
    }
  }

  compare(a, b) {
    if (a === b) return 0;
    const [aTime, aCount, aNode] = a.split(':');
    const [bTime, bCount, bNode] = b.split(':');
    
    if (aTime !== bTime) return parseInt(aTime, 10) - parseInt(bTime, 10);
    if (aCount !== bCount) return parseInt(aCount, 10) - parseInt(bCount, 10);
    return aNode.localeCompare(bNode);
  }

  toString() {
    return `${this.wallTime}:${this.counter}:${this.nodeId}`;
  }
}

module.exports = HybridLogicalClock;
module.exports.HybridLogicalClock = HybridLogicalClock;

