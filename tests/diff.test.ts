import type { Octokit } from '@octokit/rest';
import { describe, expect, it, vi } from 'vitest';
import { fetchPullRequestFiles, parsePullRequestRef } from '../src/github/diff.js';

describe('parsePullRequestRef', () => {
  it('전체 PR URL을 파싱한다', () => {
    expect(parsePullRequestRef('https://github.com/anna/claude-pr-reviewer/pull/42')).toEqual({
      owner: 'anna',
      repo: 'claude-pr-reviewer',
      pullNumber: 42,
    });
  });

  it('owner/repo#번호 축약형을 파싱한다', () => {
    expect(parsePullRequestRef('anna/claude-pr-reviewer#7')).toEqual({
      owner: 'anna',
      repo: 'claude-pr-reviewer',
      pullNumber: 7,
    });
  });

  it('알 수 없는 형식이면 에러를 던진다', () => {
    expect(() => parsePullRequestRef('not-a-pr')).toThrow();
  });
});

describe('fetchPullRequestFiles', () => {
  it('페이지네이션된 결과를 FileDiff로 변환한다', async () => {
    const paginate = vi.fn().mockResolvedValue([
      {
        filename: 'src/a.ts',
        status: 'modified',
        patch: '@@ -1 +1 @@',
        additions: 1,
        deletions: 0,
        changes: 1,
      },
      {
        filename: 'image.png',
        status: 'added',
        additions: 0,
        deletions: 0,
        changes: 0,
      },
    ]);

    const octokit = {
      paginate,
      rest: { pulls: { listFiles: vi.fn() } },
    } as unknown as Octokit;

    const files = await fetchPullRequestFiles(octokit, {
      owner: 'anna',
      repo: 'claude-pr-reviewer',
      pullNumber: 1,
    });

    expect(files).toHaveLength(2);
    expect(files[0]).toMatchObject({ filename: 'src/a.ts', patch: '@@ -1 +1 @@' });
    expect(files[1]?.patch).toBeUndefined();
    expect(paginate).toHaveBeenCalledWith(
      octokit.rest.pulls.listFiles,
      expect.objectContaining({ owner: 'anna', repo: 'claude-pr-reviewer', pull_number: 1 }),
    );
  });
});
