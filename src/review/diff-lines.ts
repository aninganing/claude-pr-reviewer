import type { FileDiff, ReviewIssue } from '../types/index.js';

/** unified diff의 한 hunk가 커버하는 새 파일 기준 줄 범위 (양끝 포함). */
export interface DiffHunkRange {
  startLine: number;
  endLine: number;
}

const HUNK_HEADER_PATTERN = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/**
 * patch 텍스트에서 `@@ -a,b +c,d @@` 헤더를 모두 찾아 새 파일 기준 줄 범위 목록을 만든다.
 * GitHub의 인라인 리뷰 코멘트는 이 범위 안의 줄만 지목할 수 있다 — 벗어나면
 * `POST .../reviews` 요청 전체가 422로 실패한다.
 */
export function parseHunkRanges(patch: string): DiffHunkRange[] {
  const ranges: DiffHunkRange[] = [];

  for (const line of patch.split('\n')) {
    const match = HUNK_HEADER_PATTERN.exec(line);
    if (!match) continue;

    const startLine = Number(match[1]);
    const lineCount = match[2] !== undefined ? Number(match[2]) : 1;
    if (lineCount === 0) continue; // 순수 삭제 hunk는 새 파일 쪽에 줄이 없음

    ranges.push({ startLine, endLine: startLine + lineCount - 1 });
  }

  return ranges;
}

export function isLineInHunkRanges(ranges: DiffHunkRange[], line: number): boolean {
  return ranges.some((range) => line >= range.startLine && line <= range.endLine);
}

export interface CommentableIssue {
  issue: ReviewIssue;
  file: FileDiff;
}

export interface PartitionedIssues {
  /** hunk 범위 안에 있어 인라인 코멘트로 게시 가능한 이슈. */
  inline: CommentableIssue[];
  /** 줄 번호가 없거나 hunk 밖이라 인라인으로 게시할 수 없는 이슈 (요약으로 강등). */
  fallback: ReviewIssue[];
}

/**
 * Claude가 보고한 이슈들을 "인라인으로 게시 가능"과 "요약으로 강등"으로 나눈다.
 * 순수 로직만 담당하며 GitHub API를 직접 호출하지 않는다.
 */
export function partitionIssuesByCommentability(
  issues: ReviewIssue[],
  files: FileDiff[],
): PartitionedIssues {
  const fileByName = new Map(files.map((file) => [file.filename, file]));
  const inline: CommentableIssue[] = [];
  const fallback: ReviewIssue[] = [];

  for (const issue of issues) {
    const file = fileByName.get(issue.filename);
    if (issue.line === null || !file?.patch) {
      fallback.push(issue);
      continue;
    }

    const ranges = parseHunkRanges(file.patch);
    if (isLineInHunkRanges(ranges, issue.line)) {
      inline.push({ issue, file });
    } else {
      fallback.push(issue);
    }
  }

  return { inline, fallback };
}
