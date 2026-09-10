/** A single file's diff as returned by the GitHub "list PR files" API. */
export interface FileDiff {
  /** Path relative to the repo root. */
  filename: string;
  /** GitHub file status for this PR (added/modified/removed/renamed/...). */
  status: 'added' | 'modified' | 'removed' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  /** Unified diff patch text. Absent for binary files or files GitHub declines to diff. */
  patch?: string;
  additions: number;
  deletions: number;
  changes: number;
  /** Present only when status === 'renamed'. */
  previousFilename?: string;
}

/** One rule loaded from `.github/review-rules.yml`, injected into the review prompt. */
export interface ReviewRule {
  id: string;
  description: string;
  /** Optional glob(s) restricting which files this rule applies to. */
  appliesTo?: string[];
  severity?: 'info' | 'warning' | 'error';
}

/** One issue Claude reports for a file, validated against src/review/schema.ts. */
export interface ReviewIssue {
  filename: string;
  /** Line number in the file's new (post-diff) version, or null when a hunk mapping isn't available. */
  line: number | null;
  severity: 'info' | 'warning' | 'error';
  ruleId?: string;
  message: string;
  suggestion?: string;
}

/** Full result of reviewing one PR, before it's rendered into GitHub comments. */
export interface ReviewResult {
  summary: string;
  issues: ReviewIssue[];
}
