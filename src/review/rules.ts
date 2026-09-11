import { readFile } from 'node:fs/promises';
import { load as parseYaml } from 'js-yaml';
import { z } from 'zod';
import type { ReviewConfig, ReviewRule } from '../types/index.js';

const RuleSchema = z.object({
  id: z.string(),
  description: z.string(),
  applies_to: z.array(z.string()).optional(),
  severity: z.enum(['info', 'warning', 'error']).optional(),
});

const ConfigFileSchema = z.object({
  language: z.string().optional(),
  comment_style: z.enum(['inline', 'summary', 'both']).default('both'),
  ignore_patterns: z.array(z.string()).default([]),
  rules: z.array(RuleSchema).default([]),
});

/**
 * `.github/review-rules.yml`의 YAML 텍스트를 파싱해 `ReviewConfig`로 변환한다.
 * 스키마가 안 맞으면(오타, 잘못된 값 등) 어떤 필드가 문제인지 알려주는 에러를 던진다.
 */
export function parseReviewConfig(yamlText: string): ReviewConfig {
  const raw = parseYaml(yamlText);
  const result = ConfigFileSchema.safeParse(raw ?? {});

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(최상위)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`review-rules.yml 형식이 올바르지 않습니다:\n${details}`);
  }

  const parsed = result.data;

  const rules: ReviewRule[] = parsed.rules.map((rule): ReviewRule => {
    const reviewRule: ReviewRule = { id: rule.id, description: rule.description };
    if (rule.applies_to !== undefined) reviewRule.appliesTo = rule.applies_to;
    if (rule.severity !== undefined) reviewRule.severity = rule.severity;
    return reviewRule;
  });

  const config: ReviewConfig = {
    commentStyle: parsed.comment_style,
    ignorePatterns: parsed.ignore_patterns,
    rules,
  };
  if (parsed.language !== undefined) config.language = parsed.language;
  return config;
}

export async function loadReviewConfig(path: string): Promise<ReviewConfig> {
  const text = await readFile(path, 'utf8');
  return parseReviewConfig(text);
}

/** 룰 파일이 없을 때 쓰는 빈 설정 (컨벤션 룰 없이도 리뷰 파이프라인 자체는 동작해야 함). */
export function emptyReviewConfig(): ReviewConfig {
  return { commentStyle: 'both', ignorePatterns: [], rules: [] };
}
