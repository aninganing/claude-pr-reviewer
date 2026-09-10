/** GitHub의 "list PR files" API가 반환하는 파일 하나의 diff. */
export interface FileDiff {
  /** 레포 루트 기준 상대 경로. */
  filename: string;
  /** 이 PR에서의 GitHub 파일 상태(added/modified/removed/renamed/...). */
  status: 'added' | 'modified' | 'removed' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  /** unified diff patch 텍스트. 바이너리 파일이거나 GitHub이 diff를 생략한 파일은 없음. */
  patch?: string;
  additions: number;
  deletions: number;
  changes: number;
  /** status === 'renamed'일 때만 존재. */
  previousFilename?: string;
}

/** `.github/review-rules.yml`에서 로드해 리뷰 프롬프트에 주입하는 룰 하나. */
export interface ReviewRule {
  id: string;
  description: string;
  /** 이 룰을 적용할 파일을 제한하는 glob 패턴(선택). */
  appliesTo?: string[];
  severity?: 'info' | 'warning' | 'error';
}

/** Claude가 파일에 대해 보고하는 이슈 하나. src/review/schema.ts로 검증됨. */
export interface ReviewIssue {
  filename: string;
  /** 파일의 새(diff 이후) 버전 기준 라인 번호. hunk 매핑이 불가능하면 null. */
  line: number | null;
  severity: 'info' | 'warning' | 'error';
  ruleId?: string;
  message: string;
  suggestion?: string;
}

/** PR 하나를 리뷰한 전체 결과. GitHub 코멘트로 렌더링되기 전 형태. */
export interface ReviewResult {
  summary: string;
  issues: ReviewIssue[];
}
