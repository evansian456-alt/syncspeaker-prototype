const { escapeHtml, formatFileSize, generatePartyCode, hashStr } = require('./utils');

describe('Client-side Utility Functions', () => {
  describe('escapeHtml', () => {
    it('should escape ampersand', () => {
      expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    it('should escape less than', () => {
      expect(escapeHtml('5 < 10')).toBe('5 &lt; 10');
    });

    it('should escape greater than', () => {
      expect(escapeHtml('10 > 5')).toBe('10 &gt; 5');
    });

    it('should escape double quotes', () => {
      expect(escapeHtml('Say "Hello"')).toBe('Say &quot;Hello&quot;');
    });

    it('should escape single quotes', () => {
      expect(escapeHtml("It's working")).toBe('It&#039;s working');
    });

    it('should escape multiple special characters', () => {
      expect(escapeHtml('<script>alert("XSS")</script>'))
        .toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
    });

    it('should handle empty string', () => {
      expect(escapeHtml('')).toBe('');
    });

    it('should handle null', () => {
      expect(escapeHtml(null)).toBe('');
    });

    it('should handle undefined', () => {
      expect(escapeHtml(undefined)).toBe('');
    });

    it('should handle string with no special characters', () => {
      expect(escapeHtml('Hello World')).toBe('Hello World');
    });
  });

  describe('formatFileSize', () => {
    it('should format 0 bytes', () => {
      expect(formatFileSize(0)).toBe('0 B');
    });

    it('should format bytes less than 1KB', () => {
      expect(formatFileSize(500)).toBe('500 B');
      expect(formatFileSize(1023)).toBe('1023 B');
    });

    it('should format KB correctly', () => {
      expect(formatFileSize(1024)).toBe('1.0 KB');
      expect(formatFileSize(1536)).toBe('1.5 KB');
      expect(formatFileSize(10240)).toBe('10.0 KB');
    });

    it('should format MB correctly', () => {
      expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
      expect(formatFileSize(1024 * 1024 * 2.5)).toBe('2.5 MB');
      expect(formatFileSize(1024 * 1024 * 100)).toBe('100.0 MB');
    });

    it('should format GB correctly', () => {
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.0 GB');
      expect(formatFileSize(1024 * 1024 * 1024 * 2.5)).toBe('2.5 GB');
    });

    it('should round to 1 decimal place', () => {
      expect(formatFileSize(1536)).toMatch(/^\d+\.\d{1} KB$/);
      expect(formatFileSize(1024 * 1024 * 1.234)).toMatch(/^\d+\.\d{1} MB$/);
    });
  });

  describe('generatePartyCode', () => {
    it('should generate a 6-character party code', () => {
      const code = generatePartyCode();
      expect(code).toHaveLength(6);
    });

    it('should only contain uppercase letters and numbers', () => {
      const code = generatePartyCode();
      expect(code).toMatch(/^[A-Z0-9]{6}$/);
    });

    it('should generate different codes on subsequent calls', () => {
      const codes = new Set();
      
      // Generate 100 codes
      for (let i = 0; i < 100; i++) {
        codes.add(generatePartyCode());
      }
      
      // Most codes should be unique (statistically very likely)
      expect(codes.size).toBeGreaterThan(95);
    });

    it('should not contain lowercase letters', () => {
      const code = generatePartyCode();
      expect(code).not.toMatch(/[a-z]/);
    });

    it('should not contain special characters', () => {
      const code = generatePartyCode();
      expect(code).not.toMatch(/[^A-Z0-9]/);
    });

    it('should use the correct character set', () => {
      // Generate many codes and check they only use the expected characters
      const validChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      
      for (let i = 0; i < 50; i++) {
        const code = generatePartyCode();
        for (const char of code) {
          expect(validChars).toContain(char);
        }
      }
    });
  });

  describe('hashStr', () => {
    it('should return a number', () => {
      const result = hashStr('test');
      expect(typeof result).toBe('number');
    });

    it('should return a positive number', () => {
      const result = hashStr('test');
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('should return consistent hash for same input', () => {
      const input = 'consistency test';
      const hash1 = hashStr(input);
      const hash2 = hashStr(input);
      expect(hash1).toBe(hash2);
    });

    it('should return different hashes for different inputs', () => {
      const hash1 = hashStr('test1');
      const hash2 = hashStr('test2');
      // Very unlikely to be equal
      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', () => {
      const result = hashStr('');
      expect(result).toBe(0);
    });

    it('should handle long strings', () => {
      const longString = 'a'.repeat(1000);
      const result = hashStr(longString);
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('should handle special characters', () => {
      const result = hashStr('Hello! @#$%^&*()');
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('should handle unicode characters', () => {
      const result = hashStr('Hello 世界 🌍');
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
    });
  });
});
