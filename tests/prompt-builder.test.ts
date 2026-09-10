import { describe, expect, it } from 'vitest';
import { buildReviewPrompt } from '../src/claude/prompt-builder.js';
import type { FileDiff, ReviewConfig } from '../src/types/index.js';

const files: FileDiff[] = [
  {
    filename: 'src/example.ts',
    status: 'modified',
    patch: '@@ -1,2 +1,2 @@\n-const x = 1\n+const x = 2',
    additions: 1,
    deletions: 1,
    changes: 2,
  },
];

const config: ReviewConfig = {
  language: 'ko',
  commentStyle: 'both',
  ignorePatterns: [],
  rules: [
    {
      id: 'no-console-log',
      description: '프로덕션 코드에 console.log를 남기지 마세요.',
      appliesTo: ['src/**/*.ts'],
      severity: 'warning',
    },
  ],
};

describe('buildReviewPrompt', () => {
  it('컨벤션 룰과 diff가 반영된 프롬프트를 만든다 (스냅샷)', () => {
    expect(buildReviewPrompt(files, config)).toMatchSnapshot();
  });

  it('룰이 없으면 룰 안내 문구를 넣지 않는다', () => {
    const emptyConfig: ReviewConfig = { commentStyle: 'both', ignorePatterns: [], rules: [] };
    const prompt = buildReviewPrompt(files, emptyConfig);
    expect(prompt.system).not.toMatch(/다음 팀 컨벤션 규칙을 반드시 적용하세요/);
  });

  it('리뷰할 파일이 없으면 안내 문구를 반환한다', () => {
    const prompt = buildReviewPrompt([], config);
    expect(prompt.user).toBe('리뷰할 파일이 없습니다.');
  });
});
