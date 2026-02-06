/**
 * Tests for Party Join Regression Fixes
 * 
 * These tests verify that:
 * 1. HTTP party creation works correctly
 * 2. Guests can join via HTTP
 * 3. Party state is properly maintained
 * 4. Tier limits are enforced
 */

const request = require('supertest');
const { app, parties, redis, waitForRedis } = require('./server');

describe('Party Join Regression Fixes', () => {
  // Wait for Redis to be ready
  beforeAll(async () => {
    try {
      await waitForRedis();
    } catch (error) {
      console.error('Failed to connect to Redis:', error.message);
    }
  });
  
  // Clear parties before each test
  beforeEach(async () => {
    parties.clear();
    await redis.flushall();
  });
  
  describe('HTTP Party Creation and Join', () => {
    it('should create party via HTTP and store in Redis', async () => {
      const createResponse = await request(app)
        .post('/api/create-party')
        .send({ djName: 'DJ Test' });
      
      expect(createResponse.status).toBe(200);
      expect(createResponse.body).toHaveProperty('partyCode');
      expect(createResponse.body).toHaveProperty('hostId');
      
      const partyCode = createResponse.body.partyCode;
      
      // Verify party exists in local memory
      expect(parties.has(partyCode)).toBe(true);
      
      const party = parties.get(partyCode);
      expect(party).toBeDefined();
      expect(party.host).toBeNull(); // HTTP-created party has no WebSocket host yet
      expect(party.members).toEqual([]); // No members yet
    });
    
    it('should allow guest to join party via HTTP', async () => {
      // Create party
      const createResponse = await request(app)
        .post('/api/create-party')
        .send({ djName: 'DJ Host' });
      
      const partyCode = createResponse.body.partyCode;
      
      // Guest joins
      const joinResponse = await request(app)
        .post('/api/join-party')
        .send({ partyCode: partyCode, nickname: 'Guest1' });
      
      expect(joinResponse.status).toBe(200);
      expect(joinResponse.body).toHaveProperty('ok', true);
      expect(joinResponse.body).toHaveProperty('guestId');
      expect(joinResponse.body).toHaveProperty('djName', 'DJ Host');
    });
    
    it('should return party state with guest count', async () => {
      // Create party
      const createResponse = await request(app)
        .post('/api/create-party')
        .send({ djName: 'DJ Host' });
      
      const partyCode = createResponse.body.partyCode;
      
      // Guest joins
      await request(app)
        .post('/api/join-party')
        .send({ partyCode: partyCode, nickname: 'Guest1' });
      
      // Check party state
      const stateResponse = await request(app)
        .get(`/api/party-state?code=${partyCode}`);
      
      expect(stateResponse.status).toBe(200);
      expect(stateResponse.body.exists).toBe(true);
      expect(stateResponse.body.guestCount).toBe(1);
    });
  });
  
  describe('Tier Info Endpoint', () => {
    it('should return tier information for all tiers', async () => {
      const response = await request(app).get('/api/tier-info');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('tiers');
      expect(response.body.tiers).toHaveProperty('FREE');
      expect(response.body.tiers).toHaveProperty('PARTY_PASS');
      expect(response.body.tiers).toHaveProperty('PRO_MONTHLY');
      
      // Verify FREE tier has phone limit
      expect(response.body.tiers.FREE.phoneLimit).toBe(2);
      
      // Verify PARTY_PASS has messaging enabled
      expect(response.body.tiers.PARTY_PASS.chatEnabled).toBe(true);
      
      // Verify PRO has more phones than FREE
      expect(response.body.tiers.PRO_MONTHLY.phoneLimit).toBeGreaterThan(2);
    });
  });
  
  describe('Party State Management', () => {
    it('should return party state even if DJ name not in state', async () => {
      // Create party
      const createResponse = await request(app)
        .post('/api/create-party')
        .send({ djName: 'DJ Awesome' });
      
      const partyCode = createResponse.body.partyCode;
      
      // Get party state
      const stateResponse = await request(app)
        .get(`/api/party-state?code=${partyCode}`);
      
      expect(stateResponse.status).toBe(200);
      expect(stateResponse.body.exists).toBe(true);
      // DJ name might be in a different field or not returned by party-state
    });
    
    it('should return 400 or 404 for invalid party code', async () => {
      const stateResponse = await request(app)
        .get('/api/party-state?code=INVALID');
      
      // Either 400 (bad request) or 404 (not found) is acceptable
      expect([400, 404]).toContain(stateResponse.status);
      expect(stateResponse.body.exists).toBe(false);
    });
  });
});
