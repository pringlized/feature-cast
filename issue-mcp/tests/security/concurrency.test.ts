// Security Tests: Concurrency and Race Conditions
import { describe, test, expect, beforeEach } from '@jest/globals';
import { initializeDatabase } from '../../src/database/init';
import { IssueOperations } from '../../src/database/operations';
import { Database } from '../../src/database/types';
import { Priority, Status, WorkStatus } from '../../src/types';

describe('Security: Concurrency and Race Conditions', () => {
  let db: Database;

  beforeEach(async () => {
    db = initializeDatabase();
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  describe('Concurrent Checkout Protection', () => {
    test('should prevent race conditions in concurrent checkout attempts', async () => {
      const operations1 = new IssueOperations(db);
      const operations2 = new IssueOperations(db);
      const operations3 = new IssueOperations(db);

      // Create test issue
      operations1.createIssue({
        issue_id: 'concurrent-checkout-test',
        title: 'Concurrent Checkout Test',
        priority: 'critical',
        project: 'concurrency-test',
        status: 'outstanding',
        work_status: 'available',
        attempt_count: 0
      });

      // Simulate concurrent checkout attempts
      const checkoutPromises = [
        new Promise(resolve => {
          setTimeout(() => {
            const result = operations1.checkoutIssue('concurrent-checkout-test', 'agent-1');
            resolve({ agent: 'agent-1', success: result });
          }, Math.random() * 10);
        }),
        new Promise(resolve => {
          setTimeout(() => {
            const result = operations2.checkoutIssue('concurrent-checkout-test', 'agent-2');
            resolve({ agent: 'agent-2', success: result });
          }, Math.random() * 10);
        }),
        new Promise(resolve => {
          setTimeout(() => {
            const result = operations3.checkoutIssue('concurrent-checkout-test', 'agent-3');
            resolve({ agent: 'agent-3', success: result });
          }, Math.random() * 10);
        })
      ];

      const results = await Promise.all(checkoutPromises) as Array<{agent: string, success: boolean}>;
      
      // Only one checkout should succeed
      const successCount = results.filter(r => r.success).length;
      expect(successCount).toBe(1);

      // Verify database integrity - issue should be checked out by exactly one agent
      const issue = operations1.getIssueById('concurrent-checkout-test');
      expect(issue?.work_status).toBe('checked_out');
      expect(issue?.checked_out_by).toBeTruthy();
      
      // The successful agent should be one of the three
      const successfulAgent = results.find(r => r.success)?.agent;
      expect(issue?.checked_out_by).toBe(successfulAgent);
    });

    test('should handle high-volume concurrent checkout attempts', async () => {
      const numAgents = 50;
      const operations = Array.from({ length: numAgents }, () => new IssueOperations(db));

      // Create test issue
      operations[0].createIssue({
        issue_id: 'high-volume-checkout-test',
        title: 'High Volume Checkout Test',
        priority: 'high',
        project: 'stress-test',
        status: 'outstanding',
        work_status: 'available',
        attempt_count: 0
      });

      // Simulate many concurrent checkout attempts
      const checkoutPromises = operations.map((ops, index) => 
        new Promise(resolve => {
          // Random delay to increase chance of race conditions
          setTimeout(() => {
            try {
              const result = ops.checkoutIssue('high-volume-checkout-test', `stress-agent-${index}`);
              resolve({ agentIndex: index, success: result, error: null });
            } catch (error: any) {
              resolve({ agentIndex: index, success: false, error: error.message });
            }
          }, Math.random() * 20);
        })
      );

      const results = await Promise.all(checkoutPromises) as Array<{agentIndex: number, success: boolean, error: string | null}>;
      
      // Only one checkout should succeed
      const successfulCheckouts = results.filter(r => r.success);
      expect(successfulCheckouts.length).toBe(1);

      // No errors should occur due to race conditions
      const errors = results.filter(r => r.error).map(r => r.error);
      expect(errors.length).toBe(0);

      // Verify database consistency
      const issue = operations[0].getIssueById('high-volume-checkout-test');
      expect(issue?.work_status).toBe('checked_out');
      expect(issue?.checked_out_by).toBe(`stress-agent-${successfulCheckouts[0].agentIndex}`);
    });
  });

  describe('Concurrent Database Operations', () => {
    test('should maintain data integrity during concurrent create operations', async () => {
      const numOperations = 100;
      const operations = Array.from({ length: 10 }, () => new IssueOperations(db));

      const createPromises = Array.from({ length: numOperations }, (_, index) =>
        new Promise(resolve => {
          const opsIndex = index % operations.length;
          setTimeout(() => {
            try {
              const result = operations[opsIndex].createIssue({
                issue_id: `concurrent-create-${index}`,
                title: `Concurrent Create Test ${index}`,
                priority: 'medium' as Priority,
                project: 'concurrent-test',
                status: 'outstanding' as Status,
                work_status: 'available' as WorkStatus,
                attempt_count: 0
              });
              resolve({ index, success: true, result, error: null });
            } catch (error: any) {
              resolve({ index, success: false, result: null, error: error.message });
            }
          }, Math.random() * 50);
        })
      );

      const results = await Promise.all(createPromises) as Array<{index: number, success: boolean, result: any, error: string | null}>;
      
      // All creates should succeed
      const successfulCreates = results.filter(r => r.success);
      expect(successfulCreates.length).toBe(numOperations);

      // No errors should occur
      const errors = results.filter(r => r.error);
      expect(errors.length).toBe(0);

      // Verify all issues exist in database
      const allIssues = operations[0].listIssues({ project: 'concurrent-test' });
      expect(allIssues.length).toBe(numOperations);

      // Verify all issue IDs are unique
      const issueIds = new Set(allIssues.map(issue => issue.issue_id));
      expect(issueIds.size).toBe(numOperations);
    });

    test('should handle concurrent status updates safely', async () => {
      const operations1 = new IssueOperations(db);
      const operations2 = new IssueOperations(db);
      const operations3 = new IssueOperations(db);

      // Create test issue
      operations1.createIssue({
        issue_id: 'concurrent-status-test',
        title: 'Concurrent Status Test',
        priority: 'high',
        project: 'status-test',
        status: 'outstanding',
        work_status: 'available',
        attempt_count: 0
      });

      // Simulate concurrent status updates
      const statusPromises = [
        new Promise(resolve => {
          setTimeout(() => {
            const result = operations1.updateStatus('concurrent-status-test', 'in_progress', 'agent-1');
            resolve({ agent: 'agent-1', status: 'in_progress', success: result });
          }, Math.random() * 10);
        }),
        new Promise(resolve => {
          setTimeout(() => {
            const result = operations2.updateStatus('concurrent-status-test', 'review', 'agent-2');
            resolve({ agent: 'agent-2', status: 'review', success: result });
          }, Math.random() * 10);
        }),
        new Promise(resolve => {
          setTimeout(() => {
            const result = operations3.updateStatus('concurrent-status-test', 'resolved', 'agent-3');
            resolve({ agent: 'agent-3', status: 'resolved', success: result });
          }, Math.random() * 10);
        })
      ];

      const results = await Promise.all(statusPromises) as Array<{agent: string, status: string, success: boolean}>;
      
      // All status updates should succeed (last one wins)
      expect(results.every(r => r.success)).toBe(true);

      // Issue should have one of the target statuses
      const finalIssue = operations1.getIssueById('concurrent-status-test');
      const finalStatus = finalIssue?.status;
      expect(['in_progress', 'review', 'resolved']).toContain(finalStatus);

      // Thread should contain all status changes
      const thread = operations1.getIssueThread('concurrent-status-test');
      const statusEntries = thread.filter(entry => entry.entry_type === 'status_change');
      expect(statusEntries.length).toBe(3);
    });

    test('should handle concurrent comment additions safely', async () => {
      const numComments = 50;
      const operations = Array.from({ length: 5 }, () => new IssueOperations(db));

      // Create test issue
      operations[0].createIssue({
        issue_id: 'concurrent-comments-test',
        title: 'Concurrent Comments Test',
        priority: 'low',
        project: 'comment-test',
        status: 'in_progress',
        work_status: 'checked_out',
        attempt_count: 0
      });

      const commentPromises = Array.from({ length: numComments }, (_, index) =>
        new Promise(resolve => {
          const opsIndex = index % operations.length;
          setTimeout(() => {
            try {
              const result = operations[opsIndex].addComment(
                'concurrent-comments-test',
                `Concurrent comment ${index}`,
                `agent-${index % 5}`
              );
              resolve({ index, success: result, error: null });
            } catch (error: any) {
              resolve({ index, success: false, error: error.message });
            }
          }, Math.random() * 30);
        })
      );

      const results = await Promise.all(commentPromises) as Array<{index: number, success: boolean, error: string | null}>;
      
      // All comments should be added successfully
      const successfulComments = results.filter(r => r.success);
      expect(successfulComments.length).toBe(numComments);

      // Verify all comments exist in thread
      const thread = operations[0].getIssueThread('concurrent-comments-test');
      const commentEntries = thread.filter(entry => entry.entry_type === 'comment');
      expect(commentEntries.length).toBe(numComments);

      // Comments should be in chronological order
      for (let i = 1; i < commentEntries.length; i++) {
        expect(commentEntries[i-1].created_at!.getTime()).toBeLessThanOrEqual(commentEntries[i].created_at!.getTime());
      }
    });
  });

  describe('Database Lock and Transaction Safety', () => {
    test('should handle database locks gracefully', async () => {
      const operations1 = new IssueOperations(db);
      const operations2 = new IssueOperations(db);

      // Create test issue
      operations1.createIssue({
        issue_id: 'lock-test',
        title: 'Database Lock Test',
        priority: 'critical',
        project: 'lock-test',
        status: 'outstanding',
        work_status: 'available',
        attempt_count: 0
      });

      // Simulate operations that might cause database locks
      const operationPromises = [
        // Long-running operation simulation
        new Promise(resolve => {
          setTimeout(() => {
            try {
              // Multiple rapid operations
              for (let i = 0; i < 10; i++) {
                operations1.addComment('lock-test', `Rapid comment ${i}`, 'rapid-agent');
              }
              resolve({ operation: 'rapid-comments', success: true, error: null });
            } catch (error: any) {
              resolve({ operation: 'rapid-comments', success: false, error: error.message });
            }
          }, 5);
        }),
        
        new Promise(resolve => {
          setTimeout(() => {
            try {
              operations2.checkoutIssue('lock-test', 'checkout-agent');
              resolve({ operation: 'checkout', success: true, error: null });
            } catch (error: any) {
              resolve({ operation: 'checkout', success: false, error: error.message });
            }
          }, 10);
        }),

        new Promise(resolve => {
          setTimeout(() => {
            try {
              operations2.updateStatus('lock-test', 'in_progress', 'status-agent');
              resolve({ operation: 'status-update', success: true, error: null });
            } catch (error: any) {
              resolve({ operation: 'status-update', success: false, error: error.message });
            }
          }, 15);
        })
      ];

      const results = await Promise.all(operationPromises) as Array<{operation: string, success: boolean, error: string | null}>;
      
      // All operations should complete without database lock errors
      const lockErrors = results.filter(r => r.error && r.error.toLowerCase().includes('lock'));
      expect(lockErrors.length).toBe(0);

      // At least some operations should succeed
      const successfulOps = results.filter(r => r.success);
      expect(successfulOps.length).toBeGreaterThan(0);
    });

    test('should maintain referential integrity under concurrent access', async () => {
      const operations = Array.from({ length: 5 }, () => new IssueOperations(db));

      // Create multiple issues concurrently
      const createPromises = Array.from({ length: 20 }, (_, index) =>
        new Promise(resolve => {
          const opsIndex = index % operations.length;
          setTimeout(() => {
            try {
              operations[opsIndex].createIssue({
                issue_id: `integrity-test-${index}`,
                title: `Integrity Test ${index}`,
                priority: 'medium',
                project: 'integrity-test',
                status: 'outstanding',
                work_status: 'available',
                attempt_count: 0
              });
              resolve({ index, operation: 'create', success: true });
            } catch (error) {
              resolve({ index, operation: 'create', success: false });
            }
          }, Math.random() * 20);
        })
      );

      await Promise.all(createPromises);

      // Now perform concurrent operations on these issues
      const issues = operations[0].listIssues({ project: 'integrity-test' });
      
      const operationPromises = issues.flatMap((issue, issueIndex) => {
        const opsIndex = issueIndex % operations.length;
        return [
          // Add comment
          new Promise(resolve => {
            setTimeout(() => {
              try {
                operations[opsIndex].addComment(issue.issue_id, `Comment for ${issue.issue_id}`, 'integrity-agent');
                resolve({ issueId: issue.issue_id, operation: 'comment', success: true });
              } catch (error) {
                resolve({ issueId: issue.issue_id, operation: 'comment', success: false });
              }
            }, Math.random() * 30);
          }),
          
          // Try to checkout
          new Promise(resolve => {
            setTimeout(() => {
              try {
                const success = operations[opsIndex].checkoutIssue(issue.issue_id, `agent-${issueIndex}`);
                resolve({ issueId: issue.issue_id, operation: 'checkout', success });
              } catch (error) {
                resolve({ issueId: issue.issue_id, operation: 'checkout', success: false });
              }
            }, Math.random() * 30);
          })
        ];
      });

      const operationResults = await Promise.all(operationPromises);
      
      // Verify database integrity after all operations
      const finalIssues = operations[0].listIssues({ project: 'integrity-test' });
      expect(finalIssues.length).toBe(20);

      // Check that all issues have consistent thread entries
      finalIssues.forEach(issue => {
        const thread = operations[0].getIssueThread(issue.issue_id);
        
        // Each issue should have at least one thread entry (comment)
        expect(thread.length).toBeGreaterThan(0);
        
        // All thread entries should reference a valid issue
        thread.forEach(entry => {
          expect(entry.issue_id).toBe(issue.id);
        });
      });
    });
  });

  describe('Memory and Resource Management', () => {
    test('should handle memory pressure during concurrent operations', async () => {
      const numOperations = 200;
      const operations = Array.from({ length: 10 }, () => new IssueOperations(db));

      // Create many issues with large metadata
      const largeMetadata = {
        description: 'Large description. '.repeat(1000),
        details: Array.from({ length: 100 }, (_, i) => ({
          item: i,
          data: 'Some data. '.repeat(50)
        })),
        history: Array.from({ length: 50 }, (_, i) => `History entry ${i}: ${'x'.repeat(100)}`)
      };

      const promises = Array.from({ length: numOperations }, (_, index) =>
        new Promise(resolve => {
          const opsIndex = index % operations.length;
          setTimeout(() => {
            try {
              const result = operations[opsIndex].createIssue({
                issue_id: `memory-test-${index}`,
                title: `Memory Test ${index}`,
                priority: 'low',
                project: 'memory-test',
                status: 'outstanding',
                work_status: 'available',
                attempt_count: 0,
                metadata: largeMetadata,
                description: largeMetadata.description
              });
              resolve({ index, success: true, error: null });
            } catch (error: any) {
              resolve({ index, success: false, error: error.message });
            }
          }, Math.random() * 100);
        })
      );

      const results = await Promise.all(promises) as Array<{index: number, success: boolean, error: string | null}>;
      
      // Most operations should succeed (some may fail due to legitimate resource constraints)
      const successfulOps = results.filter(r => r.success);
      expect(successfulOps.length).toBeGreaterThan(numOperations * 0.8); // At least 80% should succeed

      // No memory-related crashes should occur
      const memoryErrors = results.filter(r => 
        r.error && (
          r.error.toLowerCase().includes('out of memory') ||
          r.error.toLowerCase().includes('allocation failed')
        )
      );
      expect(memoryErrors.length).toBe(0);

      // Database should remain accessible
      const stats = operations[0].getStatistics();
      expect(stats).toBeDefined();
      expect(stats.total.count).toBeGreaterThan(0);
    });
  });

  describe('Stress Testing', () => {
    test('should handle sustained high-load operations', async () => {
      const duration = 5000; // 5 seconds
      const operations = Array.from({ length: 20 }, () => new IssueOperations(db));
      const startTime = Date.now();
      let operationCount = 0;
      let errorCount = 0;

      // Create initial issues for operations
      for (let i = 0; i < 10; i++) {
        operations[0].createIssue({
          issue_id: `stress-base-${i}`,
          title: `Stress Base Issue ${i}`,
          priority: 'medium',
          project: 'stress-test',
          status: 'outstanding',
          work_status: 'available',
          attempt_count: 0
        });
      }

      const stressPromise = new Promise<void>(resolve => {
        const performOperations = () => {
          if (Date.now() - startTime >= duration) {
            resolve();
            return;
          }

          const opsIndex = Math.floor(Math.random() * operations.length);
          const operationType = Math.floor(Math.random() * 4);

          try {
            switch (operationType) {
              case 0: // Create issue
                operations[opsIndex].createIssue({
                  issue_id: `stress-${Date.now()}-${Math.random()}`,
                  title: `Stress Test Issue`,
                  priority: 'low',
                  project: 'stress-test',
                  status: 'outstanding',
                  work_status: 'available',
                  attempt_count: 0
                });
                break;
              case 1: // Add comment
                const issueToComment = `stress-base-${Math.floor(Math.random() * 10)}`;
                operations[opsIndex].addComment(issueToComment, `Stress comment ${Date.now()}`, `stress-agent-${opsIndex}`);
                break;
              case 2: // List issues
                operations[opsIndex].listIssues({ project: 'stress-test' });
                break;
              case 3: // Get statistics
                operations[opsIndex].getStatistics();
                break;
            }
            operationCount++;
          } catch (error) {
            errorCount++;
          }

          // Schedule next operation
          setTimeout(performOperations, Math.random() * 10);
        };

        // Start multiple operation chains
        for (let i = 0; i < 5; i++) {
          setTimeout(performOperations, i * 10);
        }
      });

      await stressPromise;

      // Should have performed many operations
      expect(operationCount).toBeGreaterThan(100);

      // Error rate should be reasonable (less than 5%)
      const errorRate = errorCount / operationCount;
      expect(errorRate).toBeLessThan(0.05);

      // Database should still be functional
      const finalStats = operations[0].getStatistics();
      expect(finalStats).toBeDefined();
      expect(finalStats.total.count).toBeGreaterThan(10);
    });
  });
});