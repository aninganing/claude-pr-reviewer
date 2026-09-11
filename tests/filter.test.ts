import { describe, expect, it } from 'vitest';
import { classifyFiles, filterReviewableFiles } from '../src/review/filter.js';
import type { FileDiff } from '../src/types/index.js';

function textFile(overrides: Partial<FileDiff> = {}): FileDiff {
  return {
    filename: 'src/example.ts',
    status: 'modified',
    patch: '@@ -1 +1 @@',
    additions: 1,
    deletions: 0,
    changes: 1,
    ...overrides,
  };
}

describe('classifyFiles', () => {
  it('patch가 없는 파일(바이너리 등)은 제외한다', () => {
    const binaryFile: FileDiff = {
      filename: 'logo.png',
      status: 'added',
      additions: 0,
      deletions: 0,
      changes: 0,
    };

    const [decision] = classifyFiles([binaryFile]);
    expect(decision?.included).toBe(false);
    expect(decision?.reason).toMatch(/바이너리/);
  });

  it('기본 ignore 패턴(lock 파일)은 제외한다', () => {
    const [decision] = classifyFiles([textFile({ filename: 'package-lock.json' })]);
    expect(decision?.included).toBe(false);
  });

  it('사용자 지정 ignore 패턴을 적용한다', () => {
    const [decision] = classifyFiles([textFile({ filename: 'generated/schema.ts' })], {
      ignoreGlobs: ['generated/**'],
    });
    expect(decision?.included).toBe(false);
  });

  it('필터에 걸리지 않으면 포함한다', () => {
    const [decision] = classifyFiles([textFile()]);
    expect(decision?.included).toBe(true);
    expect(decision?.reason).toBeUndefined();
  });
});

describe('filterReviewableFiles', () => {
  it('포함 판정된 파일만 반환한다', () => {
    const files = [textFile({ filename: 'src/a.ts' }), textFile({ filename: 'yarn.lock' })];
    expect(filterReviewableFiles(files).map((file) => file.filename)).toEqual(['src/a.ts']);
  });
});
