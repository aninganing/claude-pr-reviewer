import type { FileDiff } from '../types/index.js';

/** 실제 토큰 수를 재기 전, 파일을 얼마나 포함시킬지 정하기 위한 대략적인 추정치 (문자수/4). */
function estimateTokens(file: FileDiff): number {
  return Math.ceil((file.patch?.length ?? 0) / 4);
}

export interface TokenBudgetResult {
  /** 예산 안에 들어와 리뷰 대상으로 남는 파일. */
  included: FileDiff[];
  /** 예산 초과로 이번 리뷰에서 제외된 파일. */
  excluded: FileDiff[];
}

/**
 * 파일 목록이 대략적인 토큰 예산을 넘지 않도록 자른다. 작은 diff부터 채워 넣어 최대한 많은
 * 파일을 리뷰 대상에 남기고, 큰 파일 몇 개 때문에 리뷰 전체가 거부되는 것을 막는다.
 * 여기서는 문자수 기반 추정치만 쓰고, 실제 토큰 수는 `src/claude/client.ts`의
 * `countTokens` 사전 검사가 최종적으로 다시 확인한다.
 */
export function applyTokenBudget(files: FileDiff[], maxTokens: number): TokenBudgetResult {
  const bySize = [...files].sort((a, b) => estimateTokens(a) - estimateTokens(b));

  const includedSet = new Set<FileDiff>();
  let total = 0;
  for (const file of bySize) {
    const cost = estimateTokens(file);
    if (total + cost > maxTokens) continue;
    includedSet.add(file);
    total += cost;
  }

  return {
    included: files.filter((file) => includedSet.has(file)),
    excluded: files.filter((file) => !includedSet.has(file)),
  };
}
