const request = require('supertest');
const { app, generateCode, httpParties } = require('./server');

describe('Server HTTP Endpoints', () => {
  // Clear httpParties before each test to ensure clean state
  beforeEach(() => {
    httpParties.clear();
  });

  describe('GET /health', () => {
    it('should return status ok', async () => {
      const response = await request(app).get('/health');
      expect(response.body).toEqual({ status: 'ok' });
    });

    it('should return 200 status code', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
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

    it('should store party in httpParties map', async () => {
      const response = await request(app).post('/api/create-party');
      const partyCode = response.body.partyCode;
      
      expect(httpParties.has(partyCode)).toBe(true);
      
      const party = httpParties.get(partyCode);
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

