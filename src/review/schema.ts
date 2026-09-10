import { z } from 'zod';

/** `src/types/index.ts`의 `ReviewIssue`와 같은 모양의 zod 스키마. Claude 구조화 출력 검증에 쓴다. */
export const ReviewIssueSchema = z.object({
  filename: z.string(),
  line: z.number().int().nullable(),
  severity: z.enum(['info', 'warning', 'error']),
  ruleId: z.string().optional(),
  message: z.string(),
  suggestion: z.string().optional(),
});

/** `src/types/index.ts`의 `ReviewResult`와 같은 모양의 zod 스키마. */
export const ReviewResultSchema = z.object({
  summary: z.string(),
  issues: z.array(ReviewIssueSchema),
});
