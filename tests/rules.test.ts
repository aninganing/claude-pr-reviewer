import { describe, expect, it } from 'vitest';
import { parseReviewConfig } from '../src/review/rules.js';

describe('parseReviewConfig', () => {
  it('YAML을 ReviewConfig로 변환한다', () => {
    const yaml = `
language: ko
comment_style: inline
ignore_patterns:
  - "docs/**"
rules:
  - id: no-console-log
    description: "console.log를 남기지 마세요."
    applies_to:
      - "src/**/*.ts"
    severity: warning
`;

    expect(parseReviewConfig(yaml)).toEqual({
      language: 'ko',
      commentStyle: 'inline',
      ignorePatterns: ['docs/**'],
      rules: [
        {
          id: 'no-console-log',
          description: 'console.log를 남기지 마세요.',
          appliesTo: ['src/**/*.ts'],
          severity: 'warning',
        },
      ],
    });
  });

  it('빈 파일은 기본값으로 채운다', () => {
    expect(parseReviewConfig('')).toEqual({
      commentStyle: 'both',
      ignorePatterns: [],
      rules: [],
    });
  });

  it('잘못된 severity 값이면 어떤 필드가 문제인지 알려주는 에러를 던진다', () => {
    const yaml = `
rules:
  - id: bad-rule
    description: "설명"
    severity: critical
`;

    expect(() => parseReviewConfig(yaml)).toThrow(/rules\.0\.severity/);
  });
});
