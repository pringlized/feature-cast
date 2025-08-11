// Integration tests for audio cast generation tool

import { describe, test, expect, jest, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { spawn } from 'child_process';
import http from 'http';
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../../src/database/init';
import { AudioCastOperations } from '../../src/database/operations';
import { createAudioCastTool, checkFFmpegAvailable, checkTTSAvailable } from '../../src/tools/generate-audio-cast';
import { 
  testTranscripts, 
  testFeaturePaths, 
  testEpisodeNumbers,
  testAgentNames,
  mockWavData,
  mockProcessedWavData 
} from '../fixtures/audio-cast-test-data';

// Mock HTTP module for TTS service
jest.mock('http');
const mockedHttp = http as jest.Mocked<typeof http>;

// Mock child_process for ffmpeg
jest.mock('child_process');
const mockedSpawn = spawn as jest.MockedFunction<typeof spawn>;

describe('Audio Cast Tool Integration Tests', () => {
  let db: Database.Database;
  let audioCastOps: AudioCastOperations;
  let audioCastTool: any;
  let testDir: string;
  let mockTTSServer: any;

  beforeAll(async () => {
    // Set up test environment variables
    process.env.TTS_SERVER_URL = 'http://localhost:10200/api/tts';
    process.env.MAX_TRANSCRIPT_LENGTH = '10000';
    process.env.TTS_TIMEOUT_MS = '1000'; // Short timeout for tests
    process.env.FFMPEG_TIMEOUT_MS = '1000';
    
    // Create test database
    testDir = path.join(__dirname, `test-audio-cast-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    
    const dbPath = path.join(testDir, 'test.db');
    db = initializeDatabase(dbPath);
    audioCastOps = new AudioCastOperations(db);
    audioCastTool = createAudioCastTool(db);
  });

  afterAll(async () => {
    // Clean up
    if (db) db.close();
    if (testDir) {
      await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Health Checks', () => {
    test('should detect when ffmpeg is available', async () => {
      const mockProcess = {
        on: jest.fn((event, callback) => {
          if (event === 'close') callback(0);
        })
      };
      mockedSpawn.mockReturnValue(mockProcess as any);

      const available = await checkFFmpegAvailable();
      expect(available).toBe(true);
      expect(mockedSpawn).toHaveBeenCalledWith('ffmpeg', ['-version']);
    });

    test('should detect when ffmpeg is not available', async () => {
      const mockProcess = {
        on: jest.fn((event, callback) => {
          if (event === 'error') callback(new Error('Command not found'));
        })
      };
      mockedSpawn.mockReturnValue(mockProcess as any);

      const available = await checkFFmpegAvailable();
      expect(available).toBe(false);
    });

    test('should detect when TTS service is available', async () => {
      const mockRequest = {
        on: jest.fn(),
        end: jest.fn()
      };
      const mockResponse = {
        statusCode: 200
      };
      
      mockedHttp.request = jest.fn((options, callback) => {
        if (callback) callback(mockResponse as any);
        return mockRequest as any;
      });

      const available = await checkTTSAvailable();
      expect(available).toBe(true);
    });

    test('should detect when TTS service is not available', async () => {
      const mockRequest = {
        on: jest.fn((event, callback) => {
          if (event === 'error') callback(new Error('ECONNREFUSED'));
        }),
        end: jest.fn()
      };
      
      mockedHttp.request = jest.fn(() => mockRequest as any);

      const available = await checkTTSAvailable();
      expect(available).toBe(false);
    });
  });

  describe('Input Validation', () => {
    test('should reject empty transcript', async () => {
      await expect(audioCastTool.execute({
        transcript: '',
        featureContextPath: testFeaturePaths.valid,
        originalAgentName: 'engineer',
        episodeNumber: 1
      })).rejects.toThrow('Transcript cannot be empty');
    });

    test('should reject transcript exceeding max length', async () => {
      await expect(audioCastTool.execute({
        transcript: testTranscripts.tooLong,
        featureContextPath: testFeaturePaths.valid,
        originalAgentName: 'engineer',
        episodeNumber: 1
      })).rejects.toThrow('Transcript exceeds maximum length');
    });

    test('should reject invalid episode numbers', async () => {
      for (const episodeNum of testEpisodeNumbers.invalid) {
        if (!isNaN(episodeNum) && isFinite(episodeNum)) {
          await expect(audioCastTool.execute({
            transcript: testTranscripts.short,
            featureContextPath: testFeaturePaths.valid,
            originalAgentName: 'engineer',
            episodeNumber: episodeNum
          })).rejects.toThrow('Episode number must be 1 or greater');
        }
      }
    });

    test('should reject path traversal attempts', async () => {
      await expect(audioCastTool.execute({
        transcript: testTranscripts.short,
        featureContextPath: testFeaturePaths.invalidTraversal,
        originalAgentName: 'engineer',
        episodeNumber: 1
      })).rejects.toThrow('Path traversal detected');
    });

    test('should reject paths outside base directory', async () => {
      await expect(audioCastTool.execute({
        transcript: testTranscripts.short,
        featureContextPath: testFeaturePaths.outsideBase,
        originalAgentName: 'engineer',
        episodeNumber: 1
      })).rejects.toThrow('Feature context path must be within /planning/projects/');
    });
  });

  describe('Successful Audio Generation', () => {
    test('should generate audio cast successfully', async () => {
      // Mock successful TTS response
      const mockRequest = {
        on: jest.fn((event, callback) => {
          if (event === 'error') return;
        }),
        write: jest.fn(),
        end: jest.fn()
      };
      
      const mockResponse = {
        statusCode: 200,
        on: jest.fn((event, callback) => {
          if (event === 'data') callback(mockWavData);
          if (event === 'end') callback();
        })
      };
      
      mockedHttp.request = jest.fn((options, callback) => {
        setImmediate(() => callback?.(mockResponse as any));
        return mockRequest as any;
      });

      // Mock successful ffmpeg processing
      const mockFFmpeg = {
        stdin: {
          write: jest.fn(),
          end: jest.fn()
        },
        stdout: {
          on: jest.fn((event, callback) => {
            if (event === 'data') callback(mockProcessedWavData);
          })
        },
        on: jest.fn((event, callback) => {
          if (event === 'close') callback(0);
        })
      };
      
      mockedSpawn.mockReturnValue(mockFFmpeg as any);

      // Create test feature directory
      const featurePath = path.join(testDir, 'planning/projects/test-feature');
      await fs.mkdir(featurePath, { recursive: true });

      const result = await audioCastTool.execute({
        transcript: testTranscripts.medium,
        featureContextPath: featurePath,
        originalAgentName: 'engineer',
        episodeNumber: 1
      });

      expect(result.status).toBe('success');
      expect(result.scriptPath).toContain('.md');
      expect(result.audioPath).toContain('.wav');
      expect(result.message).toContain('successfully');

      // Verify database record
      const record = audioCastOps.getAudioCastByEpisode(featurePath, 1);
      expect(record).toBeDefined();
      expect(record?.source_agent_name).toBe('engineer');
      expect(record?.episode_number).toBe(1);

      // Verify files were created
      const scriptExists = await fs.access(result.scriptPath!).then(() => true).catch(() => false);
      const audioExists = await fs.access(result.audioPath!).then(() => true).catch(() => false);
      expect(scriptExists).toBe(true);
      expect(audioExists).toBe(true);

      // Verify script content
      const scriptContent = await fs.readFile(result.scriptPath!, 'utf-8');
      expect(scriptContent).toBe(testTranscripts.medium);
    });

    test('should reject duplicate episode numbers', async () => {
      // Set up mocks for first successful creation
      const mockRequest = {
        on: jest.fn(),
        write: jest.fn(),
        end: jest.fn()
      };
      
      const mockResponse = {
        statusCode: 200,
        on: jest.fn((event, callback) => {
          if (event === 'data') callback(mockWavData);
          if (event === 'end') callback();
        })
      };
      
      mockedHttp.request = jest.fn((options, callback) => {
        setImmediate(() => callback?.(mockResponse as any));
        return mockRequest as any;
      });

      const mockFFmpeg = {
        stdin: { write: jest.fn(), end: jest.fn() },
        stdout: { on: jest.fn((event, callback) => {
          if (event === 'data') callback(mockProcessedWavData);
        })},
        on: jest.fn((event, callback) => {
          if (event === 'close') callback(0);
        })
      };
      
      mockedSpawn.mockReturnValue(mockFFmpeg as any);

      const featurePath = path.join(testDir, 'planning/projects/test-duplicate');
      await fs.mkdir(featurePath, { recursive: true });

      // First creation should succeed
      await audioCastTool.execute({
        transcript: testTranscripts.short,
        featureContextPath: featurePath,
        originalAgentName: 'engineer',
        episodeNumber: 5
      });

      // Second creation with same episode should fail
      await expect(audioCastTool.execute({
        transcript: testTranscripts.short,
        featureContextPath: featurePath,
        originalAgentName: 'security-analyst',
        episodeNumber: 5
      })).rejects.toThrow('Episode 5 already exists for this feature');
    });
  });

  describe('Error Handling', () => {
    test('should handle TTS service errors gracefully', async () => {
      const mockRequest = {
        on: jest.fn((event, callback) => {
          if (event === 'error') callback(new Error('Connection failed'));
        }),
        write: jest.fn(),
        end: jest.fn()
      };
      
      mockedHttp.request = jest.fn(() => mockRequest as any);

      const featurePath = path.join(testDir, 'planning/projects/test-tts-error');
      await fs.mkdir(featurePath, { recursive: true });

      await expect(audioCastTool.execute({
        transcript: testTranscripts.short,
        featureContextPath: featurePath,
        originalAgentName: 'engineer',
        episodeNumber: 1
      })).rejects.toThrow('TTS service error');
    });

    test('should handle ffmpeg errors gracefully', async () => {
      // Mock successful TTS
      const mockRequest = {
        on: jest.fn(),
        write: jest.fn(),
        end: jest.fn()
      };
      
      const mockResponse = {
        statusCode: 200,
        on: jest.fn((event, callback) => {
          if (event === 'data') callback(mockWavData);
          if (event === 'end') callback();
        })
      };
      
      mockedHttp.request = jest.fn((options, callback) => {
        setImmediate(() => callback?.(mockResponse as any));
        return mockRequest as any;
      });

      // Mock ffmpeg failure
      const mockFFmpeg = {
        stdin: { write: jest.fn(), end: jest.fn() },
        stdout: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === 'close') callback(1); // Non-zero exit code
        })
      };
      
      mockedSpawn.mockReturnValue(mockFFmpeg as any);

      const featurePath = path.join(testDir, 'planning/projects/test-ffmpeg-error');
      await fs.mkdir(featurePath, { recursive: true });

      await expect(audioCastTool.execute({
        transcript: testTranscripts.short,
        featureContextPath: featurePath,
        originalAgentName: 'engineer',
        episodeNumber: 1
      })).rejects.toThrow('FFmpeg process exited with code 1');
    });

    test('should clean up files on database failure', async () => {
      // Mock successful TTS and ffmpeg
      const mockRequest = {
        on: jest.fn(),
        write: jest.fn(),
        end: jest.fn()
      };
      
      const mockResponse = {
        statusCode: 200,
        on: jest.fn((event, callback) => {
          if (event === 'data') callback(mockWavData);
          if (event === 'end') callback();
        })
      };
      
      mockedHttp.request = jest.fn((options, callback) => {
        setImmediate(() => callback?.(mockResponse as any));
        return mockRequest as any;
      });

      const mockFFmpeg = {
        stdin: { write: jest.fn(), end: jest.fn() },
        stdout: { on: jest.fn((event, callback) => {
          if (event === 'data') callback(mockProcessedWavData);
        })},
        on: jest.fn((event, callback) => {
          if (event === 'close') callback(0);
        })
      };
      
      mockedSpawn.mockReturnValue(mockFFmpeg as any);

      // Mock database failure
      const originalCreate = audioCastOps.createAudioCast;
      audioCastOps.createAudioCast = jest.fn(() => {
        throw new Error('Database write failed');
      });

      const featurePath = path.join(testDir, 'planning/projects/test-db-error');
      await fs.mkdir(featurePath, { recursive: true });

      await expect(audioCastTool.execute({
        transcript: testTranscripts.short,
        featureContextPath: featurePath,
        originalAgentName: 'engineer',
        episodeNumber: 1
      })).rejects.toThrow('Database write failed');

      // Restore original method
      audioCastOps.createAudioCast = originalCreate;
    });
  });

  describe('Concurrent Request Handling', () => {
    test('should reject concurrent requests', async () => {
      // Set up long-running first request
      let firstRequestResolve: any;
      const firstRequestPromise = new Promise(resolve => {
        firstRequestResolve = resolve;
      });

      const mockRequest = {
        on: jest.fn(),
        write: jest.fn(),
        end: jest.fn()
      };
      
      mockedHttp.request = jest.fn((options, callback) => {
        // Delay response for first request
        firstRequestPromise.then(() => {
          const mockResponse = {
            statusCode: 200,
            on: jest.fn((event, cb) => {
              if (event === 'data') cb(mockWavData);
              if (event === 'end') cb();
            })
          };
          callback?.(mockResponse as any);
        });
        return mockRequest as any;
      });

      const mockFFmpeg = {
        stdin: { write: jest.fn(), end: jest.fn() },
        stdout: { on: jest.fn((event, callback) => {
          if (event === 'data') callback(mockProcessedWavData);
        })},
        on: jest.fn((event, callback) => {
          if (event === 'close') callback(0);
        })
      };
      
      mockedSpawn.mockReturnValue(mockFFmpeg as any);

      const featurePath = path.join(testDir, 'planning/projects/test-concurrent');
      await fs.mkdir(featurePath, { recursive: true });

      // Start first request (won't complete immediately)
      const firstRequest = audioCastTool.execute({
        transcript: testTranscripts.short,
        featureContextPath: featurePath,
        originalAgentName: 'engineer',
        episodeNumber: 1
      });

      // Try second request immediately (should be rejected)
      await expect(audioCastTool.execute({
        transcript: testTranscripts.short,
        featureContextPath: featurePath,
        originalAgentName: 'security-analyst',
        episodeNumber: 2
      })).rejects.toThrow('Audio cast generation in progress');

      // Complete first request
      firstRequestResolve();
      await firstRequest;
    });
  });
});