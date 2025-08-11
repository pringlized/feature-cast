// Issue type definitions

export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type Status = 'outstanding' | 'in_progress' | 'review' | 'resolved';
export type WorkStatus = 'available' | 'checked_out';
export type IssueType = 'Security' | 'Performance' | 'Integration' | 'Configuration' | 'Bug' | 'Feature';
export type EntryType = 
  | 'status_change'        // Status transitions
  | 'comment'              // User comments and notes
  | 'checkout'             // Issue checkout by human or agent
  | 'unlock'               // Issue unlock/release actions
  | 'resolution_attempt'   // Agent resolution submissions
  | 'agent_action'         // Generic agent actions (PRIVILEGED)
  | 'system_action'        // Automated system actions (PRIVILEGED)
  | 'approval'             // Human approval/rejection of agent work (PRIVILEGED)
  | 'assignment'           // Issue assignment to human or agent (PRIVILEGED)
  | 'priority_change';     // Priority level changes (PRIVILEGED)

export interface Issue {
  id?: number;
  file_path?: string;
  issue_id: string;
  title: string;
  priority: Priority;
  status: Status;
  work_status: WorkStatus;
  checked_out_by?: string;
  checked_out_at?: Date;
  project: string;
  milestone?: string;
  parent_feature?: string;
  severity?: string;
  issue_type?: IssueType;
  location?: string;
  description?: string;
  root_cause?: string;
  required_fix?: string;
  attempt_count: number;
  created_at?: Date;
  updated_at?: Date;
  original_content?: string;
  metadata?: any;
  file_last_modified?: Date;
}

export interface IssueThread {
  id?: number;
  issue_id: number;
  entry_type: EntryType;
  content: string;
  author: string;
  created_at?: Date;
  metadata?: any;
}

export interface FileChange {
  file: string;
  operation: 'create' | 'modify' | 'delete';
  changes: string[];
}

export interface TestResult {
  name: string;
  passed: boolean;
  message?: string;
}

export interface TestSuiteResult {
  total: number;
  passed: number;
  failed: number;
  details?: string;
}

export interface ValidationChecklist {
  security_fix_applied: boolean;
  tests_passing: boolean;
  no_regressions: boolean;
  performance_acceptable: boolean;
}

export interface ResolutionAttempt {
  attempt_number: number;
  timestamp: Date;
  analysis: {
    understanding: string;
    approach: string;
    scope: string;
  };
  implementation: {
    files_modified: FileChange[];
    changes_applied: string[];
    reasoning: string;
  };
  test_results: {
    targeted_tests: TestResult[];
    full_suite_results: TestSuiteResult;
    validation_status: ValidationChecklist;
  };
  outcome: {
    result: 'SUCCESS' | 'PARTIAL' | 'FAILED';
    assessment: string;
    next_steps: string;
  };
}