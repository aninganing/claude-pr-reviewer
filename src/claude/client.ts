import type Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { ReviewResultSchema } from '../review/schema.js';
import type { ReviewIssue, ReviewResult } from '../types/index.js';
import type { ReviewPrompt } from './prompt-builder.js';

const MODEL = 'claude-opus-5';
const MAX_TOKENS = 16000;

/** 이보다 큰 diff는 비용/컨텍스트 폭주를 막기 위해 기본적으로 리뷰를 거부한다. */
export const DEFAULT_MAX_INPUT_TOKENS = 50_000;

/** diff가 너무 커서 Claude를 호출하지 않고 사전에 거부했을 때 던지는 에러. */
export class PromptTooLargeError extends Error {
  constructor(
    public readonly tokenCount: number,
    public readonly limit: number,
  ) {
    super(
      `리뷰할 diff가 너무 큽니다 (약 ${tokenCount.toLocaleString()} 토큰, 제한 ` +
        `${limit.toLocaleString()} 토큰). PR을 더 작게 나누거나 --max-input-tokens로 ` +
        '제한을 조정하세요.',
    );
    this.name = 'PromptTooLargeError';
  }
}

export interface RequestReviewOptions {
  /** 입력 토큰 상한. 넘으면 Claude를 호출하지 않고 PromptTooLargeError를 던진다. */
  maxInputTokens?: number;
}

export interface ReviewUsage {
  inputTokens: number;
  outputTokens: number;
  /** 이번 요청에서 캐시에 새로 쓴 토큰 수 (있으면 ~1.25배 비용). */
  cacheCreationInputTokens: number;
  /** 이번 요청에서 캐시로부터 읽은 토큰 수 (있으면 ~0.1배 비용). 0이면 캐시가 안 걸린 것. */
  cacheReadInputTokens: number;
}

export interface ReviewCallResult {
  result: ReviewResult;
  usage: ReviewUsage;
}

/**
 * 조립된 프롬프트로 Claude를 호출해 구조화된 `ReviewResult`를 받는다.
 * `output_format`으로 JSON 스키마를 강제하고, 룰셋이 포함된 System 프롬프트에는
 * `cache_control`을 걸어 같은 리포를 반복 리뷰할 때 캐시가 재사용되게 한다.
 */
export async function requestReview(
  client: Anthropic,
  prompt: ReviewPrompt,
  options: RequestReviewOptions = {},
): Promise<ReviewCallResult> {
  const maxInputTokens = options.maxInputTokens ?? DEFAULT_MAX_INPUT_TOKENS;

  const count = await client.messages.countTokens({
    model: MODEL,
    system: [{ type: 'text', text: prompt.system }],
    messages: [{ role: 'user', content: prompt.user }],
  });
  if (count.input_tokens > maxInputTokens) {
    throw new PromptTooLargeError(count.input_tokens, maxInputTokens);
  }

  const message = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: 'text',
        text: prompt.system,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: prompt.user }],
    output_format: betaZodOutputFormat(ReviewResultSchema),
  });

  if (!message.parsed_output) {
    throw new Error('Claude 응답을 구조화된 JSON으로 파싱하지 못했습니다.');
  }

  const parsed = message.parsed_output;

  const issues: ReviewIssue[] = parsed.issues.map((issue): ReviewIssue => {
    const reviewIssue: ReviewIssue = {
      filename: issue.filename,
      line: issue.line,
      severity: issue.severity,
      message: issue.message,
    };
    if (issue.ruleId !== undefined) reviewIssue.ruleId = issue.ruleId;
    if (issue.suggestion !== undefined) reviewIssue.suggestion = issue.suggestion;
    return reviewIssue;
  });

  return {
    result: { summary: parsed.summary, issues },
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheCreationInputTokens: message.usage.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: message.usage.cache_read_input_tokens ?? 0,
    },
  };
}
