import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { PromptTooLargeError, requestReview } from '../src/claude/client.js';
import type { ReviewPrompt } from '../src/claude/prompt-builder.js';

const prompt: ReviewPrompt = { system: '시스템', user: '유저' };

function fakeClient(
  parse: ReturnType<typeof vi.fn>,
  countTokens: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ input_tokens: 100 }),
): Anthropic {
  return {
    messages: { countTokens },
    beta: { messages: { parse } },
  } as unknown as Anthropic;
}

describe('requestReview', () => {
  it('Claude 응답을 ReviewResult와 사용량 정보로 변환한다', async () => {
    const parse = vi.fn().mockResolvedValue({
      parsed_output: {
        summary: '이슈 1개 발견',
        issues: [
          {
            filename: 'src/a.ts',
            line: 10,
            severity: 'warning',
            message: 'console.log 제거 필요',
            ruleId: 'no-console-log',
          },
        ],
      },
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 200,
        cache_read_input_tokens: 0,
      },
    });

    const { result, usage } = await requestReview(fakeClient(parse), prompt);

    expect(result).toEqual({
      summary: '이슈 1개 발견',
      issues: [
        {
          filename: 'src/a.ts',
          line: 10,
          severity: 'warning',
          message: 'console.log 제거 필요',
          ruleId: 'no-console-log',
        },
      ],
    });
    expect(result.issues[0]).not.toHaveProperty('suggestion');
    expect(usage).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      cacheCreationInputTokens: 200,
      cacheReadInputTokens: 0,
    });

    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-opus-5',
        system: [
          expect.objectContaining({
            type: 'text',
            text: prompt.system,
            cache_control: { type: 'ephemeral' },
          }),
        ],
        messages: [{ role: 'user', content: prompt.user }],
      }),
    );
  });

  it('parsed_output이 없으면 에러를 던진다', async () => {
    const parse = vi.fn().mockResolvedValue({
      parsed_output: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    await expect(requestReview(fakeClient(parse), prompt)).rejects.toThrow(/파싱하지 못했습니다/);
  });

  it('입력 토큰이 제한을 넘으면 Claude를 호출하지 않고 거부한다', async () => {
    const parse = vi.fn();
    const countTokens = vi.fn().mockResolvedValue({ input_tokens: 60_000 });

    await expect(
      requestReview(fakeClient(parse, countTokens), prompt, { maxInputTokens: 50_000 }),
    ).rejects.toThrow(PromptTooLargeError);

    expect(parse).not.toHaveBeenCalled();
  });

  it('기본 상한(DEFAULT_MAX_INPUT_TOKENS) 이하이면 정상 진행한다', async () => {
    const parse = vi.fn().mockResolvedValue({
      parsed_output: { summary: '이슈 없음', issues: [] },
      usage: { input_tokens: 100, output_tokens: 10 },
    });
    const countTokens = vi.fn().mockResolvedValue({ input_tokens: 100 });

    await expect(requestReview(fakeClient(parse, countTokens), prompt)).resolves.toBeDefined();
    expect(parse).toHaveBeenCalledTimes(1);
  });
});
