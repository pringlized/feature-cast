// Security Test: JSON Metadata DoS Prevention
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { initializeDatabase } from '../../src/database/init';
import { IssueOperations } from '../../src/database/operations';
import { Database } from '../../src/database/types';

describe('Security: JSON Metadata DoS Prevention', () => {
  let db: Database;
  let operations: IssueOperations;

  beforeEach(async () => {
    db = initializeDatabase();
    operations = new IssueOperations(db);
    
    // Create a test issue for thread entries with unique ID per test
    const uniqueId = `test-dos-issue-${Date.now()}-${Math.random()}`;
    operations.createIssue({
      issue_id: uniqueId,
      title: 'Test DoS Issue',
      priority: 'critical',
      project: 'security-test',
      status: 'outstanding',
      work_status: 'available',
      attempt_count: 0
    });
    
    // Store the unique ID for use in tests
    (operations as any).testIssueId = uniqueId;
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  describe('Size Limit Validation', () => {
    test('should reject metadata exceeding 10KB size limit', () => {
      // Create a large payload exceeding 10KB
      const largePayload = {
        attack: 'a'.repeat(10 * 1024), // 10KB string
        extra: 'pushing over the limit'
      };

      expect(() => {
        const testIssueId = (operations as any).testIssueId;
        operations.addComment(testIssueId, 'Test comment with large metadata', 'user');
        // Actually test through the internal method that accepts metadata
        (operations as any).addThreadEntry(
          testIssueId,
          'comment',
          'DoS test',
          'user',
          largePayload
        );
      }).toThrow('JSON payload too large');
    });

    test('should accept metadata within 10KB limit', () => {
      // Create a payload just under 10KB
      const validPayload = {
        data: 'x'.repeat(5000), // Well under 10KB
        status: 'valid',
        timestamp: new Date().toISOString()
      };

      expect(() => {
        (operations as any).addThreadEntry(
          (operations as any).testIssueId,
          'comment',
          'Valid metadata test',
          'user',
          validPayload
        );
      }).not.toThrow();
    });

    test('should reject 1MB DoS payload as per issue description', () => {
      // This is the specific test case from the vulnerability report
      const dosPayload = {
        attack: 'a'.repeat(1024 * 1024), // 1MB string
        nested: {
          data: Array.from({ length: 10000 }, (_, i) => `item-${i}`.repeat(100))
        }
      };

      expect(() => {
        (operations as any).addThreadEntry(
          (operations as any).testIssueId,
          'comment',
          'DoS attack payload',
          'user',
          dosPayload
        );
      }).toThrow('JSON payload too large');
    });
  });

  describe('Depth Limit Validation', () => {
    test('should reject deeply nested JSON exceeding depth limit', () => {
      // Create deeply nested object (more than 5 levels)
      let deeplyNested: any = { value: 'bottom' };
      for (let i = 0; i < 10; i++) {
        deeplyNested = { level: deeplyNested };
      }

      expect(() => {
        (operations as any).addThreadEntry(
          (operations as any).testIssueId,
          'comment',
          'Deep nesting attack',
          'user',
          deeplyNested
        );
      }).toThrow('JSON nesting too deep');
    });

    test('should accept JSON within depth limit', () => {
      // Create nested object within 5 levels
      const validNested = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: 'valid depth'
              }
            }
          }
        }
      };

      expect(() => {
        (operations as any).addThreadEntry(
          (operations as any).testIssueId,
          'comment',
          'Valid nested metadata',
          'user',
          validNested
        );
      }).not.toThrow();
    });

    test('should prevent stack overflow from 1000-level deep nesting', () => {
      // Create extremely deep nesting as in vulnerability report
      let extremelyDeep: any = 'bottom';
      for (let i = 0; i < 1000; i++) {
        extremelyDeep = { level: extremelyDeep };
      }

      expect(() => {
        (operations as any).addThreadEntry(
          (operations as any).testIssueId,
          'comment',
          'Extreme nesting attack',
          'user',
          extremelyDeep
        );
      }).toThrow('JSON nesting too deep');
    });
  });

  describe('Dangerous Pattern Detection', () => {
    test('should handle __proto__ safely (does not serialize to JSON)', () => {
      const prototypePayload = {
        __proto__: { isAdmin: true },
        normal: 'data'
      };

      // __proto__ doesn't actually serialize to JSON, so it's not a risk
      // The real danger is from 'constructor' and 'prototype' keys which we block
      expect(() => {
        (operations as any).addThreadEntry(
          (operations as any).testIssueId,
          'comment',
          'Prototype pollution attempt',
          'user',
          prototypePayload
        );
      }).not.toThrow(); // __proto__ is ignored in JSON serialization
    });

    test('should reject constructor pollution attempts', () => {
      const constructorPayload = {
        constructor: { prototype: { isAdmin: true } },
        normal: 'data'
      };

      expect(() => {
        (operations as any).addThreadEntry(
          (operations as any).testIssueId,
          'comment',
          'Constructor pollution attempt',
          'user',
          constructorPayload
        );
      }).toThrow('Invalid JSON structure');
    });

    test('should reject code injection patterns', () => {
      const codeInjectionPayloads = [
        { eval: "require('child_process').exec('rm -rf /')" },
        { Function: "return process.exit()" },
        { require: "fs" },
        { process: "exit" },
        { child_process: "exec" }
      ];

      codeInjectionPayloads.forEach(payload => {
        expect(() => {
          (operations as any).addThreadEntry(
            (operations as any).testIssueId,
            'comment',
            'Code injection attempt',
            'user',
            payload
          );
        }).toThrow('Invalid JSON structure');
      });
    });

    test('should accept clean metadata without dangerous patterns', () => {
      const cleanMetadata = {
        status: 'resolved',
        resolution: 'Fixed the issue',
        timestamp: new Date().toISOString(),
        user_data: {
          name: 'John Doe',
          role: 'developer'
        }
      };

      expect(() => {
        (operations as any).addThreadEntry(
          (operations as any).testIssueId,
          'comment',
          'Clean metadata test',
          'user',
          cleanMetadata
        );
      }).not.toThrow();
    });
  });

  describe('Combined Attack Scenarios', () => {
    test('should handle multiple attack vectors in single payload', () => {
      const combinedAttack = {
        // Size attack
        large_field: 'x'.repeat(8000),
        // Deep nesting
        deeply_nested: {
          l1: { l2: { l3: { l4: { l5: { l6: 'too deep' } } } } }
        },
        // Dangerous pattern
        __proto__: { admin: true }
      };

      // Should fail on either size, depth, or dangerous pattern
      expect(() => {
        (operations as any).addThreadEntry(
          (operations as any).testIssueId,
          'comment',
          'Combined attack',
          'user',
          combinedAttack
        );
      }).toThrow(); // Will throw for one of the validation checks
    });

    test('should protect against memory exhaustion from rapid insertions', () => {
      // Try to insert many large (but individually valid) payloads rapidly
      const nearLimitPayload = {
        data: 'x'.repeat(9000) // Just under 10KB
      };

      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < 100; i++) {
        try {
          (operations as any).addThreadEntry(
            (operations as any).testIssueId,
            'comment',
            `Rapid insertion ${i}`,
            'user',
            nearLimitPayload
          );
          successCount++;
        } catch (error) {
          errorCount++;
        }
      }

      // All should succeed as each is within limits
      expect(successCount).toBe(100);
      expect(errorCount).toBe(0);

      // Verify database is still functional
      const thread = operations.getIssueThread((operations as any).testIssueId);
      expect(thread.length).toBeGreaterThan(0);
    });
  });

  describe('Validation Error Messages', () => {
    test('should provide clear error messages for size violations', () => {
      const oversizedPayload = { data: 'x'.repeat(11 * 1024) };

      try {
        (operations as any).addThreadEntry(
          (operations as any).testIssueId,
          'comment',
          'Oversize test',
          'user',
          oversizedPayload
        );
        throw new Error('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toContain('JSON payload too large');
        expect(error.message).toContain('10240 bytes'); // Shows the limit
      }
    });

    test('should provide clear error messages for depth violations', () => {
      let deep: any = 'value';
      for (let i = 0; i < 7; i++) {
        deep = { nested: deep };
      }

      try {
        (operations as any).addThreadEntry(
          (operations as any).testIssueId,
          'comment',
          'Deep test',
          'user',
          deep
        );
        throw new Error('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toContain('JSON nesting too deep');
        expect(error.message).toContain('5'); // Shows the max depth
      }
    });

    test('should provide clear error messages for dangerous patterns', () => {
      const dangerous = { constructor: 'malicious' };

      try {
        (operations as any).addThreadEntry(
          (operations as any).testIssueId,
          'comment',
          'Dangerous test',
          'user',
          dangerous
        );
        throw new Error('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toContain('Invalid JSON structure');
        expect(error.message).toContain('constructor'); // Shows the detected pattern
      }
    });
  });
});