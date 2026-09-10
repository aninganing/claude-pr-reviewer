import * as core from '@actions/core';
import * as github from '@actions/github';
import Anthropic from '@anthropic-ai/sdk';
import { Octokit } from '@octokit/rest';
import { requestReview } from './claude/client.js';
import { buildReviewPrompt } from './claude/prompt-builder.js';
import { postSummaryComment } from './github/comment.js';
import { fetchPullRequestFiles } from './github/diff.js';
import { classifyFiles } from './review/filter.js';
import { emptyReviewConfig, loadReviewConfig } from './review/rules.js';

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
  const includedFiles = classifyFiles(files)
    .filter((decision) => decision.included)
    .map((decision) => decision.file);

  core.info(`리뷰 대상 파일 ${includedFiles.length}/${files.length}개`);

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
  const { result, usage } = await requestReview(client, prompt);

  core.info(
    `Claude usage: input=${usage.inputTokens} output=${usage.outputTokens} ` +
      `cache_write=${usage.cacheCreationInputTokens} cache_read=${usage.cacheReadInputTokens}`,
  );

  if (commentStyle === 'inline') {
    core.warning('inline 코멘트는 아직 구현되지 않았습니다. summary로 대체합니다.');
  }
  await postSummaryComment(octokit, { owner, repo, pullNumber, result });

  core.setOutput('issue-count', String(result.issues.length));
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  core.setFailed(message);
});
