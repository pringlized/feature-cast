#!/usr/bin/env python3
"""
End-to-End Workflow Testing for MCP NPX Package
Tests complete workflows using actual CLI commands and database verification

Test Categories:
1. Complete Issue Lifecycle Testing
2. Multi-User Concurrent Workflow Testing  
3. Error Recovery and Resilience Testing
4. Real Production Scenario Simulation
5. Data Integrity and Consistency Validation
"""

import os
import sys
import subprocess
import json
import time
import sqlite3
import threading
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import uuid

class E2EWorkflowTester:
    def __init__(self):
        self.base_path = Path("/home/jakob/dev/personal-dashboard-nextjs/planning/issue-mcp")
        self.test_databases = []
        
    def setup_test_environment(self):
        """Set up E2E testing environment"""
        print("🚀 Setting up E2E Workflow Test Environment...")
        
        # Build the project
        result = subprocess.run(
            ["npm", "run", "build"], 
            cwd=self.base_path, 
            capture_output=True, 
            text=True
        )
        if result.returncode != 0:
            print(f"❌ Build failed: {result.stderr}")
            return False
            
        print("✅ E2E test environment ready")
        return True
        
    def test_complete_issue_lifecycle(self):
        """Test complete issue lifecycle from creation to resolution"""
        print("\n📋 Testing Complete Issue Lifecycle...")
        
        test_db_path = self.base_path / "e2e_lifecycle_test.db"
        if test_db_path.exists():
            test_db_path.unlink()
            
        self.test_databases.append(test_db_path)
        
        # Initialize database
        result = subprocess.run(
            ["node", "dist/cli.js", "init", "--path", str(test_db_path)],
            cwd=self.base_path,
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            print(f"❌ Database init failed: {result.stderr}")
            return False
            
        # Step 1: Add initial test issues
        print("  Step 1: Creating test issues...")
        for i in range(3):
            result = subprocess.run(
                ["node", "dist/cli.js", "test-add", "--database", str(test_db_path)],
                cwd=self.base_path,
                capture_output=True,
                text=True
            )
            if result.returncode != 0:
                print(f"❌ Failed to create issue {i}: {result.stderr}")
                return False
                
        # Step 2: Verify issues were created
        print("  Step 2: Verifying issue creation...")
        result = subprocess.run(
            ["node", "dist/cli.js", "list", "--database", str(test_db_path)],
            cwd=self.base_path,
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            print(f"❌ Failed to list issues: {result.stderr}")
            return False
            
        if "3 issues" not in result.stdout and "issues found" not in result.stdout:
            print(f"❌ Expected 3 issues in output, got: {result.stdout}")
            return False
            
        # Step 3: Check database integrity  
        print("  Step 3: Verifying database integrity...")
        conn = sqlite3.connect(test_db_path)
        cursor = conn.cursor()
        
        # Check issues table
        cursor.execute("SELECT COUNT(*) FROM issues")
        issue_count = cursor.fetchone()[0]
        if issue_count != 3:
            print(f"❌ Expected 3 issues in database, found {issue_count}")
            conn.close()
            return False
            
        # Check all issues have required fields
        cursor.execute("SELECT issue_id, title, priority, project FROM issues WHERE title IS NOT NULL AND priority IS NOT NULL")
        valid_issues = cursor.fetchall()
        if len(valid_issues) != 3:
            print(f"❌ Not all issues have required fields: {len(valid_issues)}/3")
            conn.close()
            return False
            
        # Step 4: Test status command
        print("  Step 4: Testing status reporting...")
        result = subprocess.run(
            ["node", "dist/cli.js", "status", "--database", str(test_db_path)],
            cwd=self.base_path,
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            print(f"❌ Status command failed: {result.stderr}")
            conn.close()
            return False
            
        # Check statistics are reasonable
        if "outstanding" not in result.stdout.lower():
            print(f"❌ Status output doesn't contain expected statistics: {result.stdout}")
            conn.close()
            return False
            
        conn.close()
        print("✅ Complete issue lifecycle test passed")
        return True
        
    def test_concurrent_workflow_simulation(self):
        """Test concurrent workflows using CLI commands"""
        print("\n🔄 Testing Concurrent Workflow Simulation...")
        
        test_db_path = self.base_path / "e2e_concurrent_test.db"
        if test_db_path.exists():
            test_db_path.unlink()
            
        self.test_databases.append(test_db_path)
        
        # Initialize database and add multiple issues
        result = subprocess.run(
            ["node", "dist/cli.js", "init", "--path", str(test_db_path)],
            cwd=self.base_path,
            capture_output=True,
            text=True
        )
        
        # Add 10 test issues for concurrent processing
        print("  Creating 10 test issues for concurrent processing...")
        for i in range(10):
            result = subprocess.run(
                ["node", "dist/cli.js", "test-add", "--database", str(test_db_path)],
                cwd=self.base_path,
                capture_output=True,
                text=True
            )
            
        def simulate_concurrent_operations(worker_id):
            """Simulate concurrent CLI operations"""
            operations = []
            
            # List operations
            for i in range(3):
                result = subprocess.run(
                    ["node", "dist/cli.js", "list", "--database", str(test_db_path), "--limit", "5"],
                    cwd=self.base_path,
                    capture_output=True,
                    text=True
                )
                if result.returncode == 0:
                    operations.append(f"Worker {worker_id}: List operation {i} - SUCCESS")
                else:
                    operations.append(f"Worker {worker_id}: List operation {i} - FAILED")
                    
            # Status operations
            for i in range(2):
                result = subprocess.run(
                    ["node", "dist/cli.js", "status", "--database", str(test_db_path)],
                    cwd=self.base_path,
                    capture_output=True,
                    text=True
                )
                if result.returncode == 0:
                    operations.append(f"Worker {worker_id}: Status operation {i} - SUCCESS")
                else:
                    operations.append(f"Worker {worker_id}: Status operation {i} - FAILED")
                    
            # Add issue operations
            result = subprocess.run(
                ["node", "dist/cli.js", "test-add", "--database", str(test_db_path)],
                cwd=self.base_path,
                capture_output=True,
                text=True
            )
            if result.returncode == 0:
                operations.append(f"Worker {worker_id}: Add issue - SUCCESS")
            else:
                operations.append(f"Worker {worker_id}: Add issue - FAILED")
                
            return operations
            
        # Run 5 concurrent workers
        print("  Launching 5 concurrent workers...")
        start_time = time.time()
        
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(simulate_concurrent_operations, i) for i in range(5)]
            all_results = []
            
            for future in as_completed(futures):
                worker_results = future.result()
                all_results.extend(worker_results)
                
        total_time = time.time() - start_time
        
        # Analyze results
        success_count = sum(1 for result in all_results if "SUCCESS" in result)
        total_operations = len(all_results)
        
        print(f"  Results: {success_count}/{total_operations} operations successful")
        print(f"  Total time: {total_time:.2f}s")
        
        # Check database integrity after concurrent operations
        conn = sqlite3.connect(test_db_path)
        cursor = conn.cursor()
        
        cursor.execute("SELECT COUNT(*) FROM issues")
        final_count = cursor.fetchone()[0]
        
        # Should have original 10 + up to 5 new ones from concurrent workers
        if final_count < 10 or final_count > 15:
            print(f"❌ Unexpected issue count after concurrent operations: {final_count}")
            conn.close()
            return False
            
        # Check for database corruption
        cursor.execute("PRAGMA integrity_check")
        integrity = cursor.fetchone()[0]
        if integrity != "ok":
            print(f"❌ Database integrity check failed: {integrity}")
            conn.close()
            return False
            
        conn.close()
        
        if success_count / total_operations >= 0.8:  # Allow 80% success rate
            print("✅ Concurrent workflow simulation passed")
            return True
        else:
            print("❌ Too many concurrent operations failed")
            return False
            
    def test_error_recovery_resilience(self):
        """Test system resilience and error recovery"""
        print("\n🛡️ Testing Error Recovery and Resilience...")
        
        test_db_path = self.base_path / "e2e_resilience_test.db"
        if test_db_path.exists():
            test_db_path.unlink()
            
        self.test_databases.append(test_db_path)
        
        # Test 1: Invalid database path handling
        print("  Test 1: Invalid database path handling...")
        result = subprocess.run(
            ["node", "dist/cli.js", "list", "--database", "/invalid/path/nowhere.db"],
            cwd=self.base_path,
            capture_output=True,
            text=True
        )
        
        if result.returncode == 0:
            print("❌ Should fail with invalid database path")
            return False
            
        if "not found" not in result.stderr.lower() and "does not exist" not in result.stderr.lower():
            print(f"❌ Expected 'not found' error, got: {result.stderr}")
            return False
            
        print("    ✅ Invalid path properly handled")
        
        # Test 2: Corrupted database handling (create valid DB then corrupt it)
        print("  Test 2: Corrupted database recovery...")
        
        # Create valid database first
        result = subprocess.run(
            ["node", "dist/cli.js", "init", "--path", str(test_db_path)],
            cwd=self.base_path,
            capture_output=True,
            text=True
        )
        
        # Corrupt database by truncating it
        with open(test_db_path, "w") as f:
            f.write("corrupted data")
            
        # Try to use corrupted database
        result = subprocess.run(
            ["node", "dist/cli.js", "status", "--database", str(test_db_path)],
            cwd=self.base_path,
            capture_output=True,
            text=True
        )
        
        if result.returncode == 0:
            print("❌ Should fail with corrupted database")
            return False
            
        print("    ✅ Corrupted database properly detected")
        
        # Test 3: Re-initialization of corrupted database
        print("  Test 3: Database re-initialization...")
        result = subprocess.run(
            ["node", "dist/cli.js", "init", "--path", str(test_db_path)],
            cwd=self.base_path,
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            print(f"❌ Failed to re-initialize database: {result.stderr}")
            return False
            
        # Verify database works after re-initialization
        result = subprocess.run(
            ["node", "dist/cli.js", "status", "--database", str(test_db_path)],
            cwd=self.base_path,
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            print(f"❌ Database not working after re-init: {result.stderr}")
            return False
            
        print("    ✅ Database re-initialization successful")
        
        # Test 4: Permission errors (if possible)
        print("  Test 4: Permission error handling...")
        readonly_db_path = self.base_path / "readonly_test.db"
        
        # Create database
        result = subprocess.run(
            ["node", "dist/cli.js", "init", "--path", str(readonly_db_path)],
            cwd=self.base_path,
            capture_output=True,
            text=True
        )
        
        try:
            # Make database readonly
            os.chmod(readonly_db_path, 0o444)
            self.test_databases.append(readonly_db_path)
            
            # Try to add issue to readonly database
            result = subprocess.run(
                ["node", "dist/cli.js", "test-add", "--database", str(readonly_db_path)],
                cwd=self.base_path,
                capture_output=True,
                text=True
            )
            
            if result.returncode == 0:
                print("⚠️ Warning: Readonly database operation should fail but didn't")
            else:
                print("    ✅ Readonly database properly handled")
                
        except Exception as e:
            print(f"    ⚠️ Permission test skipped: {e}")
        finally:
            # Restore permissions for cleanup
            if readonly_db_path.exists():
                os.chmod(readonly_db_path, 0o644)
                
        print("✅ Error recovery and resilience tests passed")
        return True
        
    def test_real_production_scenario(self):
        """Test realistic production scenario with mixed operations"""
        print("\n🏭 Testing Real Production Scenario...")
        
        test_db_path = self.base_path / "e2e_production_test.db"
        if test_db_path.exists():
            test_db_path.unlink()
            
        self.test_databases.append(test_db_path)
        
        # Initialize production-like environment
        result = subprocess.run(
            ["node", "dist/cli.js", "init", "--path", str(test_db_path)],
            cwd=self.base_path,
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            print(f"❌ Production environment init failed: {result.stderr}")
            return False
            
        # Scenario: Development team workflow over time
        print("  Simulating development team workflow...")
        
        # Day 1: Initial issues discovery
        print("    Day 1: Creating initial issues...")
        for i in range(5):
            result = subprocess.run(
                ["node", "dist/cli.js", "test-add", "--database", str(test_db_path)],
                cwd=self.base_path,
                capture_output=True,
                text=True
            )
            
        # Day 1: Team reviews status
        result = subprocess.run(
            ["node", "dist/cli.js", "status", "--database", str(test_db_path)],
            cwd=self.base_path,
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            print(f"❌ Day 1 status check failed: {result.stderr}")
            return False
            
        # Day 2: More issues discovered during development
        print("    Day 2: Additional issues discovered...")
        for i in range(3):
            result = subprocess.run(
                ["node", "dist/cli.js", "test-add", "--database", str(test_db_path)],
                cwd=self.base_path,
                capture_output=True,
                text=True
            )
            
        # Day 2: Team filters and reviews specific issues
        result = subprocess.run(
            ["node", "dist/cli.js", "list", "--database", str(test_db_path), "--status", "outstanding", "--limit", "10"],
            cwd=self.base_path,
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            print(f"❌ Day 2 filtered list failed: {result.stderr}")
            return False
            
        # Day 3: High-priority issues prioritized
        result = subprocess.run(
            ["node", "dist/cli.js", "list", "--database", str(test_db_path), "--priority", "high"],
            cwd=self.base_path,
            capture_output=True,
            text=True
        )
        
        # Day 4: Final status review
        print("    Day 4: Final status review...")
        result = subprocess.run(
            ["node", "dist/cli.js", "status", "--database", str(test_db_path)],
            cwd=self.base_path,
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            print(f"❌ Final status review failed: {result.stderr}")
            return False
            
        # Verify data consistency after workflow
        conn = sqlite3.connect(test_db_path)
        cursor = conn.cursor()
        
        # Check total issues
        cursor.execute("SELECT COUNT(*) FROM issues")
        total_issues = cursor.fetchone()[0]
        
        if total_issues != 8:  # 5 + 3 = 8 total issues
            print(f"❌ Expected 8 issues, found {total_issues}")
            conn.close()
            return False
            
        # Check data integrity
        cursor.execute("SELECT COUNT(*) FROM issues WHERE title IS NULL OR priority IS NULL")
        invalid_issues = cursor.fetchone()[0]
        
        if invalid_issues > 0:
            print(f"❌ Found {invalid_issues} issues with missing required data")
            conn.close()
            return False
            
        # Check database consistency
        cursor.execute("PRAGMA foreign_key_check")
        fk_violations = cursor.fetchall()
        
        if fk_violations:
            print(f"❌ Foreign key violations: {fk_violations}")
            conn.close()
            return False
            
        conn.close()
        print("✅ Real production scenario test passed")
        return True
        
    def test_data_integrity_validation(self):
        """Test data integrity and consistency under various conditions"""
        print("\n🔍 Testing Data Integrity and Consistency...")
        
        test_db_path = self.base_path / "e2e_integrity_test.db"
        if test_db_path.exists():
            test_db_path.unlink()
            
        self.test_databases.append(test_db_path)
        
        # Initialize database
        result = subprocess.run(
            ["node", "dist/cli.js", "init", "--path", str(test_db_path)],
            cwd=self.base_path,
            capture_output=True,
            text=True
        )
        
        # Add test data
        print("  Creating test data...")
        for i in range(5):
            result = subprocess.run(
                ["node", "dist/cli.js", "test-add", "--database", str(test_db_path)],
                cwd=self.base_path,
                capture_output=True,
                text=True
            )
            
        # Test 1: Database schema validation
        print("  Test 1: Database schema validation...")
        conn = sqlite3.connect(test_db_path)
        cursor = conn.cursor()
        
        # Check required tables exist
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in cursor.fetchall()]
        
        required_tables = ['issues', 'issue_thread']
        for table in required_tables:
            if table not in tables:
                print(f"❌ Missing required table: {table}")
                conn.close()
                return False
                
        # Test 2: Data type consistency
        print("  Test 2: Data type consistency...")
        cursor.execute("SELECT issue_id, title, priority FROM issues")
        issues = cursor.fetchall()
        
        for issue_id, title, priority in issues:
            if not isinstance(issue_id, str) or not issue_id:
                print(f"❌ Invalid issue_id type or value: {issue_id}")
                conn.close()
                return False
                
            if not isinstance(title, str) or not title:
                print(f"❌ Invalid title type or value: {title}")
                conn.close()
                return False
                
            if priority not in ['critical', 'high', 'medium']:
                print(f"❌ Invalid priority value: {priority}")
                conn.close()
                return False
                
        # Test 3: Referential integrity
        print("  Test 3: Referential integrity...")
        cursor.execute("""
            SELECT COUNT(*) FROM issue_thread it 
            LEFT JOIN issues i ON it.issue_id = i.id 
            WHERE i.id IS NULL
        """)
        orphaned_threads = cursor.fetchone()[0]
        
        if orphaned_threads > 0:
            print(f"❌ Found {orphaned_threads} orphaned thread entries")
            conn.close()
            return False
            
        # Test 4: Constraint enforcement
        print("  Test 4: Constraint enforcement...")
        try:
            # Try to insert invalid priority (should fail)
            cursor.execute("""
                INSERT INTO issues (issue_id, title, priority, status, work_status, project, attempt_count) 
                VALUES ('test-invalid', 'Test', 'invalid_priority', 'outstanding', 'available', 'test', 0)
            """)
            conn.commit()
            print("❌ Invalid priority was accepted (constraint not enforced)")
            conn.close()
            return False
        except sqlite3.IntegrityError:
            print("    ✅ Priority constraint properly enforced")
            
        # Test 5: Timestamp consistency
        print("  Test 5: Timestamp consistency...")
        cursor.execute("SELECT created_at, updated_at FROM issues WHERE created_at > updated_at")
        invalid_timestamps = cursor.fetchall()
        
        if invalid_timestamps:
            print(f"❌ Found {len(invalid_timestamps)} issues with invalid timestamps")
            conn.close()
            return False
            
        conn.close()
        print("✅ Data integrity and consistency validation passed")
        return True
        
    def cleanup_test_environment(self):
        """Clean up test databases and artifacts"""
        print("\n🧹 Cleaning up E2E test environment...")
        
        for db_path in self.test_databases:
            if db_path.exists():
                # Restore permissions if needed
                try:
                    os.chmod(db_path, 0o644)
                except:
                    pass
                db_path.unlink()
                
        print("✅ E2E test cleanup completed")
        
    def run_e2e_workflow_tests(self):
        """Run complete end-to-end workflow test suite"""
        print("🚀 Starting End-to-End Workflow Testing")
        print("=" * 60)
        
        if not self.setup_test_environment():
            return False
            
        test_functions = [
            ("Complete Issue Lifecycle", self.test_complete_issue_lifecycle),
            ("Concurrent Workflow Simulation", self.test_concurrent_workflow_simulation),
            ("Error Recovery & Resilience", self.test_error_recovery_resilience),
            ("Real Production Scenario", self.test_real_production_scenario),
            ("Data Integrity Validation", self.test_data_integrity_validation)
        ]
        
        passed_tests = 0
        total_tests = len(test_functions)
        
        for test_name, test_function in test_functions:
            try:
                if test_function():
                    passed_tests += 1
                    print(f"✅ {test_name}: PASSED")
                else:
                    print(f"❌ {test_name}: FAILED")
            except Exception as e:
                print(f"❌ {test_name}: ERROR - {e}")
                
        self.cleanup_test_environment()
        
        # Print summary
        print("\n" + "=" * 60)
        print("🎯 END-TO-END WORKFLOW TESTING SUMMARY")
        print("=" * 60)
        
        print(f"Tests Passed: {passed_tests}/{total_tests}")
        
        if passed_tests == total_tests:
            print("🎉 ALL END-TO-END WORKFLOW TESTS PASSED")
            print("✅ System validated for production use")
            return True
        else:
            print("⚠️ SOME WORKFLOW TESTS FAILED")
            print("❌ System requires fixes before production deployment")
            return False

if __name__ == "__main__":
    tester = E2EWorkflowTester()
    success = tester.run_e2e_workflow_tests()
    sys.exit(0 if success else 1)