import { describe, expect, it } from 'vitest';
import type { FileDiff, ReviewIssue, ReviewResult, ReviewRule } from '../src/types/index.js';

describe('types', () => {
  it('핵심 타입(FileDiff, ReviewRule, ReviewIssue, ReviewResult)으로 값을 구성할 수 있다', () => {
    const diff: FileDiff = {
      filename: 'src/index.ts',
      status: 'modified',
      additions: 1,
      deletions: 0,
      changes: 1,
    };

    const rule: ReviewRule = {
      id: 'no-console-log',
      description: 'Do not leave console.log in production code.',
      severity: 'warning',
    };

    const issue: ReviewIssue = {
      filename: diff.filename,
      line: 1,
      severity: 'warning',
      ruleId: rule.id,
      message: 'Remove debug log.',
    };

    const result: ReviewResult = {
      summary: '1 issue found.',
      issues: [issue],
    };

    expect(result.issues).toHaveLength(1);
  });
});
