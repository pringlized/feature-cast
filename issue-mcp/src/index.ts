// Main entry point for Audio Cast MCP
export { AudioCastMCPServer } from './server';
export * from './tools';

// Start server if this is the main module
if (require.main === module) {
  require('./server');
}