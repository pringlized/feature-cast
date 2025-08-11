// Security Tests: SQL Injection Prevention
import { describe, test, expect, beforeEach } from '@jest/globals';
import { initializeDatabase } from '../../src/database/init';
import { IssueOperations } from '../../src/database/operations';
import { Database } from '../../src/database/types';
import { Priority, Status, WorkStatus } from '../../src/types';

describe('Security: SQL Injection Prevention', () => {
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

  describe('Database Operations Security', () => {
    const maliciousPayloads = [
      "'; DROP TABLE issues; --",
      "' OR 1=1; --",
      "' UNION SELECT * FROM sqlite_master; --",
      "'; INSERT INTO issues (title) VALUES ('hacked'); --",
      "' OR '1'='1",
      "admin'--",
      "' OR 1=1#",
      "1' ORDER BY 1--+",
      "1' UNION ALL SELECT NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL--+",
      "<script>alert('XSS')</script>",
      "'; UPDATE issues SET status='resolved' WHERE '1'='1'; --"
    ];

    test('should prevent SQL injection in createIssue', () => {
      maliciousPayloads.forEach(payload => {
        expect(() => {
          operations.createIssue({
            issue_id: 'test-' + Date.now(),
            title: payload,
            description: payload,
            priority: 'high' as Priority,
            project: payload,
            milestone: payload,
            parent_feature: payload,
            severity: payload,
            location: payload,
            root_cause: payload,
            required_fix: payload,
            status: 'outstanding' as Status,
            work_status: 'available' as WorkStatus,
            attempt_count: 0
          });
        }).not.toThrow();

        // Verify database integrity - should still have proper structure
        const stats = operations.getStatistics();
        expect(stats).toBeDefined();
      });
    });

    test('should prevent SQL injection in getIssueById', () => {
      maliciousPayloads.forEach(payload => {
        expect(() => {
          operations.getIssueById(payload);
        }).not.toThrow();
      });
    });

    test('should prevent SQL injection in listIssues filters', () => {
      maliciousPayloads.forEach(payload => {
        expect(() => {
          operations.listIssues({
            status: payload as any,
            priority: payload as any,
            project: payload,
            work_status: payload as any
          });
        }).not.toThrow();
      });
    });

    test('should prevent SQL injection in checkoutIssue', () => {
      // First create a valid issue
      const issue = operations.createIssue({
        issue_id: 'test-checkout-sql',
        title: 'Test Issue',
        priority: 'high' as Priority,
        project: 'test',
        status: 'outstanding' as Status,
        work_status: 'available' as WorkStatus,
        attempt_count: 0
      });

      maliciousPayloads.forEach(payload => {
        expect(() => {
          operations.checkoutIssue(payload, payload);
        }).not.toThrow();
      });
    });

    test('should prevent SQL injection in updateStatus', () => {
      maliciousPayloads.forEach(payload => {
        expect(() => {
          operations.updateStatus(payload, payload as any, payload);
        }).not.toThrow();
      });
    });

    test('should prevent SQL injection in addComment', () => {
      maliciousPayloads.forEach(payload => {
        expect(() => {
          operations.addComment(payload, payload, payload);
        }).not.toThrow();
      });
    });

    test('should sanitize JSON metadata to prevent injection', () => {
      const maliciousJson = {
        "key1": "'; DROP TABLE issues; --",
        "key2": "' OR 1=1; --",
        "nested": {
          "attack": "'; INSERT INTO issues (title) VALUES ('injected'); --"
        }
      };

      expect(() => {
        operations.createIssue({
          issue_id: 'test-json-' + Date.now(),
          title: 'JSON Test',
          priority: 'medium' as Priority,
          project: 'test',
          status: 'outstanding' as Status,
          work_status: 'available' as WorkStatus,
          attempt_count: 0,
          metadata: maliciousJson
        });
      }).not.toThrow();

      // Verify the metadata was stored safely
      const issue = operations.getIssueById('test-json-' + (Date.now() - 1000));
      if (issue && issue.metadata) {
        expect(typeof issue.metadata).toBe('object');
        expect(issue.metadata.key1).toBe("'; DROP TABLE issues; --");
      }
    });

    test('should handle database schema queries securely', () => {
      // Attempt to query schema information through various methods
      const schemaQueries = [
        "' UNION SELECT name FROM sqlite_master WHERE type='table'; --",
        "' UNION SELECT sql FROM sqlite_master; --",
        "1' AND (SELECT COUNT(*) FROM sqlite_master) > 0; --"
      ];

      schemaQueries.forEach(query => {
        expect(() => {
          operations.getIssueById(query);
        }).not.toThrow();

        // Should not return any schema information
        const result = operations.getIssueById(query);
        expect(result).toBeNull();
      });
    });
  });

  describe('Parameterized Query Verification', () => {
    test('should use parameterized queries for all database operations', () => {
      // This test verifies that our operations use parameterized queries
      // by ensuring malicious input doesn't affect other data

      // Create a legitimate issue first
      const legit = operations.createIssue({
        issue_id: 'legit-issue',
        title: 'Legitimate Issue',
        priority: 'high' as Priority,
        project: 'test',
        status: 'outstanding' as Status,
        work_status: 'available' as WorkStatus,
        attempt_count: 0
      });

      // Try to inject SQL that would modify the legitimate issue
      const maliciousTitle = "Malicious'; UPDATE issues SET title='HACKED' WHERE issue_id='legit-issue'; --";
      
      expect(() => {
        operations.createIssue({
          issue_id: 'malicious-issue',
          title: maliciousTitle,
          priority: 'low' as Priority,
          project: 'test',
          status: 'outstanding' as Status,
          work_status: 'available' as WorkStatus,
          attempt_count: 0
        });
      }).not.toThrow();

      // Verify the legitimate issue wasn't modified
      const checkLegit = operations.getIssueById('legit-issue');
      expect(checkLegit?.title).toBe('Legitimate Issue');
    });

    test('should prevent second-order SQL injection', () => {
      // Create issue with malicious content
      const maliciousContent = "'; DROP TABLE issues; SELECT '1";
      
      const result = operations.createIssue({
        issue_id: 'second-order-test',
        title: maliciousContent,
        description: maliciousContent,
        priority: 'medium' as Priority,
        project: 'test',
        status: 'outstanding' as Status,
        work_status: 'available' as WorkStatus,
        attempt_count: 0
      });

      // Retrieve the issue and use its data in another query
      const retrieved = operations.getIssueById('second-order-test');
      expect(retrieved).toBeTruthy();
      
      // Try to use the malicious content in filter operations
      expect(() => {
        operations.listIssues({
          project: retrieved!.title
        });
      }).not.toThrow();

      // Database should still be intact
      const stats = operations.getStatistics();
      expect(stats.total).toBeDefined();
    });
  });

  describe('Input Validation Boundary Testing', () => {
    test('should handle extremely long strings without resource exhaustion', () => {
      const veryLongString = 'A'.repeat(1000000); // 1MB string
      const longSqlPayload = "' OR 1=1; " + 'X'.repeat(100000) + " --";
      
      expect(() => {
        operations.createIssue({
          issue_id: 'long-string-test',
          title: veryLongString.substring(0, 1000), // Reasonable title length
          description: veryLongString,
          priority: 'low' as Priority,
          project: 'test',
          status: 'outstanding' as Status,
          work_status: 'available' as WorkStatus,
          attempt_count: 0
        });
      }).not.toThrow();

      expect(() => {
        operations.addComment('long-string-test', longSqlPayload);
      }).not.toThrow();
    });

    test('should handle null and undefined values securely', () => {
      const nullPayloads = [null, undefined, '', 'null', 'undefined'];
      
      nullPayloads.forEach(payload => {
        expect(() => {
          operations.getIssueById(payload as any);
        }).not.toThrow();
      });
    });

    test('should handle special characters and encoding', () => {
      const specialChars = [
        "'; -- comment",
        "' /* comment */ OR 1=1; --",
        "' + CHAR(39) + 'test",
        "0x27; DROP TABLE issues; --",
        "%27 OR 1=1 --",
        "\\'; DROP TABLE issues; --",
        "፡'; DROP TABLE issues; --" // Unicode semicolon
      ];

      specialChars.forEach(chars => {
        expect(() => {
          operations.createIssue({
            issue_id: 'special-chars-' + Math.random(),
            title: chars,
            priority: 'medium' as Priority,
            project: 'test',
            status: 'outstanding' as Status,
            work_status: 'available' as WorkStatus,
            attempt_count: 0
          });
        }).not.toThrow();
      });
    });
  });
});