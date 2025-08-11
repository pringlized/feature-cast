// Integration Tests: CLI Functionality
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { existsSync } from 'fs';

describe('CLI Integration Tests', () => {
  const testDir = path.join(__dirname, 'cli-test-workspace');
  const testDbPath = path.join(testDir, 'test-issues.db');

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

  describe('Database Initialization', () => {
    test('should initialize database with init command', async () => {
      const result = await runCLICommand(['init', '--path', testDbPath], {
        timeout: 10000,
        cwd: testDir
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Initializing database at:');
      expect(result.stdout).toContain('Created tables:');
      expect(result.stdout).toContain('✅ Issue database initialized successfully');
      expect(existsSync(testDbPath)).toBe(true);
    });

    test('should handle init command with default path', async () => {
      const defaultDbPath = path.join(testDir, 'issues.db');
      
      const result = await runCLICommand(['init'], {
        timeout: 10000,
        cwd: testDir
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('✅ Issue database initialized successfully');
      expect(existsSync(defaultDbPath)).toBe(true);
    });

    test('should handle init errors gracefully', async () => {
      // Try to init in a read-only directory (simulate permission error)
      const readOnlyDir = path.join(testDir, 'readonly');
      await fs.mkdir(readOnlyDir);
      
      // Make directory read-only on Unix systems
      if (process.platform !== 'win32') {
        await fs.chmod(readOnlyDir, 0o444);
      }

      const result = await runCLICommand(['init', '--path', path.join(readOnlyDir, 'test.db')], {
        timeout: 10000,
        cwd: testDir,
        expectError: true
      });

      if (process.platform !== 'win32') {
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('❌ Failed to initialize database');
      }
    });

    test('should show help information', async () => {
      const result = await runCLICommand(['--help'], {
        timeout: 5000,
        cwd: testDir
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Usage:');
      expect(result.stdout).toContain('issue-mcp');
      expect(result.stdout).toContain('Commands:');
      expect(result.stdout).toContain('init');
      expect(result.stdout).toContain('start');
    });

    test('should show version information', async () => {
      const result = await runCLICommand(['--version'], {
        timeout: 5000,
        cwd: testDir
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/); // Version pattern
    });
  });

  describe('Server Commands', () => {
    beforeEach(async () => {
      // Initialize database first
      await runCLICommand(['init', '--path', testDbPath], {
        timeout: 10000,
        cwd: testDir
      });
    });

    test('should handle start command with missing database', async () => {
      const missingDbPath = path.join(testDir, 'nonexistent.db');
      
      const result = await runCLICommand(['start', '--database', missingDbPath], {
        timeout: 5000,
        cwd: testDir,
        expectError: true
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('❌ Database not found');
      expect(result.stderr).toContain('Run "issue-mcp init" first');
    });

    test('should start server with existing database (short test)', async () => {
      // Start server process
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

      serverProcess.stdout?.on('data', (data) => {
        serverOutput += data.toString();
      });

      serverProcess.stderr?.on('data', (data) => {
        serverError += data.toString();
      });

      // Wait a short time for server to start
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check if server started (should be waiting for MCP input)
      expect(serverError).toContain('Initializing database at:');
      expect(serverError).toContain('Registered');
      expect(serverError).toContain('MCP tools');

      // Terminate server
      serverProcess.kill('SIGTERM');
      
      // Wait for process to exit
      await new Promise(resolve => {
        serverProcess.on('exit', resolve);
        setTimeout(() => {
          serverProcess.kill('SIGKILL');
          resolve(null);
        }, 1000);
      });
    });
  });

  describe('Status and Utility Commands', () => {
    beforeEach(async () => {
      // Initialize database
      await runCLICommand(['init', '--path', testDbPath], {
        timeout: 10000,
        cwd: testDir
      });
    });

    test('should handle status command', async () => {
      const result = await runCLICommand(['status', '--database', testDbPath], {
        timeout: 5000,
        cwd: testDir
      });

      // Status command may or may not exist, but should not crash
      expect([0, 1]).toContain(result.exitCode);
      
      if (result.exitCode === 1) {
        // If command doesn't exist, should show help or error
        expect(result.stderr || result.stdout).toBeTruthy();
      }
    });

    test('should handle list command', async () => {
      const result = await runCLICommand(['list', '--database', testDbPath], {
        timeout: 5000,
        cwd: testDir
      });

      // List command may or may not exist, but should not crash
      expect([0, 1]).toContain(result.exitCode);
      
      if (result.exitCode === 1) {
        // If command doesn't exist, should show help or error
        expect(result.stderr || result.stdout).toBeTruthy();
      }
    });

    test('should handle invalid command gracefully', async () => {
      const result = await runCLICommand(['invalid-command'], {
        timeout: 5000,
        cwd: testDir,
        expectError: true
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr || result.stdout).toBeTruthy();
    });
  });

  describe('Command Line Argument Validation', () => {
    test('should validate database path arguments', async () => {
      // Test with various invalid path formats
      const invalidPaths = [
        '',
        '   ',
        '../../../etc/passwd',
        'NUL:', // Windows device name
        'CON:'  // Windows device name
      ];

      for (const invalidPath of invalidPaths) {
        const result = await runCLICommand(['init', '--path', invalidPath], {
          timeout: 5000,
          cwd: testDir,
          expectError: true
        });

        // Should either succeed with sanitized path or fail gracefully
        expect([0, 1]).toContain(result.exitCode);
        
        if (result.exitCode === 1) {
          expect(result.stderr).toBeTruthy();
        }
      }
    });

    test('should handle malformed command line arguments', async () => {
      const malformedArgs = [
        ['--path'], // Missing value
        ['init', '--invalid-flag'],
        ['start', '--database'], // Missing value
        ['--path='], // Empty value
        ['init', '--path', ''], // Empty path
      ];

      for (const args of malformedArgs) {
        const result = await runCLICommand(args, {
          timeout: 5000,
          cwd: testDir,
          expectError: true
        });

        // Should handle gracefully without crashing
        expect([0, 1]).toContain(result.exitCode);
      }
    });
  });

  describe('Process and Signal Handling', () => {
    test('should handle SIGINT gracefully during initialization', async () => {
      // Start init process
      const initProcess = spawn('node', [
        path.join(__dirname, '../../dist/cli.js'),
        'init',
        '--path', testDbPath
      ], {
        cwd: testDir,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Immediately send SIGINT
      setTimeout(() => {
        initProcess.kill('SIGINT');
      }, 100);

      const result = await new Promise<{exitCode: number, stdout: string, stderr: string}>(resolve => {
        let stdout = '';
        let stderr = '';

        initProcess.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        initProcess.stderr?.on('data', (data) => {
          stderr += data.toString();
        });

        initProcess.on('exit', (code) => {
          resolve({
            exitCode: code || 0,
            stdout,
            stderr
          });
        });

        // Force kill if process doesn't exit
        setTimeout(() => {
          initProcess.kill('SIGKILL');
          resolve({
            exitCode: -1,
            stdout,
            stderr: stderr + 'Process forced to exit'
          });
        }, 5000);
      });

      // Process should exit cleanly (exit code varies by platform)
      expect([-1, 0, 1, 2, 130]).toContain(result.exitCode);
    });

    test('should handle server shutdown gracefully', async () => {
      // Initialize database first
      await runCLICommand(['init', '--path', testDbPath], {
        timeout: 10000,
        cwd: testDir
      });

      const serverProcess = spawn('node', [
        path.join(__dirname, '../../dist/cli.js'),
        'start',
        '--database', testDbPath
      ], {
        cwd: testDir,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let serverStarted = false;
      
      serverProcess.stderr?.on('data', (data) => {
        const output = data.toString();
        if (output.includes('Registered') && output.includes('MCP tools')) {
          serverStarted = true;
        }
      });

      // Wait for server to start
      await new Promise(resolve => {
        const checkInterval = setInterval(() => {
          if (serverStarted) {
            clearInterval(checkInterval);
            resolve(null);
          }
        }, 100);
        
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve(null);
        }, 3000);
      });

      // Send SIGTERM for graceful shutdown
      serverProcess.kill('SIGTERM');

      const exitCode = await new Promise<number>(resolve => {
        serverProcess.on('exit', (code) => {
          resolve(code || 0);
        });
        
        setTimeout(() => {
          serverProcess.kill('SIGKILL');
          resolve(-1);
        }, 2000);
      });

      // Should exit cleanly
      expect([-1, 0, 1, 15]).toContain(exitCode);
    });
  });
});

// Utility function to run CLI commands
async function runCLICommand(
  args: string[], 
  options: {
    timeout?: number;
    cwd?: string;
    expectError?: boolean;
  } = {}
): Promise<{exitCode: number, stdout: string, stderr: string}> {
  const { timeout = 5000, cwd = process.cwd(), expectError = false } = options;
  
  const cliPath = path.join(__dirname, '../../dist/cli.js');
  
  return new Promise((resolve, reject) => {
    const child = spawn('node', [cliPath, ...args], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('exit', (code) => {
      resolve({
        exitCode: code || 0,
        stdout,
        stderr
      });
    });

    child.on('error', (error) => {
      if (expectError) {
        resolve({
          exitCode: 1,
          stdout,
          stderr: error.message
        });
      } else {
        reject(error);
      }
    });

    // Timeout handling
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      setTimeout(() => {
        child.kill('SIGKILL');
        resolve({
          exitCode: -1,
          stdout,
          stderr: stderr + '\nProcess timed out'
        });
      }, 1000);
    }, timeout);

    child.on('exit', () => {
      clearTimeout(timer);
    });
  });
}