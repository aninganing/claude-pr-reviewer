import { minimatch } from 'minimatch';
import type { FileDiff } from '../types/index.js';

/** LLM 코드 리뷰에서 거의 항상 노이즈가 되는 파일들. */
const DEFAULT_IGNORE_GLOBS = [
  '**/package-lock.json',
  '**/npm-shrinkwrap.json',
  '**/yarn.lock',
  '**/pnpm-lock.yaml',
  '**/bun.lockb',
  '**/Cargo.lock',
  '**/Gemfile.lock',
  '**/composer.lock',
  '**/poetry.lock',
  '**/Pipfile.lock',
  '**/go.sum',
];

export interface FilterOptions {
  /** 제외할 추가 glob 패턴(리포 기준 상대 파일명과 매칭). */
  ignoreGlobs?: string[];
}

export interface FilterDecision {
  file: FileDiff;
  included: boolean;
  reason?: string;
}

/**
 * 순수 필터링 로직: GitHub API에서 `patch`가 없는 바이너리/과대 diff 파일과
 * lock/ignore 패턴에 매칭되는 파일을 리뷰 대상에서 제외한다. GitHub/Claude API에는 의존하지 않는다.
 */
export function classifyFiles(files: FileDiff[], options: FilterOptions = {}): FilterDecision[] {
  const ignoreGlobs = [...DEFAULT_IGNORE_GLOBS, ...(options.ignoreGlobs ?? [])];

  return files.map((file): FilterDecision => {
    if (!file.patch) {
      return { file, included: false, reason: '바이너리 파일이거나 diff가 너무 커서 patch가 없음' };
    }

    const matchedGlob = ignoreGlobs.find((glob) => minimatch(file.filename, glob));
    if (matchedGlob) {
      return { file, included: false, reason: `ignore 패턴에 매칭됨: ${matchedGlob}` };
    }

    return { file, included: true };
  });
}

export function filterReviewableFiles(files: FileDiff[], options: FilterOptions = {}): FileDiff[] {
  return classifyFiles(files, options)
    .filter((decision) => decision.included)
    .map((decision) => decision.file);
}
