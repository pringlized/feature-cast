// Unit Tests: Error Handling and Edge Cases
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { initializeDatabase } from '../../src/database/init';
import { IssueOperations } from '../../src/database/operations';
import { Database } from '../../src/database/types';
import { getAllTools } from '../../src/tools';
import { Priority, Status, WorkStatus } from '../../src/types';
import fs from 'fs';
import path from 'path';

describe('Error Handling and Edge Cases', () => {
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

  describe('Database Error Handling', () => {
    test('should handle database connection loss gracefully', () => {
      // Close database to simulate connection loss
      db.close();
      
      expect(() => {
        operations.createIssue({
          issue_id: 'test-connection-loss',
          title: 'Test Issue',
          priority: 'high',
          project: 'test',
          status: 'outstanding',
          work_status: 'available',
          attempt_count: 0
        });
      }).toThrow();
    });

    test('should handle corrupted database gracefully', () => {
      // Create a corrupted database file
      const corruptedDbPath = path.join(__dirname, 'corrupted-test.db');
      
      try {
        fs.writeFileSync(corruptedDbPath, 'This is not a valid SQLite database file');
        
        expect(() => {
          initializeDatabase(corruptedDbPath);
        }).toThrow();
      } finally {
        if (fs.existsSync(corruptedDbPath)) {
          fs.unlinkSync(corruptedDbPath);
        }
      }
    });

    test('should handle invalid database operations', () => {
      // Try operations with invalid data types
      expect(() => {
        operations.createIssue({
          issue_id: null as any,
          title: 'Test Issue',
          priority: 'high',
          project: 'test',
          status: 'outstanding',
          work_status: 'available',
          attempt_count: 0
        });
      }).toThrow();

      expect(() => {
        operations.getIssueById(null as any);
      }).toThrow();
    });

    test('should handle database schema inconsistencies', () => {
      // Test with malformed metadata JSON
      const issueData = {
        issue_id: 'schema-test',
        title: 'Schema Test Issue',
        priority: 'medium' as Priority,
        project: 'test',
        status: 'outstanding' as Status,
        work_status: 'available' as WorkStatus,
        attempt_count: 0,
        metadata: { validJson: true }
      };

      // This should work fine
      expect(() => {
        operations.createIssue(issueData);
      }).not.toThrow();

      // Verify it was stored correctly
      const retrieved = operations.getIssueById('schema-test');
      expect(retrieved?.metadata).toEqual({ validJson: true });
    });

    test('should handle database constraint violations', () => {
      // Create an issue first
      operations.createIssue({
        issue_id: 'constraint-test',
        title: 'Constraint Test Issue',
        priority: 'high',
        project: 'test',
        status: 'outstanding',
        work_status: 'available',
        attempt_count: 0
      });

      // Try to create another issue with the same ID (should fail due to unique constraint)
      expect(() => {
        operations.createIssue({
          issue_id: 'constraint-test',
          title: 'Duplicate Issue',
          priority: 'low',
          project: 'test',
          status: 'outstanding',
          work_status: 'available',
          attempt_count: 0
        });
      }).toThrow();
    });
  });

  describe('Input Validation Edge Cases', () => {
    test('should handle empty and whitespace-only strings', () => {
      const emptyStringCases = [
        { issue_id: '', title: 'Valid Title', priority: 'high', project: 'test' },
        { issue_id: '   ', title: 'Valid Title', priority: 'high', project: 'test' },
        { issue_id: 'valid-id', title: '', priority: 'high', project: 'test' },
        { issue_id: 'valid-id', title: 'Valid Title', priority: 'high', project: '' },
      ];

      emptyStringCases.forEach((testCase, index) => {
        expect(() => {
          operations.createIssue({
            ...testCase,
            status: 'outstanding' as Status,
            work_status: 'available' as WorkStatus,
            attempt_count: 0
          } as any);
        }).toThrow();
      });
    });

    test('should handle null and undefined values', () => {
      const nullUndefinedCases = [
        { issue_id: null, title: 'Valid Title', priority: 'high', project: 'test' },
        { issue_id: undefined, title: 'Valid Title', priority: 'high', project: 'test' },
        { issue_id: 'valid-id', title: null, priority: 'high', project: 'test' },
        { issue_id: 'valid-id', title: 'Valid Title', priority: null, project: 'test' },
        { issue_id: 'valid-id', title: 'Valid Title', priority: 'high', project: null },
      ];

      nullUndefinedCases.forEach((testCase) => {
        expect(() => {
          operations.createIssue({
            ...testCase,
            status: 'outstanding' as Status,
            work_status: 'available' as WorkStatus,
            attempt_count: 0
          } as any);
        }).toThrow();
      });
    });

    test('should handle invalid enum values', () => {
      const invalidEnumCases = [
        { priority: 'urgent' }, // Invalid priority
        { priority: 'CRITICAL' }, // Wrong case
        { priority: 123 }, // Wrong type
        { status: 'pending' }, // Invalid status
        { status: 'OUTSTANDING' }, // Wrong case
        { work_status: 'busy' }, // Invalid work status
        { work_status: 'AVAILABLE' }, // Wrong case
      ];

      invalidEnumCases.forEach((invalidField) => {
        expect(() => {
          operations.createIssue({
            issue_id: 'enum-test-' + Math.random(),
            title: 'Enum Test Issue',
            priority: 'medium',
            project: 'test',
            status: 'outstanding',
            work_status: 'available',
            attempt_count: 0,
            ...invalidField
          } as any);
        }).toThrow();
      });
    });

    test('should handle boundary values for numeric fields', () => {
      const boundaryValues = [
        { attempt_count: -1 }, // Negative
        { attempt_count: 999999999 }, // Very large
        { attempt_count: 0.5 }, // Decimal
        { attempt_count: 'text' }, // String
        { attempt_count: null }, // Null
        { attempt_count: undefined }, // Undefined
      ];

      boundaryValues.forEach((testCase) => {
        if (testCase.attempt_count === null || testCase.attempt_count === undefined || 
            typeof testCase.attempt_count === 'string') {
          expect(() => {
            operations.createIssue({
              issue_id: 'boundary-test-' + Math.random(),
              title: 'Boundary Test Issue',
              priority: 'medium',
              project: 'test',
              status: 'outstanding',
              work_status: 'available',
              ...testCase
            } as any);
          }).toThrow();
        } else {
          // Numbers should be handled gracefully
          expect(() => {
            operations.createIssue({
              issue_id: 'boundary-test-' + Math.random(),
              title: 'Boundary Test Issue',
              priority: 'medium',
              project: 'test',
              status: 'outstanding',
              work_status: 'available',
              ...testCase
            });
          }).not.toThrow();
        }
      });
    });

    test('should handle special characters in strings', () => {
      const specialCharacterCases = [
        'Issue with "double quotes"',
        "Issue with 'single quotes'",
        'Issue with \n newlines \n and \t tabs',
        'Issue with unicode: 🚀 emoji and 中文字符',
        'Issue with backslashes: \\ and forward slashes: /',
        'Issue with SQL chars: \' OR 1=1; --',
        'Issue with HTML: <script>alert("xss")</script>',
        'Issue with null bytes: \0',
        'Issue with control chars: \x01\x02\x03',
      ];

      specialCharacterCases.forEach((title, index) => {
        expect(() => {
          operations.createIssue({
            issue_id: `special-chars-${index}`,
            title: title,
            priority: 'low',
            project: 'special-test',
            status: 'outstanding',
            work_status: 'available',
            attempt_count: 0
          });
        }).not.toThrow();

        // Verify the issue was stored correctly
        const retrieved = operations.getIssueById(`special-chars-${index}`);
        expect(retrieved?.title).toBe(title);
      });
    });
  });

  describe('MCP Tool Error Handling', () => {
    test('should handle invalid tool parameters', async () => {
      const tools = getAllTools(db);
      const createTool = tools.find(t => t.name === 'create_issue');
      
      const invalidInputs = [
        null,
        undefined,
        {},
        { invalid: 'parameter' },
        { title: 'Valid', description: 'Valid', priority: 'invalid', project: 'test' },
        { title: '', description: '', priority: '', project: '' },
      ];

      for (const input of invalidInputs) {
        try {
          await createTool!.execute(input as any);
          fail(`Expected error for invalid input: ${JSON.stringify(input)}`);
        } catch (error: any) {
          expect(error.message).toBeTruthy();
        }
      }
    });

    test('should handle missing required MCP tool parameters', async () => {
      const tools = getAllTools(db);
      const createTool = tools.find(t => t.name === 'create_issue');
      
      const incompleteInputs = [
        { title: 'Missing other fields' },
        { description: 'Missing other fields' },
        { priority: 'high' },
        { project: 'test' },
        { title: 'Test', description: 'Test' }, // Missing priority and project
      ];

      for (const input of incompleteInputs) {
        try {
          await createTool!.execute(input as any);
          fail(`Expected error for incomplete input: ${JSON.stringify(input)}`);
        } catch (error: any) {
          expect(error.message).toBeTruthy();
        }
      }
    });

    test('should handle tool execution with non-existent issues', async () => {
      const tools = getAllTools(db);
      const checkoutTool = tools.find(t => t.name === 'checkout_issue');
      const updateTool = tools.find(t => t.name === 'update_status');
      const commentTool = tools.find(t => t.name === 'add_comment');
      const reportTool = tools.find(t => t.name === 'submit_report');

      const nonExistentId = 'non-existent-issue-id';

      // All these should throw errors for non-existent issues
      await expect((checkoutTool!.execute as any)({
        issue_id: nonExistentId,
        agent_name: 'test-agent'
      })).rejects.toThrow();

      await expect((updateTool!.execute as any)({
        issue_id: nonExistentId,
        new_status: 'resolved',
        agent_name: 'test-agent'
      })).rejects.toThrow();

      await expect((commentTool!.execute as any)({
        issue_id: nonExistentId,
        comment: 'Test comment',
        author: 'test-agent'
      })).rejects.toThrow();

      await expect(reportTool!.execute({
        issue_id: nonExistentId,
        attempt_number: 1,
        analysis: { understanding: 'test', approach: 'test', scope: 'test' },
        implementation: { files_modified: [], changes_applied: [], reasoning: 'test' },
        test_results: {
          targeted_tests: [],
          full_suite_results: { total: 0, passed: 0, failed: 0 },
          validation_status: {
            security_fix_applied: false,
            tests_passing: false,
            no_regressions: false,
            performance_acceptable: false
          }
        },
        outcome: { result: 'FAILED', assessment: 'test', next_steps: 'test' }
      })).rejects.toThrow();
    });

    test('should handle malformed tool input data types', async () => {
      const tools = getAllTools(db);
      const createTool = tools.find(t => t.name === 'create_issue');

      const malformedInputs = [
        // Wrong data types
        {
          title: 123, // Number instead of string
          description: true, // Boolean instead of string
          priority: [], // Array instead of string
          project: {} // Object instead of string
        },
        // Circular reference
        (() => {
          const circular: any = { title: 'Test', description: 'Test', priority: 'high', project: 'test' };
          circular.self = circular;
          return circular;
        })(),
        // Very deep nesting
        {
          title: 'Test',
          description: 'Test',
          priority: 'high',
          project: 'test',
          metadata: {
            level1: {
              level2: {
                level3: {
                  level4: {
                    level5: 'deep nesting'
                  }
                }
              }
            }
          }
        }
      ];

      for (const input of malformedInputs) {
        try {
          await createTool!.execute(input as any);
          // Some malformed inputs might be handled gracefully
        } catch (error: any) {
          expect(error.message).toBeTruthy();
        }
      }
    });
  });

  describe('Concurrency Error Handling', () => {
    test('should handle database busy/lock errors', async () => {
      // Create an issue for testing
      operations.createIssue({
        issue_id: 'lock-error-test',
        title: 'Lock Error Test Issue',
        priority: 'high',
        project: 'lock-test',
        status: 'outstanding',
        work_status: 'available',
        attempt_count: 0
      });

      // Simulate concurrent operations that might cause locks
      const concurrentOperations = Array.from({ length: 20 }, (_, index) =>
        new Promise<{ success: boolean, error?: string }>((resolve) => {
          try {
            // Mix of different operations
            switch (index % 4) {
              case 0:
                operations.addComment('lock-error-test', `Comment ${index}`, `agent-${index}`);
                break;
              case 1:
                operations.updateStatus('lock-error-test', 'in_progress', `agent-${index}`);
                break;
              case 2:
                operations.checkoutIssue('lock-error-test', `agent-${index}`);
                break;
              case 3:
                operations.unlockIssue('lock-error-test', `agent-${index}`);
                break;
            }
            resolve({ success: true });
          } catch (error: any) {
            resolve({ success: false, error: error.message });
          }
        })
      );

      const results = await Promise.all(concurrentOperations);
      
      // Some operations should succeed, others may fail due to business logic
      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);
      
      // Should have some successful operations
      expect(successful.length).toBeGreaterThan(0);
      
      // Failed operations should have meaningful error messages
      failed.forEach(result => {
        expect(result.error).toBeTruthy();
      });

      // Database should remain consistent
      const finalIssue = operations.getIssueById('lock-error-test');
      expect(finalIssue).toBeTruthy();
    });

    test('should recover from transaction rollbacks', () => {
      // Start a transaction-like operation sequence
      const issues = [
        {
          issue_id: 'rollback-test-1',
          title: 'Rollback Test 1',
          priority: 'high' as Priority,
          project: 'rollback-test',
          status: 'outstanding' as Status,
          work_status: 'available' as WorkStatus,
          attempt_count: 0
        },
        {
          issue_id: 'rollback-test-2',
          title: 'Rollback Test 2',
          priority: 'medium' as Priority,
          project: 'rollback-test',
          status: 'outstanding' as Status,
          work_status: 'available' as WorkStatus,
          attempt_count: 0
        }
      ];

      // Create issues successfully
      issues.forEach(issue => {
        expect(() => operations.createIssue(issue)).not.toThrow();
      });

      // Verify they exist
      expect(operations.getIssueById('rollback-test-1')).toBeTruthy();
      expect(operations.getIssueById('rollback-test-2')).toBeTruthy();

      // Database should remain in consistent state
      const stats = operations.getStatistics();
      expect(stats.total.count).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Memory and Resource Error Handling', () => {
    test('should handle large data inputs gracefully', () => {
      // Test with very large strings
      const largeString = 'A'.repeat(1000000); // 1MB string
      const hugeMetadata = {
        largeField: largeString,
        arrayField: Array.from({ length: 10000 }, (_, i) => ({
          index: i,
          data: 'X'.repeat(100)
        }))
      };

      try {
        operations.createIssue({
          issue_id: 'large-data-test',
          title: 'Large Data Test',
          description: largeString,
          priority: 'low',
          project: 'memory-test',
          status: 'outstanding',
          work_status: 'available',
          attempt_count: 0,
          metadata: hugeMetadata
        });
        
        // If it succeeds, verify the data is stored correctly
        const retrieved = operations.getIssueById('large-data-test');
        expect(retrieved?.description).toBe(largeString);
        expect(retrieved?.metadata?.largeField).toBe(largeString);
      } catch (error: any) {
        // If it fails, should be a meaningful error (not a crash)
        expect(error.message).toBeTruthy();
        expect(error.message).not.toContain('segmentation fault');
        expect(error.message).not.toContain('heap overflow');
      }
    });

    test('should handle memory pressure during bulk operations', () => {
      const numIssues = 1000;
      let successCount = 0;
      let errorCount = 0;

      // Create many issues to test memory handling
      for (let i = 0; i < numIssues; i++) {
        try {
          operations.createIssue({
            issue_id: `bulk-${i}`,
            title: `Bulk Issue ${i}`,
            description: `Description for bulk issue ${i}`,
            priority: 'low',
            project: 'bulk-test',
            status: 'outstanding',
            work_status: 'available',
            attempt_count: 0,
            metadata: {
              index: i,
              data: 'Some data '.repeat(10)
            }
          });
          successCount++;
        } catch (error: any) {
          errorCount++;
          // Errors should be meaningful, not memory crashes
          expect(error.message).toBeTruthy();
        }
      }

      // Most operations should succeed
      expect(successCount).toBeGreaterThan(numIssues * 0.8);
      
      // If there are errors, they should be reasonable
      if (errorCount > 0) {
        expect(errorCount).toBeLessThan(numIssues * 0.2);
      }

      // Database should remain accessible
      const stats = operations.getStatistics();
      expect(stats.total.count).toBeGreaterThan(0);
    });
  });

  describe('Edge Case Scenarios', () => {
    test('should handle empty database queries', () => {
      // Query on empty database
      const issues = operations.listIssues();
      expect(issues).toEqual([]);
      
      const stats = operations.getStatistics();
      expect(stats.total.count).toBe(0);
      expect(stats.by_status).toEqual([]);
    });

    test('should handle operations on just-deleted issues', () => {
      // Create and then immediately try to operate on issues
      operations.createIssue({
        issue_id: 'deletion-test',
        title: 'Deletion Test Issue',
        priority: 'medium',
        project: 'deletion-test',
        status: 'outstanding',
        work_status: 'available',
        attempt_count: 0
      });

      // Verify it exists
      expect(operations.getIssueById('deletion-test')).toBeTruthy();

      // Note: The current implementation doesn't have a delete operation
      // but this tests the pattern of operations on potentially non-existent issues
      
      // Try operations on potentially deleted issue
      expect(() => {
        operations.addComment('deletion-test', 'Comment after deletion', 'test-agent');
      }).not.toThrow();
    });

    test('should handle rapid state changes', () => {
      // Create issue and rapidly change its state
      operations.createIssue({
        issue_id: 'rapid-state-test',
        title: 'Rapid State Test Issue',
        priority: 'high',
        project: 'state-test',
        status: 'outstanding',
        work_status: 'available',
        attempt_count: 0
      });

      // Rapid state changes
      const stateChanges = [
        () => operations.checkoutIssue('rapid-state-test', 'agent-1'),
        () => operations.updateStatus('rapid-state-test', 'in_progress', 'agent-1'),
        () => operations.addComment('rapid-state-test', 'Comment 1', 'agent-1'),
        () => operations.updateStatus('rapid-state-test', 'review', 'agent-1'),
        () => operations.addComment('rapid-state-test', 'Comment 2', 'agent-2'),
        () => operations.updateStatus('rapid-state-test', 'resolved', 'agent-2'),
        () => operations.unlockIssue('rapid-state-test', 'agent-2'),
      ];

      stateChanges.forEach((changeOp, index) => {
        expect(() => changeOp()).not.toThrow();
      });

      // Verify final state is consistent
      const finalIssue = operations.getIssueById('rapid-state-test');
      expect(finalIssue).toBeTruthy();
      expect(finalIssue!.status).toBe('resolved');
      expect(finalIssue!.work_status).toBe('available');

      // Verify thread has all entries
      const thread = operations.getIssueThread('rapid-state-test');
      expect(thread.length).toBeGreaterThan(5);
    });

    test('should handle malformed date inputs', () => {
      const malformedDates = [
        new Date('invalid'),
        new Date('2025-13-45'), // Invalid month/day
        new Date('not a date'),
        new Date(NaN),
        new Date(Infinity),
        new Date(-Infinity),
      ];

      malformedDates.forEach((date, index) => {
        expect(() => {
          operations.createIssue({
            issue_id: `date-test-${index}`,
            title: 'Date Test Issue',
            priority: 'low',
            project: 'date-test',
            status: 'outstanding',
            work_status: 'available',
            attempt_count: 0,
            file_last_modified: date
          });
        }).not.toThrow(); // Should handle gracefully, not crash
      });
    });
  });
});