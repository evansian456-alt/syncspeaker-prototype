/**
 * @jest-environment node
 */

const request = require("supertest");
const WebSocket = require("ws");
const { app, waitForRedis, redis, parties } = require("./server");

describe("Prototype Mode Tier Preservation", () => {
  // Wait for Redis to be ready before running any tests
  beforeAll(async () => {
    try {
      await waitForRedis();
    } catch (error) {
      console.error('Failed to connect to Redis:', error.message);
    }
  });

  // Clear parties and Redis before each test to ensure clean state
  beforeEach(async () => {
    parties.clear();
    // Clear Redis mock
    if (redis) {
      await redis.flushall();
    }
  });
  
  describe("Party Creation with Prototype Mode", () => {
    it("should create party with FREE tier in prototype mode", async () => {
      const response = await request(app)
        .post("/api/create-party")
        .send({
          djName: "DJ Test",
          source: "local",
          prototypeMode: true,
          tier: "FREE"
        })
        .expect(200);
      
      expect(response.body).toHaveProperty("partyCode");
      expect(response.body).toHaveProperty("hostId");
      expect(response.body.partyCode).toMatch(/^[A-Z0-9]{6}$/);
    });
    
    it("should create party with PARTY_PASS tier in prototype mode", async () => {
      const response = await request(app)
        .post("/api/create-party")
        .send({
          djName: "DJ Party Pass",
          source: "local",
          prototypeMode: true,
          tier: "PARTY_PASS"
        })
        .expect(200);
      
      expect(response.body).toHaveProperty("partyCode");
      expect(response.body).toHaveProperty("hostId");
    });
    
    it("should create party with PRO tier in prototype mode", async () => {
      const response = await request(app)
        .post("/api/create-party")
        .send({
          djName: "DJ Pro",
          source: "local",
          prototypeMode: true,
          tier: "PRO"
        })
        .expect(200);
      
      expect(response.body).toHaveProperty("partyCode");
      expect(response.body).toHaveProperty("hostId");
    });
    
    it("should create party with PRO_MONTHLY tier in prototype mode", async () => {
      const response = await request(app)
        .post("/api/create-party")
        .send({
          djName: "DJ Pro Monthly",
          source: "local",
          prototypeMode: true,
          tier: "PRO_MONTHLY"
        })
        .expect(200);
      
      expect(response.body).toHaveProperty("partyCode");
      expect(response.body).toHaveProperty("hostId");
    });
    
    it("should reject invalid tier in prototype mode", async () => {
      const response = await request(app)
        .post("/api/create-party")
        .send({
          djName: "DJ Invalid",
          source: "local",
          prototypeMode: true,
          tier: "INVALID_TIER"
        })
        .expect(400);
      
      expect(response.body).toHaveProperty("error");
      expect(response.body.error).toContain("Invalid tier");
    });
    
    it("should create party without tier when prototypeMode is false", async () => {
      const response = await request(app)
        .post("/api/create-party")
        .send({
          djName: "DJ Normal",
          source: "local",
          prototypeMode: false
        })
        .expect(200);
      
      expect(response.body).toHaveProperty("partyCode");
      expect(response.body).toHaveProperty("hostId");
    });
  });
  
  describe("Party State Verification", () => {
    it("should return party state with tier for PARTY_PASS in prototype mode", async () => {
      // Create party first
      const createResponse = await request(app)
        .post("/api/create-party")
        .send({
          djName: "DJ Party Pass",
          source: "local",
          prototypeMode: true,
          tier: "PARTY_PASS"
        })
        .expect(200);
      
      const partyCode = createResponse.body.partyCode;
      
      // Get party state
      const stateResponse = await request(app)
        .get(`/api/party-state?code=${partyCode}`)
        .expect(200);
      
      expect(stateResponse.body.exists).toBe(true);
      expect(stateResponse.body.tierInfo).toHaveProperty("tier");
      expect(stateResponse.body.tierInfo.tier).toBe("PARTY_PASS");
      expect(stateResponse.body.tierInfo).toHaveProperty("partyPassExpiresAt");
      expect(stateResponse.body.tierInfo.partyPassExpiresAt).not.toBeNull();
      expect(stateResponse.body.tierInfo).toHaveProperty("maxPhones");
      expect(stateResponse.body.tierInfo.maxPhones).toBe(4); // Party Pass allows 4 phones
    });
    
    it("should return party state with tier for PRO_MONTHLY in prototype mode", async () => {
      // Create party first
      const createResponse = await request(app)
        .post("/api/create-party")
        .send({
          djName: "DJ Pro Monthly",
          source: "local",
          prototypeMode: true,
          tier: "PRO_MONTHLY"
        })
        .expect(200);
      
      const partyCode = createResponse.body.partyCode;
      
      // Get party state
      const stateResponse = await request(app)
        .get(`/api/party-state?code=${partyCode}`)
        .expect(200);
      
      expect(stateResponse.body.exists).toBe(true);
      expect(stateResponse.body.tierInfo).toHaveProperty("tier");
      expect(stateResponse.body.tierInfo.tier).toBe("PRO_MONTHLY");
      expect(stateResponse.body.tierInfo).toHaveProperty("partyPassExpiresAt");
      expect(stateResponse.body.tierInfo.partyPassExpiresAt).not.toBeNull();
      expect(stateResponse.body.tierInfo).toHaveProperty("maxPhones");
      expect(stateResponse.body.tierInfo.maxPhones).toBe(10); // Pro Monthly allows 10 phones
    });
    
    it("should return party state with tier for FREE in prototype mode", async () => {
      // Create party first
      const createResponse = await request(app)
        .post("/api/create-party")
        .send({
          djName: "DJ Free",
          source: "local",
          prototypeMode: true,
          tier: "FREE"
        })
        .expect(200);
      
      const partyCode = createResponse.body.partyCode;
      
      // Get party state
      const stateResponse = await request(app)
        .get(`/api/party-state?code=${partyCode}`)
        .expect(200);
      
      expect(stateResponse.body.exists).toBe(true);
      expect(stateResponse.body.tierInfo).toHaveProperty("tier");
      expect(stateResponse.body.tierInfo.tier).toBe("FREE");
      expect(stateResponse.body.tierInfo.partyPassExpiresAt).toBeNull();
      expect(stateResponse.body.tierInfo.maxPhones).toBeNull();
    });
  });
  
  describe("Tier-Based Feature Gating", () => {
    it("should enforce 2-phone limit for FREE tier", async () => {
      // Create party with FREE tier
      const createResponse = await request(app)
        .post("/api/create-party")
        .send({
          djName: "DJ Free",
          source: "local",
          prototypeMode: true,
          tier: "FREE"
        })
        .expect(200);
      
      const partyCode = createResponse.body.partyCode;
      
      // Get party state to verify limits
      const stateResponse = await request(app)
        .get(`/api/party-state?code=${partyCode}`)
        .expect(200);
      
      expect(stateResponse.body.tierInfo.tier).toBe("FREE");
      // Free tier should have null maxPhones (defaults to 2)
      expect(stateResponse.body.tierInfo.maxPhones).toBeNull();
    });
    
    it("should enforce 4-phone limit for PARTY_PASS tier", async () => {
      // Create party with PARTY_PASS tier
      const createResponse = await request(app)
        .post("/api/create-party")
        .send({
          djName: "DJ Party Pass",
          source: "local",
          prototypeMode: true,
          tier: "PARTY_PASS"
        })
        .expect(200);
      
      const partyCode = createResponse.body.partyCode;
      
      // Get party state to verify limits
      const stateResponse = await request(app)
        .get(`/api/party-state?code=${partyCode}`)
        .expect(200);
      
      expect(stateResponse.body.tierInfo.tier).toBe("PARTY_PASS");
      expect(stateResponse.body.tierInfo.maxPhones).toBe(4);
    });
    
    it("should enforce 10-phone limit for PRO_MONTHLY tier", async () => {
      // Create party with PRO_MONTHLY tier
      const createResponse = await request(app)
        .post("/api/create-party")
        .send({
          djName: "DJ Pro",
          source: "local",
          prototypeMode: true,
          tier: "PRO_MONTHLY"
        })
        .expect(200);
      
      const partyCode = createResponse.body.partyCode;
      
      // Get party state to verify limits
      const stateResponse = await request(app)
        .get(`/api/party-state?code=${partyCode}`)
        .expect(200);
      
      expect(stateResponse.body.tierInfo.tier).toBe("PRO_MONTHLY");
      expect(stateResponse.body.tierInfo.maxPhones).toBe(10);
    });
  });
  
  describe("Tier Preservation Across Different Flows", () => {
    it("should not override tier to FREE when prototype mode is not specified", async () => {
      // Create party without prototype mode
      const createResponse = await request(app)
        .post("/api/create-party")
        .send({
          djName: "DJ Normal",
          source: "local"
        })
        .expect(200);
      
      const partyCode = createResponse.body.partyCode;
      
      // Get party state
      const stateResponse = await request(app)
        .get(`/api/party-state?code=${partyCode}`)
        .expect(200);
      
      expect(stateResponse.body.exists).toBe(true);
      // tier should be null when not in prototype mode
      expect(stateResponse.body.tierInfo.tier).toBeNull();
    });
    
    it("should preserve PRO tier separately from PRO_MONTHLY", async () => {
      // Create party with PRO tier
      const createResponse = await request(app)
        .post("/api/create-party")
        .send({
          djName: "DJ Pro",
          source: "local",
          prototypeMode: true,
          tier: "PRO"
        })
        .expect(200);
      
      const partyCode = createResponse.body.partyCode;
      
      // Get party state
      const stateResponse = await request(app)
        .get(`/api/party-state?code=${partyCode}`)
        .expect(200);
      
      expect(stateResponse.body.tierInfo.tier).toBe("PRO");
    });
  });
});
