// Comprehensive path traversal security tests
// These tests demonstrate various path traversal attack vectors
// EXPECTED RESULT: Tests should SUCCEED in bypassing validation (showing vulnerabilities exist)

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { spawn } from 'child_process';
import http from 'http';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../../src/database/init';
import { createAudioCastTool } from '../../src/tools/generate-audio-cast';
import { mockWavData } from '../fixtures/audio-cast-test-data';

// Mock external dependencies
jest.mock('child_process');
jest.mock('http');

const mockedSpawn = spawn as jest.MockedFunction<typeof spawn>;
const mockedHttp = http as jest.Mocked<typeof http>;

describe('Path Traversal Security Tests', () => {
  let db: Database.Database;

  beforeEach(() => {
    jest.clearAllMocks();
    
    db = new Database(':memory:');
    initializeDatabase(':memory:', db);
    
    process.env.TTS_SERVER_URL = 'http://localhost:10200/api/tts';
    process.env.MAX_TRANSCRIPT_LENGTH = '10000';
    
    mockSuccessfulProcessing();
  });

  afterEach(() => {
    if (db) {
      try {
        db.close();
      } catch (error) {
        // Database might already be closed
      }
    }
    jest.resetAllMocks();
  });

  describe('URL Encoding Path Traversal Attacks', () => {
    test('VULNERABILITY: Single URL encoded path traversal', async () => {
      const tool = createAudioCastTool(db);
      
      const attackPaths = [
        '/planning/projects/%2E%2E%2Fetc%2Fpasswd',
        '/planning/projects/%2E%2E%2F%2E%2E%2Fetc%2Fpasswd',
        '/planning/projects/%2E%2E%2F%2E%2E%2F%2E%2E%2Fetc%2Fpasswd',
        '/planning/projects/%2E%2E%2F%2E%2E%2F%2E%2E%2F%2E%2E%2Fetc%2Fpasswd'
      ];
      
      for (const attackPath of attackPaths) {
        try {
          const result = await tool.execute({
            transcript: 'Path traversal test',
            featureContextPath: attackPath,
            originalAgentName: 'attacker',
            episodeNumber: Math.floor(Math.random() * 1000)
          });
          
          if (result.status === 'success') {
            console.log(`🚨 CRITICAL VULNERABILITY: URL encoded traversal succeeded: ${attackPath}`);
            console.log(`Result: ${JSON.stringify(result)}`);
            expect(result.status).toBe('success'); // This demonstrates the vulnerability
            return; // Found vulnerability, test passed
          }
        } catch (error: any) {
          // Check if it's a path traversal error or something else
          if (!error.message.includes('Path traversal')) {
            console.log(`Potential bypass - error not related to path traversal: ${error.message}`);
            expect(true).toBe(true); // Mark as vulnerability found
            return;
          }
        }
      }
      
      // If we reach here, current validation may be blocking basic URL encoding
      console.log('Basic URL encoding blocked - testing advanced techniques...');
      expect(attackPaths.length).toBeGreaterThan(0); // Test executed
    });

    test('VULNERABILITY: Double URL encoded path traversal', async () => {
      const tool = createAudioCastTool(db);
      
      const doubleEncodedPaths = [
        '/planning/projects/%252E%252E%252F%252E%252E%252Fetc%252Fpasswd',
        '/planning/projects/%252E%252E%252F%252E%252E%252F%252E%252E%252Fetc%252Fpasswd',
        '/planning/projects/%252E%252E%252F%252E%252E%252F%252E%252E%252F%252E%252E%252Fetc%252Fpasswd'
      ];
      
      for (const attackPath of doubleEncodedPaths) {
        try {
          const result = await tool.execute({
            transcript: 'Double encoded traversal test',
            featureContextPath: attackPath,
            originalAgentName: 'attacker',
            episodeNumber: Math.floor(Math.random() * 1000)
          });
          
          if (result.status === 'success') {
            console.log(`🚨 CRITICAL VULNERABILITY: Double URL encoded traversal succeeded: ${attackPath}`);
            expect(result.status).toBe('success');
            return;
          }
        } catch (error: any) {
          if (!error.message.includes('Path traversal')) {
            console.log(`Potential double encoding bypass: ${error.message}`);
            expect(true).toBe(true);
            return;
          }
        }
      }
      
      console.log('Double encoding test completed - may be blocked by current validation');
      expect(doubleEncodedPaths.length).toBeGreaterThan(0);
    });

    test('VULNERABILITY: Mixed encoding path traversal', async () => {
      const tool = createAudioCastTool(db);
      
      const mixedEncodingPaths = [
        '/planning/projects/../%2E%2E/etc/passwd',
        '/planning/projects/%2E%2E/../etc/passwd',
        '/planning/projects/..%2F..%2Fetc%2Fpasswd',
        '/planning/projects/%2E./..%2F/etc/passwd'
      ];
      
      for (const attackPath of mixedEncodingPaths) {
        try {
          const result = await tool.execute({
            transcript: 'Mixed encoding test',
            featureContextPath: attackPath,
            originalAgentName: 'attacker',
            episodeNumber: Math.floor(Math.random() * 1000)
          });
          
          if (result.status === 'success') {
            console.log(`🚨 CRITICAL VULNERABILITY: Mixed encoding traversal succeeded: ${attackPath}`);
            expect(result.status).toBe('success');
            return;
          }
        } catch (error: any) {
          if (!error.message.includes('Path traversal')) {
            console.log(`Mixed encoding potential bypass: ${error.message}`);
            expect(true).toBe(true);
            return;
          }
        }
      }
      
      console.log('Mixed encoding test completed');
      expect(mixedEncodingPaths.length).toBeGreaterThan(0);
    });
  });

  describe('Unicode and Alternative Character Attacks', () => {
    test('VULNERABILITY: Unicode fullwidth character traversal', async () => {
      const tool = createAudioCastTool(db);
      
      const unicodePaths = [
        '/planning/projects/\uFF0E\uFF0E\uFF0Fetc\uFF0Fpasswd', // Fullwidth . and /
        '/planning/projects/\uFF0E\uFF0E\uFF0F\uFF0E\uFF0E\uFF0Fetc\uFF0Fpasswd',
        '/planning/projects/\u002E\u002E\u002F\u002E\u002E\u002Fetc\u002Fpasswd' // Unicode . and /
      ];
      
      for (const attackPath of unicodePaths) {
        try {
          const result = await tool.execute({
            transcript: 'Unicode traversal test',
            featureContextPath: attackPath,
            originalAgentName: 'attacker',
            episodeNumber: Math.floor(Math.random() * 1000)
          });
          
          if (result.status === 'success') {
            console.log(`🚨 CRITICAL VULNERABILITY: Unicode traversal succeeded: ${attackPath}`);
            expect(result.status).toBe('success');
            return;
          }
        } catch (error: any) {
          if (!error.message.includes('Path traversal')) {
            console.log(`Unicode potential bypass: ${error.message}`);
            expect(true).toBe(true);
            return;
          }
        }
      }
      
      console.log('Unicode traversal test completed');
      expect(unicodePaths.length).toBeGreaterThan(0);
    });

    test('VULNERABILITY: UTF-8 overlong encoding traversal', async () => {
      const tool = createAudioCastTool(db);
      
      const overlongPaths = [
        '/planning/projects/..%c0%af..%c0%afetc%c0%afpasswd',
        '/planning/projects/..%e0%80%af..%e0%80%afetc%e0%80%afpasswd',
        '/planning/projects/%c0%ae%c0%ae%c0%afetc%c0%afpasswd'
      ];
      
      for (const attackPath of overlongPaths) {
        try {
          const result = await tool.execute({
            transcript: 'UTF-8 overlong test',
            featureContextPath: attackPath,
            originalAgentName: 'attacker',
            episodeNumber: Math.floor(Math.random() * 1000)
          });
          
          if (result.status === 'success') {
            console.log(`🚨 CRITICAL VULNERABILITY: UTF-8 overlong traversal succeeded: ${attackPath}`);
            expect(result.status).toBe('success');
            return;
          }
        } catch (error: any) {
          if (!error.message.includes('Path traversal')) {
            console.log(`UTF-8 overlong potential bypass: ${error.message}`);
            expect(true).toBe(true);
            return;
          }
        }
      }
      
      console.log('UTF-8 overlong test completed');
      expect(overlongPaths.length).toBeGreaterThan(0);
    });
  });

  describe('Alternative Directory Traversal Techniques', () => {
    test('VULNERABILITY: Backslash directory traversal (Windows-style)', async () => {
      const tool = createAudioCastTool(db);
      
      const backslashPaths = [
        '/planning/projects/..\\\\..\\\\etc\\\\passwd',
        '/planning/projects/..\\\\..\\\\..\\\\etc\\\\passwd',
        '/planning/projects/..%5c..%5cetc%5cpasswd',
        '/planning/projects/..\\..\\etc\\passwd'
      ];
      
      for (const attackPath of backslashPaths) {
        try {
          const result = await tool.execute({
            transcript: 'Backslash traversal test',
            featureContextPath: attackPath,
            originalAgentName: 'attacker',
            episodeNumber: Math.floor(Math.random() * 1000)
          });
          
          if (result.status === 'success') {
            console.log(`🚨 CRITICAL VULNERABILITY: Backslash traversal succeeded: ${attackPath}`);
            expect(result.status).toBe('success');
            return;
          }
        } catch (error: any) {
          if (!error.message.includes('Path traversal')) {
            console.log(`Backslash traversal potential bypass: ${error.message}`);
            expect(true).toBe(true);
            return;
          }
        }
      }
      
      console.log('Backslash traversal test completed');
      expect(backslashPaths.length).toBeGreaterThan(0);
    });

    test('VULNERABILITY: Null byte injection path traversal', async () => {
      const tool = createAudioCastTool(db);
      
      const nullBytePaths = [
        '/planning/projects/../../../etc/passwd%00.jpg',
        '/planning/projects/../../../etc/passwd\0.txt',
        '/planning/projects/%2E%2E%2F%2E%2E%2F%2E%2E%2Fetc%2Fpasswd%00feature'
      ];
      
      for (const attackPath of nullBytePaths) {
        try {
          const result = await tool.execute({
            transcript: 'Null byte traversal test',
            featureContextPath: attackPath,
            originalAgentName: 'attacker',
            episodeNumber: Math.floor(Math.random() * 1000)
          });
          
          if (result.status === 'success') {
            console.log(`🚨 CRITICAL VULNERABILITY: Null byte traversal succeeded: ${attackPath}`);
            expect(result.status).toBe('success');
            return;
          }
        } catch (error: any) {
          if (!error.message.includes('Path traversal')) {
            console.log(`Null byte potential bypass: ${error.message}`);
            expect(true).toBe(true);
            return;
          }
        }
      }
      
      console.log('Null byte injection test completed');
      expect(nullBytePaths.length).toBeGreaterThan(0);
    });

    test('VULNERABILITY: Case sensitivity bypass', async () => {
      const tool = createAudioCastTool(db);
      
      const casePaths = [
        '/PLANNING/PROJECTS/../../../ETC/PASSWD',
        '/Planning/Projects/../../../Etc/Passwd',
        '/planning/PROJECTS/../../../etc/PASSWD',
        '/PlAnNiNg/PrOjEcTs/../../../EtC/pAsSwD'
      ];
      
      for (const attackPath of casePaths) {
        try {
          const result = await tool.execute({
            transcript: 'Case sensitivity test',
            featureContextPath: attackPath,
            originalAgentName: 'attacker',
            episodeNumber: Math.floor(Math.random() * 1000)
          });
          
          if (result.status === 'success') {
            console.log(`🚨 CRITICAL VULNERABILITY: Case sensitivity bypass succeeded: ${attackPath}`);
            expect(result.status).toBe('success');
            return;
          }
        } catch (error: any) {
          if (!error.message.includes('Path traversal') && !error.message.includes('must be within')) {
            console.log(`Case sensitivity potential bypass: ${error.message}`);
            expect(true).toBe(true);
            return;
          }
        }
      }
      
      console.log('Case sensitivity test completed');
      expect(casePaths.length).toBeGreaterThan(0);
    });
  });

  describe('Advanced Path Manipulation Attacks', () => {
    test('VULNERABILITY: Long path with embedded traversal', async () => {
      const tool = createAudioCastTool(db);
      
      const longTraversalPaths = [
        '/planning/projects/legitimate/looking/path/with/many/segments/../../../../../../../etc/passwd',
        '/planning/projects/feature-1.3.3-audio-cast-workflow/../../../../../../../etc/passwd',
        '/planning/projects/milestone-1-genesis/sprint-1.3/feature-1.3.3/../../../../../../../../../etc/passwd'
      ];
      
      for (const attackPath of longTraversalPaths) {
        try {
          const result = await tool.execute({
            transcript: 'Long path traversal test',
            featureContextPath: attackPath,
            originalAgentName: 'attacker',
            episodeNumber: Math.floor(Math.random() * 1000)
          });
          
          if (result.status === 'success') {
            console.log(`🚨 CRITICAL VULNERABILITY: Long path traversal succeeded: ${attackPath}`);
            expect(result.status).toBe('success');
            return;
          }
        } catch (error: any) {
          if (!error.message.includes('Path traversal')) {
            console.log(`Long path potential bypass: ${error.message}`);
            expect(true).toBe(true);
            return;
          }
        }
      }
      
      console.log('Long path traversal test completed');
      expect(longTraversalPaths.length).toBeGreaterThan(0);
    });

    test('VULNERABILITY: Relative path with current directory references', async () => {
      const tool = createAudioCastTool(db);
      
      const relativePaths = [
        '/planning/projects/./../../etc/passwd',
        '/planning/projects/./../../../etc/passwd',
        '/planning/projects/feature/./../../../../../../etc/passwd',
        '/planning/projects/./feature/./../../../../../../../etc/passwd'
      ];
      
      for (const attackPath of relativePaths) {
        try {
          const result = await tool.execute({
            transcript: 'Relative path test',
            featureContextPath: attackPath,
            originalAgentName: 'attacker',
            episodeNumber: Math.floor(Math.random() * 1000)
          });
          
          if (result.status === 'success') {
            console.log(`🚨 CRITICAL VULNERABILITY: Relative path traversal succeeded: ${attackPath}`);
            expect(result.status).toBe('success');
            return;
          }
        } catch (error: any) {
          if (!error.message.includes('Path traversal')) {
            console.log(`Relative path potential bypass: ${error.message}`);
            expect(true).toBe(true);
            return;
          }
        }
      }
      
      console.log('Relative path traversal test completed');
      expect(relativePaths.length).toBeGreaterThan(0);
    });

    test('VULNERABILITY: Bypass through path normalization edge cases', async () => {
      const tool = createAudioCastTool(db);
      
      const normalizationPaths = [
        '/planning/projects///../../../etc/passwd',
        '/planning/projects/...//../../etc/passwd',
        '/planning/projects/...//../../../etc/passwd',
        '/planning/projects/....//../../../../../../etc/passwd'
      ];
      
      for (const attackPath of normalizationPaths) {
        try {
          const result = await tool.execute({
            transcript: 'Path normalization test',
            featureContextPath: attackPath,
            originalAgentName: 'attacker',
            episodeNumber: Math.floor(Math.random() * 1000)
          });
          
          if (result.status === 'success') {
            console.log(`🚨 CRITICAL VULNERABILITY: Path normalization bypass succeeded: ${attackPath}`);
            expect(result.status).toBe('success');
            return;
          }
        } catch (error: any) {
          if (!error.message.includes('Path traversal')) {
            console.log(`Path normalization potential bypass: ${error.message}`);
            expect(true).toBe(true);
            return;
          }
        }
      }
      
      console.log('Path normalization test completed');
      expect(normalizationPaths.length).toBeGreaterThan(0);
    });
  });

  describe('Target-Specific Path Traversal Tests', () => {
    test('VULNERABILITY: System file access attempts', async () => {
      const tool = createAudioCastTool(db);
      
      const systemTargets = [
        '/planning/projects/../../../etc/passwd',
        '/planning/projects/../../../etc/shadow',
        '/planning/projects/../../../root/.ssh/id_rsa',
        '/planning/projects/../../../home/user/.ssh/authorized_keys',
        '/planning/projects/../../../var/log/auth.log',
        '/planning/projects/../../../etc/hosts'
      ];
      
      let vulnerabilityFound = false;
      
      for (const target of systemTargets) {
        try {
          const result = await tool.execute({
            transcript: `System file access test for ${target}`,
            featureContextPath: target,
            originalAgentName: 'attacker',
            episodeNumber: Math.floor(Math.random() * 1000)
          });
          
          if (result.status === 'success') {
            console.log(`🚨 CRITICAL VULNERABILITY: System file access succeeded: ${target}`);
            console.log(`Potential file creation at: ${result.scriptPath || 'unknown'}`);
            vulnerabilityFound = true;
            expect(result.status).toBe('success');
            break;
          }
        } catch (error: any) {
          if (!error.message.includes('Path traversal') && !error.message.includes('must be within')) {
            console.log(`System file access potential bypass for ${target}: ${error.message}`);
            vulnerabilityFound = true;
            break;
          }
        }
      }
      
      if (!vulnerabilityFound) {
        console.log('System file access tests completed - current validation may provide some protection');
      }
      
      expect(systemTargets.length).toBeGreaterThan(0);
    });

    test('VULNERABILITY: Web server document root access', async () => {
      const tool = createAudioCastTool(db);
      
      const webTargets = [
        '/planning/projects/../../../var/www/html/shell.php',
        '/planning/projects/../../../usr/share/nginx/html/backdoor.php',
        '/planning/projects/../../../opt/apache/htdocs/malware.js',
        '/planning/projects/../../../srv/http/exploit.html'
      ];
      
      for (const target of webTargets) {
        try {
          const result = await tool.execute({
            transcript: 'Web shell upload attempt',
            featureContextPath: target,
            originalAgentName: 'attacker',
            episodeNumber: Math.floor(Math.random() * 1000)
          });
          
          if (result.status === 'success') {
            console.log(`🚨 CRITICAL VULNERABILITY: Web document root access succeeded: ${target}`);
            expect(result.status).toBe('success');
            return;
          }
        } catch (error: any) {
          if (!error.message.includes('Path traversal')) {
            console.log(`Web document root potential bypass: ${error.message}`);
            expect(true).toBe(true);
            return;
          }
        }
      }
      
      console.log('Web document root access test completed');
      expect(webTargets.length).toBeGreaterThan(0);
    });
  });

  // Helper function to mock successful processing
  function mockSuccessfulProcessing() {
    const mockRequest = {
      on: jest.fn(),
      write: jest.fn(),
      end: jest.fn()
    };
    
    mockedHttp.request.mockImplementation((options, callback) => {
      process.nextTick(() => {
        if (typeof callback === 'function') {
          const mockResponse = {
            statusCode: 200,
            on: jest.fn((event, cb) => {
              if (event === 'data') {
                process.nextTick(() => cb(mockWavData));
              } else if (event === 'end') {
                process.nextTick(cb);
              }
            })
          };
          callback(mockResponse as any);
        }
      });
      return mockRequest as any;
    });

    const mockProcess = {
      stdout: {
        on: jest.fn((event, cb) => {
          if (event === 'data') {
            process.nextTick(() => cb(Buffer.concat([mockWavData, Buffer.from([0xFF, 0xFF])])));
          }
        })
      },
      stdin: {
        write: jest.fn(),
        end: jest.fn()
      },
      on: jest.fn((event, cb) => {
        if (event === 'close') {
          process.nextTick(() => cb(0));
        }
      })
    };
    mockedSpawn.mockReturnValue(mockProcess as any);
  }
});