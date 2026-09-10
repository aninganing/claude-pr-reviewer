#!/usr/bin/env node
import { Octokit } from '@octokit/rest';
import { fetchPullRequestFiles, parsePullRequestRef } from './github/diff.js';
import { classifyFiles } from './review/filter.js';

function printUsage(): void {
  console.log('사용법: npm run cli -- <PR_URL 또는 owner/repo#번호> [--dry-run] [--ignore <glob>]');
}

interface ParsedArgs {
  target: string;
  dryRun: boolean;
  ignoreGlobs: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  let target: string | undefined;
  let dryRun = false;
  const ignoreGlobs: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--ignore') {
      const value = argv[++i];
      if (!value) throw new Error('--ignore 옵션에는 glob 패턴이 필요합니다.');
      ignoreGlobs.push(value);
    } else if (arg && !target && !arg.startsWith('--')) {
      target = arg;
    } else {
      throw new Error(`알 수 없는 인자: ${arg}`);
    }
  }

  if (!target) {
    throw new Error('PR URL 또는 owner/repo#번호를 지정해야 합니다.');
  }

  return { target, dryRun, ignoreGlobs };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const ref = parsePullRequestRef(args.target);

  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const octokit = new Octokit(token ? { auth: token } : {});

  console.log(
    `PR 조회 중: ${ref.owner}/${ref.repo}#${ref.pullNumber}` +
      (token ? '' : ' (인증 없음 — rate limit이 낮으니 큰 PR에서는 GITHUB_TOKEN을 설정하세요)'),
  );

  const files = await fetchPullRequestFiles(octokit, ref);
  const decisions = classifyFiles(files, { ignoreGlobs: args.ignoreGlobs });

  const included = decisions.filter((decision) => decision.included);
  const excluded = decisions.filter((decision) => !decision.included);

  console.log(`\n리뷰 대상 파일 (${included.length}/${files.length}):`);
  for (const { file } of included) {
    console.log(`  [${file.status}] +${file.additions}/-${file.deletions}  ${file.filename}`);
  }

  if (excluded.length > 0) {
    console.log(`\n제외된 파일 (${excluded.length}):`);
    for (const { file, reason } of excluded) {
      console.log(`  ${file.filename} — ${reason}`);
    }
  }

  if (args.dryRun) {
    console.log('\n(--dry-run) Claude API 호출 및 코멘트 게시는 아직 구현되지 않았습니다.');
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`오류: ${message}`);
  printUsage();
  process.exitCode = 1;
});
