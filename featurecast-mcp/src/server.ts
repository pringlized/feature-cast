// MCP Server Implementation with stdio - Audio Cast Only

// Load environment variables from .env file
import * as dotenv from 'dotenv';
import * as path from 'path';

// Explicitly load .env from the featurecast-mcp directory
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Verify critical environment variables are loaded
if (!process.env.BASE_PROJECT_PATH) {
  console.error('WARNING: BASE_PROJECT_PATH not loaded from .env, using default');
}

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import { getAllTools } from './tools';
import { checkFFmpegAvailable, checkTTSAvailable } from './tools/generate-audio-cast';

export class FeatureCastMCPServer {
  private server: Server;
  private tools: Map<string, any> = new Map();
  private audioToolsAvailable: boolean = true;

  constructor() {
    this.server = new Server(
      {
        name: 'featurecast-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Check dependencies for audio cast tool
    this.checkAudioDependencies().then(available => {
      this.audioToolsAvailable = available;
      if (!available && process.env.MCP_MODE !== 'true') {
        console.error('WARNING: Audio cast tool disabled - missing dependencies');
      }
    });

    // Register all tools
    this.registerTools();

    // Set up request handlers
    this.setupHandlers();
  }

  private async checkAudioDependencies(): Promise<boolean> {
    // Check for TTS_SERVER_URL environment variable
    if (!process.env.TTS_SERVER_URL) {
      console.error('FATAL: TTS_SERVER_URL environment variable is not set.');
      if (process.env.STRICT_DEPS === 'true') {
        process.exit(1);
      }
      return false;
    }

    // Check ffmpeg availability
    const ffmpegAvailable = await checkFFmpegAvailable();
    if (!ffmpegAvailable) {
      console.error('FATAL: ffmpeg is not available. Please install ffmpeg.');
      if (process.env.STRICT_DEPS === 'true') {
        process.exit(1);
      }
      return false;
    }

    // Check TTS service availability
    const ttsAvailable = await checkTTSAvailable();
    if (!ttsAvailable) {
      console.error('WARNING: TTS service is not reachable at ' + process.env.TTS_SERVER_URL);
      // Don't exit, just warn - service might come up later
    }

    return ffmpegAvailable && process.env.TTS_SERVER_URL !== undefined;
  }

  private registerTools() {
    const toolDefinitions = getAllTools();
    
    for (const tool of toolDefinitions) {
      // Skip audio cast tool if dependencies are not available
      if (!this.audioToolsAvailable) {
        if (process.env.MCP_MODE !== 'true') {
          console.error('Skipping generate_audio_cast tool - dependencies not available');
        }
        continue;
      }
      this.tools.set(tool.name, tool);
    }

    if (process.env.MCP_MODE !== 'true') {
      console.error(`Registered ${this.tools.size} MCP tools`);
    }
  }

  private setupHandlers() {
    // Handle list tools request
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = [];
      
      for (const [name, tool] of this.tools) {
        tools.push({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        });
      }

      return { tools };
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      const tool = this.tools.get(name);
      if (!tool) {
        throw new Error(`Tool not found: ${name}`);
      }

      try {
        // Execute the tool
        const result = await tool.execute(args);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error: any) {
        console.error(`Tool execution error for ${name}:`, error);
        return {
          content: [
            {
              type: 'text',
              text: `Error executing tool ${name}: ${error.message}`
            }
          ],
          isError: true
        };
      }
    });
  }

  async start() {
    // Create stdio transport
    const transport = new StdioServerTransport();
    
    // Connect and run
    await this.server.connect(transport);
    if (process.env.MCP_MODE !== 'true') {
      console.error('FeatureCast MCP Server started on stdio');
    }
  }

  async stop() {
    await this.server.close();
    console.error('FeatureCast MCP Server stopped');
  }
}

// Start server if run directly
if (require.main === module) {
  const server = new FeatureCastMCPServer();
  
  server.start().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.error('\nShutting down server...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.error('\nShutting down server...');
    await server.stop();
    process.exit(0);
  });
}