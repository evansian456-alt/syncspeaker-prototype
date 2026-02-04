const request = require('supertest');
const { app } = require('./server');

describe('Party Pass Tier Info', () => {
  describe('GET /api/tier-info', () => {
    it('should return tier information', async () => {
      const response = await request(app).get('/api/tier-info');
      expect(response.status).toBe(200);
      expect(response.body.appName).toBe('Phone Party');
      expect(response.body.tiers).toBeDefined();
      expect(response.body.tiers.FREE).toBeDefined();
      expect(response.body.tiers.PARTY_PASS).toBeDefined();
      expect(response.body.tiers.PRO).toBeDefined();
    });
    
    it('should have correct FREE tier settings', async () => {
      const response = await request(app).get('/api/tier-info');
      const freeTier = response.body.tiers.FREE;
      expect(freeTier.chatEnabled).toBe(false);
      expect(freeTier.guestQuickReplies).toBe(false);
      expect(freeTier.hostQuickMessages).toBe(false);
      expect(freeTier.systemAutoMessages).toBe(false);
    });
    
    it('should have correct PARTY_PASS tier settings', async () => {
      const response = await request(app).get('/api/tier-info');
      const partyPass = response.body.tiers.PARTY_PASS;
      expect(partyPass.chatEnabled).toBe(true);
      expect(partyPass.guestQuickReplies).toBe(true);
      expect(partyPass.hostQuickMessages).toBe(true);
      expect(partyPass.systemAutoMessages).toBe(true);
      expect(partyPass.maxTextLength).toBe(60);
      expect(partyPass.maxEmojiLength).toBe(10);
      expect(partyPass.messageTtlMs).toBe(12000);
    });
  });
});
