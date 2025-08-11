#!/usr/bin/env python3
"""
Performance and End-to-End Workflow Testing for MCP NPX Package
Tests system behavior under realistic production-like conditions

Test Categories:
1. Performance Baseline Establishment 
2. Load Testing with Concurrent Agents
3. Memory Usage Profiling
4. Complete Agent Workflow Simulation
5. Database Performance under Scale
6. System Recovery and Resilience Testing
"""

import os
import sys
import subprocess
import json
import time
import sqlite3
import threading
import psutil
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import uuid
import tempfile

class PerformanceE2ETester:
    def __init__(self):
        self.base_path = Path("/home/jakob/dev/personal-dashboard-nextjs/planning/issue-mcp")
        self.performance_metrics = {}
        self.test_databases = []
        
    def setup_test_environment(self):
        """Set up performance testing environment"""
        print("⚡ Setting up Performance Testing Environment...")
        
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
            
        print("✅ Performance test environment ready")
        return True
        
    def test_performance_baselines(self):
        """Establish performance baselines for all operations"""
        print("\n📊 Establishing Performance Baselines...")
        
        test_db_path = self.base_path / "perf_baseline_test.db"
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
            
        baseline_test = f'''
const {{ initializeDatabase }} = require('./dist/database/init.js');
const {{ getAllTools }} = require('./dist/tools/index.js');

try {{
    const db = initializeDatabase('{test_db_path}');
    const tools = getAllTools(db);
    
    const createTool = tools.find(t => t.name === 'create_issue');
    const listTool = tools.find(t => t.name === 'list_issues');
    const checkoutTool = tools.find(t => t.name === 'checkout_issue');
    const commentTool = tools.find(t => t.name === 'add_comment');
    const statusTool = tools.find(t => t.name === 'update_status');
    const reportTool = tools.find(t => t.name === 'submit_report');
    
    const metrics = {{}};
    
    // Test 1: Issue Creation Performance
    console.log('Testing issue creation performance...');
    const createTimes = [];
    
    for (let i = 0; i < 10; i++) {{
        const start = Date.now();
        const uniqueId = `perf-create-${{Date.now()}}-${{i}}`;
        
        await createTool.execute({{
            issue_id: uniqueId,
            title: `Performance test issue ${{i}}`,
            description: `Description for performance test issue number ${{i}}`,
            priority: "medium",
            project: "performance-test",
            issue_type: "Performance"
        }});
        
        const duration = Date.now() - start;
        createTimes.push(duration);
    }}
    
    metrics.create_issue = {{
        avg: createTimes.reduce((a, b) => a + b, 0) / createTimes.length,
        min: Math.min(...createTimes),
        max: Math.max(...createTimes),
        samples: createTimes.length
    }};
    
    console.log(`Issue Creation - Avg: ${{metrics.create_issue.avg.toFixed(2)}}ms`);
    
    // Test 2: List Issues Performance
    console.log('Testing list issues performance...');
    const listTimes = [];
    
    for (let i = 0; i < 20; i++) {{
        const start = Date.now();
        await listTool.execute({{ limit: 50 }});
        const duration = Date.now() - start;
        listTimes.push(duration);
    }}
    
    metrics.list_issues = {{
        avg: listTimes.reduce((a, b) => a + b, 0) / listTimes.length,
        min: Math.min(...listTimes),
        max: Math.max(...listTimes),
        samples: listTimes.length
    }};
    
    console.log(`List Issues - Avg: ${{metrics.list_issues.avg.toFixed(2)}}ms`);
    
    // Test 3: Checkout Performance
    console.log('Testing checkout performance...');
    const checkoutTimes = [];
    
    // Get available issues
    const availableIssues = await listTool.execute({{ work_status: 'available', limit: 10 }});
    
    for (let i = 0; i < Math.min(5, availableIssues.issues.length); i++) {{
        const start = Date.now();
        await checkoutTool.execute({{
            issue_id: availableIssues.issues[i].issue_id,
            agent_name: `perf-agent-${{i}}`
        }});
        const duration = Date.now() - start;
        checkoutTimes.push(duration);
    }}
    
    if (checkoutTimes.length > 0) {{
        metrics.checkout_issue = {{
            avg: checkoutTimes.reduce((a, b) => a + b, 0) / checkoutTimes.length,
            min: Math.min(...checkoutTimes),
            max: Math.max(...checkoutTimes),
            samples: checkoutTimes.length
        }};
        console.log(`Checkout Issue - Avg: ${{metrics.checkout_issue.avg.toFixed(2)}}ms`);
    }}
    
    // Test 4: Comment Addition Performance
    console.log('Testing comment addition performance...');
    const commentTimes = [];
    
    for (let i = 0; i < 5; i++) {{
        const start = Date.now();
        await commentTool.execute({{
            issue_id: availableIssues.issues[0].issue_id,
            comment: `Performance test comment number ${{i}} with some detailed content`,
            author: `perf-agent-${{i}}`
        }});
        const duration = Date.now() - start;
        commentTimes.push(duration);
    }}
    
    metrics.add_comment = {{
        avg: commentTimes.reduce((a, b) => a + b, 0) / commentTimes.length,
        min: Math.min(...commentTimes),
        max: Math.max(...commentTimes),
        samples: commentTimes.length
    }};
    
    console.log(`Add Comment - Avg: ${{metrics.add_comment.avg.toFixed(2)}}ms`);
    
    // Test 5: Database Query Performance
    console.log('Testing raw database performance...');
    const { IssueOperations } = require('./dist/database/operations.js');
    const ops = new IssueOperations(db);
    
    const dbQueryTimes = [];
    
    for (let i = 0; i < 20; i++) {{
        const start = Date.now();
        ops.getStatistics();
        const duration = Date.now() - start;
        dbQueryTimes.push(duration);
    }}
    
    metrics.db_statistics = {{
        avg: dbQueryTimes.reduce((a, b) => a + b, 0) / dbQueryTimes.length,
        min: Math.min(...dbQueryTimes),
        max: Math.max(...dbQueryTimes),
        samples: dbQueryTimes.length
    }};
    
    console.log(`DB Statistics - Avg: ${{metrics.db_statistics.avg.toFixed(2)}}ms`);
    
    // Memory usage
    const memUsage = process.memoryUsage();
    metrics.memory = {{
        rss: Math.round(memUsage.rss / 1024 / 1024),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024)
    }};
    
    console.log('Performance Baselines:');
    console.log(JSON.stringify(metrics, null, 2));
    
    // Performance thresholds (expectations)
    const issues = [];
    
    if (metrics.create_issue.avg > 50) {{
        issues.push(`Issue creation avg (${{metrics.create_issue.avg.toFixed(2)}}ms) exceeds 50ms threshold`);
    }}
    
    if (metrics.list_issues.avg > 20) {{
        issues.push(`List issues avg (${{metrics.list_issues.avg.toFixed(2)}}ms) exceeds 20ms threshold`);
    }}
    
    if (metrics.memory.heapUsed > 50) {{
        issues.push(`Memory usage (${{metrics.memory.heapUsed}}MB) exceeds 50MB threshold`);
    }}
    
    if (issues.length > 0) {{
        console.log('Performance Issues:');
        issues.forEach(issue => console.log(`- ${{issue}}`));
        process.exit(1);
    }}
    
    console.log('✅ All performance baselines within acceptable limits');
    db.close();
    
}} catch (error) {{
    console.error('❌ Baseline test failed:', error.message);
    process.exit(1);
}}
'''
        
        with open(self.base_path / "test_baselines.js", "w") as f:
            f.write(baseline_test)
            
        try:
            result = subprocess.run(
                ["node", "test_baselines.js"],
                cwd=self.base_path,
                capture_output=True,
                text=True,
                timeout=60
            )
            
            if result.returncode != 0:
                print(f"❌ Performance baseline test failed: {result.stderr}")
                print(f"stdout: {result.stdout}")
                return False
                
            # Extract metrics from output
            for line in result.stdout.split('\\n'):
                if 'Avg:' in line:
                    print(f"  {line}")
                    
            print("✅ Performance baselines established")
            return True
            
        except subprocess.TimeoutExpired:
            print("❌ Baseline test timed out")
            return False
        finally:
            test_file = self.base_path / "test_baselines.js"
            if test_file.exists():
                test_file.unlink()
                
    def test_concurrent_agent_simulation(self):
        """Simulate multiple agents working concurrently"""
        print("\n🤖 Testing Concurrent Agent Simulation...")
        
        test_db_path = self.base_path / "perf_concurrent_test.db"
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
        
        # Create multiple test issues
        for i in range(10):
            result = subprocess.run(
                ["node", "dist/cli.js", "test-add", "--database", str(test_db_path)],
                cwd=self.base_path,
                capture_output=True,
                text=True
            )
            
        def simulate_agent_workflow(agent_id):
            """Simulate a complete agent workflow"""
            workflow_script = f'''
const {{ initializeDatabase }} = require('./dist/database/init.js');
const {{ getAllTools }} = require('./dist/tools/index.js');

try {{
    const db = initializeDatabase('{test_db_path}');
    const tools = getAllTools(db);
    
    const listTool = tools.find(t => t.name === 'list_issues');
    const checkoutTool = tools.find(t => t.name === 'checkout_issue');
    const commentTool = tools.find(t => t.name === 'add_comment');
    const statusTool = tools.find(t => t.name === 'update_status');
    const reportTool = tools.find(t => t.name === 'submit_report');
    
    const startTime = Date.now();
    const agentName = 'concurrent-agent-{agent_id}';
    
    // Step 1: List available issues
    const issues = await listTool.execute({{ work_status: 'available', limit: 5 }});
    if (issues.issues.length === 0) {{
        console.log(`Agent {agent_id}: No available issues`);
        return;
    }}
    
    // Step 2: Checkout first available issue
    const issueId = issues.issues[0].issue_id;
    const checkout = await checkoutTool.execute({{
        issue_id: issueId,
        agent_name: agentName
    }});
    
    if (!checkout.success) {{
        console.log(`Agent {agent_id}: Failed to checkout ${{issueId}}`);
        return;
    }}
    
    // Step 3: Add analysis comment
    await commentTool.execute({{
        issue_id: issueId,
        comment: `Agent {agent_id} analyzing issue...`,
        author: agentName
    }});
    
    // Step 4: Update to in_progress
    await statusTool.execute({{
        issue_id: issueId,
        new_status: 'in_progress',
        author: agentName
    }});
    
    // Step 5: Simulate work time
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
    
    // Step 6: Submit resolution report  
    await reportTool.execute({{
        issue_id: issueId,
        attempt_number: 1,
        analysis: {{
            understanding: `Agent {agent_id} analysis`,
            approach: `Automated resolution approach`,
            scope: `Limited scope resolution`
        }},
        implementation: {{
            files_modified: [
                {{ file: '/test/file.js', operation: 'modify', changes: ['Fixed issue'] }}
            ],
            changes_applied: ['Applied automated fix'],
            reasoning: `Agent {agent_id} applied standard fix`
        }},
        test_results: {{
            targeted_tests: [{{ name: 'test_fix', passed: true }}],
            full_suite_results: {{ total: 10, passed: 10, failed: 0 }},
            validation_status: {{
                security_fix_applied: true,
                tests_passing: true,
                no_regressions: true,
                performance_acceptable: true
            }}
        }},
        outcome: {{
            result: 'SUCCESS',
            assessment: `Agent {agent_id} successfully resolved issue`,
            next_steps: 'Ready for review'
        }}
    }});
    
    // Step 7: Mark as resolved
    await statusTool.execute({{
        issue_id: issueId,
        new_status: 'resolved',
        author: agentName,
        unlock_if_resolved: true
    }});
    
    const totalTime = Date.now() - startTime;
    console.log(`Agent {agent_id}: Completed workflow in ${{totalTime}}ms`);
    
    db.close();
    
}} catch (error) {{
    console.error(`Agent {agent_id}: Error - ${{error.message}}`);
    process.exit(1);
}}
'''
            
            workflow_file = self.base_path / f"agent_workflow_{agent_id}.js"
            with open(workflow_file, "w") as f:
                f.write(workflow_script)
                
            try:
                result = subprocess.run(
                    ["node", workflow_file],
                    cwd=self.base_path,
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                
                if result.returncode == 0:
                    # Extract timing info
                    for line in result.stdout.split('\\n'):
                        if 'Completed workflow' in line:
                            return f"Agent {agent_id}: {line}"
                    return f"Agent {agent_id}: Success"
                else:
                    return f"Agent {agent_id}: Failed - {result.stderr}"
                    
            except subprocess.TimeoutExpired:
                return f"Agent {agent_id}: Timeout"
            finally:
                if workflow_file.exists():
                    workflow_file.unlink()
                    
        # Run concurrent agent simulation
        print("  Launching 5 concurrent agents...")
        start_time = time.time()
        
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(simulate_agent_workflow, i) for i in range(5)]
            results = [future.result() for future in as_completed(futures)]
            
        total_time = time.time() - start_time
        
        successful_agents = sum(1 for result in results if "Success" in result or "Completed" in result)
        
        print(f"  Results: {successful_agents}/5 agents completed successfully")
        print(f"  Total time: {total_time:.2f}s")
        
        for result in results:
            print(f"    {result}")
            
        if successful_agents >= 3:  # Allow some tolerance for race conditions
            print("✅ Concurrent agent simulation passed")
            return True
        else:
            print("❌ Too many agents failed")
            return False
            
    def test_database_scalability(self):
        """Test database performance with large datasets"""
        print("\n📈 Testing Database Scalability...")
        
        test_db_path = self.base_path / "perf_scale_test.db"
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
        
        scale_test = f'''
const {{ initializeDatabase }} = require('./dist/database/init.js');
const {{ getAllTools }} = require('./dist/tools/index.js');

try {{
    const db = initializeDatabase('{test_db_path}');
    const tools = getAllTools(db);
    const createTool = tools.find(t => t.name === 'create_issue');
    const listTool = tools.find(t => t.name === 'list_issues');
    
    console.log('Creating 100 test issues...');
    const createStartTime = Date.now();
    
    // Create 100 issues
    for (let i = 0; i < 100; i++) {{
        const uniqueId = `scale-${{Date.now()}}-${{i}}`;
        await createTool.execute({{
            issue_id: uniqueId,
            title: `Scale test issue ${{i}}`,
            description: `This is scale test issue number ${{i}} with detailed description containing multiple sentences and technical details to simulate real-world issue content.`,
            priority: i % 3 === 0 ? 'critical' : i % 3 === 1 ? 'high' : 'medium',
            project: `scale-project-${{i % 10}}`,
            issue_type: 'Performance',
            location: `/src/components/Component${{i}}.js`,
            root_cause: `Root cause analysis for issue ${{i}}`,
            required_fix: `Required fix description for issue ${{i}}`
        }});
        
        if (i % 20 === 19) {{
            console.log(`Created ${{i + 1}} issues...`);
        }}
    }}
    
    const createTime = Date.now() - createStartTime;
    const createRate = (100 / createTime) * 1000;
    
    console.log(`Issue creation: ${{createTime}}ms (${{createRate.toFixed(2)}} issues/sec)`);
    
    // Test query performance with large dataset
    console.log('Testing query performance...');
    const queryTimes = [];
    
    for (let i = 0; i < 20; i++) {{
        const start = Date.now();
        const results = await listTool.execute({{ 
            priority: 'critical',
            project: `scale-project-${{i % 10}}`,
            limit: 50 
        }});
        const duration = Date.now() - start;
        queryTimes.push(duration);
        
        if (results.issues.length === 0) {{
            console.log('Warning: No issues returned by query');
        }}
    }}
    
    const avgQueryTime = queryTimes.reduce((a, b) => a + b, 0) / queryTimes.length;
    console.log(`Query performance: avg ${{avgQueryTime.toFixed(2)}}ms`);
    
    // Test statistics generation with large dataset
    console.log('Testing statistics generation...');
    const { IssueOperations } = require('./dist/database/operations.js');
    const ops = new IssueOperations(db);
    
    const statsStart = Date.now();
    const stats = ops.getStatistics();
    const statsTime = Date.now() - statsStart;
    
    console.log(`Statistics generation: ${{statsTime}}ms`);
    console.log(`Total issues in DB: ${{stats.total}}`);
    
    // Performance validation
    const issues = [];
    
    if (createRate < 10) {{
        issues.push(`Issue creation rate (${{createRate.toFixed(2)}} issues/sec) below 10/sec threshold`);
    }}
    
    if (avgQueryTime > 100) {{
        issues.push(`Average query time (${{avgQueryTime.toFixed(2)}}ms) exceeds 100ms threshold`);
    }}
    
    if (statsTime > 50) {{
        issues.push(`Statistics generation (${{statsTime}}ms) exceeds 50ms threshold`);
    }}
    
    if (issues.length > 0) {{
        console.log('Scalability Issues:');
        issues.forEach(issue => console.log(`- ${{issue}}`));
        process.exit(1);
    }}
    
    console.log('✅ Database scalability within acceptable limits');
    db.close();
    
}} catch (error) {{
    console.error('❌ Scalability test failed:', error.message);
    process.exit(1);
}}
'''
        
        with open(self.base_path / "test_scalability.js", "w") as f:
            f.write(scale_test)
            
        try:
            result = subprocess.run(
                ["node", "test_scalability.js"],
                cwd=self.base_path,
                capture_output=True,
                text=True,
                timeout=120
            )
            
            if result.returncode != 0:
                print(f"❌ Database scalability test failed: {result.stderr}")
                return False
                
            # Show performance metrics
            for line in result.stdout.split('\\n'):
                if any(keyword in line for keyword in ['creation:', 'performance:', 'generation:', 'Total issues']):
                    print(f"  {line}")
                    
            print("✅ Database scalability test passed")
            return True
            
        except subprocess.TimeoutExpired:
            print("❌ Scalability test timed out")
            return False
        finally:
            test_file = self.base_path / "test_scalability.js"
            if test_file.exists():
                test_file.unlink()
                
    def test_system_memory_usage(self):
        """Test system memory usage and leak detection"""
        print("\n🧠 Testing Memory Usage and Leak Detection...")
        
        test_db_path = self.base_path / "perf_memory_test.db"
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
        
        memory_test = f'''
const {{ initializeDatabase }} = require('./dist/database/init.js');
const {{ getAllTools }} = require('./dist/tools/index.js');

try {{
    const db = initializeDatabase('{test_db_path}');
    const tools = getAllTools(db);
    const createTool = tools.find(t => t.name === 'create_issue');
    const listTool = tools.find(t => t.name === 'list_issues');
    
    function getMemoryUsage() {{
        const usage = process.memoryUsage();
        return {{
            rss: Math.round(usage.rss / 1024 / 1024),
            heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
            heapTotal: Math.round(usage.heapTotal / 1024 / 1024)
        }};
    }}
    
    console.log('Memory Usage Testing - Running sustained operations...');
    
    const initialMemory = getMemoryUsage();
    console.log(`Initial memory: RSS=${{initialMemory.rss}}MB, Heap=${{initialMemory.heapUsed}}MB`);
    
    // Run sustained operations to test for memory leaks
    for (let cycle = 0; cycle < 5; cycle++) {{
        console.log(`Memory test cycle ${{cycle + 1}}/5...`);
        
        // Create issues
        for (let i = 0; i < 20; i++) {{
            const uniqueId = `memory-${{Date.now()}}-${{cycle}}-${{i}}`;
            await createTool.execute({{
                issue_id: uniqueId,
                title: `Memory test issue ${{cycle}}-${{i}}`,
                description: 'A'.repeat(1000), // 1KB description
                priority: "medium",
                project: `memory-project-${{cycle}}`,
                issue_type: 'Performance'
            }});
        }}
        
        // Query operations
        for (let i = 0; i < 10; i++) {{
            await listTool.execute({{ limit: 100 }});
        }}
        
        const cycleMemory = getMemoryUsage();
        console.log(`Cycle ${{cycle + 1}} memory: RSS=${{cycleMemory.rss}}MB, Heap=${{cycleMemory.heapUsed}}MB`);
        
        // Force garbage collection if available
        if (global.gc) {{
            global.gc();
        }}
    }}
    
    const finalMemory = getMemoryUsage();
    console.log(`Final memory: RSS=${{finalMemory.rss}}MB, Heap=${{finalMemory.heapUsed}}MB`);
    
    const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
    console.log(`Memory increase: ${{memoryIncrease}}MB`);
    
    // Memory thresholds
    if (finalMemory.heapUsed > 100) {{
        console.log(`WARNING: High memory usage (${{finalMemory.heapUsed}}MB)`);
        process.exit(1);
    }}
    
    if (memoryIncrease > 50) {{
        console.log(`WARNING: Significant memory increase (${{memoryIncrease}}MB) - possible leak`);
        process.exit(2);
    }}
    
    console.log('✅ Memory usage within acceptable limits');
    db.close();
    
}} catch (error) {{
    console.error('❌ Memory test failed:', error.message);
    process.exit(1);
}}
'''
        
        with open(self.base_path / "test_memory.js", "w") as f:
            f.write(memory_test)
            
        try:
            # Run with --expose-gc for better garbage collection control
            result = subprocess.run(
                ["node", "--expose-gc", "test_memory.js"],
                cwd=self.base_path,
                capture_output=True,
                text=True,
                timeout=60
            )
            
            if result.returncode == 1:
                print("❌ High memory usage detected")
                return False
            elif result.returncode == 2:
                print("❌ Memory leak detected")
                return False
            elif result.returncode != 0:
                print(f"❌ Memory test failed: {result.stderr}")
                return False
                
            # Show memory usage progression
            for line in result.stdout.split('\\n'):
                if 'memory:' in line or 'Memory increase:' in line:
                    print(f"  {line}")
                    
            print("✅ Memory usage test passed")
            return True
            
        except subprocess.TimeoutExpired:
            print("❌ Memory test timed out")
            return False
        finally:
            test_file = self.base_path / "test_memory.js"
            if test_file.exists():
                test_file.unlink()
                
    def cleanup_test_environment(self):
        """Clean up test databases and artifacts"""
        print("\\n🧹 Cleaning up performance test environment...")
        
        for db_path in self.test_databases:
            if db_path.exists():
                db_path.unlink()
                
        print("✅ Performance test cleanup completed")
        
    def run_performance_e2e_tests(self):
        """Run complete performance and end-to-end test suite"""
        print("🚀 Starting Performance & End-to-End Testing")
        print("=" * 60)
        
        if not self.setup_test_environment():
            return False
            
        test_functions = [
            ("Performance Baselines", self.test_performance_baselines),
            ("Concurrent Agent Simulation", self.test_concurrent_agent_simulation),  
            ("Database Scalability", self.test_database_scalability),
            ("Memory Usage & Leak Detection", self.test_system_memory_usage)
        ]
        
        passed_tests = 0
        total_tests = len(test_functions)
        
        for test_name, test_function in test_functions:
            try:
                print(f"\\n--- {test_name} ---")
                if test_function():
                    passed_tests += 1
                    print(f"✅ {test_name}: PASSED")
                else:
                    print(f"❌ {test_name}: FAILED")
            except Exception as e:
                print(f"❌ {test_name}: ERROR - {e}")
                
        self.cleanup_test_environment()
        
        # Print summary
        print("\\n" + "=" * 60)
        print("📊 PERFORMANCE & E2E TESTING SUMMARY")
        print("=" * 60)
        
        print(f"Tests Passed: {passed_tests}/{total_tests}")
        
        if passed_tests == total_tests:
            print("🎉 ALL PERFORMANCE & E2E TESTS PASSED")
            print("✅ System ready for production workloads")
            return True
        else:
            print("⚠️ SOME TESTS FAILED")
            print("❌ System may have performance issues under load")
            return False

if __name__ == "__main__":
    tester = PerformanceE2ETester()
    success = tester.run_performance_e2e_tests()
    sys.exit(0 if success else 1)