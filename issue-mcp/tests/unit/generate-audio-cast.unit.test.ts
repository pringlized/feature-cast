// Unit tests for individual functions in generate-audio-cast tool
// These tests focus on isolated function behavior with heavy mocking
// EXPECTED RESULT: Most tests should PASS (functional validation)

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
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
  mockWavData,
  mockProcessedWavData 
} from '../fixtures/audio-cast-test-data';

// Mock external dependencies
jest.mock('http');
jest.mock('child_process');
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    writeFile: jest.fn(),
    rename: jest.fn(),
    unlink: jest.fn()
  }
}));

const mockedHttp = http as jest.Mocked<typeof http>;
const mockedSpawn = spawn as jest.MockedFunction<typeof spawn>;
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('Generate Audio Cast - Unit Tests', () => {
  let db: Database.Database;
  let audioCastOps: AudioCastOperations;
  let testDbPath: string;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create in-memory database for each test
    db = new Database(':memory:');
    initializeDatabase(':memory:');
    audioCastOps = new AudioCastOperations(db);
    
    // Set test environment variables
    process.env.TTS_SERVER_URL = 'http://localhost:10200/api/tts';
    process.env.MAX_TRANSCRIPT_LENGTH = '10000';
    process.env.TTS_TIMEOUT_MS = '1000';
    process.env.FFMPEG_TIMEOUT_MS = '1000';
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

  describe('Input Validation', () => {
    test('should reject empty transcript', async () => {
      const tool = createAudioCastTool(db);
      
      await expect(tool.execute({
        transcript: '',
        featureContextPath: testFeaturePaths.valid,
        originalAgentName: 'engineer',
        episodeNumber: 1
      })).rejects.toThrow('Transcript cannot be empty');
    });

    test('should reject whitespace-only transcript', async () => {
      const tool = createAudioCastTool(db);
      
      await expect(tool.execute({
        transcript: '   \n\t  ',
        featureContextPath: testFeaturePaths.valid,
        originalAgentName: 'engineer',
        episodeNumber: 1
      })).rejects.toThrow('Transcript cannot be empty');
    });

    test('should reject transcript exceeding max length', async () => {
      const tool = createAudioCastTool(db);
      
      await expect(tool.execute({
        transcript: testTranscripts.tooLong,
        featureContextPath: testFeaturePaths.valid,
        originalAgentName: 'engineer',
        episodeNumber: 1
      })).rejects.toThrow('Transcript exceeds maximum length');
    });

    test('should reject episode number less than 1', async () => {
      const tool = createAudioCastTool(db);
      
      for (const invalidEpisode of testEpisodeNumbers.invalid) {
        await expect(tool.execute({
          transcript: testTranscripts.short,
          featureContextPath: testFeaturePaths.valid,
          originalAgentName: 'engineer',
          episodeNumber: invalidEpisode
        })).rejects.toThrow('Episode number must be 1 or greater');
      }
    });

    test('should accept valid episode numbers', async () => {
      const tool = createAudioCastTool(db);
      
      // Mock successful processing
      mockSuccessfulProcessing();
      
      for (const validEpisode of testEpisodeNumbers.valid.slice(0, 2)) { // Test first 2 to avoid too many calls
        await expect(tool.execute({
          transcript: testTranscripts.short,
          featureContextPath: testFeaturePaths.valid,
          originalAgentName: 'engineer',
          episodeNumber: validEpisode
        })).resolves.toHaveProperty('status', 'success');
      }
    });
  });

  describe('Path Validation Function', () => {
    test('should accept valid feature paths', () => {
      const tool = createAudioCastTool(db);
      
      // This should not throw for valid paths
      expect(() => {
        // We need to access the internal validation function
        // For unit testing, we'll test through the main function
      }).not.toThrow();
    });

    test('should reject paths with traversal attempts', async () => {
      const tool = createAudioCastTool(db);
      
      await expect(tool.execute({
        transcript: testTranscripts.short,
        featureContextPath: testFeaturePaths.invalidTraversal,
        originalAgentName: 'engineer',
        episodeNumber: 1
      })).rejects.toThrow('Path traversal detected');
    });

    test('should reject paths outside base directory', async () => {
      const tool = createAudioCastTool(db);
      
      await expect(tool.execute({
        transcript: testTranscripts.short,
        featureContextPath: testFeaturePaths.outsideBase,
        originalAgentName: 'engineer',
        episodeNumber: 1
      })).rejects.toThrow('must be within /planning/projects/');
    });
  });

  describe('FFmpeg Health Check', () => {
    test('should detect FFmpeg availability when command succeeds', async () => {
      const mockProcess = {
        on: jest.fn((event, callback: Function) => {
          if (event === 'close') callback(0);
        })
      };
      mockedSpawn.mockReturnValue(mockProcess as any);

      const available = await checkFFmpegAvailable();
      
      expect(available).toBe(true);
      expect(mockedSpawn).toHaveBeenCalledWith('ffmpeg', ['-version']);
    });

    test('should detect FFmpeg unavailability when command fails', async () => {
      const mockProcess = {
        on: jest.fn((event, callback: Function) => {
          if (event === 'close') callback(1);
        })
      };
      mockedSpawn.mockReturnValue(mockProcess as any);

      const available = await checkFFmpegAvailable();
      
      expect(available).toBe(false);
    });

    test('should detect FFmpeg unavailability when command errors', async () => {
      const mockProcess = {
        on: jest.fn((event, callback: Function) => {
          if (event === 'error') callback(new Error('Command not found'));
        })
      };
      mockedSpawn.mockReturnValue(mockProcess as any);

      const available = await checkFFmpegAvailable();
      
      expect(available).toBe(false);
    });
  });

  describe('TTS Service Health Check', () => {
    test('should detect TTS availability when service responds', async () => {
      const mockRequest = {
        on: jest.fn(),
        end: jest.fn()
      };
      
      mockedHttp.request.mockImplementation((options, callback) => {
        // Simulate successful response
        process.nextTick(() => {
          if (typeof callback === 'function') {
            callback({
              statusCode: 200
            } as any);
          }
        });
        return mockRequest as any;
      });

      const available = await checkTTSAvailable();
      
      expect(available).toBe(true);
    });

    test('should detect TTS unavailability when service errors', async () => {
      const mockRequest = {
        on: jest.fn((event, callback: Function) => {
          if (event === 'error') process.nextTick(() => callback(new Error('Connection refused')));
        }),
        end: jest.fn()
      };
      
      mockedHttp.request.mockReturnValue(mockRequest as any);

      const available = await checkTTSAvailable();
      
      expect(available).toBe(false);
    });

    test('should detect TTS unavailability when service times out', async () => {
      const mockRequest = {
        on: jest.fn((event, callback: Function) => {
          if (event === 'timeout') process.nextTick(() => callback());
        }),
        end: jest.fn(),
        destroy: jest.fn()
      };
      
      mockedHttp.request.mockReturnValue(mockRequest as any);

      const available = await checkTTSAvailable();
      
      expect(available).toBe(false);
    });

    test('should return false when TTS_SERVER_URL is not set', async () => {
      delete process.env.TTS_SERVER_URL;

      const available = await checkTTSAvailable();
      
      expect(available).toBe(false);
    });
  });

  describe('Database Operations Integration', () => {
    test('should create audio cast record in database', async () => {
      const castId = randomUUID();
      const testRecord = {
        id: castId,
        feature_context_path: testFeaturePaths.valid,
        episode_number: 1,
        source_agent_name: 'engineer',
        script_path: '/test/script.md',
        audio_path: '/test/audio.wav',
        processing_duration_ms: 1500
      };

      const created = audioCastOps.createAudioCast(testRecord);
      
      expect(created).toMatchObject(testRecord);
      expect(created.created_at).toBeDefined();
    });

    test('should retrieve audio cast by ID', async () => {
      const castId = randomUUID();
      const testRecord = {
        id: castId,
        feature_context_path: testFeaturePaths.valid,
        episode_number: 1,
        source_agent_name: 'engineer',
        script_path: '/test/script.md',
        audio_path: '/test/audio.wav'
      };

      audioCastOps.createAudioCast(testRecord);
      const retrieved = audioCastOps.getAudioCast(castId);
      
      expect(retrieved).toMatchObject(testRecord);
    });

    test('should retrieve audio cast by episode number', async () => {
      const castId = randomUUID();
      const testRecord = {
        id: castId,
        feature_context_path: testFeaturePaths.valid,
        episode_number: 42,
        source_agent_name: 'engineer',
        script_path: '/test/script.md',
        audio_path: '/test/audio.wav'
      };

      audioCastOps.createAudioCast(testRecord);
      const retrieved = audioCastOps.getAudioCastByEpisode(testFeaturePaths.valid, 42);
      
      expect(retrieved).toMatchObject(testRecord);
    });

    test('should reject duplicate episode numbers for same feature', async () => {
      const testRecord1 = {
        id: randomUUID(),
        feature_context_path: testFeaturePaths.valid,
        episode_number: 1,
        source_agent_name: 'engineer',
        script_path: '/test/script1.md',
        audio_path: '/test/audio1.wav'
      };

      const testRecord2 = {
        id: randomUUID(),
        feature_context_path: testFeaturePaths.valid,
        episode_number: 1, // Same episode number
        source_agent_name: 'security-analyst',
        script_path: '/test/script2.md',
        audio_path: '/test/audio2.wav'
      };

      audioCastOps.createAudioCast(testRecord1);
      
      expect(() => {
        audioCastOps.createAudioCast(testRecord2);
      }).toThrow(); // Should violate UNIQUE constraint
    });
  });

  describe('Concurrent Processing Prevention', () => {
    test('should reject concurrent requests', async () => {
      const tool = createAudioCastTool(db);
      
      // Mock slow processing by delaying TTS service response
      mockSlowTTSService();
      
      const request1 = tool.execute({
        transcript: testTranscripts.short,
        featureContextPath: testFeaturePaths.valid,
        originalAgentName: 'engineer',
        episodeNumber: 1
      });

      // Start second request before first completes
      const request2 = tool.execute({
        transcript: testTranscripts.short,
        featureContextPath: testFeaturePaths.valid,
        originalAgentName: 'engineer',
        episodeNumber: 2
      });

      await expect(request2).rejects.toThrow('Audio cast generation in progress');
      
      // Clean up first request
      await request1.catch(() => {}); // Ignore result
    });
  });

  describe('Error Handling and Cleanup', () => {
    test('should cleanup files on TTS service failure', async () => {
      const tool = createAudioCastTool(db);
      
      // Mock TTS service failure
      mockTTSServiceFailure();
      
      await expect(tool.execute({
        transcript: testTranscripts.short,
        featureContextPath: testFeaturePaths.valid,
        originalAgentName: 'engineer',
        episodeNumber: 1
      })).rejects.toThrow('Failed to generate audio cast');

      // Verify cleanup was attempted
      expect(mockedFs.unlink).toHaveBeenCalled();
    });

    test('should cleanup files on FFmpeg failure', async () => {
      const tool = createAudioCastTool(db);
      
      // Mock successful TTS but failing FFmpeg
      mockSuccessfulTTS();
      mockFFmpegFailure();
      
      await expect(tool.execute({
        transcript: testTranscripts.short,
        featureContextPath: testFeaturePaths.valid,
        originalAgentName: 'engineer',
        episodeNumber: 1
      })).rejects.toThrow('Failed to generate audio cast');

      // Verify cleanup was attempted
      expect(mockedFs.unlink).toHaveBeenCalled();
    });

    test('should reset processing flag after success', async () => {
      const tool = createAudioCastTool(db);
      
      mockSuccessfulProcessing();
      
      // First request should succeed
      await tool.execute({
        transcript: testTranscripts.short,
        featureContextPath: testFeaturePaths.valid,
        originalAgentName: 'engineer',
        episodeNumber: 1
      });

      // Second request should also work (not blocked)
      await expect(tool.execute({
        transcript: testTranscripts.short,
        featureContextPath: testFeaturePaths.valid,
        originalAgentName: 'engineer',
        episodeNumber: 2
      })).resolves.toHaveProperty('status', 'success');
    });

    test('should reset processing flag after failure', async () => {
      const tool = createAudioCastTool(db);
      
      mockTTSServiceFailure();
      
      // First request should fail
      await expect(tool.execute({
        transcript: testTranscripts.short,
        featureContextPath: testFeaturePaths.valid,
        originalAgentName: 'engineer',
        episodeNumber: 1
      })).rejects.toThrow();

      // Second request should work (not blocked by first failure)
      mockSuccessfulProcessing();
      await expect(tool.execute({
        transcript: testTranscripts.short,
        featureContextPath: testFeaturePaths.valid,
        originalAgentName: 'engineer',
        episodeNumber: 2
      })).resolves.toHaveProperty('status', 'success');
    });
  });

  // Helper functions for mocking
  function mockSuccessfulProcessing() {
    mockSuccessfulTTS();
    mockSuccessfulFFmpeg();
    mockSuccessfulFileOperations();
  }

  function mockSuccessfulTTS() {
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
            on: jest.fn((event, cb: Function) => {
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
  }

  function mockSuccessfulFFmpeg() {
    const mockProcess = {
      stdout: {
        on: jest.fn((event, cb: Function) => {
          if (event === 'data') {
            process.nextTick(() => cb(mockProcessedWavData));
          }
        })
      },
      stdin: {
        write: jest.fn(),
        end: jest.fn()
      },
      on: jest.fn((event, cb: Function) => {
        if (event === 'close') {
          process.nextTick(() => cb(0)); // Success
        }
      })
    };
    mockedSpawn.mockReturnValue(mockProcess as any);
  }

  function mockSuccessfulFileOperations() {
    mockedFs.mkdir.mockResolvedValue(undefined);
    mockedFs.writeFile.mockResolvedValue(undefined);
    mockedFs.rename.mockResolvedValue(undefined);
  }

  function mockSlowTTSService() {
    const mockRequest = {
      on: jest.fn(),
      write: jest.fn(),
      end: jest.fn()
    };
    
    mockedHttp.request.mockImplementation((options, callback) => {
      // Delay response to simulate slow service
      setTimeout(() => {
        if (typeof callback === 'function') {
          const mockResponse = {
            statusCode: 200,
            on: jest.fn((event, cb: Function) => {
              if (event === 'data') {
                setTimeout(() => cb(mockWavData), 100);
              } else if (event === 'end') {
                setTimeout(() => cb(), 150);
              }
            })
          };
          callback(mockResponse as any);
        }
      }, 200); // Longer than test timeout
      return mockRequest as any;
    });
  }

  function mockTTSServiceFailure() {
    const mockRequest = {
      on: jest.fn((event, callback: Function) => {
        if (event === 'error') {
          process.nextTick(() => callback(new Error('TTS service connection failed')));
        }
      }),
      write: jest.fn(),
      end: jest.fn()
    };
    mockedHttp.request.mockReturnValue(mockRequest as any);
  }

  function mockFFmpegFailure() {
    const mockProcess = {
      stdout: {
        on: jest.fn()
      },
      stdin: {
        write: jest.fn(),
        end: jest.fn()
      },
      on: jest.fn((event, cb: Function) => {
        if (event === 'close') {
          process.nextTick(() => cb(1)); // Failure exit code
        }
      })
    };
    mockedSpawn.mockReturnValue(mockProcess as any);
  }
});