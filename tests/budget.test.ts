import { describe, expect, it } from 'vitest';
import { applyTokenBudget } from '../src/review/budget.js';
import type { FileDiff } from '../src/types/index.js';

function fileWithPatchLength(filename: string, length: number): FileDiff {
  return {
    filename,
    status: 'modified',
    patch: 'x'.repeat(length),
    additions: 1,
    deletions: 0,
    changes: 1,
  };
}

describe('applyTokenBudget', () => {
  it('예산 안에 다 들어오면 전부 포함한다', () => {
    const files = [fileWithPatchLength('a.ts', 40), fileWithPatchLength('b.ts', 40)];
    const result = applyTokenBudget(files, 1000);
    expect(result.included).toEqual(files);
    expect(result.excluded).toEqual([]);
  });

  it('예산을 넘으면 작은 파일부터 채우고 큰 파일을 제외한다', () => {
    const small = fileWithPatchLength('small.ts', 40); // ~10 토큰
    const big = fileWithPatchLength('big.ts', 4000); // ~1000 토큰
    const result = applyTokenBudget([big, small], 100);

    expect(result.included).toEqual([small]);
    expect(result.excluded).toEqual([big]);
  });

  it('원래 순서를 유지한다', () => {
    const a = fileWithPatchLength('a.ts', 40);
    const b = fileWithPatchLength('b.ts', 40);
    const result = applyTokenBudget([b, a], 1000);
    expect(result.included.map((f) => f.filename)).toEqual(['b.ts', 'a.ts']);
  });

  it('전부 예산을 넘으면 모두 제외한다', () => {
    const files = [fileWithPatchLength('a.ts', 8000)];
    const result = applyTokenBudget(files, 10);
    expect(result.included).toEqual([]);
    expect(result.excluded).toEqual(files);
  });
});
