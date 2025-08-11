// Security Tests: Input Validation and Boundary Testing
import { describe, test, expect, beforeEach } from '@jest/globals';
import { initializeDatabase } from '../../src/database/init';
import { IssueOperations } from '../../src/database/operations';
import { Database } from '../../src/database/types';
import { createCreateIssueTool } from '../../src/tools/create-issue';
import { createListIssuesTool } from '../../src/tools/list-issues';
import { createCheckoutIssueTool } from '../../src/tools/checkout-issue';

describe('Security: Input Validation and Boundary Testing', () => {
  let db: Database;
  let operations: IssueOperations;

  beforeEach(async () => {
    db = initializeDatabase();
    operations = new IssueOperations(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  describe('MCP Tool Input Validation', () => {
    test('should validate enum values in create_issue tool', async () => {
      const createTool = createCreateIssueTool(db);
      
      // Test invalid priority values
      const invalidPriorities = ['urgent', 'low', 'highest', '', null, undefined, 123, true];
      
      for (const priority of invalidPriorities) {
        try {
          await createTool.execute({
            title: 'Test Issue',
            description: 'Test Description',
            priority: priority as any,
            project: 'test'
          });
          // If this doesn't throw, the validation failed
          fail(`Expected validation error for invalid priority: ${priority}`);
        } catch (error: any) {
          expect(error.message).toContain('priority');
        }
      }
    });

    test('should validate required fields in create_issue tool', async () => {
      const createTool = createCreateIssueTool(db);
      
      const incompleteInputs = [
        { description: 'Missing title' }, // missing title
        { title: 'Missing description' }, // missing description  
        { title: 'Test', description: 'Test' }, // missing priority and project
        { title: 'Test', description: 'Test', priority: 'high' }, // missing project
      ];

      for (const input of incompleteInputs) {
        try {
          await createTool.execute(input as any);
          fail(`Expected validation error for incomplete input: ${JSON.stringify(input)}`);
        } catch (error: any) {
          expect(error.message).toBeTruthy();
        }
      }
    });

    test('should validate issue_type enum values', async () => {
      const createTool = createCreateIssueTool(db);
      
      const invalidTypes = ['BugFix', 'security', 'SECURITY', 'unknown', 'critical', 123, null];
      
      for (const type of invalidTypes) {
        try {
          await createTool.execute({
            title: 'Test Issue',
            description: 'Test Description',
            priority: 'high',
            project: 'test',
            issue_type: type as any
          });
          fail(`Expected validation error for invalid issue_type: ${type}`);
        } catch (error: any) {
          expect(error.message).toBeTruthy();
        }
      }
    });
  });

  describe('Resource Exhaustion Prevention', () => {
    test('should handle extremely large string inputs without crashing', async () => {
      const createTool = createCreateIssueTool(db);
      
      // Test with very large strings (this should not crash but may be limited)
      const hugeString = 'X'.repeat(1000000); // 1MB string
      const mediumString = 'Y'.repeat(10000);  // 10KB string
      
      // Test creating issue with large strings
      try {
        await createTool.execute({
          title: mediumString.substring(0, 1000), // Reasonable title
          description: hugeString,
          priority: 'medium',
          project: 'test'
        });
        
        // If successful, verify it was stored correctly
        const issues = operations.listIssues({ project: 'test' });
        expect(issues.length).toBeGreaterThan(0);
        
        // Memory should not be exhausted
        const stats = operations.getStatistics();
        expect(stats).toBeDefined();
      } catch (error: any) {
        // If it fails, it should be a reasonable validation error, not a crash
        expect(error.message).toBeDefined();
        expect(error.message).not.toContain('out of memory');
        expect(error.message).not.toContain('ENOSPC');
      }
    });

    test('should handle malformed JSON in metadata fields', () => {
      const malformedJsonStrings = [
        '{"unclosed": "string',
        '{"duplicate": "key", "duplicate": "value"}',
        '{invalid json}',
        '{"nested": {"deep": {"very": {"extremely": "deep".repeat(1000)}}}}',
        '[]', // Array instead of object
        'null',
        'undefined',
        '{"function": function() { return "evil"; }}',
        '{"__proto__": {"admin": true}}'
      ];

      malformedJsonStrings.forEach(jsonStr => {
        expect(() => {
          operations.createIssue({
            issue_id: 'malformed-json-' + Date.now() + Math.random(),
            title: 'Malformed JSON Test',
            priority: 'medium',
            project: 'test',
            status: 'outstanding',
            work_status: 'available',
            attempt_count: 0,
            metadata: jsonStr as any // Force invalid metadata
          });
        }).not.toThrow();
      });
    });

    test('should prevent memory exhaustion from recursive operations', () => {
      // Create many issues rapidly to test memory handling
      const numIssues = 1000;
      
      expect(() => {
        for (let i = 0; i < numIssues; i++) {
          operations.createIssue({
            issue_id: `bulk-issue-${i}`,
            title: `Bulk Issue ${i}`,
            priority: 'low',
            project: 'bulk-test',
            status: 'outstanding',
            work_status: 'available',
            attempt_count: 0
          });
        }
      }).not.toThrow();
      
      // Verify all issues were created
      const issues = operations.listIssues({ project: 'bulk-test' });
      expect(issues.length).toBe(numIssues);
      
      // Memory should be manageable
      const stats = operations.getStatistics();
      expect(stats.total.count).toBeGreaterThanOrEqual(numIssues);
    });
  });

  describe('Path Traversal and File Security', () => {
    test('should handle malicious file paths safely', () => {
      const maliciousPaths = [
        '../../../etc/passwd',
        '..\\..\\windows\\system32\\config\\sam',
        '/dev/null',
        '/proc/self/environ',
        'file:///etc/passwd',
        'C:\\Windows\\System32\\drivers\\etc\\hosts',
        '\\\\server\\share\\file',
        'NUL:', // Windows device
        'CON:', // Windows device
        '\0', // Null byte
        'path/with\nnewline',
        'path/with\ttab',
        'very/long/path/' + 'dir/'.repeat(1000) + 'file.txt'
      ];

      maliciousPaths.forEach(path => {
        expect(() => {
          operations.createIssue({
            issue_id: 'path-test-' + Date.now() + Math.random(),
            title: 'Path Traversal Test',
            file_path: path,
            priority: 'low',
            project: 'security-test',
            status: 'outstanding',
            work_status: 'available',
            attempt_count: 0
          });
        }).not.toThrow();
      });
    });
  });

  describe('Concurrent Access Security', () => {
    test('should handle concurrent checkout attempts safely', () => {
      // Create a test issue
      const issue = operations.createIssue({
        issue_id: 'concurrent-test',
        title: 'Concurrent Test Issue',
        priority: 'high',
        project: 'test',
        status: 'outstanding',
        work_status: 'available',
        attempt_count: 0
      });

      // Simulate concurrent checkout attempts
      const agents = ['agent1', 'agent2', 'agent3', 'agent4', 'agent5'];
      const results: boolean[] = [];
      
      agents.forEach(agent => {
        const result = operations.checkoutIssue('concurrent-test', agent);
        results.push(result);
      });

      // Only one checkout should succeed
      const successCount = results.filter(r => r).length;
      expect(successCount).toBe(1);
      
      // Verify issue state is consistent
      const checkoutIssue = operations.getIssueById('concurrent-test');
      expect(checkoutIssue?.work_status).toBe('checked_out');
      expect(agents).toContain(checkoutIssue?.checked_out_by!);
    });

    test('should handle concurrent database operations without corruption', () => {
      const operations1 = new IssueOperations(db);
      const operations2 = new IssueOperations(db);
      
      // Perform concurrent operations
      const promises: Promise<any>[] = [];
      
      for (let i = 0; i < 50; i++) {
        promises.push(
          new Promise(resolve => {
            const ops = i % 2 === 0 ? operations1 : operations2;
            const result = ops.createIssue({
              issue_id: `concurrent-${i}`,
              title: `Concurrent Issue ${i}`,
              priority: 'medium',
              project: 'concurrent-test',
              status: 'outstanding',
              work_status: 'available',
              attempt_count: 0
            });
            resolve(result);
          })
        );
      }
      
      // All operations should complete without error
      expect(() => {
        Promise.all(promises);
      }).not.toThrow();
      
      // Verify database integrity
      const stats = operations.getStatistics();
      expect(stats.by_project.find((p: any) => p.project === 'concurrent-test')?.count).toBe(50);
    });
  });

  describe('Error Information Disclosure Prevention', () => {
    test('should not leak database schema information in error messages', () => {
      try {
        // Force a database error by corrupting operation
        const fakeOps = new IssueOperations(null as any);
        fakeOps.createIssue({
          issue_id: 'error-test',
          title: 'Error Test',
          priority: 'high',
          project: 'test',
          status: 'outstanding',
          work_status: 'available',
          attempt_count: 0
        });
        fail('Expected error to be thrown');
      } catch (error: any) {
        // Error message should not contain sensitive information
        const errorMsg = error.message.toLowerCase();
        const forbiddenKeywords = [
          'sqlite_master',
          'pragma',
          'schema',
          'table_info',
          'database schema',
          'column names',
          'primary key',
          'foreign key'
        ];
        
        forbiddenKeywords.forEach(keyword => {
          expect(errorMsg).not.toContain(keyword);
        });
      }
    });

    test('should sanitize file paths in error messages', () => {
      // This test checks for the low-priority issue identified by security analyst
      const sensitivePathOperations = [
        () => operations.getIssueById('/sensitive/path/to/database'),
        () => operations.checkoutIssue('/etc/passwd/../database.db', 'agent'),
        () => operations.updateStatus('C:\\Windows\\System32\\database.db', 'resolved', 'agent')
      ];

      sensitivePathOperations.forEach(op => {
        try {
          op();
        } catch (error: any) {
          // Error messages should not expose full system paths
          const errorMsg = error.message;
          expect(errorMsg).not.toMatch(/\/etc\/passwd/);
          expect(errorMsg).not.toMatch(/C:\\Windows\\System32/);
          expect(errorMsg).not.toMatch(/\/sensitive\/path/);
        }
      });
    });
  });
});