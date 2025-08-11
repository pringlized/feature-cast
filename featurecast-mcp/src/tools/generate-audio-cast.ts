// Generate Audio Cast MCP Tool - Standalone version without database
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import http from 'http';

// Configuration constants with environment variable support
const MAX_TRANSCRIPT_LENGTH = parseInt(process.env.MAX_TRANSCRIPT_LENGTH || '10000');
const TTS_TIMEOUT_MS = parseInt(process.env.TTS_TIMEOUT_MS || '30000');
const FFMPEG_TIMEOUT_MS = parseInt(process.env.FFMPEG_TIMEOUT_MS || '60000');

// Get base project path from environment (must be called after dotenv loads)
function getBaseProjectPath(): string {
  const basePath = process.env.BASE_PROJECT_PATH;
  console.error('[DEBUG] getBaseProjectPath called, env value:', basePath);
  if (!basePath) {
    throw new Error('BASE_PROJECT_PATH environment variable is not set. Please check your .env file.');
  }
  return basePath;
}

// Per-feature locks to prevent concurrent processing
const processingLocks = new Map<string, boolean>();

function isFeatureProcessing(featurePath: string): boolean {
  return processingLocks.get(featurePath) || false;
}

function setFeatureProcessing(featurePath: string, state: boolean): void {
  if (state) {
    processingLocks.set(featurePath, true);
  } else {
    processingLocks.delete(featurePath);
  }
}

export interface GenerateAudioCastInput {
  transcript: string;
  featureContextPath: string;
  originalAgentName: string;
  episodeNumber: number;
}

export interface GenerateAudioCastOutput {
  status: 'success' | 'error';
  scriptPath?: string;
  audioPath?: string;
  message?: string;
  error?: string;
}

// Structured logging helper
function logEvent(level: 'info' | 'error' | 'warn', message: string, data?: any) {
  console.log(JSON.stringify({
    level,
    timestamp: new Date().toISOString(),
    message,
    tool: 'generate_audio_cast',
    ...data
  }));
}

// Validate feature context path to prevent path traversal
function validateFeatureContextPath(inputPath: string): void {
  // First decode any URL encoding (handles %2E%2E%2F, double encoding, etc)
  let decodedPath = inputPath;
  
  // Decode up to 3 levels to catch double/triple encoding
  for (let i = 0; i < 3; i++) {
    try {
      const decoded = decodeURIComponent(decodedPath);
      if (decoded === decodedPath) break; // No more encoding
      decodedPath = decoded;
    } catch {
      // If decoding fails, continue with current value
      break;
    }
  }
  
  // Get canonical base path
  const canonicalBase = path.resolve(getBaseProjectPath());
  
  // Resolve the path relative to the base directory
  const resolved = path.resolve(canonicalBase, decodedPath);
  
  // Verify resolved path starts with base directory (after canonicalization)
  if (!resolved.startsWith(canonicalBase)) {
    throw new Error('Path traversal detected - path escapes base directory');
  }
  
  // Additional check for any remaining traversal patterns after resolution
  if (resolved.includes('..')) {
    throw new Error('Path traversal patterns detected in resolved path');
  }
}

// Validate TTS URL to prevent SSRF
function validateTTSUrl(urlString: string): void {
  const url = new URL(urlString);
  
  // Whitelist of allowed hosts
  const ALLOWED_TTS_HOSTS = [
    'localhost',
    '127.0.0.1',
    'tts-service',  // Docker service name
    // Add production TTS hosts here as needed
  ];
  
  const ALLOWED_PROTOCOLS = ['http:', 'https:'];
  const ALLOWED_PORTS = ['5000', '10200', '443', '80', ''];
  
  if (!ALLOWED_PROTOCOLS.includes(url.protocol)) {
    throw new Error('Invalid TTS protocol - only HTTP/HTTPS allowed');
  }
  
  if (!ALLOWED_TTS_HOSTS.includes(url.hostname)) {
    throw new Error(`Invalid TTS host - ${url.hostname} not in whitelist`);
  }
  
  if (url.port && !ALLOWED_PORTS.includes(url.port)) {
    throw new Error(`Invalid TTS port - ${url.port} not allowed`);
  }
  
  // Reject URLs with credentials
  if (url.username || url.password) {
    throw new Error('TTS URL cannot contain credentials');
  }
}

// Call TTS service to generate audio
async function callTTSService(transcript: string): Promise<Buffer> {
  const ttsUrl = process.env.TTS_SERVER_URL;
  if (!ttsUrl) {
    throw new Error('TTS_SERVER_URL environment variable is not set');
  }

  // Validate URL to prevent SSRF
  validateTTSUrl(ttsUrl);

  const voice = process.env.TTS_VOICE || 'en_US-hfc_female-medium';

  // Parse URL to get components and add voice parameter
  const url = new URL(ttsUrl);
  url.searchParams.set('voice', voice);
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('TTS service request timed out'));
    }, TTS_TIMEOUT_MS);

    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': Buffer.byteLength(transcript)
      }
    };

    const req = http.request(options, (res) => {
      if (res.statusCode !== 200) {
        clearTimeout(timeout);
        reject(new Error(`TTS service returned status ${res.statusCode}`));
        return;
      }

      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        clearTimeout(timeout);
        const audioBuffer = Buffer.concat(chunks);
        if (audioBuffer.length === 0) {
          reject(new Error('TTS service returned empty response'));
        } else {
          resolve(audioBuffer);
        }
      });
    });

    req.on('error', (err) => {
      clearTimeout(timeout);
      if (err.message.includes('ECONNREFUSED')) {
        reject(new Error('TTS service connection refused - service may be down'));
      } else {
        reject(new Error(`TTS service error: ${err.message}`));
      }
    });

    req.write(transcript);
    req.end();
  });
}

// Process audio with ffmpeg to add pre-roll and post-roll silence
async function processWithFFmpeg(audioBuffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ffmpeg.kill('SIGKILL');
      reject(new Error('FFmpeg processing timed out'));
    }, FFMPEG_TIMEOUT_MS);

    const chunks: Buffer[] = [];
    
    const prerollMs = parseInt(process.env.AUDIO_PREROLL_MS || '750');
    const postrollMs = parseInt(process.env.AUDIO_POSTROLL_MS || '1000');
    
    // Add pre-roll silence with adelay and post-roll silence with apad
    const ffmpeg = spawn('ffmpeg', [
      '-i', 'pipe:0',
      '-af', `adelay=${prerollMs}|${prerollMs},apad=pad_dur=${postrollMs}ms`,
      '-f', 'wav',
      'pipe:1'
    ]);

    ffmpeg.stdout.on('data', (chunk) => chunks.push(chunk));
    
    ffmpeg.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`FFmpeg process exited with code ${code}`));
      } else {
        resolve(Buffer.concat(chunks));
      }
    });

    ffmpeg.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`FFmpeg process error: ${err.message}`));
    });

    ffmpeg.stdin.write(audioBuffer);
    ffmpeg.stdin.end();
  });
}

// Check if ffmpeg is available
export async function checkFFmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const ffmpeg = spawn('ffmpeg', ['-version']);
    ffmpeg.on('close', (code) => {
      resolve(code === 0);
    });
    ffmpeg.on('error', () => {
      resolve(false);
    });
  });
}

// Check if TTS service is available
export async function checkTTSAvailable(): Promise<boolean> {
  const ttsUrl = process.env.TTS_SERVER_URL;
  if (!ttsUrl) return false;

  try {
    const url = new URL(ttsUrl);
    return new Promise((resolve) => {
      const options = {
        hostname: url.hostname,
        port: url.port || 80,
        path: '/',  // Just check if service responds
        method: 'GET',
        timeout: 5000
      };

      const req = http.request(options, (res) => {
        // Any response means service is up
        resolve(true);
      });

      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });

      req.end();
    });
  } catch {
    return false;
  }
}

// Check if episode already exists (file-based check instead of database)
async function checkEpisodeExists(castDir: string, episodeNumber: number): Promise<boolean> {
  try {
    const files = await fs.readdir(castDir);
    const episodePrefix = episodeNumber.toString().padStart(2, '0');
    // Check if any file starts with the episode number
    return files.some(file => file.startsWith(`${episodePrefix}-`));
  } catch {
    // Directory doesn't exist or error reading it
    return false;
  }
}

export function createAudioCastTool() {
  return {
    name: 'generate_audio_cast',
    description: 'Convert a text transcript into an audio cast with TTS and save both artifacts',
    inputSchema: {
      type: 'object',
      properties: {
        transcript: {
          type: 'string',
          description: 'The full text content of the debrief script.'
        },
        featureContextPath: {
          type: 'string',
          description: 'The root directory path for the feature.'
        },
        originalAgentName: {
          type: 'string',
          description: 'The name of the source agent.'
        },
        episodeNumber: {
          type: 'integer',
          description: 'The sequential episode number.'
        }
      },
      required: ['transcript', 'featureContextPath', 'originalAgentName', 'episodeNumber']
    },
    execute: async (input: GenerateAudioCastInput): Promise<GenerateAudioCastOutput> => {
      const startTime = Date.now();
      
      // Check if this feature is already processing (per-feature locking)
      if (isFeatureProcessing(input.featureContextPath)) {
        logEvent('warn', 'Concurrent request rejected for feature', { 
          reason: 'feature_already_processing',
          feature: input.featureContextPath 
        });
        throw new Error(`Audio cast generation already in progress for this feature. Please try again later.`);
      }

      setFeatureProcessing(input.featureContextPath, true);
      let scriptPath: string | undefined;
      let audioPath: string | undefined;

      try {
        // Validate inputs
        if (!input.transcript || input.transcript.trim().length === 0) {
          throw new Error('Transcript cannot be empty');
        }

        if (input.transcript.length > MAX_TRANSCRIPT_LENGTH) {
          throw new Error(`Transcript exceeds maximum length of ${MAX_TRANSCRIPT_LENGTH} characters`);
        }

        if (input.episodeNumber < 1) {
          throw new Error('Episode number must be 1 or greater');
        }

        // Validate feature context path
        validateFeatureContextPath(input.featureContextPath);

        // Check directory structure - audio_casts instead of casts
        const basePath = getBaseProjectPath();
        const castDir = path.join(
          basePath,
          input.featureContextPath,
          'audio_casts'
        );
        
        // Check if directory exists - do NOT create it
        try {
          await fs.access(castDir, fs.constants.F_OK);
        } catch (error) {
          throw new Error(`Audio cast directory does not exist: ${castDir}. Please create the directory structure first.`);
        }

        // Check if episode already exists (file-based check)
        const episodeExists = await checkEpisodeExists(castDir, input.episodeNumber);
        if (episodeExists) {
          throw new Error(`Episode ${input.episodeNumber} already exists for this feature`);
        }
        
        // Generate timestamp for filenames
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const episodePrefix = input.episodeNumber.toString().padStart(2, '0');
        
        // Define file paths with naming convention: XX-<agent>_audio-cast_timestamp.ext
        const baseFileName = `${episodePrefix}-${input.originalAgentName}_audio-cast_${timestamp}`;
        scriptPath = path.join(castDir, `${baseFileName}.md`);
        audioPath = path.join(castDir, `${baseFileName}.wav`);

        // Write transcript to file (atomic operation)
        const tempScriptPath = scriptPath + '.tmp';
        await fs.writeFile(tempScriptPath, input.transcript, 'utf-8');
        await fs.rename(tempScriptPath, scriptPath);

        logEvent('info', 'Transcript saved', { path: scriptPath });

        // Call TTS service
        logEvent('info', 'Calling TTS service');
        const rawAudio = await callTTSService(input.transcript);
        
        // Process with ffmpeg
        logEvent('info', 'Processing audio with ffmpeg');
        const processedAudio = await processWithFFmpeg(rawAudio);

        // Write audio file (atomic operation)
        const tempAudioPath = audioPath + '.tmp';
        await fs.writeFile(tempAudioPath, processedAudio);
        await fs.rename(tempAudioPath, audioPath);

        logEvent('info', 'Audio saved', { path: audioPath });

        // Calculate processing duration
        const processingDuration = Date.now() - startTime;

        logEvent('info', 'Audio cast created successfully', {
          event: 'audio_cast_success',
          duration_ms: processingDuration,
          cast_id: randomUUID()
        });

        return {
          status: 'success',
          scriptPath: scriptPath,
          audioPath: audioPath,
          message: `Audio cast generated successfully in ${processingDuration}ms`
        };

      } catch (error: any) {
        logEvent('error', 'Audio cast generation failed', {
          error: error.message,
          duration_ms: Date.now() - startTime
        });

        // Cleanup on failure
        if (scriptPath) {
          await fs.unlink(scriptPath).catch(e => 
            logEvent('error', 'Cleanup failed for script', { path: scriptPath, error: e.message })
          );
        }
        if (audioPath) {
          await fs.unlink(audioPath).catch(e => 
            logEvent('error', 'Cleanup failed for audio', { path: audioPath, error: e.message })
          );
        }

        throw new Error(`Failed to generate audio cast: ${error.message}`);
      } finally {
        setFeatureProcessing(input.featureContextPath, false);
      }
    }
  };
}