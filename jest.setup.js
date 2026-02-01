// Mock ioredis with ioredis-mock for tests
const RedisMock = require('ioredis-mock');

// Create a custom Redis mock that is immediately ready
class CustomRedisMock extends RedisMock {
  constructor(...args) {
    super(...args);
    // Set status to ready immediately
    this.status = 'ready';
    // Emit ready event synchronously for tests
    process.nextTick(() => {
      this.emit('ready');
    });
  }
}

jest.mock('ioredis', () => CustomRedisMock);
