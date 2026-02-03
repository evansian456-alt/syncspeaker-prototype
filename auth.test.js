/**
 * Authentication System Tests
 * Tests for user signup, login, and auth middleware
 */

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const authMiddleware = require('./auth-middleware');

// Create a simple test app
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  
  // Test route that requires auth
  app.get('/protected', authMiddleware.requireAuth, (req, res) => {
    res.json({ message: 'Protected resource', userId: req.user.userId });
  });
  
  // Test route with optional auth
  app.get('/optional', authMiddleware.optionalAuth, (req, res) => {
    res.json({ 
      message: 'Optional auth resource',
      authenticated: !!req.user,
      userId: req.user?.userId
    });
  });
  
  return app;
}

describe('Authentication Middleware', () => {
  describe('Password hashing', () => {
    it('should hash passwords', async () => {
      const password = 'test123';
      const hash = await authMiddleware.hashPassword(password);
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
    });
    
    it('should verify correct passwords', async () => {
      const password = 'test123';
      const hash = await authMiddleware.hashPassword(password);
      const isValid = await authMiddleware.verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });
    
    it('should reject incorrect passwords', async () => {
      const password = 'test123';
      const hash = await authMiddleware.hashPassword(password);
      const isValid = await authMiddleware.verifyPassword('wrong', hash);
      expect(isValid).toBe(false);
    });
  });
  
  describe('JWT tokens', () => {
    it('should generate valid tokens', () => {
      const payload = { userId: '123', email: 'test@example.com' };
      const token = authMiddleware.generateToken(payload);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });
    
    it('should verify valid tokens', () => {
      const payload = { userId: '123', email: 'test@example.com' };
      const token = authMiddleware.generateToken(payload);
      const decoded = authMiddleware.verifyToken(token);
      expect(decoded).toBeDefined();
      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.email).toBe(payload.email);
    });
    
    it('should reject invalid tokens', () => {
      const decoded = authMiddleware.verifyToken('invalid-token');
      expect(decoded).toBeNull();
    });
  });
  
  describe('Email validation', () => {
    it('should accept valid emails', () => {
      expect(authMiddleware.isValidEmail('test@example.com')).toBe(true);
      expect(authMiddleware.isValidEmail('user+tag@domain.co.uk')).toBe(true);
    });
    
    it('should reject invalid emails', () => {
      expect(authMiddleware.isValidEmail('not-an-email')).toBe(false);
      expect(authMiddleware.isValidEmail('@example.com')).toBe(false);
      expect(authMiddleware.isValidEmail('test@')).toBe(false);
    });
  });
  
  describe('Password validation', () => {
    it('should accept valid passwords', () => {
      expect(authMiddleware.isValidPassword('123456')).toBe(true);
      expect(authMiddleware.isValidPassword('longpassword')).toBe(true);
    });
    
    it('should reject short passwords', () => {
      expect(authMiddleware.isValidPassword('12345')).toBe(false);
      expect(authMiddleware.isValidPassword('abc')).toBe(false);
      expect(authMiddleware.isValidPassword('')).toBe(false);
    });
  });
  
  describe('requireAuth middleware', () => {
    const app = createTestApp();
    
    it('should reject requests without auth token', async () => {
      const response = await request(app).get('/protected');
      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
    });
    
    it('should accept requests with valid auth token', async () => {
      const token = authMiddleware.generateToken({ userId: '123', email: 'test@example.com' });
      const response = await request(app)
        .get('/protected')
        .set('Cookie', [`auth_token=${token}`]);
      expect(response.status).toBe(200);
      expect(response.body.userId).toBe('123');
    });
    
    it('should reject requests with invalid auth token', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Cookie', ['auth_token=invalid']);
      expect(response.status).toBe(401);
    });
  });
  
  describe('optionalAuth middleware', () => {
    const app = createTestApp();
    
    it('should allow requests without auth token', async () => {
      const response = await request(app).get('/optional');
      expect(response.status).toBe(200);
      expect(response.body.authenticated).toBe(false);
    });
    
    it('should recognize authenticated requests', async () => {
      const token = authMiddleware.generateToken({ userId: '123', email: 'test@example.com' });
      const response = await request(app)
        .get('/optional')
        .set('Cookie', [`auth_token=${token}`]);
      expect(response.status).toBe(200);
      expect(response.body.authenticated).toBe(true);
      expect(response.body.userId).toBe('123');
    });
  });
});
