import type { Octokit } from '@octokit/rest';
import { describe, expect, it, vi } from 'vitest';
import { postSummaryComment, renderSummaryComment } from '../src/github/comment.js';
import type { ReviewResult } from '../src/types/index.js';

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
});

describe('postSummaryComment', () => {
  it('issues.createComment를 올바른 인자로 호출한다', async () => {
    const createComment = vi.fn().mockResolvedValue({});
    const octokit = { rest: { issues: { createComment } } } as unknown as Octokit;
    const result: ReviewResult = { summary: '요약', issues: [] };

    await postSummaryComment(octokit, { owner: 'anna', repo: 'repo', pullNumber: 5, result });

    expect(createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'anna',
        repo: 'repo',
        issue_number: 5,
        body: expect.stringContaining('요약'),
      }),
    );
  });
});
