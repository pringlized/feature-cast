// Test setup configuration
import path from 'path';
import fs from 'fs';

// Set up test database path to avoid conflicts with actual database
process.env.ISSUE_DB_PATH = path.join(__dirname, 'test-database.db');

// Clean up test database before and after tests
beforeEach(() => {
  const testDbPath = process.env.ISSUE_DB_PATH!;
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});

afterEach(() => {
  const testDbPath = process.env.ISSUE_DB_PATH!;
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});

// Global test timeout
jest.setTimeout(30000);

// Mock console.log for cleaner test output
global.console = {
  ...console,
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn()
};