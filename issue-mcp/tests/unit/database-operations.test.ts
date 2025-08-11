// Unit Tests: Database Operations
import { describe, test, expect, beforeEach } from '@jest/globals';
import { initializeDatabase } from '../../src/database/init';
import { IssueOperations } from '../../src/database/operations';
import { Database } from '../../src/database/types';
import { Priority, Status, WorkStatus, IssueType, ResolutionAttempt } from '../../src/types';

describe('Database Operations', () => {
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

  describe('Database Initialization', () => {
    test('should initialize database with correct schema', () => {
      expect(db).toBeDefined();
      
      // Verify tables exist
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      const tableNames = tables.map((t: any) => t.name);
      
      expect(tableNames).toContain('issues');
      expect(tableNames).toContain('issue_thread');
    });

    test('should create indexes for performance', () => {
      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all();
      const indexNames = indexes.map((i: any) => i.name);
      
      // Should have indexes on commonly filtered columns
      expect(indexNames.some(name => name.includes('status'))).toBe(true);
      expect(indexNames.some(name => name.includes('priority'))).toBe(true);
      expect(indexNames.some(name => name.includes('project'))).toBe(true);
    });

    test('should enable foreign keys', () => {
      const result = db.prepare("PRAGMA foreign_keys").get() as any;
      expect(result.foreign_keys).toBe(1);
    });
  });

  describe('Issue Creation', () => {
    test('should create issue with minimal required fields', () => {
      const result = operations.createIssue({
        issue_id: 'test-minimal',
        title: 'Minimal Test Issue',
        priority: 'medium',
        project: 'test-project',
        status: 'outstanding',
        work_status: 'available',
        attempt_count: 0
      });

      expect(result.id).toBeGreaterThan(0);
      expect(result.issue_id).toBe('test-minimal');
    });

    test('should create issue with all fields populated', () => {
      const issueData = {
        issue_id: 'test-complete',
        title: 'Complete Test Issue',
        priority: 'critical' as Priority,
        project: 'test-project',
        milestone: 'v1.0.0',
        parent_feature: 'feature-auth',
        severity: 'high',
        issue_type: 'Security' as IssueType,
        location: 'src/auth/login.ts:42',
        description: 'Detailed description of the security vulnerability',
        root_cause: 'Insufficient input validation leading to SQL injection',
        required_fix: 'Implement parameterized queries and input sanitization',
        status: 'outstanding' as Status,
        work_status: 'available' as WorkStatus,
        attempt_count: 0,
        original_content: 'Original vulnerable code snippet',
        metadata: {
          severity_score: 9.2,
          cvss: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
          tags: ['sql-injection', 'critical', 'auth']
        },
        file_path: '/project/src/auth/login.ts',
        file_last_modified: new Date('2025-01-01T12:00:00Z')
      };

      const result = operations.createIssue(issueData);

      expect(result.id).toBeGreaterThan(0);
      expect(result.issue_id).toBe('test-complete');

      // Verify the issue was stored correctly
      const retrieved = operations.getIssueById('test-complete');
      expect(retrieved).toBeTruthy();
      expect(retrieved!.title).toBe(issueData.title);
      expect(retrieved!.priority).toBe(issueData.priority);
      expect(retrieved!.metadata).toEqual(issueData.metadata);
    });

    test('should handle JSON metadata serialization', () => {
      const metadata = {
        nested: {
          object: {
            with: 'deep',
            structure: true,
            numbers: [1, 2, 3],
            null_value: null
          }
        },
        array: ['string', 42, { mixed: true }],
        special_chars: "Special characters: 'quotes', \"double\", \n newlines, \t tabs"
      };

      const result = operations.createIssue({
        issue_id: 'test-json',
        title: 'JSON Metadata Test',
        priority: 'low',
        project: 'test-project',
        status: 'outstanding',
        work_status: 'available',
        attempt_count: 0,
        metadata: metadata
      });

      const retrieved = operations.getIssueById('test-json');
      expect(retrieved!.metadata).toEqual(metadata);
    });

    test('should auto-generate timestamps', () => {
      const before = new Date();
      
      operations.createIssue({
        issue_id: 'test-timestamps',
        title: 'Timestamp Test',
        priority: 'medium',
        project: 'test-project',
        status: 'outstanding',
        work_status: 'available',
        attempt_count: 0
      });

      const after = new Date();
      const issue = operations.getIssueById('test-timestamps');
      
      expect(issue!.created_at).toBeTruthy();
      expect(issue!.updated_at).toBeTruthy();
      expect(issue!.created_at!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(issue!.created_at!.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('Issue Retrieval', () => {
    beforeEach(() => {
      // Create test data
      operations.createIssue({
        issue_id: 'retrieval-test-1',
        title: 'First Test Issue',
        priority: 'critical',
        project: 'project-alpha',
        status: 'outstanding',
        work_status: 'available',
        attempt_count: 0
      });

      operations.createIssue({
        issue_id: 'retrieval-test-2',
        title: 'Second Test Issue',
        priority: 'high',
        project: 'project-beta',
        status: 'in_progress',
        work_status: 'checked_out',
        attempt_count: 1,
        checked_out_by: 'test-agent'
      });
    });

    test('should retrieve issue by ID', () => {
      const issue = operations.getIssueById('retrieval-test-1');
      
      expect(issue).toBeTruthy();
      expect(issue!.issue_id).toBe('retrieval-test-1');
      expect(issue!.title).toBe('First Test Issue');
      expect(issue!.priority).toBe('critical');
    });

    test('should retrieve issue by database ID', () => {
      const issueByStringId = operations.getIssueById('retrieval-test-1');
      const issueByDbId = operations.getIssueByDbId(issueByStringId!.id!);
      
      expect(issueByDbId).toBeTruthy();
      expect(issueByDbId!.issue_id).toBe('retrieval-test-1');
    });

    test('should return null for non-existent issue', () => {
      const issue = operations.getIssueById('non-existent');
      expect(issue).toBeNull();
    });

    test('should list all issues without filters', () => {
      const issues = operations.listIssues();
      
      expect(issues.length).toBeGreaterThanOrEqual(2);
      expect(issues.some(i => i.issue_id === 'retrieval-test-1')).toBe(true);
      expect(issues.some(i => i.issue_id === 'retrieval-test-2')).toBe(true);
    });

    test('should filter issues by status', () => {
      const outstandingIssues = operations.listIssues({ status: 'outstanding' });
      const inProgressIssues = operations.listIssues({ status: 'in_progress' });
      
      expect(outstandingIssues.every(i => i.status === 'outstanding')).toBe(true);
      expect(inProgressIssues.every(i => i.status === 'in_progress')).toBe(true);
      expect(outstandingIssues.some(i => i.issue_id === 'retrieval-test-1')).toBe(true);
      expect(inProgressIssues.some(i => i.issue_id === 'retrieval-test-2')).toBe(true);
    });

    test('should filter issues by priority', () => {
      const criticalIssues = operations.listIssues({ priority: 'critical' });
      const highIssues = operations.listIssues({ priority: 'high' });
      
      expect(criticalIssues.every(i => i.priority === 'critical')).toBe(true);
      expect(highIssues.every(i => i.priority === 'high')).toBe(true);
    });

    test('should filter issues by project', () => {
      const alphaIssues = operations.listIssues({ project: 'project-alpha' });
      const betaIssues = operations.listIssues({ project: 'project-beta' });
      
      expect(alphaIssues.every(i => i.project === 'project-alpha')).toBe(true);
      expect(betaIssues.every(i => i.project === 'project-beta')).toBe(true);
    });

    test('should filter issues by work status', () => {
      const availableIssues = operations.listIssues({ work_status: 'available' });
      const checkedOutIssues = operations.listIssues({ work_status: 'checked_out' });
      
      expect(availableIssues.every(i => i.work_status === 'available')).toBe(true);
      expect(checkedOutIssues.every(i => i.work_status === 'checked_out')).toBe(true);
    });

    test('should apply multiple filters', () => {
      const filteredIssues = operations.listIssues({
        project: 'project-beta',
        status: 'in_progress',
        work_status: 'checked_out'
      });
      
      expect(filteredIssues.length).toBe(1);
      expect(filteredIssues[0].issue_id).toBe('retrieval-test-2');
    });

    test('should sort issues by priority and creation date', () => {
      // Create additional issues with different priorities
      operations.createIssue({
        issue_id: 'priority-test-medium',
        title: 'Medium Priority',
        priority: 'medium',
        project: 'test',
        status: 'outstanding',
        work_status: 'available',
        attempt_count: 0
      });

      const issues = operations.listIssues();
      
      // Find the critical and medium priority issues
      const criticalIndex = issues.findIndex(i => i.priority === 'critical');
      const mediumIndex = issues.findIndex(i => i.priority === 'medium');
      
      if (criticalIndex !== -1 && mediumIndex !== -1) {
        expect(criticalIndex).toBeLessThan(mediumIndex);
      }
    });
  });

  describe('Issue Checkout Operations', () => {
    beforeEach(() => {
      operations.createIssue({
        issue_id: 'checkout-test',
        title: 'Checkout Test Issue',
        priority: 'high',
        project: 'checkout-project',
        status: 'outstanding',
        work_status: 'available',
        attempt_count: 0
      });
    });

    test('should checkout available issue', () => {
      const success = operations.checkoutIssue('checkout-test', 'test-agent');
      
      expect(success).toBe(true);
      
      const issue = operations.getIssueById('checkout-test');
      expect(issue!.work_status).toBe('checked_out');
      expect(issue!.checked_out_by).toBe('test-agent');
      expect(issue!.checked_out_at).toBeTruthy();
      expect(issue!.status).toBe('in_progress'); // Should auto-update status
    });

    test('should prevent double checkout', () => {
      // First checkout
      operations.checkoutIssue('checkout-test', 'agent-1');
      
      // Second checkout should fail
      const success = operations.checkoutIssue('checkout-test', 'agent-2');
      expect(success).toBe(false);
      
      // Verify original checkout is preserved
      const issue = operations.getIssueById('checkout-test');
      expect(issue!.checked_out_by).toBe('agent-1');
    });

    test('should add checkout entry to thread', () => {
      operations.checkoutIssue('checkout-test', 'thread-agent');
      
      const thread = operations.getIssueThread('checkout-test');
      expect(thread.length).toBe(1);
      expect(thread[0].entry_type).toBe('checkout');
      expect(thread[0].author).toBe('thread-agent');
      expect(thread[0].content).toContain('checked out by thread-agent');
    });

    test('should handle checkout of non-existent issue', () => {
      const success = operations.checkoutIssue('non-existent', 'test-agent');
      expect(success).toBe(false);
    });
  });

  describe('Issue Unlock Operations', () => {
    beforeEach(() => {
      operations.createIssue({
        issue_id: 'unlock-test',
        title: 'Unlock Test Issue',
        priority: 'medium',
        project: 'unlock-project',
        status: 'outstanding',
        work_status: 'available',
        attempt_count: 0
      });
      
      // Checkout the issue first
      operations.checkoutIssue('unlock-test', 'original-agent');
    });

    test('should unlock checked out issue', () => {
      const success = operations.unlockIssue('unlock-test', 'unlock-agent');
      
      expect(success).toBe(true);
      
      const issue = operations.getIssueById('unlock-test');
      expect(issue!.work_status).toBe('available');
      expect(issue!.checked_out_by).toBeNull();
      expect(issue!.checked_out_at).toBeNull();
    });

    test('should add unlock entry to thread', () => {
      operations.unlockIssue('unlock-test', 'thread-agent');
      
      const thread = operations.getIssueThread('unlock-test');
      const unlockEntry = thread.find(entry => entry.entry_type === 'unlock');
      
      expect(unlockEntry).toBeTruthy();
      expect(unlockEntry!.author).toBe('thread-agent');
      expect(unlockEntry!.content).toBe('Issue unlocked and made available');
    });

    test('should handle unlock of non-existent issue', () => {
      const success = operations.unlockIssue('non-existent', 'test-agent');
      expect(success).toBe(false);
    });

    test('should use default author for unlock', () => {
      operations.unlockIssue('unlock-test'); // No author specified
      
      const thread = operations.getIssueThread('unlock-test');
      const unlockEntry = thread.find(entry => entry.entry_type === 'unlock');
      
      expect(unlockEntry!.author).toBe('system');
    });
  });

  describe('Status Update Operations', () => {
    beforeEach(() => {
      operations.createIssue({
        issue_id: 'status-test',
        title: 'Status Test Issue',
        priority: 'high',
        project: 'status-project',
        status: 'outstanding',
        work_status: 'available',
        attempt_count: 0
      });
    });

    test('should update issue status', () => {
      const success = operations.updateStatus('status-test', 'in_progress', 'status-agent');
      
      expect(success).toBe(true);
      
      const issue = operations.getIssueById('status-test');
      expect(issue!.status).toBe('in_progress');
    });

    test('should add status change to thread', () => {
      operations.updateStatus('status-test', 'review', 'thread-agent');
      
      const thread = operations.getIssueThread('status-test');
      const statusEntry = thread.find(entry => entry.entry_type === 'status_change');
      
      expect(statusEntry).toBeTruthy();
      expect(statusEntry!.author).toBe('thread-agent');
      expect(statusEntry!.content).toContain('Status changed from outstanding to review');
      expect(statusEntry!.metadata).toEqual({
        from_status: 'outstanding',
        to_status: 'review'
      });
    });

    test('should handle status update of non-existent issue', () => {
      const success = operations.updateStatus('non-existent', 'resolved', 'test-agent');
      expect(success).toBe(false);
    });

    test('should use default author for status update', () => {
      operations.updateStatus('status-test', 'resolved');
      
      const thread = operations.getIssueThread('status-test');
      const statusEntry = thread.find(entry => entry.entry_type === 'status_change');
      
      expect(statusEntry!.author).toBe('agent');
    });
  });

  describe('Comment Operations', () => {
    beforeEach(() => {
      operations.createIssue({
        issue_id: 'comment-test',
        title: 'Comment Test Issue',
        priority: 'low',
        project: 'comment-project',
        status: 'outstanding',
        work_status: 'available',
        attempt_count: 0
      });
    });

    test('should add comment to issue', () => {
      const success = operations.addComment('comment-test', 'This is a test comment', 'comment-agent');
      
      expect(success).toBe(true);
      
      const thread = operations.getIssueThread('comment-test');
      const commentEntry = thread.find(entry => entry.entry_type === 'comment');
      
      expect(commentEntry).toBeTruthy();
      expect(commentEntry!.content).toBe('This is a test comment');
      expect(commentEntry!.author).toBe('comment-agent');
    });

    test('should handle very long comments', () => {
      const longComment = 'This is a very long comment. '.repeat(1000);
      const success = operations.addComment('comment-test', longComment, 'verbose-agent');
      
      expect(success).toBe(true);
      
      const thread = operations.getIssueThread('comment-test');
      const commentEntry = thread.find(entry => entry.content === longComment);
      expect(commentEntry).toBeTruthy();
    });

    test('should handle comment on non-existent issue', () => {
      const success = operations.addComment('non-existent', 'Comment', 'test-agent');
      expect(success).toBe(false);
    });

    test('should use default author for comment', () => {
      operations.addComment('comment-test', 'Default author comment');
      
      const thread = operations.getIssueThread('comment-test');
      const commentEntry = thread.find(entry => entry.content === 'Default author comment');
      
      expect(commentEntry!.author).toBe('agent');
    });
  });

  describe('Resolution Attempt Operations', () => {
    beforeEach(() => {
      operations.createIssue({
        issue_id: 'resolution-test',
        title: 'Resolution Test Issue',
        priority: 'critical',
        project: 'resolution-project',
        status: 'in_progress',
        work_status: 'checked_out',
        attempt_count: 0
      });
    });

    test('should submit successful resolution attempt', () => {
      const attempt: ResolutionAttempt = {
        attempt_number: 1,
        timestamp: new Date(),
        analysis: {
          understanding: 'Identified the root cause',
          approach: 'Implemented comprehensive fix',
          scope: 'Modified core authentication system'
        },
        implementation: {
          files_modified: [{
            file: 'src/auth.ts',
            operation: 'modify',
            changes: ['Added input validation']
          }],
          changes_applied: ['Fixed SQL injection vulnerability'],
          reasoning: 'Security improvement'
        },
        test_results: {
          targeted_tests: [{
            name: 'Security Test',
            passed: true,
            message: 'All tests passed'
          }],
          full_suite_results: {
            total: 10,
            passed: 10,
            failed: 0
          },
          validation_status: {
            security_fix_applied: true,
            tests_passing: true,
            no_regressions: true,
            performance_acceptable: true
          }
        },
        outcome: {
          result: 'SUCCESS',
          assessment: 'Issue fully resolved',
          next_steps: 'Monitor for any related issues'
        }
      };

      const success = operations.submitResolutionAttempt('resolution-test', attempt);
      
      expect(success).toBe(true);
      
      // Check that attempt count was incremented
      const issue = operations.getIssueById('resolution-test');
      expect(issue!.attempt_count).toBe(1);
      expect(issue!.status).toBe('review'); // Should move to review on success
    });

    test('should submit failed resolution attempt', () => {
      const attempt: ResolutionAttempt = {
        attempt_number: 1,
        timestamp: new Date(),
        analysis: {
          understanding: 'Partial understanding of issue',
          approach: 'Attempted basic fix',
          scope: 'Limited changes'
        },
        implementation: {
          files_modified: [],
          changes_applied: ['Minimal changes'],
          reasoning: 'Initial attempt'
        },
        test_results: {
          targeted_tests: [{
            name: 'Security Test',
            passed: false,
            message: 'Tests still failing'
          }],
          full_suite_results: {
            total: 10,
            passed: 5,
            failed: 5
          },
          validation_status: {
            security_fix_applied: false,
            tests_passing: false,
            no_regressions: true,
            performance_acceptable: true
          }
        },
        outcome: {
          result: 'FAILED',
          assessment: 'Initial approach unsuccessful',
          next_steps: 'Research better solution'
        }
      };

      const success = operations.submitResolutionAttempt('resolution-test', attempt);
      
      expect(success).toBe(true);
      
      const issue = operations.getIssueById('resolution-test');
      expect(issue!.attempt_count).toBe(1);
      expect(issue!.status).toBe('in_progress'); // Should remain in progress on failure
    });

    test('should add resolution attempt to thread', () => {
      const attempt: ResolutionAttempt = {
        attempt_number: 1,
        timestamp: new Date(),
        analysis: {
          understanding: 'Test understanding',
          approach: 'Test approach',
          scope: 'Test scope'
        },
        implementation: {
          files_modified: [],
          changes_applied: [],
          reasoning: 'Test reasoning'
        },
        test_results: {
          targeted_tests: [],
          full_suite_results: {
            total: 0,
            passed: 0,
            failed: 0
          },
          validation_status: {
            security_fix_applied: false,
            tests_passing: false,
            no_regressions: false,
            performance_acceptable: false
          }
        },
        outcome: {
          result: 'FAILED',
          assessment: 'Test assessment',
          next_steps: 'Test next steps'
        }
      };

      operations.submitResolutionAttempt('resolution-test', attempt);
      
      const thread = operations.getIssueThread('resolution-test');
      const attemptEntry = thread.find(entry => entry.entry_type === 'resolution_attempt');
      
      expect(attemptEntry).toBeTruthy();
      expect(attemptEntry!.author).toBe('agent');
      expect(attemptEntry!.metadata).toEqual({
        attempt_number: 1,
        result: 'FAILED'
      });
      
      const storedAttempt = JSON.parse(attemptEntry!.content);
      expect(storedAttempt).toMatchObject(attempt as any);
    });

    test('should handle resolution attempt on non-existent issue', () => {
      const attempt: ResolutionAttempt = {
        attempt_number: 1,
        timestamp: new Date(),
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
      };

      const success = operations.submitResolutionAttempt('non-existent', attempt);
      expect(success).toBe(false);
    });
  });

  describe('Thread Operations', () => {
    let testIssueId: string;

    beforeEach(() => {
      operations.createIssue({
        issue_id: 'thread-test',
        title: 'Thread Test Issue',
        priority: 'medium',
        project: 'thread-project',
        status: 'outstanding',
        work_status: 'available',
        attempt_count: 0
      });
      testIssueId = 'thread-test';
    });

    test('should retrieve complete issue thread', () => {
      // Add various thread entries
      operations.checkoutIssue(testIssueId, 'agent-1');
      operations.addComment(testIssueId, 'First comment', 'agent-1');
      operations.updateStatus(testIssueId, 'in_progress', 'agent-1');
      operations.addComment(testIssueId, 'Second comment', 'agent-2');
      operations.unlockIssue(testIssueId, 'agent-1');
      
      const thread = operations.getIssueThread(testIssueId);
      
      expect(thread.length).toBe(5);
      expect(thread[0].entry_type).toBe('checkout');
      expect(thread[1].entry_type).toBe('comment');
      expect(thread[2].entry_type).toBe('status_change');
      expect(thread[3].entry_type).toBe('comment');
      expect(thread[4].entry_type).toBe('unlock');
    });

    test('should sort thread entries by creation date', () => {
      operations.addComment(testIssueId, 'Comment 1', 'agent-1');
      operations.addComment(testIssueId, 'Comment 2', 'agent-2');
      operations.addComment(testIssueId, 'Comment 3', 'agent-3');
      
      const thread = operations.getIssueThread(testIssueId);
      
      for (let i = 1; i < thread.length; i++) {
        expect(thread[i-1].created_at!.getTime()).toBeLessThanOrEqual(thread[i].created_at!.getTime());
      }
    });

    test('should handle thread of non-existent issue', () => {
      const thread = operations.getIssueThread('non-existent');
      expect(thread).toEqual([]);
    });

    test('should preserve metadata in thread entries', () => {
      operations.updateStatus(testIssueId, 'resolved', 'metadata-agent');
      
      const thread = operations.getIssueThread(testIssueId);
      const statusEntry = thread.find(entry => entry.entry_type === 'status_change');
      
      expect(statusEntry!.metadata).toEqual({
        from_status: 'outstanding',
        to_status: 'resolved'
      });
    });
  });

  describe('Statistics Operations', () => {
    beforeEach(() => {
      // Create diverse test data for statistics
      const testData = [
        { issue_id: 'stats-1', priority: 'critical', status: 'outstanding', work_status: 'available', project: 'project-a' },
        { issue_id: 'stats-2', priority: 'critical', status: 'in_progress', work_status: 'checked_out', project: 'project-a' },
        { issue_id: 'stats-3', priority: 'high', status: 'review', work_status: 'available', project: 'project-b' },
        { issue_id: 'stats-4', priority: 'medium', status: 'resolved', work_status: 'available', project: 'project-b' },
        { issue_id: 'stats-5', priority: 'medium', status: 'outstanding', work_status: 'available', project: 'project-c' }
      ];

      testData.forEach(data => {
        operations.createIssue({
          ...data,
          title: `Stats Test ${data.issue_id}`,
          attempt_count: 0
        } as any);
      });
    });

    test('should generate status statistics', () => {
      const stats = operations.getStatistics();
      
      expect(stats.by_status).toBeDefined();
      expect(Array.isArray(stats.by_status)).toBe(true);
      
      const statusCounts = stats.by_status.reduce((acc: any, stat: any) => {
        acc[stat.status] = stat.count;
        return acc;
      }, {});
      
      expect(statusCounts.outstanding).toBe(2);
      expect(statusCounts.in_progress).toBe(1);
      expect(statusCounts.review).toBe(1);
      expect(statusCounts.resolved).toBe(1);
    });

    test('should generate priority statistics excluding resolved issues', () => {
      const stats = operations.getStatistics();
      
      expect(stats.by_priority).toBeDefined();
      
      const priorityCounts = stats.by_priority.reduce((acc: any, stat: any) => {
        acc[stat.priority] = stat.count;
        return acc;
      }, {});
      
      // Should exclude resolved issue (stats-4)
      expect(priorityCounts.critical).toBe(2);
      expect(priorityCounts.high).toBe(1);
      expect(priorityCounts.medium).toBe(1); // One medium is resolved, one is outstanding
    });

    test('should generate work status statistics excluding resolved issues', () => {
      const stats = operations.getStatistics();
      
      expect(stats.by_work_status).toBeDefined();
      
      const workStatusCounts = stats.by_work_status.reduce((acc: any, stat: any) => {
        acc[stat.work_status] = stat.count;
        return acc;
      }, {});
      
      expect(workStatusCounts.available).toBe(3); // Excludes resolved issue
      expect(workStatusCounts.checked_out).toBe(1);
    });

    test('should generate project statistics', () => {
      const stats = operations.getStatistics();
      
      expect(stats.by_project).toBeDefined();
      
      const projectCounts = stats.by_project.reduce((acc: any, stat: any) => {
        acc[stat.project] = stat.count;
        return acc;
      }, {});
      
      expect(projectCounts['project-a']).toBe(2);
      expect(projectCounts['project-b']).toBe(2);
      expect(projectCounts['project-c']).toBe(1);
    });

    test('should generate total count', () => {
      const stats = operations.getStatistics();
      
      expect(stats.total).toBeDefined();
      expect(stats.total.count).toBe(5);
    });
  });

  describe('Resolution History', () => {
    let testIssueId: string;

    beforeEach(() => {
      operations.createIssue({
        issue_id: 'history-test',
        title: 'History Test Issue',
        priority: 'high',
        project: 'history-project',
        status: 'in_progress',
        work_status: 'checked_out',
        attempt_count: 0
      });
      testIssueId = 'history-test';
    });

    test('should retrieve resolution history', () => {
      // Submit multiple resolution attempts
      const attempts: ResolutionAttempt[] = [
        {
          attempt_number: 1,
          timestamp: new Date(),
          analysis: { understanding: 'First attempt', approach: 'Basic fix', scope: 'Limited' },
          implementation: { files_modified: [], changes_applied: ['Fix 1'], reasoning: 'Initial try' },
          test_results: {
            targeted_tests: [{ name: 'Test 1', passed: false }],
            full_suite_results: { total: 5, passed: 3, failed: 2 },
            validation_status: { security_fix_applied: false, tests_passing: false, no_regressions: true, performance_acceptable: true }
          },
          outcome: { result: 'FAILED', assessment: 'Incomplete fix', next_steps: 'Try different approach' }
        },
        {
          attempt_number: 2,
          timestamp: new Date(),
          analysis: { understanding: 'Better understanding', approach: 'Comprehensive fix', scope: 'Full module' },
          implementation: { files_modified: [{ file: 'test.ts', operation: 'modify', changes: ['Fix 2'] }], changes_applied: ['Complete fix'], reasoning: 'Proper solution' },
          test_results: {
            targeted_tests: [{ name: 'Test 1', passed: true }],
            full_suite_results: { total: 5, passed: 5, failed: 0 },
            validation_status: { security_fix_applied: true, tests_passing: true, no_regressions: true, performance_acceptable: true }
          },
          outcome: { result: 'SUCCESS', assessment: 'Issue resolved', next_steps: 'Monitor' }
        }
      ];

      attempts.forEach(attempt => {
        operations.submitResolutionAttempt(testIssueId, attempt);
      });

      const history = operations.getResolutionHistory(testIssueId);
      
      expect(history.length).toBe(2);
      expect(history[0].attempt_number).toBe(1);
      expect(history[0].outcome.result).toBe('FAILED');
      expect(history[1].attempt_number).toBe(2);
      expect(history[1].outcome.result).toBe('SUCCESS');
    });

    test('should handle empty resolution history', () => {
      const history = operations.getResolutionHistory(testIssueId);
      expect(history).toEqual([]);
    });

    test('should handle malformed resolution entries gracefully', () => {
      // Manually add malformed entry to thread
      const issueDbId = operations.getIssueById(testIssueId)!.id!;
      db.prepare(`
        INSERT INTO issue_thread (issue_id, entry_type, content, author)
        VALUES (?, 'resolution_attempt', 'invalid json', 'test')
      `).run(issueDbId);

      const history = operations.getResolutionHistory(testIssueId);
      expect(history).toEqual([]); // Should filter out malformed entries
    });
  });
});