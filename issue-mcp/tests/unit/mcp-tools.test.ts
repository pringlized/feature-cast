// Unit Tests: MCP Tools Functionality
import { describe, test, expect, beforeEach } from '@jest/globals';
import { initializeDatabase } from '../../src/database/init';
import { Database } from '../../src/database/types';
import { 
  createCreateIssueTool,
  createCheckoutIssueTool, 
  createSubmitReportTool,
  createAddCommentTool,
  createListIssuesTool,
  createUpdateStatusTool,
  getAllTools
} from '../../src/tools';

describe('MCP Tools Functionality', () => {
  let db: Database;

  beforeEach(async () => {
    db = initializeDatabase();
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  describe('create_issue Tool', () => {
    test('should create issue with all required fields', async () => {
      const tool = createCreateIssueTool(db);
      
      const input = {
        title: 'Test Security Issue',
        description: 'This is a test security vulnerability that needs fixing',
        priority: 'critical' as const,
        project: 'security-test'
      };

      const result = await tool.execute(input);
      
      expect(result.status).toBe('outstanding');
      expect(result.issue_id).toMatch(/^issue-security-test-general-/);
      expect(result.database_id).toBeGreaterThan(0);
      expect(result.message).toContain('Issue created successfully');
    });

    test('should create issue with all optional fields', async () => {
      const tool = createCreateIssueTool(db);
      
      const input = {
        title: 'Complex Issue',
        description: 'A complex issue with all fields populated',
        priority: 'high' as const,
        project: 'test-project',
        milestone: 'milestone-1.0',
        parent_feature: 'feature-auth',
        severity: 'critical',
        issue_type: 'Security' as const,
        location: 'src/auth/login.ts:45',
        root_cause: 'Improper input validation',
        required_fix: 'Implement proper sanitization'
      };

      const result = await tool.execute(input);
      
      expect(result.status).toBe('outstanding');
      expect(result.issue_id).toMatch(/^issue-test-project-milestone-1\.0-/);
      expect(result.database_id).toBeGreaterThan(0);
    });

    test('should handle missing required fields gracefully', async () => {
      const tool = createCreateIssueTool(db);
      
      const invalidInputs = [
        { description: 'Missing title', priority: 'high', project: 'test' },
        { title: 'Missing description', priority: 'high', project: 'test' },
        { title: 'Missing priority', description: 'test', project: 'test' },
        { title: 'Missing project', description: 'test', priority: 'high' }
      ];

      for (const input of invalidInputs) {
        await expect(tool.execute(input as any)).rejects.toThrow();
      }
    });

    test('should generate unique issue IDs', async () => {
      const tool = createCreateIssueTool(db);
      const issueIds = new Set();
      
      for (let i = 0; i < 10; i++) {
        const result = await tool.execute({
          title: `Test Issue ${i}`,
          description: `Description ${i}`,
          priority: 'medium' as const,
          project: 'uniqueness-test'
        });
        
        expect(issueIds.has(result.issue_id)).toBe(false);
        issueIds.add(result.issue_id);
      }
    });
  });

  describe('list_issues Tool', () => {
    beforeEach(async () => {
      const createTool = createCreateIssueTool(db);
      
      // Create test issues
      const testIssues = [
        { title: 'Critical Bug', priority: 'critical', project: 'project-a', status: 'outstanding' },
        { title: 'High Priority Feature', priority: 'high', project: 'project-a', status: 'in_progress' },
        { title: 'Medium Bug', priority: 'medium', project: 'project-b', status: 'resolved' },
        { title: 'Another Critical', priority: 'critical', project: 'project-b', status: 'review' }
      ];
      
      for (const issue of testIssues) {
        await createTool.execute({
          title: issue.title,
          description: `Description for ${issue.title}`,
          priority: issue.priority as any,
          project: issue.project
        });
      }
    });

    test('should list all issues without filters', async () => {
      const tool = createListIssuesTool(db);
      
      const result = await tool.execute({});
      
      expect(result.issues).toHaveLength(4);
      expect(result.total_count).toBe(4);
      expect(result.filters_applied).toEqual({});
    });

    test('should filter issues by status', async () => {
      const tool = createListIssuesTool(db);
      
      const result = await tool.execute({ status: 'outstanding' });
      
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.filters_applied.status).toBe('outstanding');
      result.issues.forEach(issue => {
        expect(issue.status).toBe('outstanding');
      });
    });

    test('should filter issues by priority', async () => {
      const tool = createListIssuesTool(db);
      
      const result = await tool.execute({ priority: 'critical' });
      
      expect(result.issues.length).toBe(2);
      expect(result.filters_applied.priority).toBe('critical');
      result.issues.forEach(issue => {
        expect(issue.priority).toBe('critical');
      });
    });

    test('should filter issues by project', async () => {
      const tool = createListIssuesTool(db);
      
      const result = await tool.execute({ project: 'project-a' });
      
      expect(result.issues.length).toBe(2);
      expect(result.filters_applied.project).toBe('project-a');
      result.issues.forEach(issue => {
        expect(issue.project).toBe('project-a');
      });
    });

    test('should apply multiple filters', async () => {
      const tool = createListIssuesTool(db);
      
      const result = await tool.execute({ 
        project: 'project-b',
        priority: 'critical'
      });
      
      expect(result.issues.length).toBe(1);
      expect(result.issues[0].title).toBe('Another Critical');
    });

    test('should sort issues by priority and creation date', async () => {
      const tool = createListIssuesTool(db);
      
      const result = await tool.execute({});
      
      // First issue should be critical priority
      expect(result.issues[0].priority).toBe('critical');
      
      // Critical issues should come first, then high, then medium
      const priorities = result.issues.map(issue => issue.priority);
      const criticalIndex = priorities.indexOf('critical');
      const highIndex = priorities.indexOf('high');
      const mediumIndex = priorities.indexOf('medium');
      
      if (criticalIndex !== -1 && highIndex !== -1) {
        expect(criticalIndex).toBeLessThan(highIndex);
      }
      if (highIndex !== -1 && mediumIndex !== -1) {
        expect(highIndex).toBeLessThan(mediumIndex);
      }
    });
  });

  describe('checkout_issue Tool', () => {
    let testIssueId: string;

    beforeEach(async () => {
      const createTool = createCreateIssueTool(db);
      const result = await createTool.execute({
        title: 'Checkout Test Issue',
        description: 'Issue for testing checkout functionality',
        priority: 'high',
        project: 'checkout-test'
      });
      testIssueId = result.issue_id;
    });

    test('should checkout available issue successfully', async () => {
      const tool = createCheckoutIssueTool(db);
      
      const result = await tool.execute({
        issue_id: testIssueId,
        agent_name: 'test-agent'
      });
      
      expect(result.success).toBe(true);
      expect(result.checked_out_by).toBe('test-agent');
      expect(result.status).toBe('in_progress');
      expect(result.message).toContain('successfully checked out');
    });

    test('should prevent double checkout of same issue', async () => {
      const tool = createCheckoutIssueTool(db);
      
      // First checkout should succeed
      await tool.execute({
        issue_id: testIssueId,
        agent_name: 'agent-1'
      });
      
      // Second checkout should fail
      const result = await tool.execute({
        issue_id: testIssueId,
        agent_name: 'agent-2'
      });
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('not available for checkout');
    });

    test('should handle non-existent issue gracefully', async () => {
      const tool = createCheckoutIssueTool(db);
      
      await expect(tool.execute({
        issue_id: 'non-existent-issue',
        agent_name: 'test-agent'
      })).rejects.toThrow('Issue not found');
    });

    test('should require agent_name parameter', async () => {
      const tool = createCheckoutIssueTool(db);
      
      await expect(tool.execute({
        issue_id: testIssueId
      } as any)).rejects.toThrow();
    });
  });

  describe('update_status Tool', () => {
    let testIssueId: string;

    beforeEach(async () => {
      const createTool = createCreateIssueTool(db);
      const result = await createTool.execute({
        title: 'Status Update Test',
        description: 'Issue for testing status updates',
        priority: 'medium',
        project: 'status-test'
      });
      testIssueId = result.issue_id;
    });

    test('should update issue status successfully', async () => {
      const tool = createUpdateStatusTool(db);
      
      const result = await tool.execute({
        issue_id: testIssueId,
        new_status: 'in_progress',
        agent_name: 'status-agent'
      });
      
      expect(result.success).toBe(true);
      expect(result.previous_status).toBe('outstanding');
      expect(result.new_status).toBe('in_progress');
      expect(result.message).toContain('Status updated');
    });

    test('should validate status enum values', async () => {
      const tool = createUpdateStatusTool(db);
      
      const invalidStatuses = ['pending', 'completed', 'active', 'closed'];
      
      for (const status of invalidStatuses) {
        await expect(tool.execute({
          issue_id: testIssueId,
          new_status: status as any,
          agent_name: 'test-agent'
        })).rejects.toThrow();
      }
    });

    test('should handle non-existent issue', async () => {
      const tool = createUpdateStatusTool(db);
      
      await expect(tool.execute({
        issue_id: 'non-existent-issue',
        new_status: 'resolved',
        agent_name: 'test-agent'
      })).rejects.toThrow('Issue not found');
    });

    test('should track status change in thread', async () => {
      const tool = createUpdateStatusTool(db);
      const listTool = createListIssuesTool(db);
      
      await tool.execute({
        issue_id: testIssueId,
        new_status: 'review',
        agent_name: 'status-agent'
      });
      
      // Get updated issue and verify thread entry exists
      const issues = await listTool.execute({ project: 'status-test' });
      const updatedIssue = issues.issues.find(i => i.issue_id === testIssueId);
      
      expect(updatedIssue?.status).toBe('review');
    });
  });

  describe('add_comment Tool', () => {
    let testIssueId: string;

    beforeEach(async () => {
      const createTool = createCreateIssueTool(db);
      const result = await createTool.execute({
        title: 'Comment Test Issue',
        description: 'Issue for testing comments',
        priority: 'low',
        project: 'comment-test'
      });
      testIssueId = result.issue_id;
    });

    test('should add comment successfully', async () => {
      const tool = createAddCommentTool(db);
      
      const result = await tool.execute({
        issue_id: testIssueId,
        comment: 'This is a test comment about the issue status',
        author: 'comment-agent'
      });
      
      expect(result.success).toBe(true);
      expect(result.comment_added).toBe(true);
      expect(result.message).toContain('Comment added successfully');
    });

    test('should handle empty comments', async () => {
      const tool = createAddCommentTool(db);
      
      await expect(tool.execute({
        issue_id: testIssueId,
        comment: '',
        author: 'test-agent'
      })).rejects.toThrow();
    });

    test('should handle very long comments', async () => {
      const tool = createAddCommentTool(db);
      const longComment = 'This is a very long comment. '.repeat(1000);
      
      const result = await tool.execute({
        issue_id: testIssueId,
        comment: longComment,
        author: 'verbose-agent'
      });
      
      expect(result.success).toBe(true);
    });

    test('should handle non-existent issue', async () => {
      const tool = createAddCommentTool(db);
      
      await expect(tool.execute({
        issue_id: 'non-existent-issue',
        comment: 'Test comment',
        author: 'test-agent'
      })).rejects.toThrow('Issue not found');
    });
  });

  describe('submit_report Tool', () => {
    let testIssueId: string;

    beforeEach(async () => {
      const createTool = createCreateIssueTool(db);
      const result = await createTool.execute({
        title: 'Resolution Test Issue',
        description: 'Issue for testing resolution reports',
        priority: 'critical',
        project: 'resolution-test'
      });
      testIssueId = result.issue_id;
    });

    test('should submit successful resolution report', async () => {
      const tool = createSubmitReportTool(db);
      
      const report = {
        issue_id: testIssueId,
        attempt_number: 1,
        analysis: {
          understanding: 'Identified SQL injection vulnerability in user input handling',
          approach: 'Implemented parameterized queries and input validation',
          scope: 'Modified authentication and user management modules'
        },
        implementation: {
          files_modified: [
            {
              file: 'src/auth/login.ts',
              operation: 'modify' as const,
              changes: ['Added input sanitization', 'Implemented parameterized queries']
            }
          ],
          changes_applied: [
            'Replaced string concatenation with prepared statements',
            'Added input validation middleware'
          ],
          reasoning: 'Prevents SQL injection by ensuring all user input is properly escaped'
        },
        test_results: {
          targeted_tests: [
            {
              name: 'SQL Injection Prevention Test',
              passed: true,
              message: 'All malicious inputs properly blocked'
            }
          ],
          full_suite_results: {
            total: 25,
            passed: 24,
            failed: 1,
            details: 'One unrelated test failed due to environment issue'
          },
          validation_status: {
            security_fix_applied: true,
            tests_passing: true,
            no_regressions: true,
            performance_acceptable: true
          }
        },
        outcome: {
          result: 'SUCCESS' as const,
          assessment: 'Vulnerability fully resolved with comprehensive testing',
          next_steps: 'Monitor for any related security issues'
        }
      };
      
      const result = await tool.execute(report);
      
      expect(result.success).toBe(true);
      expect(result.new_status).toBe('review');
      expect(result.attempt_recorded).toBe(1);
      expect(result.message).toContain('Resolution successful');
    });

    test('should submit failed resolution report', async () => {
      const tool = createSubmitReportTool(db);
      
      const report = {
        issue_id: testIssueId,
        attempt_number: 1,
        analysis: {
          understanding: 'Attempted to fix SQL injection but complexity is higher than expected',
          approach: 'Tried basic input sanitization',
          scope: 'Limited to login form validation'
        },
        implementation: {
          files_modified: [
            {
              file: 'src/auth/login.ts',
              operation: 'modify' as const,
              changes: ['Added basic input cleaning']
            }
          ],
          changes_applied: ['Added basic string escaping'],
          reasoning: 'Initial attempt at input validation'
        },
        test_results: {
          targeted_tests: [
            {
              name: 'SQL Injection Test',
              passed: false,
              message: 'Some injection vectors still successful'
            }
          ],
          full_suite_results: {
            total: 25,
            passed: 20,
            failed: 5,
            details: 'Security tests still failing'
          },
          validation_status: {
            security_fix_applied: false,
            tests_passing: false,
            no_regressions: true,
            performance_acceptable: true
          }
        },
        outcome: {
          result: 'FAILED' as const,
          assessment: 'Initial approach insufficient, need comprehensive solution',
          next_steps: 'Research parameterized queries and implement proper ORM usage'
        }
      };
      
      const result = await tool.execute(report);
      
      expect(result.success).toBe(true);
      expect(result.attempt_recorded).toBe(1);
      expect(result.message).toContain('Resolution attempt failed');
      expect(result.recommendations).toBeDefined();
      expect(result.recommendations!.length).toBeGreaterThan(0);
    });

    test('should handle partial resolution report', async () => {
      const tool = createSubmitReportTool(db);
      
      const report = {
        issue_id: testIssueId,
        attempt_number: 2,
        analysis: {
          understanding: 'SQL injection partially addressed',
          approach: 'Implemented parameterized queries for main attack vectors',
          scope: 'Primary login and search functionality secured'
        },
        implementation: {
          files_modified: [
            {
              file: 'src/auth/login.ts',
              operation: 'modify' as const,
              changes: ['Implemented parameterized queries']
            }
          ],
          changes_applied: ['Added prepared statements for main queries'],
          reasoning: 'Addressed primary vulnerability vectors'
        },
        test_results: {
          targeted_tests: [
            {
              name: 'Primary SQL Injection Test',
              passed: true,
              message: 'Main attack vectors blocked'
            },
            {
              name: 'Secondary Injection Points Test',
              passed: false,
              message: 'Some edge cases still vulnerable'
            }
          ],
          full_suite_results: {
            total: 25,
            passed: 22,
            failed: 3,
            details: 'Significant improvement but work remains'
          },
          validation_status: {
            security_fix_applied: true,
            tests_passing: false,
            no_regressions: true,
            performance_acceptable: true
          }
        },
        outcome: {
          result: 'PARTIAL' as const,
          assessment: 'Major progress made but edge cases need addressing',
          next_steps: 'Secure remaining query endpoints and add comprehensive input validation'
        }
      };
      
      const result = await tool.execute(report);
      
      expect(result.success).toBe(true);
      expect(result.attempt_recorded).toBe(2);
      expect(result.message).toContain('Partial resolution achieved');
    });

    test('should validate required fields in resolution report', async () => {
      const tool = createSubmitReportTool(db);
      
      const incompleteReports = [
        { issue_id: testIssueId }, // Missing all fields
        { issue_id: testIssueId, attempt_number: 1 }, // Missing analysis
        { 
          issue_id: testIssueId, 
          attempt_number: 1,
          analysis: {
            understanding: 'test',
            approach: 'test',
            scope: 'test'
          }
          // Missing implementation, test_results, outcome
        }
      ];

      for (const report of incompleteReports) {
        await expect(tool.execute(report as any)).rejects.toThrow();
      }
    });

    test('should handle non-existent issue in report', async () => {
      const tool = createSubmitReportTool(db);
      
      const report = {
        issue_id: 'non-existent-issue',
        attempt_number: 1,
        analysis: {
          understanding: 'test',
          approach: 'test',
          scope: 'test'
        },
        implementation: {
          files_modified: [],
          changes_applied: [],
          reasoning: 'test'
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
          result: 'FAILED' as const,
          assessment: 'test',
          next_steps: 'test'
        }
      };
      
      await expect(tool.execute(report)).rejects.toThrow('Issue not found');
    });
  });

  describe('Tool Registry', () => {
    test('should return all 6 tools', () => {
      const tools = getAllTools(db);
      
      expect(tools).toHaveLength(6);
      
      const toolNames = tools.map(tool => tool.name);
      expect(toolNames).toContain('create_issue');
      expect(toolNames).toContain('checkout_issue');
      expect(toolNames).toContain('submit_report');
      expect(toolNames).toContain('add_comment');
      expect(toolNames).toContain('list_issues');
      expect(toolNames).toContain('update_status');
    });

    test('should have valid tool schemas', () => {
      const tools = getAllTools(db);
      
      tools.forEach(tool => {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.execute).toBeDefined();
        expect(typeof tool.execute).toBe('function');
        
        // Validate schema structure
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.properties).toBeDefined();
      });
    });

    test('should have unique tool names', () => {
      const tools = getAllTools(db);
      const names = tools.map(tool => tool.name);
      const uniqueNames = new Set(names);
      
      expect(uniqueNames.size).toBe(tools.length);
    });
  });
});