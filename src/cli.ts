#!/usr/bin/env node
import Anthropic from '@anthropic-ai/sdk';
import { Octokit } from '@octokit/rest';
import { DEFAULT_MAX_INPUT_TOKENS, requestReview } from './claude/client.js';
import { buildReviewPrompt } from './claude/prompt-builder.js';
import { fetchPullRequestFiles, parsePullRequestRef } from './github/diff.js';
import { applyTokenBudget } from './review/budget.js';
import { partitionIssuesByCommentability } from './review/diff-lines.js';
import { classifyFiles } from './review/filter.js';
import { emptyReviewConfig, loadReviewConfig } from './review/rules.js';
import type { FileDiff, ReviewConfig } from './types/index.js';

const DEFAULT_RULES_PATH = '.github/review-rules.yml';

// prints the CLI usage string to stdout
function printUsage(): void {
  console.log(
    '사용법: npm run cli -- <PR_URL 또는 owner/repo#번호> [--dry-run] [--print-prompt] ' +
      '[--ignore <glob>] [--rules-path <path>] [--max-input-tokens <n>]',
  );
}

interface ParsedArgs {
  target: string;
  dryRun: boolean;
  printPrompt: boolean;
  ignoreGlobs: string[];
  rulesPath: string;
  rulesPathExplicit: boolean;
  maxInputTokens: number;
}

function parseArgs(argv: string[]): ParsedArgs {
  let target: string | undefined;
  let dryRun = false;
  let printPrompt = false;
  let rulesPath = DEFAULT_RULES_PATH;
  let rulesPathExplicit = false;
  let maxInputTokens = DEFAULT_MAX_INPUT_TOKENS;
  const ignoreGlobs: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--print-prompt') {
      printPrompt = true;
    } else if (arg === '--ignore') {
      const value = argv[++i];
      if (!value) throw new Error('--ignore 옵션에는 glob 패턴이 필요합니다.');
      ignoreGlobs.push(value);
    } else if (arg === '--rules-path') {
      const value = argv[++i];
      if (!value) throw new Error('--rules-path 옵션에는 파일 경로가 필요합니다.');
      rulesPath = value;
      rulesPathExplicit = true;
    } else if (arg === '--max-input-tokens') {
      const value = argv[++i];
      const parsed = value ? Number(value) : NaN;
      if (!value || !Number.isInteger(parsed) || parsed <= 0) {
        throw new Error('--max-input-tokens 옵션에는 양의 정수가 필요합니다.');
      }
      maxInputTokens = parsed;
    } else if (arg && !target && !arg.startsWith('--')) {
      target = arg;
    } else {
      throw new Error(`알 수 없는 인자: ${arg}`);
    }
  }

  if (!target) {
    throw new Error('PR URL 또는 owner/repo#번호를 지정해야 합니다.');
  }

  return {
    target,
    dryRun,
    printPrompt,
    ignoreGlobs,
    rulesPath,
    rulesPathExplicit,
    maxInputTokens,
  };
}

function isEnoent(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function resolveReviewConfig(rulesPath: string, explicit: boolean): Promise<ReviewConfig> {
  try {
    return await loadReviewConfig(rulesPath);
  } catch (error) {
    if (!explicit && isEnoent(error)) {
      console.log(`\n(${rulesPath} 없음 — 컨벤션 룰 없이 진행합니다)`);
      return emptyReviewConfig();
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const ref = parsePullRequestRef(args.target);

  const githubToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const octokit = new Octokit(githubToken ? { auth: githubToken } : {});

  console.log(
    `PR 조회 중: ${ref.owner}/${ref.repo}#${ref.pullNumber}` +
      (githubToken
        ? ''
        : ' (인증 없음 — rate limit이 낮으니 큰 PR에서는 GITHUB_TOKEN을 설정하세요)'),
  );

  const files = await fetchPullRequestFiles(octokit, ref);
  const decisions = classifyFiles(files, { ignoreGlobs: args.ignoreGlobs });

  const included = decisions.filter((decision) => decision.included);
  const excluded = decisions.filter((decision) => !decision.included);
  const reviewableFiles: FileDiff[] = included.map((decision) => decision.file);

  const { included: includedFiles, excluded: budgetExcludedFiles } = applyTokenBudget(
    reviewableFiles,
    args.maxInputTokens,
  );

  console.log(`\n리뷰 대상 파일 (${includedFiles.length}/${files.length}):`);
  for (const file of includedFiles) {
    console.log(`  [${file.status}] +${file.additions}/-${file.deletions}  ${file.filename}`);
  }

  if (excluded.length > 0) {
    console.log(`\n제외된 파일 (${excluded.length}):`);
    for (const { file, reason } of excluded) {
      console.log(`  ${file.filename} — ${reason}`);
    }
  }

  if (budgetExcludedFiles.length > 0) {
    console.log(`\n토큰 예산 초과로 제외된 파일 (${budgetExcludedFiles.length}):`);
    for (const file of budgetExcludedFiles) {
      console.log(`  ${file.filename}`);
    }
  }

  if (args.dryRun) {
    if (args.printPrompt) {
      const config = await resolveReviewConfig(args.rulesPath, args.rulesPathExplicit);
      const prompt = buildReviewPrompt(includedFiles, config);
      console.log('\n=== SYSTEM PROMPT ===');
      console.log(prompt.system);
      console.log('\n=== USER MESSAGE ===');
      console.log(prompt.user);
    }
    console.log('\n(--dry-run) Claude API 호출 및 코멘트 게시는 생략합니다.');
    return;
  }

  const config = await resolveReviewConfig(args.rulesPath, args.rulesPathExplicit);
  const prompt = buildReviewPrompt(includedFiles, config);

  if (args.printPrompt) {
    console.log('\n=== SYSTEM PROMPT ===');
    console.log(prompt.system);
    console.log('\n=== USER MESSAGE ===');
    console.log(prompt.user);
  }

  console.log('\nClaude 호출 중...');
  const client = new Anthropic();
  const { result, usage } = await requestReview(client, prompt, {
    maxInputTokens: args.maxInputTokens,
  });

  const { inline, fallback } = partitionIssuesByCommentability(result.issues, includedFiles);
  console.log('\n=== REVIEW RESULT ===');
  console.log(JSON.stringify(result, null, 2));
  console.log(
    `\n(인라인 코멘트 가능: ${inline.length}개, hunk 범위 밖이라 요약으로 강등: ${fallback.length}개)`,
  );
  console.log(
    `\n(usage: input=${usage.inputTokens}, output=${usage.outputTokens}, ` +
      `cache_write=${usage.cacheCreationInputTokens}, cache_read=${usage.cacheReadInputTokens})`,
  );
  if (usage.cacheReadInputTokens === 0 && usage.cacheCreationInputTokens === 0) {
    console.log(
      '(캐시가 전혀 안 걸렸습니다 — System 프롬프트가 최소 캐시 프리픽스보다 짧을 수 있습니다.)',
    );
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`오류: ${message}`);
  printUsage();
  process.exitCode = 1;
});
