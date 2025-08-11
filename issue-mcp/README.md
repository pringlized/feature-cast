# Audio Cast MCP Server

A simplified MCP (Model Context Protocol) server that provides a single tool for generating audio casts from text transcripts using TTS (Text-to-Speech) and ffmpeg.

## Features

- Convert text transcripts to audio using an external TTS service
- Process audio with ffmpeg to add pre-roll and post-roll silence
- File-based episode tracking (no database required)
- Concurrent processing protection per feature
- Path traversal and SSRF security protections

## Requirements

- Node.js 16+
- ffmpeg installed and available in PATH
- External TTS service (e.g., Piper TTS server)

## Environment Variables

Create a `.env` file with the following variables:

```bash
# Required
TTS_SERVER_URL=http://localhost:10200/synthesize  # Your TTS service endpoint
BASE_PROJECT_PATH=/path/to/your/project           # Base directory for file operations

# Optional
TTS_VOICE=en_US-hfc_female-medium                 # TTS voice to use
MAX_TRANSCRIPT_LENGTH=10000                       # Max transcript characters
TTS_TIMEOUT_MS=30000                             # TTS request timeout
FFMPEG_TIMEOUT_MS=60000                          # FFmpeg processing timeout
AUDIO_PREROLL_MS=750                             # Pre-roll silence in ms
AUDIO_POSTROLL_MS=1000                           # Post-roll silence in ms
```

## Installation

```bash
npm install
npm run build
```

## Usage

### As MCP Server (stdio mode)

```bash
npm start
```

The server communicates via stdio and exposes one tool: `generate_audio_cast`

### Tool Input

The `generate_audio_cast` tool accepts:

- `transcript` (string): The text content to convert to audio
- `featureContextPath` (string): Relative path to the feature directory
- `originalAgentName` (string): Name of the source agent
- `episodeNumber` (integer): Sequential episode number (must be unique per feature)

### Output

The tool creates two files in `<BASE_PROJECT_PATH>/<featureContextPath>/audio_casts/`:

1. `XX-<agent>_audio-cast_<timestamp>.md` - The transcript text
2. `XX-<agent>_audio-cast_<timestamp>.wav` - The generated audio

Where `XX` is the zero-padded episode number.

## Directory Structure

The tool expects the following directory structure to exist:

```
<BASE_PROJECT_PATH>/
  <featureContextPath>/
    audio_casts/       # Must exist before running the tool
      01-agent_audio-cast_2024-01-01T12-00-00.md
      01-agent_audio-cast_2024-01-01T12-00-00.wav
```

## Security

- Path traversal protection on all file operations
- SSRF protection with TTS URL whitelist
- Concurrent processing locks per feature
- Input validation and sanitization

## License

MIT