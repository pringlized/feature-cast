# Audio Cast Deployment Guide

## Overview

The issue-mcp server now includes the `generate_audio_cast` tool for converting text transcripts into audio files using TTS (Text-to-Speech) services. This guide covers deployment requirements, configuration, and operational considerations.

## System Requirements

### Required Dependencies

1. **ffmpeg** - Audio processing tool for adding pre-roll silence
   - Version: Any recent version (4.x or higher recommended)
   - Purpose: Adds 500ms silence at the beginning of audio files
   - Installation: Included in Docker image or `apt-get install ffmpeg` / `brew install ffmpeg`

2. **Wyoming Piper TTS Service** - Text-to-speech engine
   - Docker image: `rhasspy/wyoming-piper:latest`
   - Default port: 10200
   - Purpose: Converts text transcripts to WAV audio files

3. **Node.js** - Runtime environment
   - Version: 20.x or higher
   - Purpose: Runs the MCP server

4. **SQLite** - Database (included with better-sqlite3)
   - Purpose: Stores audio cast metadata

## Environment Variables

### Required Variables

| Variable | Description | Example | Default |
|----------|-------------|---------|---------|
| `TTS_SERVER_URL` | Complete URL to TTS service endpoint | `http://wyoming-piper:10200/api/tts` | None (REQUIRED) |

### Optional Configuration Variables

| Variable | Description | Default | Valid Range |
|----------|-------------|---------|-------------|
| `MAX_TRANSCRIPT_LENGTH` | Maximum characters allowed in transcript | `10000` | 1-50000 |
| `TTS_TIMEOUT_MS` | Timeout for TTS service requests | `30000` | 1000-300000 |
| `FFMPEG_TIMEOUT_MS` | Timeout for ffmpeg processing | `60000` | 1000-600000 |
| `AUDIO_DELAY_MS` | Pre-roll silence duration | `500` | 0-5000 |
| `STRICT_DEPS` | Exit on missing dependencies | `false` | true/false |
| `ISSUE_DB_PATH` | Path to issues database | `./issues.db` | Any valid path |
| `MCP_MODE` | Silent mode for MCP protocol | `false` | true/false |

## Deployment Methods

### 1. Docker Compose (Recommended)

```bash
# Build and start services
docker-compose up -d

# View logs
docker-compose logs -f issue-mcp

# Stop services
docker-compose down
```

The provided `docker-compose.yml` includes:
- issue-mcp server with ffmpeg
- Wyoming Piper TTS service
- Proper networking between services
- Volume mounts for data persistence
- Health checks for both services

### 2. Docker Standalone

```bash
# Build the image
docker build -t issue-mcp:latest .

# Run with TTS service on host network
docker run -d \
  --name issue-mcp \
  -v $(pwd)/../dashboard-app/data:/app/dashboard-data:ro \
  -v $(pwd)/../../planning:/planning \
  -e TTS_SERVER_URL=http://host.docker.internal:10200/api/tts \
  -e ISSUE_DB_PATH=/app/dashboard-data/issues.db \
  issue-mcp:latest
```

### 3. Manual Installation

```bash
# Install system dependencies
apt-get update && apt-get install -y ffmpeg  # Debian/Ubuntu
# or
brew install ffmpeg  # macOS

# Install Node.js dependencies
npm install

# Build TypeScript
npm run build

# Set environment variables
export TTS_SERVER_URL=http://localhost:10200/api/tts
export ISSUE_DB_PATH=../dashboard-app/data/issues.db

# Run the server
npm start
```

## TTS Service Setup

### Wyoming Piper Installation

```bash
# Using Docker (recommended)
docker run -d \
  --name wyoming-piper \
  -p 10200:10200 \
  -v piper-data:/data \
  rhasspy/wyoming-piper:latest \
  --voice en_US-lessac-medium

# Verify service is running
curl -X POST \
  --header "Content-Type: text/plain" \
  --data "Hello, this is a test." \
  --output test.wav \
  http://localhost:10200/api/tts
```

### Available Voices

The Wyoming Piper service supports multiple voices. Common options:
- `en_US-lessac-medium` - Clear American English (default)
- `en_GB-alan-medium` - British English
- `en_US-libritts-high` - High quality American English

Change voice in docker-compose.yml or Docker command.

## File Storage Structure

Audio casts are stored in the following structure:

```
{featureContextPath}/
└── casts/
    └── {episode_number}/
        ├── {uuid}.md     # Text transcript
        └── {uuid}.wav    # Processed audio file
```

Example:
```
/planning/projects/planning/milestone-1/sprint-1.3/feature-1.3.3/
└── casts/
    └── 1/
        ├── a1b2c3d4-e5f6-7890-abcd-ef1234567890.md
        └── a1b2c3d4-e5f6-7890-abcd-ef1234567890.wav
```

## Database Schema

The `audio_casts` table stores metadata:

```sql
CREATE TABLE audio_casts (
    id TEXT PRIMARY KEY,                    -- UUID v4
    feature_context_path TEXT NOT NULL,     -- Feature directory path
    episode_number INTEGER NOT NULL,        -- Sequential episode number
    source_agent_name TEXT NOT NULL,        -- Agent who created content
    script_path TEXT NOT NULL,              -- Absolute path to .md file
    audio_path TEXT NOT NULL,               -- Absolute path to .wav file
    processing_duration_ms INTEGER,         -- Time taken to generate
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(feature_context_path, episode_number)
);
```

## Operational Considerations

### Performance

- **Processing Time**: ~10-15 seconds for 400-word transcript
- **Memory Usage**: Minimal, uses streaming where possible
- **Disk Space**: ~1MB per minute of audio (WAV format)
- **Concurrent Requests**: Sequential processing only (by design)

### Monitoring

The tool outputs structured JSON logs to stdout:

```json
{
  "level": "info",
  "timestamp": "2025-08-09T10:30:45.123Z",
  "message": "Audio cast created successfully",
  "tool": "generate_audio_cast",
  "event": "audio_cast_success",
  "duration_ms": 12345,
  "cast_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

Log levels:
- `info`: Successful operations
- `warn`: Non-critical issues (e.g., concurrent request rejection)
- `error`: Operation failures

### Error Handling

Common errors and resolutions:

1. **"TTS_SERVER_URL environment variable is not set"**
   - Set the TTS_SERVER_URL environment variable

2. **"ffmpeg is not available"**
   - Install ffmpeg or use Docker image

3. **"TTS service connection refused"**
   - Ensure TTS service is running and accessible
   - Check network connectivity and firewall rules

4. **"Episode X already exists for this feature"**
   - Use a different episode number
   - Database enforces unique episodes per feature

5. **"Audio cast generation in progress"**
   - Wait for current operation to complete
   - Tool processes requests sequentially

### Security Considerations

1. **Path Traversal Protection**: The tool validates all paths to prevent directory traversal attacks
2. **Input Validation**: Transcript length and content are validated
3. **No Authentication**: Tool assumes trusted MCP environment (not exposed publicly)
4. **File Permissions**: Files created with 0644 (read all, write owner)
5. **Directory Permissions**: Directories created with 0755

### Backup and Recovery

1. **Database Backup**: Regular SQLite database backups recommended
2. **Audio Files**: Consider backing up generated audio files
3. **Disaster Recovery**: Both database and files needed for full recovery

## Testing

### Unit Tests
```bash
npm test
```

### Integration Tests
```bash
npm run test:integration
```

### Manual Testing
```bash
# Test with MCP CLI
npx @modelcontextprotocol/cli issue-mcp generate_audio_cast \
  --transcript "This is a test transcript." \
  --featureContextPath "/planning/projects/test" \
  --originalAgentName "engineer" \
  --episodeNumber 1
```

## Troubleshooting

### Health Check Script

```bash
#!/bin/bash
# check-audio-deps.sh

echo "Checking audio cast dependencies..."

# Check ffmpeg
if command -v ffmpeg &> /dev/null; then
    echo "✓ ffmpeg installed: $(ffmpeg -version 2>&1 | head -n1)"
else
    echo "✗ ffmpeg not found"
fi

# Check TTS service
if [ -z "$TTS_SERVER_URL" ]; then
    echo "✗ TTS_SERVER_URL not set"
else
    echo "✓ TTS_SERVER_URL: $TTS_SERVER_URL"
    if curl -s -o /dev/null -w "%{http_code}" "$TTS_SERVER_URL" | grep -q "200\|404"; then
        echo "✓ TTS service reachable"
    else
        echo "✗ TTS service not reachable"
    fi
fi

# Check database
if [ -f "$ISSUE_DB_PATH" ]; then
    echo "✓ Database exists: $ISSUE_DB_PATH"
else
    echo "✗ Database not found: $ISSUE_DB_PATH"
fi
```

## Support

For issues or questions about the audio cast feature:
1. Check logs for error messages
2. Verify all dependencies are installed and running
3. Ensure environment variables are correctly set
4. Review this deployment guide for configuration options