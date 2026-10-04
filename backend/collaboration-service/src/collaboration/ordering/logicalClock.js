class LamportClock {
  constructor() {
    this.counter = 0;
  }

  get time() {
    return this.counter;
  }

  tick() {
    this.counter += 1;
    return this.counter;
  }

  receive(remoteTimestamp) {
    this.counter = Math.max(this.counter, remoteTimestamp || 0) + 1;
    return this.counter;
  }

  timestamp() {
    return this.counter;
  }
}

module.exports = LamportClock;
module.exports.LamportClock = LamportClock;


