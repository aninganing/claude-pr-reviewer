import type { Octokit } from '@octokit/rest';
import { describe, expect, it, vi } from 'vitest';
import { postInlineReview, renderSummaryComment, upsertSummaryComment } from '../src/github/comment.js';
import type { FileDiff, ReviewResult } from '../src/types/index.js';

describe('renderSummaryComment', () => {
  it('이슈가 없으면 안내 문구를 넣는다', () => {
    const result: ReviewResult = { summary: '문제 없음', issues: [] };
    const body = renderSummaryComment(result);
    expect(body).toContain('발견된 이슈가 없습니다.');
    expect(body).toContain('문제 없음');
  });

  it('이슈를 테이블로 렌더링하고 suggestion을 포함한다', () => {
    const result: ReviewResult = {
      summary: '이슈 1개',
      issues: [
        {
          filename: 'src/a.ts',
          line: 10,
          severity: 'warning',
          message: 'console.log 제거 필요',
          suggestion: 'logger.debug로 교체하세요',
        },
      ],
    };

    const body = renderSummaryComment(result);
    expect(body).toContain('src/a.ts');
    expect(body).toContain('10');
    expect(body).toContain('🟡 warning');
    expect(body).toContain('console.log 제거 필요');
    expect(body).toContain('logger.debug로 교체하세요');
  });

  it('파일명/메시지에 `|`가 있어도 표가 깨지지 않도록 이스케이프한다', () => {
    const result: ReviewResult = {
      summary: '요약',
      issues: [
        {
          filename: 'src/a|b.ts',
          line: null,
          severity: 'info',
          message: 'a | b 중 하나를 선택하세요',
        },
      ],
    };

    const body = renderSummaryComment(result);
    expect(body).toContain('a\\|b.ts');
    expect(body).toContain('a | b 중 하나를 선택하세요'.replace('|', '\\|'));
  });

  it('line이 null이면 -로 표시한다', () => {
    const result: ReviewResult = {
      summary: '요약',
      issues: [{ filename: 'a.ts', line: null, severity: 'info', message: '메시지' }],
    };
    expect(renderSummaryComment(result)).toContain('| - |');
  });

  it('skippedFiles가 있으면 안내 문구를 덧붙인다', () => {
    const result: ReviewResult = { summary: '요약', issues: [] };
    const body = renderSummaryComment(result, ['huge.ts']);
    expect(body).toContain('huge.ts');
    expect(body).toContain('너무 커서');
  });
});

describe('upsertSummaryComment', () => {
  const result: ReviewResult = { summary: '요약', issues: [] };

  it('기존 요약 코멘트가 없으면 새로 만든다', async () => {
    const listComments = vi.fn().mockResolvedValue([]);
    const createComment = vi.fn().mockResolvedValue({});
    const updateComment = vi.fn();
    const octokit = {
      paginate: vi.fn().mockImplementation((_fn, params) => listComments(params)),
      rest: { issues: { listComments, createComment, updateComment } },
    } as unknown as Octokit;

    await upsertSummaryComment(octokit, { owner: 'anna', repo: 'repo', pullNumber: 5, result });

    expect(createComment).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'anna', repo: 'repo', issue_number: 5 }),
    );
    expect(updateComment).not.toHaveBeenCalled();
  });

  it('마커가 있는 기존 코멘트가 있으면 그걸 갱신한다', async () => {
    const existing = { id: 42, body: '이전 리뷰\n<!-- claude-pr-reviewer:summary -->' };
    const createComment = vi.fn();
    const updateComment = vi.fn().mockResolvedValue({});
    const octokit = {
      paginate: vi.fn().mockResolvedValue([existing]),
      rest: { issues: { listComments: vi.fn(), createComment, updateComment } },
    } as unknown as Octokit;

    await upsertSummaryComment(octokit, { owner: 'anna', repo: 'repo', pullNumber: 5, result });

    expect(updateComment).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'anna', repo: 'repo', comment_id: 42 }),
    );
    expect(createComment).not.toHaveBeenCalled();
  });
});

describe('postInlineReview', () => {
  const file: FileDiff = {
    filename: 'src/a.ts',
    status: 'modified',
    patch: '@@ -1,1 +1,2 @@',
    additions: 1,
    deletions: 0,
    changes: 1,
  };

  it('이슈가 있으면 createReview를 line/side와 함께 호출한다', async () => {
    const createReview = vi.fn().mockResolvedValue({});
    const octokit = { rest: { pulls: { createReview } } } as unknown as Octokit;

    await postInlineReview(octokit, {
      owner: 'anna',
      repo: 'repo',
      pullNumber: 5,
      issues: [
        {
          file,
          issue: { filename: 'src/a.ts', line: 2, severity: 'warning', message: 'msg' },
        },
      ],
    });

    expect(createReview).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'anna',
        repo: 'repo',
        pull_number: 5,
        event: 'COMMENT',
        comments: [expect.objectContaining({ path: 'src/a.ts', line: 2, side: 'RIGHT' })],
      }),
    );
  });

  it('이슈가 없으면 createReview를 호출하지 않는다', async () => {
    const createReview = vi.fn();
    const octokit = { rest: { pulls: { createReview } } } as unknown as Octokit;

    await postInlineReview(octokit, { owner: 'anna', repo: 'repo', pullNumber: 5, issues: [] });

    expect(createReview).not.toHaveBeenCalled();
  });
});
