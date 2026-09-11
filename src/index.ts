import * as core from '@actions/core';
import * as github from '@actions/github';
import Anthropic from '@anthropic-ai/sdk';
import { Octokit } from '@octokit/rest';
import { DEFAULT_MAX_INPUT_TOKENS, PromptTooLargeError, requestReview } from './claude/client.js';
import { buildReviewPrompt } from './claude/prompt-builder.js';
import { postInlineReview, upsertSummaryComment } from './github/comment.js';
import { fetchPullRequestFiles } from './github/diff.js';
import { applyTokenBudget } from './review/budget.js';
import { partitionIssuesByCommentability } from './review/diff-lines.js';
import { classifyFiles } from './review/filter.js';
import { emptyReviewConfig, loadReviewConfig } from './review/rules.js';
import type { ReviewResult } from './types/index.js';

function isEnoent(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function run(): Promise<void> {
  const pullRequest = github.context.payload.pull_request;
  if (!pullRequest) {
    core.setFailed('이 액션은 pull_request 이벤트(opened, synchronize)에서만 실행할 수 있습니다.');
    return;
  }

  const githubToken = core.getInput('github-token', { required: true });
  const anthropicApiKey = core.getInput('anthropic-api-key', { required: true });
  const rulesPath = core.getInput('rules-path') || '.github/review-rules.yml';
  const commentStyle = core.getInput('comment-style') || 'both';

  const { owner, repo } = github.context.repo;
  const pullNumber = pullRequest.number as number;
  const octokit = new Octokit({ auth: githubToken });

  const files = await fetchPullRequestFiles(octokit, { owner, repo, pullNumber });
  const reviewableFiles = classifyFiles(files)
    .filter((decision) => decision.included)
    .map((decision) => decision.file);

  const { included: includedFiles, excluded: budgetExcludedFiles } = applyTokenBudget(
    reviewableFiles,
    DEFAULT_MAX_INPUT_TOKENS,
  );

  core.info(
    `리뷰 대상 파일 ${includedFiles.length}/${files.length}개` +
      (budgetExcludedFiles.length > 0
        ? ` (토큰 예산 초과로 ${budgetExcludedFiles.length}개 제외)`
        : ''),
  );

  if (includedFiles.length === 0) {
    core.setOutput('issue-count', '0');
    return;
  }

  let config;
  try {
    config = await loadReviewConfig(rulesPath);
  } catch (error) {
    if (isEnoent(error)) {
      core.info(`${rulesPath} 없음 — 컨벤션 룰 없이 진행합니다.`);
      config = emptyReviewConfig();
    } else {
      throw error;
    }
  }

  const prompt = buildReviewPrompt(includedFiles, config);
  const client = new Anthropic({ apiKey: anthropicApiKey });

  let result: ReviewResult;
  try {
    const response = await requestReview(client, prompt);
    result = response.result;
    core.info(
      `Claude usage: input=${response.usage.inputTokens} output=${response.usage.outputTokens} ` +
        `cache_write=${response.usage.cacheCreationInputTokens} ` +
        `cache_read=${response.usage.cacheReadInputTokens}`,
    );
  } catch (error) {
    if (error instanceof PromptTooLargeError) {
      core.warning(error.message);
      await upsertSummaryComment(octokit, {
        owner,
        repo,
        pullNumber,
        result: { summary: 'PR이 너무 커서 자동 리뷰를 생략했습니다.', issues: [] },
        skippedFiles: [...includedFiles, ...budgetExcludedFiles].map((file) => file.filename),
      });
      core.setOutput('issue-count', '0');
      return;
    }
    throw error;
  }

  const skippedFilenames = budgetExcludedFiles.map((file) => file.filename);

  if (commentStyle === 'summary') {
    await upsertSummaryComment(octokit, { owner, repo, pullNumber, result, skippedFiles: skippedFilenames });
  } else {
    const { inline, fallback } = partitionIssuesByCommentability(result.issues, includedFiles);
    await postInlineReview(octokit, { owner, repo, pullNumber, issues: inline });

    if (commentStyle === 'both') {
      await upsertSummaryComment(octokit, {
        owner,
        repo,
        pullNumber,
        result,
        skippedFiles: skippedFilenames,
      });
    } else if (fallback.length > 0 || skippedFilenames.length > 0) {
      // inline 전용 모드: 인라인으로 못 붙인 이슈만 요약으로 보충한다.
      await upsertSummaryComment(octokit, {
        owner,
        repo,
        pullNumber,
        result: { summary: result.summary, issues: fallback },
        skippedFiles: skippedFilenames,
      });
    }
  }

  core.setOutput('issue-count', String(result.issues.length));
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  core.setFailed(message);
});
