// Main entry point for FeatureCast MCP
export { FeatureCastMCPServer } from './server';
export * from './tools';

// Start server if this is the main module
if (require.main === module) {
  require('./server');
}