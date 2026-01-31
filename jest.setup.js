// Mock ioredis with ioredis-mock for tests
jest.mock('ioredis', () => require('ioredis-mock'));
