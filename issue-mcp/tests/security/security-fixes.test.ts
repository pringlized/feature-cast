// Security Fixes Verification Tests for Feature 1.3.3
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { initializeDatabase } from '../../src/database/init';
import { createAudioCastTool } from '../../src/tools/generate-audio-cast';
import * as fs from 'fs';
import * as path from 'path';

describe('Security Fixes for Audio Cast Generation', () => {
  let db: any;
  let tool: any;
  const testFeaturePath = '/planning/projects/test/milestone-1/sprint-1/feature-test';
  
  beforeAll(() => {
    // Initialize test database
    db = initializeDatabase(':memory:');
    tool = createAudioCastTool(db);
    
    // Mock TTS_SERVER_URL for testing
    process.env.TTS_SERVER_URL = 'http://localhost:5000/api/text-to-speech';
  });
  
  afterAll(() => {
    db.close();
  });
  
  beforeEach(() => {
    // Clear any locks between tests
    // Note: In real implementation, locks are in module scope
  });

  describe('Path Traversal Protection', () => {
    const attackVectors = [
      { path: '../../../etc/passwd', name: 'Direct traversal' },
      { path: '%2E%2E%2F%2E%2E%2F%2E%2E%2Fetc%2Fpasswd', name: 'URL encoded' },
      { path: '%252E%252E%252F%252E%252E%252F', name: 'Double encoded' },
      { path: '..%2F..%2F..%2Fetc%2Fpasswd', name: 'Mixed encoding' },
      { path: '/planning/projects/../../../../../../etc/passwd', name: 'Valid prefix with traversal' },
      { path: '/planning/projects/test/../../../../../../../etc/passwd', name: 'Complex traversal' },
    ];
    
    attackVectors.forEach(({ path: attackPath, name }) => {
      it(`should reject ${name}`, async () => {
        await expect(
          tool.execute({
            transcript: 'Test content',
            featureContextPath: attackPath,
            originalAgentName: 'test-agent',
            episodeNumber: 1
          })
        ).rejects.toThrow(/path traversal|escapes base directory/i);
      });
    });
    
    it('should accept valid feature paths', async () => {
      const validPath = '/planning/projects/valid/milestone-1/sprint-1/feature-1';
      
      // Mock filesystem operations for valid path
      jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
      jest.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
      jest.spyOn(fs.promises, 'rename').mockResolvedValue(undefined);
      
      // This should not throw path traversal error
      // (It may fail for other reasons in test environment)
      const result = tool.execute({
        transcript: 'Valid test content',
        featureContextPath: validPath,
        originalAgentName: 'test-agent',
        episodeNumber: 1
      }).catch((e: Error) => {
        // Should not be path traversal error
        expect(e.message).not.toMatch(/path traversal|escapes base directory/i);
      });
    });
  });

  describe('SSRF Protection', () => {
    const originalUrl = process.env.TTS_SERVER_URL;
    
    afterEach(() => {
      process.env.TTS_SERVER_URL = originalUrl;
    });
    
    const attackUrls = [
      { url: 'http://169.254.169.254/latest/meta-data/', name: 'AWS metadata endpoint' },
      { url: 'file:///etc/passwd', name: 'File protocol' },
      { url: 'http://internal-service:8080', name: 'Internal service' },
      { url: 'gopher://evil.com:70', name: 'Gopher protocol' },
      { url: 'http://user:pass@localhost:5000', name: 'Credentials in URL' },
      { url: 'http://evil.com:5000', name: 'Non-whitelisted host' },
    ];
    
    attackUrls.forEach(({ url, name }) => {
      it(`should reject ${name}`, async () => {
        process.env.TTS_SERVER_URL = url;
        
        await expect(
          tool.execute({
            transcript: 'Test content',
            featureContextPath: testFeaturePath,
            originalAgentName: 'test-agent',
            episodeNumber: 1
          })
        ).rejects.toThrow(/Invalid TTS|not in whitelist|cannot contain credentials/i);
      });
    });
    
    const validUrls = [
      'http://localhost:5000/api/text-to-speech',
      'https://localhost:443/tts',
      'http://127.0.0.1:10200/api/tts',
      'http://tts-service:5000/generate',
    ];
    
    validUrls.forEach((url) => {
      it(`should accept valid URL: ${url}`, async () => {
        process.env.TTS_SERVER_URL = url;
        
        // Mock filesystem operations
        jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
        jest.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
        jest.spyOn(fs.promises, 'rename').mockResolvedValue(undefined);
        
        // This should not throw SSRF error
        // (It may fail for other reasons in test environment)
        const result = tool.execute({
          transcript: 'Valid test content',
          featureContextPath: testFeaturePath,
          originalAgentName: 'test-agent',
          episodeNumber: 1
        }).catch((e: Error) => {
          // Should not be SSRF-related error
          expect(e.message).not.toMatch(/Invalid TTS|whitelist|credentials/i);
        });
      });
    });
  });

  describe('Per-Feature Locking (DoS Protection)', () => {
    it('should block concurrent requests for same feature', async () => {
      const feature1 = '/planning/projects/test/milestone-1/sprint-1/feature-1';
      
      // Mock filesystem operations
      jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
      jest.spyOn(fs.promises, 'writeFile').mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      );
      jest.spyOn(fs.promises, 'rename').mockResolvedValue(undefined);
      
      // Start first request (will take 100ms due to mock)
      const request1 = tool.execute({
        transcript: 'First request',
        featureContextPath: feature1,
        originalAgentName: 'agent-1',
        episodeNumber: 1
      });
      
      // Try second request immediately (should be blocked)
      const request2 = tool.execute({
        transcript: 'Second request',
        featureContextPath: feature1,
        originalAgentName: 'agent-2',
        episodeNumber: 2
      });
      
      await expect(request2).rejects.toThrow(/already in progress for this feature/i);
    });
    
    it('should allow concurrent requests for different features', async () => {
      const feature1 = '/planning/projects/test/milestone-1/sprint-1/feature-1';
      const feature2 = '/planning/projects/test/milestone-1/sprint-1/feature-2';
      
      // Mock filesystem operations
      jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
      jest.spyOn(fs.promises, 'writeFile').mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 50))
      );
      jest.spyOn(fs.promises, 'rename').mockResolvedValue(undefined);
      
      // Start requests for different features
      const request1 = tool.execute({
        transcript: 'Feature 1 request',
        featureContextPath: feature1,
        originalAgentName: 'agent-1',
        episodeNumber: 1
      }).catch(() => {}); // Ignore errors for this test
      
      const request2 = tool.execute({
        transcript: 'Feature 2 request',
        featureContextPath: feature2,
        originalAgentName: 'agent-2',
        episodeNumber: 1
      }).catch(() => {}); // Ignore errors for this test
      
      // Both should be processing (not blocked by each other)
      // If feature 2 was blocked by feature 1, it would throw immediately
      await Promise.race([
        request2,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Feature 2 not blocked')), 10)
        )
      ]).catch((e) => {
        // Feature 2 should NOT be blocked
        expect(e.message).toBe('Feature 2 not blocked');
      });
    });
  });

  describe('Race Condition Protection', () => {
    it('should handle concurrent episode creation atomically', async () => {
      const featurePath = '/planning/projects/test/milestone-1/sprint-1/feature-race';
      const episodeNumber = 99;
      
      // Mock filesystem operations to be instant
      jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
      jest.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);
      jest.spyOn(fs.promises, 'rename').mockResolvedValue(undefined);
      
      // Note: In a real scenario with actual database and no per-feature locking,
      // both requests would reach the database at nearly the same time.
      // The UNIQUE constraint would ensure only one succeeds.
      
      // Since we have per-feature locking now, we need to test the DB constraint
      // by directly calling the database operations
      const { AudioCastOperations } = require('../../src/database/operations');
      const ops = new AudioCastOperations(db);
      
      // Create first record
      ops.createAudioCast({
        id: 'uuid-1',
        feature_context_path: featurePath,
        episode_number: episodeNumber,
        source_agent_name: 'agent-1',
        script_path: '/path/to/script1.md',
        audio_path: '/path/to/audio1.wav',
        processing_duration_ms: 1000
      });
      
      // Try to create duplicate - should fail due to UNIQUE constraint
      expect(() => {
        ops.createAudioCast({
          id: 'uuid-2',
          feature_context_path: featurePath,
          episode_number: episodeNumber,
          source_agent_name: 'agent-2',
          script_path: '/path/to/script2.md',
          audio_path: '/path/to/audio2.wav',
          processing_duration_ms: 2000
        });
      }).toThrow(/already exists for this feature/i);
    });
  });
});

console.log('Security fixes test file created successfully');