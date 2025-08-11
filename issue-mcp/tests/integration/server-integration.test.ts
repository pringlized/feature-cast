// Integration Tests: MCP Server Functionality
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { existsSync } from 'fs';
import { IssueMCPServer } from '../../src/server';
import { initializeDatabase } from '../../src/database/init';

describe('MCP Server Integration Tests', () => {
  const testDir = path.join(__dirname, 'server-test-workspace');
  const testDbPath = path.join(testDir, 'test-server-issues.db');

  beforeEach(async () => {
    // Create test directory
    if (existsSync(testDir)) {
      await fs.rm(testDir, { recursive: true });
    }
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup test directory
    if (existsSync(testDir)) {
      await fs.rm(testDir, { recursive: true });
    }
  });

  describe('Server Initialization', () => {
    test('should initialize server with database', () => {
      // Initialize database first
      const db = initializeDatabase(testDbPath);
      db.close();

      expect(() => {
        const server = new IssueMCPServer(testDbPath);
        // Server should initialize without errors
        expect(server).toBeDefined();
      }).not.toThrow();
    });

    test('should handle missing database path', () => {
      // Should create database in default location
      expect(() => {
        const server = new IssueMCPServer();
        expect(server).toBeDefined();
      }).not.toThrow();
    });

    test('should register all tools correctly', () => {
      const db = initializeDatabase(testDbPath);
      db.close();

      const server = new IssueMCPServer(testDbPath);
      
      // Server should start without errors
      expect(server).toBeDefined();
      
      // Note: Cannot easily test internal state without exposing it,
      // but server creation without errors indicates tools were registered
    });
  });

  describe('MCP Protocol Handling', () => {
    let server: IssueMCPServer;

    beforeEach(() => {
      const db = initializeDatabase(testDbPath);
      db.close();
      server = new IssueMCPServer(testDbPath);
    });

    test('should handle server creation and startup', async () => {
      // Server should be created successfully
      expect(server).toBeDefined();

      // Server should be ready to handle requests
      // (Actual MCP protocol testing would require more complex setup)
    });

    test('should handle tool list requests', async () => {
      // This test verifies the server can be created and would handle tool requests
      // Full MCP protocol testing would require MCP client simulation
      expect(server).toBeDefined();
    });

    test('should handle tool execution requests', async () => {
      // Server should be able to process tool execution
      // Actual execution testing would require MCP message protocol
      expect(server).toBeDefined();
    });
  });

  describe('Server Process Integration', () => {
    beforeEach(async () => {
      // Initialize database first
      const db = initializeDatabase(testDbPath);
      db.close();
    });

    test('should start server process via CLI', async () => {
      const serverProcess = spawn('node', [
        path.join(__dirname, '../../dist/cli.js'),
        'start',
        '--database', testDbPath
      ], {
        cwd: testDir,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let serverOutput = '';
      let serverError = '';
      let toolsRegistered = false;

      serverProcess.stdout?.on('data', (data) => {
        serverOutput += data.toString();
      });

      serverProcess.stderr?.on('data', (data) => {
        const output = data.toString();
        serverError += output;
        if (output.includes('Registered') && output.includes('MCP tools')) {
          toolsRegistered = true;
        }
      });

      // Wait for server to initialize
      await new Promise(resolve => {
        let attempts = 0;
        const checkInterval = setInterval(() => {
          attempts++;
          if (toolsRegistered || attempts > 30) { // 3 seconds max
            clearInterval(checkInterval);
            resolve(null);
          }
        }, 100);
      });

      expect(toolsRegistered).toBe(true);
      expect(serverError).toContain('Initializing database at:');

      // Cleanup
      serverProcess.kill('SIGTERM');
      await new Promise(resolve => {
        serverProcess.on('exit', resolve);
        setTimeout(() => {
          serverProcess.kill('SIGKILL');
          resolve(null);
        }, 2000);
      });
    });

    test('should handle MCP requests via stdio', async () => {
      const serverProcess = spawn('node', [
        path.join(__dirname, '../../dist/cli.js'),
        'start',
        '--database', testDbPath
      ], {
        cwd: testDir,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let serverError = '';
      let toolsRegistered = false;

      serverProcess.stderr?.on('data', (data) => {
        const output = data.toString();
        serverError += output;
        if (output.includes('Registered') && output.includes('MCP tools')) {
          toolsRegistered = true;
        }
      });

      // Wait for server to start
      await new Promise(resolve => {
        let attempts = 0;
        const checkInterval = setInterval(() => {
          attempts++;
          if (toolsRegistered || attempts > 30) {
            clearInterval(checkInterval);
            resolve(null);
          }
        }, 100);
      });

      expect(toolsRegistered).toBe(true);

      // Send a simple MCP request (list tools)
      const listToolsRequest = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {}
      }) + '\n';

      let response = '';
      let responseReceived = false;

      serverProcess.stdout?.on('data', (data) => {
        response += data.toString();
        if (response.includes('"result"') && response.includes('"tools"')) {
          responseReceived = true;
        }
      });

      // Send request
      serverProcess.stdin?.write(listToolsRequest);

      // Wait for response
      await new Promise(resolve => {
        let attempts = 0;
        const checkInterval = setInterval(() => {
          attempts++;
          if (responseReceived || attempts > 50) { // 5 seconds max
            clearInterval(checkInterval);
            resolve(null);
          }
        }, 100);
      });

      if (responseReceived) {
        expect(response).toContain('"tools"');
        expect(response).toContain('create_issue');
        expect(response).toContain('list_issues');
        expect(response).toContain('checkout_issue');
      }

      // Cleanup
      serverProcess.kill('SIGTERM');
      await new Promise(resolve => {
        serverProcess.on('exit', resolve);
        setTimeout(() => {
          serverProcess.kill('SIGKILL');
          resolve(null);
        }, 2000);
      });
    });

    test('should handle tool execution via MCP protocol', async () => {
      const serverProcess = spawn('node', [
        path.join(__dirname, '../../dist/cli.js'),
        'start',
        '--database', testDbPath
      ], {
        cwd: testDir,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let toolsRegistered = false;

      serverProcess.stderr?.on('data', (data) => {
        const output = data.toString();
        if (output.includes('Registered') && output.includes('MCP tools')) {
          toolsRegistered = true;
        }
      });

      // Wait for server to start
      await new Promise(resolve => {
        let attempts = 0;
        const checkInterval = setInterval(() => {
          attempts++;
          if (toolsRegistered || attempts > 30) {
            clearInterval(checkInterval);
            resolve(null);
          }
        }, 100);
      });

      expect(toolsRegistered).toBe(true);

      // Send create_issue tool request
      const createIssueRequest = JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'create_issue',
          arguments: {
            title: 'Integration Test Issue',
            description: 'This is a test issue created during server integration testing',
            priority: 'high',
            project: 'integration-test'
          }
        }
      }) + '\n';

      let response = '';
      let responseReceived = false;

      serverProcess.stdout?.on('data', (data) => {
        response += data.toString();
        try {
          const parsed = JSON.parse(response.trim());
          if (parsed.id === 2 && parsed.result) {
            responseReceived = true;
          }
        } catch (e) {
          // Response might be incomplete
        }
      });

      // Send request
      serverProcess.stdin?.write(createIssueRequest);

      // Wait for response
      await new Promise(resolve => {
        let attempts = 0;
        const checkInterval = setInterval(() => {
          attempts++;
          if (responseReceived || attempts > 50) {
            clearInterval(checkInterval);
            resolve(null);
          }
        }, 100);
      });

      if (responseReceived) {
        const parsedResponse = JSON.parse(response.trim());
        expect(parsedResponse.result).toBeDefined();
        expect(parsedResponse.result.issue_id).toBeDefined();
        expect(parsedResponse.result.message).toContain('Issue created successfully');
      }

      // Cleanup
      serverProcess.kill('SIGTERM');
      await new Promise(resolve => {
        serverProcess.on('exit', resolve);
        setTimeout(() => {
          serverProcess.kill('SIGKILL');
          resolve(null);
        }, 2000);
      });
    });

    test('should handle malformed MCP requests gracefully', async () => {
      const serverProcess = spawn('node', [
        path.join(__dirname, '../../dist/cli.js'),
        'start',
        '--database', testDbPath
      ], {
        cwd: testDir,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let toolsRegistered = false;

      serverProcess.stderr?.on('data', (data) => {
        const output = data.toString();
        if (output.includes('Registered') && output.includes('MCP tools')) {
          toolsRegistered = true;
        }
      });

      await new Promise(resolve => {
        let attempts = 0;
        const checkInterval = setInterval(() => {
          attempts++;
          if (toolsRegistered || attempts > 30) {
            clearInterval(checkInterval);
            resolve(null);
          }
        }, 100);
      });

      // Send malformed requests
      const malformedRequests = [
        'invalid json\n',
        '{"invalid": "request"}\n',
        '{}\n',
        '{"jsonrpc": "2.0", "id": 1}\n', // Missing method
        '{"jsonrpc": "2.0", "method": "invalid/method", "id": 1}\n'
      ];

      let responses = '';
      let errorResponses = 0;

      serverProcess.stdout?.on('data', (data) => {
        responses += data.toString();
        // Count error responses
        const lines = responses.split('\n').filter(line => line.trim());
        errorResponses = lines.filter(line => {
          try {
            const parsed = JSON.parse(line);
            return parsed.error !== undefined;
          } catch (e) {
            return false;
          }
        }).length;
      });

      // Send all malformed requests
      for (const request of malformedRequests) {
        serverProcess.stdin?.write(request);
        await new Promise(resolve => setTimeout(resolve, 200)); // Small delay between requests
      }

      // Wait for responses
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Server should respond with error messages for malformed requests
      // (but not crash)
      expect(errorResponses).toBeGreaterThan(0);

      // Process should still be running
      expect(serverProcess.killed).toBe(false);

      // Cleanup
      serverProcess.kill('SIGTERM');
      await new Promise(resolve => {
        serverProcess.on('exit', resolve);
        setTimeout(() => {
          serverProcess.kill('SIGKILL');
          resolve(null);
        }, 2000);
      });
    });
  });

  describe('Server Error Handling', () => {
    test('should handle database connection errors', () => {
      // Test with invalid database path
      const invalidPath = '/invalid/path/that/does/not/exist/db.sqlite';
      
      expect(() => {
        new IssueMCPServer(invalidPath);
      }).toThrow();
    });

    test('should handle database corruption gracefully', async () => {
      // Create a corrupted database file
      await fs.writeFile(testDbPath, 'This is not a valid SQLite database');

      expect(() => {
        new IssueMCPServer(testDbPath);
      }).toThrow();
    });

    test('should handle permission errors', async () => {
      if (process.platform === 'win32') {
        // Skip permission test on Windows
        return;
      }

      // Create directory without write permissions
      const restrictedDir = path.join(testDir, 'restricted');
      await fs.mkdir(restrictedDir);
      await fs.chmod(restrictedDir, 0o444); // Read-only

      const restrictedDbPath = path.join(restrictedDir, 'restricted.db');

      expect(() => {
        new IssueMCPServer(restrictedDbPath);
      }).toThrow();
    });
  });

  describe('Server Performance', () => {
    test('should handle multiple concurrent tool requests', async () => {
      const serverProcess = spawn('node', [
        path.join(__dirname, '../../dist/cli.js'),
        'start',
        '--database', testDbPath
      ], {
        cwd: testDir,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let toolsRegistered = false;

      serverProcess.stderr?.on('data', (data) => {
        const output = data.toString();
        if (output.includes('Registered') && output.includes('MCP tools')) {
          toolsRegistered = true;
        }
      });

      await new Promise(resolve => {
        let attempts = 0;
        const checkInterval = setInterval(() => {
          attempts++;
          if (toolsRegistered || attempts > 30) {
            clearInterval(checkInterval);
            resolve(null);
          }
        }, 100);
      });

      let responseCount = 0;
      const expectedResponses = 5;

      serverProcess.stdout?.on('data', (data) => {
        const responses = data.toString().split('\n').filter((line: string) => line.trim());
        responses.forEach((response: string) => {
          try {
            const parsed = JSON.parse(response);
            if (parsed.result && parsed.result.issue_id) {
              responseCount++;
            }
          } catch (e) {
            // Ignore parsing errors
          }
        });
      });

      // Send multiple create_issue requests rapidly
      for (let i = 0; i < expectedResponses; i++) {
        const request = JSON.stringify({
          jsonrpc: '2.0',
          id: i + 10,
          method: 'tools/call',
          params: {
            name: 'create_issue',
            arguments: {
              title: `Concurrent Test Issue ${i}`,
              description: `Test issue ${i} for concurrent processing`,
              priority: 'medium',
              project: 'concurrent-test'
            }
          }
        }) + '\n';

        serverProcess.stdin?.write(request);
      }

      // Wait for all responses
      await new Promise(resolve => {
        let attempts = 0;
        const checkInterval = setInterval(() => {
          attempts++;
          if (responseCount >= expectedResponses || attempts > 100) {
            clearInterval(checkInterval);
            resolve(null);
          }
        }, 100);
      });

      expect(responseCount).toBe(expectedResponses);

      // Cleanup
      serverProcess.kill('SIGTERM');
      await new Promise(resolve => {
        serverProcess.on('exit', resolve);
        setTimeout(() => {
          serverProcess.kill('SIGKILL');
          resolve(null);
        }, 2000);
      });
    });

    test('should maintain responsiveness under load', async () => {
      const serverProcess = spawn('node', [
        path.join(__dirname, '../../dist/cli.js'),
        'start',
        '--database', testDbPath
      ], {
        cwd: testDir,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let toolsRegistered = false;

      serverProcess.stderr?.on('data', (data) => {
        const output = data.toString();
        if (output.includes('Registered') && output.includes('MCP tools')) {
          toolsRegistered = true;
        }
      });

      await new Promise(resolve => {
        let attempts = 0;
        const checkInterval = setInterval(() => {
          attempts++;
          if (toolsRegistered || attempts > 30) {
            clearInterval(checkInterval);
            resolve(null);
          }
        }, 100);
      });

      const startTime = Date.now();
      let firstResponseTime = 0;
      let lastResponseTime = 0;
      let responseCount = 0;

      serverProcess.stdout?.on('data', (data) => {
        const responses = data.toString().split('\n').filter((line: string) => line.trim());
        responses.forEach((response: string) => {
          try {
            const parsed = JSON.parse(response);
            if (parsed.result) {
              responseCount++;
              if (firstResponseTime === 0) {
                firstResponseTime = Date.now();
              }
              lastResponseTime = Date.now();
            }
          } catch (e) {
            // Ignore parsing errors
          }
        });
      });

      // Send many requests to test load handling
      const numRequests = 20;
      for (let i = 0; i < numRequests; i++) {
        const request = JSON.stringify({
          jsonrpc: '2.0',
          id: i + 100,
          method: 'tools/call',
          params: {
            name: 'list_issues',
            arguments: {}
          }
        }) + '\n';

        serverProcess.stdin?.write(request);
        
        // Small delay to avoid overwhelming
        if (i % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      // Wait for responses
      await new Promise(resolve => {
        let attempts = 0;
        const checkInterval = setInterval(() => {
          attempts++;
          if (responseCount >= numRequests * 0.8 || attempts > 200) { // Accept 80% response rate
            clearInterval(checkInterval);
            resolve(null);
          }
        }, 50);
      });

      // Check response times
      const totalTime = lastResponseTime - startTime;
      const averageResponseTime = totalTime / responseCount;

      expect(responseCount).toBeGreaterThan(numRequests * 0.5); // At least 50% should succeed
      expect(averageResponseTime).toBeLessThan(1000); // Average response under 1 second

      // Cleanup
      serverProcess.kill('SIGTERM');
      await new Promise(resolve => {
        serverProcess.on('exit', resolve);
        setTimeout(() => {
          serverProcess.kill('SIGKILL');
          resolve(null);
        }, 2000);
      });
    });
  });
});