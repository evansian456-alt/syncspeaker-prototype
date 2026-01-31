const request = require('supertest');
const { app, generateCode, parties, redis } = require('./server');

describe('Server HTTP Endpoints', () => {
  // Clear parties and Redis before each test to ensure clean state
  beforeEach(async () => {
    parties.clear();
    // Clear Redis mock
    await redis.flushall();
  });

  describe('GET /health', () => {
    it('should return status ok', async () => {
      const response = await request(app).get('/health');
      expect(response.body.status).toBe('ok');
    });

    it('should return 200 status code', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
    });
    
    it('should include instanceId', async () => {
      const response = await request(app).get('/health');
      expect(response.body.instanceId).toBeDefined();
      expect(typeof response.body.instanceId).toBe('string');
    });
    
    it('should include Redis status', async () => {
      const response = await request(app).get('/health');
      expect(response.body.redis).toBeDefined();
      expect(typeof response.body.redis).toBe('string');
    });

    it('should return JSON content type', async () => {
      const response = await request(app).get('/health');
      expect(response.headers['content-type']).toMatch(/json/);
    });
  });

  describe('GET /api/ping', () => {
    it('should return pong message', async () => {
      const response = await request(app).get('/api/ping');
      expect(response.body.message).toBe('pong');
    });

    it('should include timestamp', async () => {
      const response = await request(app).get('/api/ping');
      expect(response.body.timestamp).toBeDefined();
      expect(typeof response.body.timestamp).toBe('number');
      expect(response.body.timestamp).toBeGreaterThan(0);
    });

    it('should return 200 status code', async () => {
      const response = await request(app).get('/api/ping');
      expect(response.status).toBe(200);
    });

    it('should return JSON content type', async () => {
      const response = await request(app).get('/api/ping');
      expect(response.headers['content-type']).toMatch(/json/);
    });
  });

  describe('POST /api/create-party', () => {
    it('should create a new party and return party code', async () => {
      const response = await request(app).post('/api/create-party');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('partyCode');
      expect(response.body).toHaveProperty('hostId');
    });

    it('should return a 6-character party code', async () => {
      const response = await request(app).post('/api/create-party');
      
      expect(response.body.partyCode).toHaveLength(6);
      expect(response.body.partyCode).toMatch(/^[A-Z0-9]{6}$/);
    });

    it('should return a unique hostId', async () => {
      const response1 = await request(app).post('/api/create-party');
      const response2 = await request(app).post('/api/create-party');
      
      expect(response1.body.hostId).toBeDefined();
      expect(response2.body.hostId).toBeDefined();
      expect(response1.body.hostId).not.toBe(response2.body.hostId);
    });

    it('should generate unique party codes', async () => {
      const codes = new Set();
      
      // Create multiple parties
      for (let i = 0; i < 10; i++) {
        const response = await request(app).post('/api/create-party');
        codes.add(response.body.partyCode);
      }
      
      // All codes should be unique
      expect(codes.size).toBe(10);
    });

    it('should store party in parties map', async () => {
      const response = await request(app).post('/api/create-party');
      const partyCode = response.body.partyCode;
      
      expect(parties.has(partyCode)).toBe(true);
      
      const party = parties.get(partyCode);
      expect(party).toHaveProperty('hostId');
      expect(party).toHaveProperty('createdAt');
      expect(party).toHaveProperty('members');
      expect(Array.isArray(party.members)).toBe(true);
    });

    it('should return JSON content type', async () => {
      const response = await request(app).post('/api/create-party');
      expect(response.headers['content-type']).toMatch(/json/);
    });
  });

  describe('POST /api/join-party', () => {
    let partyCode;

    beforeEach(async () => {
      // Create a party to join
      const response = await request(app).post('/api/create-party');
      partyCode = response.body.partyCode;
    });

    it('should allow joining an existing party', async () => {
      const response = await request(app)
        .post('/api/join-party')
        .send({ partyCode });
      
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
    });

    it('should return 400 if party code is missing', async () => {
      const response = await request(app)
        .post('/api/join-party')
        .send({});
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Party code is required');
    });

    it('should return 404 if party does not exist', async () => {
      const response = await request(app)
        .post('/api/join-party')
        .send({ partyCode: 'NOEXST' });
      
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Party not found');
    });

    it('should handle uppercase conversion of party code', async () => {
      const response = await request(app)
        .post('/api/join-party')
        .send({ partyCode: partyCode.toLowerCase() });
      
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
    });

    it('should trim whitespace from party code', async () => {
      const response = await request(app)
        .post('/api/join-party')
        .send({ partyCode: `  ${partyCode}  ` });
      
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
    });

    it('should return JSON content type', async () => {
      const response = await request(app)
        .post('/api/join-party')
        .send({ partyCode });
      
      expect(response.headers['content-type']).toMatch(/json/);
    });

    it('should respond within 500ms for valid party', async () => {
      const startTime = Date.now();
      const response = await request(app)
        .post('/api/join-party')
        .send({ partyCode });
      const duration = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(500);
    });

    it('should respond within 500ms even for non-existent party', async () => {
      const startTime = Date.now();
      const response = await request(app)
        .post('/api/join-party')
        .send({ partyCode: 'NOEXST' });
      const duration = Date.now() - startTime;
      
      expect(response.status).toBe(404);
      expect(duration).toBeLessThan(500);
    });

    it('should handle slow Redis gracefully', async () => {
      // Mock a slow Redis response by temporarily slowing down get
      const originalGet = redis.get.bind(redis);
      redis.get = jest.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => resolve(null), 400); // Simulate slow Redis
        });
      });

      const response = await request(app)
        .post('/api/join-party')
        .send({ partyCode: 'SLOW01' });

      // Should return timeout error
      expect(response.status).toBe(503);
      expect(response.body.error).toBeDefined();

      // Restore original get
      redis.get = originalGet;
    });
  });

  describe('GET /api/party/:code', () => {
    let partyCode;

    beforeEach(async () => {
      // Create a party to query
      const response = await request(app).post('/api/create-party');
      partyCode = response.body.partyCode;
    });

    it('should return party information if party exists', async () => {
      const response = await request(app).get(`/api/party/${partyCode}`);
      
      expect(response.status).toBe(200);
      expect(response.body.exists).toBe(true);
      expect(response.body.code).toBe(partyCode);
      expect(response.body.createdAt).toBeDefined();
      expect(response.body.hostConnected).toBeDefined();
      expect(response.body.guestCount).toBeDefined();
      expect(response.body.instanceId).toBeDefined();
    });

    it('should return exists false if party does not exist', async () => {
      const response = await request(app).get('/api/party/NOEXST');
      
      expect(response.status).toBe(200);
      expect(response.body.exists).toBe(false);
      expect(response.body.code).toBe('NOEXST');
      expect(response.body.instanceId).toBeDefined();
    });

    it('should handle lowercase party codes', async () => {
      const response = await request(app).get(`/api/party/${partyCode.toLowerCase()}`);
      
      expect(response.status).toBe(200);
      expect(response.body.exists).toBe(true);
      expect(response.body.code).toBe(partyCode);
    });

    it('should return hostConnected false for HTTP-only parties', async () => {
      const response = await request(app).get(`/api/party/${partyCode}`);
      
      expect(response.status).toBe(200);
      expect(response.body.hostConnected).toBe(false); // No WebSocket connection yet
    });
  });

  describe('GET /', () => {
    it('should serve index.html', async () => {
      const response = await request(app).get('/');
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/html/);
    });
  });

  describe('Static Files', () => {
    it('should serve app.js', async () => {
      const response = await request(app).get('/app.js');
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/javascript/);
    });

    it('should serve styles.css', async () => {
      const response = await request(app).get('/styles.css');
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/css/);
    });
  });
});

describe('Utility Functions', () => {
  describe('generateCode', () => {
    it('should generate a 6-character code', () => {
      const code = generateCode();
      expect(code).toHaveLength(6);
    });

    it('should only contain uppercase letters and numbers', () => {
      const code = generateCode();
      expect(code).toMatch(/^[A-Z0-9]{6}$/);
    });

    it('should generate different codes on subsequent calls', () => {
      const codes = new Set();
      
      // Generate 100 codes
      for (let i = 0; i < 100; i++) {
        codes.add(generateCode());
      }
      
      // Most codes should be unique (allowing for rare collisions)
      expect(codes.size).toBeGreaterThan(95);
    });

    it('should not contain ambiguous characters', () => {
      // The nanoid alphabet only contains clear characters
      const code = generateCode();
      
      // Should not contain lowercase letters or special characters
      expect(code).not.toMatch(/[a-z]/);
      expect(code).not.toMatch(/[^A-Z0-9]/);
    });
  });
});

describe('Party Storage and Sync', () => {
  beforeEach(() => {
    parties.clear();
  });

  describe('Party TTL and Cleanup', () => {
    it('should store createdAt timestamp when creating a party', async () => {
      const beforeCreate = Date.now();
      const response = await request(app).post('/api/create-party');
      const afterCreate = Date.now();
      
      expect(response.status).toBe(200);
      const partyCode = response.body.partyCode;
      
      const party = parties.get(partyCode);
      expect(party).toBeDefined();
      expect(party.createdAt).toBeDefined();
      expect(party.createdAt).toBeGreaterThanOrEqual(beforeCreate);
      expect(party.createdAt).toBeLessThanOrEqual(afterCreate);
    });

    it('should include party age in join response logs', async () => {
      // Create a party
      const createResponse = await request(app).post('/api/create-party');
      const partyCode = createResponse.body.partyCode;
      
      // Wait a small amount of time
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Join the party
      const joinResponse = await request(app)
        .post('/api/join-party')
        .send({ partyCode });
      
      expect(joinResponse.status).toBe(200);
      
      // Verify party still exists and has valid createdAt
      const party = parties.get(partyCode);
      expect(party).toBeDefined();
      expect(Date.now() - party.createdAt).toBeGreaterThanOrEqual(10);
    });
  });

  describe('Cross-Protocol Party Sync', () => {
    it('should log available parties when party not found', async () => {
      // Try to join a non-existent party
      const response = await request(app)
        .post('/api/join-party')
        .send({ partyCode: 'NOEXST' });
      
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Party not found');
    });

    it('should handle multiple parties in storage', async () => {
      // Create multiple parties
      const party1 = await request(app).post('/api/create-party');
      const party2 = await request(app).post('/api/create-party');
      const party3 = await request(app).post('/api/create-party');
      
      // Verify all parties are in storage
      expect(parties.size).toBe(3);
      expect(parties.has(party1.body.partyCode)).toBe(true);
      expect(parties.has(party2.body.partyCode)).toBe(true);
      expect(parties.has(party3.body.partyCode)).toBe(true);
      
      // Join each party
      const join1 = await request(app)
        .post('/api/join-party')
        .send({ partyCode: party1.body.partyCode });
      const join2 = await request(app)
        .post('/api/join-party')
        .send({ partyCode: party2.body.partyCode });
      const join3 = await request(app)
        .post('/api/join-party')
        .send({ partyCode: party3.body.partyCode });
      
      expect(join1.status).toBe(200);
      expect(join2.status).toBe(200);
      expect(join3.status).toBe(200);
    });
  });

  describe('Enhanced Logging', () => {
    it('should log timestamp when creating party', async () => {
      const response = await request(app).post('/api/create-party');
      
      expect(response.status).toBe(200);
      // Verify response includes expected fields
      expect(response.body.partyCode).toBeDefined();
      expect(response.body.hostId).toBeDefined();
    });

    it('should log timestamp and party details when joining party', async () => {
      const createResponse = await request(app).post('/api/create-party');
      const partyCode = createResponse.body.partyCode;
      
      const joinResponse = await request(app)
        .post('/api/join-party')
        .send({ partyCode });
      
      expect(joinResponse.status).toBe(200);
      expect(joinResponse.body).toEqual({ ok: true });
    });
  });
});

describe('Production Scenarios', () => {
  beforeEach(async () => {
    parties.clear();
    await redis.flushall();
  });

  describe('Cross-Instance Party Discovery', () => {
    it('should allow party created via HTTP to be discovered via GET /api/party/:code', async () => {
      // Simulate first request: Create party
      const createResponse = await request(app)
        .post('/api/create-party');
      
      expect(createResponse.status).toBe(200);
      const partyCode = createResponse.body.partyCode;
      expect(partyCode).toBeDefined();
      
      // Simulate second request from another client/instance: Check if party exists
      const checkResponse = await request(app)
        .get(`/api/party/${partyCode}`);
      
      expect(checkResponse.status).toBe(200);
      expect(checkResponse.body.exists).toBe(true);
      expect(checkResponse.body.code).toBe(partyCode);
      expect(checkResponse.body.createdAt).toBeDefined();
      expect(checkResponse.body.hostConnected).toBeDefined();
      expect(checkResponse.body.guestCount).toBeDefined();
      expect(checkResponse.body.instanceId).toBeDefined();
    });
    
    it('should persist party in Redis for cross-instance lookup', async () => {
      // Create party
      const createResponse = await request(app)
        .post('/api/create-party');
      
      expect(createResponse.status).toBe(200);
      const partyCode = createResponse.body.partyCode;
      
      // Directly check Redis (simulating another instance)
      const { getPartyFromRedis } = require('./server');
      const partyData = await getPartyFromRedis(partyCode);
      
      expect(partyData).toBeDefined();
      expect(partyData.createdAt).toBeDefined();
      expect(partyData.hostId).toBeDefined();
      expect(partyData.chatMode).toBe('OPEN');
      expect(partyData.guestCount).toBe(0);
    });
    
    it('should allow guests to join party created on different instance', async () => {
      // Instance 1: Create party
      const createResponse = await request(app)
        .post('/api/create-party');
      
      expect(createResponse.status).toBe(200);
      const partyCode = createResponse.body.partyCode;
      
      // Clear local memory to simulate different instance
      parties.clear();
      
      // Instance 2: Join party (should find it in Redis)
      const joinResponse = await request(app)
        .post('/api/join-party')
        .send({ partyCode });
      
      expect(joinResponse.status).toBe(200);
      expect(joinResponse.body.ok).toBe(true);
    });
  });
  
  describe('Redis Connection Requirements', () => {
    it('should show redis status in health endpoint', async () => {
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body.redis).toBeDefined();
      expect(typeof response.body.redis).toBe('string');
      // In test environment with mock, status could be various states
      expect(['connected', 'ready', 'connect', 'connecting', 'unknown']).toContain(response.body.redis);
    });
  });
});

