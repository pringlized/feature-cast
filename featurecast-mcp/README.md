# FeatureCast MCP Server

A Model Context Protocol (MCP) server for generating audio narrations from text transcripts using TTS and ffmpeg.

## Installation

### Prerequisites

1. **Node.js 16+**
2. **ffmpeg** - Must be installed and available in PATH
   ```bash
   # macOS
   brew install ffmpeg
   
   # Ubuntu/Debian
   sudo apt-get install ffmpeg
   
   # Windows
   winget install ffmpeg
   ```

3. **TTS Service** - You need a running TTS server (e.g., Piper TTS)
   ```bash
   # Example: Running Piper TTS with Docker
   docker run -p 5000:5000 rhasspy/piper
   ```

### Setup

1. Clone the repository and navigate to the MCP server:
   ```bash
   cd featurecast-mcp
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the TypeScript code:
   ```bash
   npm run build
   ```

4. Create a `.env` file with required configuration:
   ```bash
   # Required
   BASE_PROJECT_PATH=/path/to/your/project
   
   # TTS Configuration for Audio Cast Generation
   TTS_SERVER_URL=http://localhost:5000/api/text-to-speech
   TTS_VOICE=en_US-hfc_female-medium
   TTS_TIMEOUT_MS=180000  # Adjust based on your transcript length and TTS speed
   
   # Audio Processing
   # Note: Piper TTS recordings often start abruptly, so we add pre/post-roll using ffmpeg
   # silence for cleaner intro/outro transitions
   AUDIO_PREROLL_MS=750   # Silence before speech begins
   AUDIO_POSTROLL_MS=1000 # Silence after speech ends
   FFMPEG_TIMEOUT_MS=60000
   
   # Audio Cast Limits
   MAX_TRANSCRIPT_LENGTH=20000  # Adjust based on your needs
   ```

## Usage with Claude Desktop

1. Update your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

   ```json
   {
     "mcpServers": {
       "featurecast": {
         "command": "node",
         "args": ["/path/to/featurecast-mcp/dist/server.js"],
         "env": {
           "TTS_SERVER_URL": "http://localhost:5000/api/text-to-speech",
           "BASE_PROJECT_PATH": "/path/to/your/project"
         }
       }
     }
   }
   ```

2. Restart Claude Desktop

3. The MCP tool `generate_audio_cast` will be available in Claude

## MCP Tool Reference

### generate_audio_cast

Converts text transcripts into audio narrations.

**Parameters:**
- `transcript` (string, required): The text content to convert to audio
- `featureContextPath` (string, required): Relative path to the feature directory
- `originalAgentName` (string, required): Name of the source agent
- `episodeNumber` (integer, required): Sequential episode number (must be unique per feature)

**Output:**
Creates two files in `<BASE_PROJECT_PATH>/<featureContextPath>/audio_casts/`:
- `XX-<agent>_audio-cast_<timestamp>.md` - The transcript text
- `XX-<agent>_audio-cast_<timestamp>.wav` - The generated audio

## Direct Usage (Development)

For development or testing, you can run the server directly:

```bash
npm start
```

The server communicates via stdio and can be tested with MCP clients.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TTS_SERVER_URL` | Yes | - | URL of your TTS service endpoint |
| `BASE_PROJECT_PATH` | Yes | - | Base directory for file operations |
| `TTS_VOICE` | No | `en_US-hfc_female-medium` | TTS voice selection |
| `MAX_TRANSCRIPT_LENGTH` | No | `20000` | Maximum characters allowed - adjust based on your needs |
| `TTS_TIMEOUT_MS` | No | `180000` | TTS timeout - increase for longer transcripts |
| `FFMPEG_TIMEOUT_MS` | No | `60000` | FFmpeg processing timeout |
| `AUDIO_PREROLL_MS` | No | `750` | Pre-roll silence to smooth abrupt Piper TTS starts |
| `AUDIO_POSTROLL_MS` | No | `1000` | Post-roll silence for clean outro transitions |

## Security Features

- **Path Traversal Protection**: All file paths are validated to prevent directory escaping
- **SSRF Protection**: TTS URLs are validated against a whitelist
- **Concurrent Processing Locks**: Prevents multiple simultaneous generations for the same feature
- **Input Validation**: All inputs are sanitized and validated

## Troubleshooting

### FFmpeg not found
Ensure ffmpeg is installed and available in your PATH:
```bash
ffmpeg -version
```

### TTS service unreachable
Verify your TTS service is running:
```bash
curl http://localhost:5000/
```

### Permission errors
Ensure the `BASE_PROJECT_PATH` directory exists and is writable.

## License

MIT