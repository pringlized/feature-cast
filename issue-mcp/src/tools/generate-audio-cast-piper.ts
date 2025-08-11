// Generate Audio Cast MCP Tool - Updated for Piper/Wyoming TTS
import { Database } from '../database/types';
import { AudioCastOperations } from '../database/operations';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import http from 'http';

// Configuration constants with environment variable support
const MAX_TRANSCRIPT_LENGTH = parseInt(process.env.MAX_TRANSCRIPT_LENGTH || '20000');
const TTS_TIMEOUT_MS = parseInt(process.env.TTS_TIMEOUT_MS || '60000');
const FFMPEG_TIMEOUT_MS = parseInt(process.env.FFMPEG_TIMEOUT_MS || '60000');
const AUDIO_PREROLL_MS = parseInt(process.env.AUDIO_PREROLL_MS || '750');
const AUDIO_POSTROLL_MS = parseInt(process.env.AUDIO_POSTROLL_MS || '500');
const BASE_PROJECT_PATH = '/planning/projects/';
const TTS_VOICE = process.env.TTS_VOICE || 'en_US-hfc_female-medium';

// Lock for sequential processing
let isProcessing = false;

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

// Call Piper TTS service to generate audio
async function callPiperTTS(transcript: string): Promise<Buffer> {
  const ttsUrl = process.env.TTS_SERVER_URL || 'http://localhost:5000/api/text-to-speech';
  
  // Parse URL to get components
  const url = new URL(ttsUrl);
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('TTS service request timed out'));
    }, TTS_TIMEOUT_MS);

    // Build query parameters for Piper
    const params = new URLSearchParams({
      voice: TTS_VOICE
    });

    const options = {
      hostname: url.hostname,
      port: url.port || 5000,
      path: `${url.pathname}?${params.toString()}`,
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'Content-Length': Buffer.byteLength(transcript)
      }
    };

    const req = http.request(options, (res) => {
      if (res.statusCode !== 200) {
        clearTimeout(timeout);
        reject(new Error(`Piper TTS service returned status ${res.statusCode}`));
        return;
      }

      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        clearTimeout(timeout);
        const audioBuffer = Buffer.concat(chunks);
        if (audioBuffer.length === 0) {
          reject(new Error('Piper TTS service returned empty response'));
        } else {
          resolve(audioBuffer);
        }
      });
    });

    req.on('error', (err) => {
      clearTimeout(timeout);
      if (err.message.includes('ECONNREFUSED')) {
        reject(new Error('Piper TTS service connection refused - is Wyoming/Piper running?'));
      } else {
        reject(new Error(`Piper TTS service error: ${err.message}`));
      }
    });

    req.write(transcript);
    req.end();
  });
}

// Process audio with ffmpeg to add pre-roll and post-roll silence
async function addAudioPadding(audioBuffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ffmpeg.kill('SIGKILL');
      reject(new Error('FFmpeg processing timed out'));
    }, FFMPEG_TIMEOUT_MS);

    const chunks: Buffer[] = [];
    
    // Convert ms to seconds for ffmpeg
    const prerollSec = AUDIO_PREROLL_MS / 1000;
    const postrollSec = AUDIO_POSTROLL_MS / 1000;
    
    // Add both pre-roll and post-roll padding
    const ffmpeg = spawn('/usr/bin/ffmpeg', [
      '-i', 'pipe:0',
      '-af', `adelay=${AUDIO_PREROLL_MS}|${AUDIO_PREROLL_MS},apad=pad_dur=${postrollSec}`,
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

// Validate feature context path to prevent path traversal
function validateFeatureContextPath(path: string): void {
  const resolved = path.startsWith('/') ? path : `/${path}`;
  
  if (resolved.includes('../')) {
    throw new Error('Path traversal detected in feature context path');
  }
  
  if (!resolved.startsWith(BASE_PROJECT_PATH)) {
    throw new Error(`Feature context path must be within ${BASE_PROJECT_PATH}`);
  }
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

export function createAudioCastTool(db: Database) {
  const operations = new AudioCastOperations(db);

  return {
    name: 'generate_audio_cast',
    description: 'Convert a text transcript into an audio cast with Piper TTS and save both artifacts',
    inputSchema: {
      type: 'object',
      properties: {
        transcript: {
          type: 'string',
          description: 'The full text content of the audio cast script.'
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
      
      // Check if already processing
      if (isProcessing) {
        logEvent('warn', 'Concurrent request rejected', { reason: 'already_processing' });
        throw new Error('Audio cast generation in progress. Please try again later.');
      }

      isProcessing = true;
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

        // Check if episode already exists
        const existing = operations.getAudioCastByEpisode(
          input.featureContextPath,
          input.episodeNumber
        );
        
        if (existing) {
          throw new Error(`Episode ${input.episodeNumber} already exists for this feature`);
        }

        // Generate UUID for database record
        const castId = randomUUID();
        
        // Generate timestamp for filenames
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const episodePrefix = input.episodeNumber.toString().padStart(2, '0');
        
        // Create directory structure - audio_casts directory in feature path
        const castDir = path.join(
          '/home/jakob/dev/personal-dashboard-nextjs',
          input.featureContextPath,
          'audio_casts'
        );
        
        await fs.mkdir(castDir, { recursive: true, mode: 0o755 });

        // Define file paths with new naming convention: XX-<agent>_audio-cast_timestamp.ext
        const baseFileName = `${episodePrefix}-${input.originalAgentName}_audio-cast_${timestamp}`;
        scriptPath = path.join(castDir, `${baseFileName}.md`);
        audioPath = path.join(castDir, `${baseFileName}.wav`);

        // Write transcript to file (atomic operation)
        const tempScriptPath = scriptPath + '.tmp';
        await fs.writeFile(tempScriptPath, input.transcript, 'utf-8');
        await fs.rename(tempScriptPath, scriptPath);

        logEvent('info', 'Transcript saved', { path: scriptPath });

        // Call Piper TTS service
        logEvent('info', 'Calling Piper TTS service', { voice: TTS_VOICE });
        const rawAudio = await callPiperTTS(input.transcript);
        
        // Add padding with ffmpeg
        logEvent('info', 'Adding audio padding with ffmpeg', { 
          preroll: AUDIO_PREROLL_MS, 
          postroll: AUDIO_POSTROLL_MS 
        });
        const processedAudio = await addAudioPadding(rawAudio);

        // Write audio file (atomic operation)
        const tempAudioPath = audioPath + '.tmp';
        await fs.writeFile(tempAudioPath, processedAudio);
        await fs.rename(tempAudioPath, audioPath);

        logEvent('info', 'Audio saved', { path: audioPath });

        // Calculate processing duration
        const processingDuration = Date.now() - startTime;

        // Save to database
        const record = operations.createAudioCast({
          id: castId,
          feature_context_path: input.featureContextPath,
          episode_number: input.episodeNumber,
          source_agent_name: input.originalAgentName,
          script_path: scriptPath,
          audio_path: audioPath,
          processing_duration_ms: processingDuration
        });

        logEvent('info', 'Audio cast created successfully', {
          event: 'audio_cast_success',
          duration_ms: processingDuration,
          cast_id: castId,
          voice: TTS_VOICE
        });

        return {
          status: 'success',
          scriptPath: record.script_path,
          audioPath: record.audio_path,
          message: `Audio cast generated successfully in ${processingDuration}ms using voice ${TTS_VOICE}`
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
        isProcessing = false;
      }
    }
  };
}