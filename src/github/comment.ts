import type { Octokit } from '@octokit/rest';
import type { CommentableIssue } from '../review/diff-lines.js';
import type { ReviewIssue, ReviewResult } from '../types/index.js';

/** 재실행 시 이 코멘트를 찾아 갱신할 수 있도록 남기는 숨김 마커. */
export const SUMMARY_COMMENT_MARKER = '<!-- claude-pr-reviewer:summary -->';

export interface UpsertSummaryCommentParams {
  owner: string;
  repo: string;
  pullNumber: number;
  result: ReviewResult;
  /** 토큰 예산 초과 등으로 이번 리뷰에서 제외된 파일명 (있으면 요약에 안내 문구를 덧붙인다). */
  skippedFiles?: string[];
}

function severityLabel(severity: ReviewIssue['severity']): string {
  switch (severity) {
    case 'error':
      return '🔴 error';
    case 'warning':
      return '🟡 warning';
    case 'info':
      return '🔵 info';
  }
}

/** 마크다운 테이블 셀 안에서 `|`와 줄바꿈이 표를 깨뜨리지 않도록 이스케이프한다. */
function escapeTableCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

/** ReviewResult를 PR 요약 코멘트용 마크다운으로 렌더링한다. */
export function renderSummaryComment(result: ReviewResult, skippedFiles: string[] = []): string {
  const lines = [SUMMARY_COMMENT_MARKER, '## 🤖 Claude PR Review', '', result.summary];

  if (result.issues.length > 0) {
    lines.push('', '| 파일 | 줄 | 심각도 | 내용 |', '| --- | --- | --- | --- |');
    for (const issue of result.issues) {
      const line = issue.line ?? '-';
      const message = issue.suggestion
        ? `${issue.message}<br>💡 ${issue.suggestion}`
        : issue.message;
      lines.push(
        `| \`${escapeTableCell(issue.filename)}\` | ${line} | ${severityLabel(issue.severity)} | ` +
          `${escapeTableCell(message)} |`,
      );
    }
  } else {
    lines.push('', '발견된 이슈가 없습니다.');
  }

  if (skippedFiles.length > 0) {
    lines.push(
      '',
      `⚠️ 다음 ${skippedFiles.length}개 파일은 diff가 너무 커서 이번 리뷰에서 제외했습니다: ` +
        skippedFiles.map((filename) => `\`${filename}\``).join(', '),
    );
  }

  return lines.join('\n');
}

/** 이 봇이 이전에 남긴 요약 코멘트를 마커로 찾는다. 없으면 undefined. */
async function findExistingSummaryComment(
  octokit: Octokit,
  params: { owner: string; repo: string; pullNumber: number },
) {
  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner: params.owner,
    repo: params.repo,
    issue_number: params.pullNumber,
    per_page: 100,
  });
  return comments.find((comment) => comment.body?.includes(SUMMARY_COMMENT_MARKER));
}

/**
 * 요약 리뷰 코멘트를 게시한다. 이 봇이 이전에 남긴 요약 코멘트가 이미 있으면(같은 PR에
 * `synchronize`로 재실행된 경우) 새로 만들지 않고 그 코멘트를 갱신한다.
 */
export async function upsertSummaryComment(
  octokit: Octokit,
  params: UpsertSummaryCommentParams,
): Promise<void> {
  const body = renderSummaryComment(params.result, params.skippedFiles ?? []);
  const existing = await findExistingSummaryComment(octokit, params);

  if (existing) {
    await octokit.rest.issues.updateComment({
      owner: params.owner,
      repo: params.repo,
      comment_id: existing.id,
      body,
    });
  } else {
    await octokit.rest.issues.createComment({
      owner: params.owner,
      repo: params.repo,
      issue_number: params.pullNumber,
      body,
    });
  }
}

function renderInlineCommentBody(issue: ReviewIssue): string {
  const parts = [`${severityLabel(issue.severity)} ${issue.message}`];
  if (issue.suggestion) parts.push(`💡 ${issue.suggestion}`);
  return parts.join('\n\n');
}

export interface PostInlineReviewParams {
  owner: string;
  repo: string;
  pullNumber: number;
  issues: CommentableIssue[];
}

/**
 * diff hunk 범위 안에 있는 이슈들을 라인별 인라인 코멘트로 게시한다.
 * `issues`가 비어 있으면 빈 리뷰를 만들지 않고 그냥 아무것도 하지 않는다.
 * (호출 전에 `src/review/diff-lines.ts`의 `partitionIssuesByCommentability`로
 * hunk 범위 밖 이슈를 걸러내야 한다 — 하나라도 범위 밖이면 요청 전체가 422로 실패한다.)
 */
export async function postInlineReview(
  octokit: Octokit,
  params: PostInlineReviewParams,
): Promise<void> {
  if (params.issues.length === 0) return;

  await octokit.rest.pulls.createReview({
    owner: params.owner,
    repo: params.repo,
    pull_number: params.pullNumber,
    event: 'COMMENT',
    comments: params.issues.map(({ issue, file }) => ({
      path: file.filename,
      // partitionIssuesByCommentability가 이미 line !== null과 hunk 범위 포함을 보장한다.
      line: issue.line as number,
      side: 'RIGHT',
      body: renderInlineCommentBody(issue),
    })),
  });
}
