import { describe, expect, it } from 'vitest';
import {
  isLineInHunkRanges,
  parseHunkRanges,
  partitionIssuesByCommentability,
} from '../src/review/diff-lines.js';
import type { FileDiff, ReviewIssue } from '../src/types/index.js';

const SAMPLE_PATCH = ['@@ -10,3 +10,4 @@', ' context', '-old', '+new1', '+new2', ' context'].join(
  '\n',
);

describe('parseHunkRanges', () => {
  it('hunk 헤더에서 새 파일 기준 줄 범위를 추출한다', () => {
    expect(parseHunkRanges(SAMPLE_PATCH)).toEqual([{ startLine: 10, endLine: 13 }]);
  });

  it('여러 hunk를 모두 추출한다', () => {
    const patch = '@@ -1,2 +1,2 @@\n@@ -50,1 +52,3 @@';
    expect(parseHunkRanges(patch)).toEqual([
      { startLine: 1, endLine: 2 },
      { startLine: 52, endLine: 54 },
    ]);
  });

  it('줄 수가 생략된 헤더(+N만 있는 경우)는 1줄로 취급한다', () => {
    expect(parseHunkRanges('@@ -5 +7 @@')).toEqual([{ startLine: 7, endLine: 7 }]);
  });

  it('순수 삭제 hunk(+N,0)는 범위에 포함하지 않는다', () => {
    expect(parseHunkRanges('@@ -5,3 +7,0 @@')).toEqual([]);
  });
});

describe('isLineInHunkRanges', () => {
  const ranges = parseHunkRanges(SAMPLE_PATCH);

  it('범위 안의 줄은 true', () => {
    expect(isLineInHunkRanges(ranges, 10)).toBe(true);
    expect(isLineInHunkRanges(ranges, 13)).toBe(true);
  });

  it('범위 밖의 줄은 false', () => {
    expect(isLineInHunkRanges(ranges, 9)).toBe(false);
    expect(isLineInHunkRanges(ranges, 14)).toBe(false);
  });
});

describe('partitionIssuesByCommentability', () => {
  const file: FileDiff = {
    filename: 'src/a.ts',
    status: 'modified',
    patch: SAMPLE_PATCH,
    additions: 3,
    deletions: 1,
    changes: 4,
  };

  it('hunk 범위 안의 이슈는 inline으로 분류한다', () => {
    const issue: ReviewIssue = {
      filename: 'src/a.ts',
      line: 12,
      severity: 'warning',
      message: 'm',
    };
    const result = partitionIssuesByCommentability([issue], [file]);
    expect(result.inline).toEqual([{ issue, file }]);
    expect(result.fallback).toEqual([]);
  });

  it('hunk 범위 밖의 이슈는 fallback으로 분류한다', () => {
    const issue: ReviewIssue = {
      filename: 'src/a.ts',
      line: 999,
      severity: 'warning',
      message: 'm',
    };
    const result = partitionIssuesByCommentability([issue], [file]);
    expect(result.inline).toEqual([]);
    expect(result.fallback).toEqual([issue]);
  });

  it('line이 null이면 fallback으로 분류한다', () => {
    const issue: ReviewIssue = { filename: 'src/a.ts', line: null, severity: 'info', message: 'm' };
    const result = partitionIssuesByCommentability([issue], [file]);
    expect(result.fallback).toEqual([issue]);
  });

  it('파일을 찾을 수 없거나 patch가 없으면 fallback으로 분류한다', () => {
    const issue: ReviewIssue = {
      filename: 'src/unknown.ts',
      line: 1,
      severity: 'info',
      message: 'm',
    };
    const result = partitionIssuesByCommentability([issue], [file]);
    expect(result.fallback).toEqual([issue]);
  });
});
