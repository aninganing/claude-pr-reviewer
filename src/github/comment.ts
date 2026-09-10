import type { Octokit } from '@octokit/rest';
import type { ReviewIssue, ReviewResult } from '../types/index.js';

/** 재실행 시 이 코멘트를 찾아 갱신할 수 있도록 남기는 숨김 마커. */
export const SUMMARY_COMMENT_MARKER = '<!-- claude-pr-reviewer:summary -->';

export interface PostSummaryCommentParams {
  owner: string;
  repo: string;
  pullNumber: number;
  result: ReviewResult;
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
export function renderSummaryComment(result: ReviewResult): string {
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

  return lines.join('\n');
}

/** PR에 요약 리뷰 코멘트를 새로 게시한다. */
export async function postSummaryComment(
  octokit: Octokit,
  params: PostSummaryCommentParams,
): Promise<void> {
  await octokit.rest.issues.createComment({
    owner: params.owner,
    repo: params.repo,
    issue_number: params.pullNumber,
    body: renderSummaryComment(params.result),
  });
}
