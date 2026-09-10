import type { FileDiff, ReviewConfig } from '../types/index.js';

export interface ReviewPrompt {
  system: string;
  user: string;
}

/** 컨벤션 룰(ReviewConfig)을 Claude에게 줄 System 프롬프트로 조립한다. */
export function buildSystemPrompt(config: ReviewConfig): string {
  const lines: string[] = [
    '당신은 시니어 소프트웨어 엔지니어로서 pull request의 diff를 리뷰합니다.',
    '실제 버그, 팀 컨벤션 위반, 명백한 휴먼 에러만 지적하고, 사소한 스타일 취향이나',
    '억지스러운 지적은 피하세요.',
  ];

  if (config.language) {
    lines.push(`리뷰 코멘트는 "${config.language}" 언어로 작성하세요.`);
  }

  if (config.rules.length > 0) {
    lines.push('', '다음 팀 컨벤션 규칙을 반드시 적용하세요:');
    for (const rule of config.rules) {
      const severity = rule.severity ? ` [${rule.severity}]` : '';
      const scope = rule.appliesTo?.length ? ` (적용 대상: ${rule.appliesTo.join(', ')})` : '';
      lines.push(`- [${rule.id}]${severity} ${rule.description}${scope}`);
    }
  }

  lines.push(
    '',
    '## 줄 번호 규칙 (매우 중요)',
    '입력 diff는 unified diff 형식이며, 각 hunk는',
    '`@@ -구버전_시작줄,구버전_줄수 +신버전_시작줄,신버전_줄수 @@` 헤더로 시작합니다.',
    'issue의 line은 반드시 "신버전(+)" 기준 줄 번호여야 합니다: hunk 헤더의 +시작줄부터 세어',
    '`-`로 시작하는 삭제된 줄은 건너뛰고, 공백(context) 또는 `+`로 시작하는 줄마다 1씩 증가시키세요.',
    '이 hunk에 나타나지 않는 줄 번호는 절대 지목하지 마세요 — 코멘트 게시 자체가 실패합니다.',
    '줄 번호를 정확히 특정할 수 없으면 해당 이슈는 보고하지 마세요.',
    '',
    '## severity 기준',
    '- error: 실제 버그, 보안 취약점(인젝션, 시크릿 노출, XSS 등), 빌드/런타임을 깨뜨리는 문제.',
    '  보안 이슈는 위 컨벤션 규칙에 없어도 항상 error로 보고하세요.',
    '- warning: 팀 컨벤션 위반이 명확하거나 버그로 이어질 가능성이 높은 패턴.',
    '- info: 사소한 개선 제안이거나 확신이 낮은 경우.',
    '',
    '## 출력 필드 사용법',
    '- ruleId: 위 컨벤션 규칙 중 하나를 위반했을 때만 해당 규칙의 id를 적으세요. 특정 규칙과',
    '  무관한 일반 버그면 비워두세요.',
    '- suggestion: 한두 줄 안에서 바로 적용 가능한 간단한 대안이 있을 때만 적으세요. 없으면 생략.',
    '- message: 무엇이 문제이고 왜 문제인지 간결하게 설명하세요.',
    '',
    '## 주의사항',
    '- diff에는 변경된 hunk 주변 몇 줄만 보이고 파일 전체는 보이지 않습니다. 보이지 않는 코드의',
    '  존재를 추측해 단정적으로 지적하지 마세요(예: "이 변수는 안 쓰인다"처럼 파일 전체를 봐야',
    '  확인 가능한 주장). 확신이 없으면 info로 낮추거나 아예 보고하지 마세요.',
    '- 같은 문제가 여러 줄에 반복되면 각 줄마다 따로 보고하지 말고 대표되는 한두 곳만 짚은 뒤,',
    '  message에 동일 패턴이 다른 곳에도 있다고 요약하세요.',
    '',
    '각 파일의 diff를 검토한 뒤, 발견한 이슈마다 filename, line, severity, message,',
    '(해당하면) ruleId, suggestion을 포함해 응답하세요.',
    '이슈가 없으면 issues를 빈 배열로 두고, summary에는 리뷰한 변경 사항에 대한 한두 문장 총평을',
    '적으세요.',
  );

  return lines.join('\n');
}

/** 필터링된 diff 목록을 Claude에게 보여줄 User 메시지로 조립한다. */
export function buildUserMessage(files: FileDiff[]): string {
  if (files.length === 0) {
    return '리뷰할 파일이 없습니다.';
  }

  return files
    .map((file) => {
      const header = `### ${file.filename} (${file.status}, +${file.additions}/-${file.deletions})`;
      const body = file.patch ? '```diff\n' + file.patch + '\n```' : '(patch 없음)';
      return `${header}\n${body}`;
    })
    .join('\n\n');
}

export function buildReviewPrompt(files: FileDiff[], config: ReviewConfig): ReviewPrompt {
  return {
    system: buildSystemPrompt(config),
    user: buildUserMessage(files),
  };
}
