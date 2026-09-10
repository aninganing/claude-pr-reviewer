import type { Octokit } from '@octokit/rest';
import type { FileDiff } from '../types/index.js';

export interface PullRequestRef {
  owner: string;
  repo: string;
  pullNumber: number;
}

const PR_URL_PATTERN =
  /^https?:\/\/github\.com\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/pull\/(?<number>\d+)/i;
const SHORTHAND_PATTERN = /^(?<owner>[^/\s]+)\/(?<repo>[^/\s#]+)#(?<number>\d+)$/;

/** 전체 PR URL 또는 `owner/repo#123` 축약형을 받는다(로컬 CLI에서 쓰기 편하도록). */
export function parsePullRequestRef(input: string): PullRequestRef {
  const urlMatch = PR_URL_PATTERN.exec(input);
  if (urlMatch?.groups) {
    // 패턴상 세 그룹 모두 필수이므로, 매칭됐다면 값이 있음이 보장된다.
    return {
      owner: urlMatch.groups.owner!,
      repo: urlMatch.groups.repo!,
      pullNumber: Number(urlMatch.groups.number!),
    };
  }

  const shorthandMatch = SHORTHAND_PATTERN.exec(input);
  if (shorthandMatch?.groups) {
    return {
      owner: shorthandMatch.groups.owner!,
      repo: shorthandMatch.groups.repo!,
      pullNumber: Number(shorthandMatch.groups.number!),
    };
  }

  throw new Error(
    `PR을 식별할 수 없습니다: "${input}". "https://github.com/{owner}/{repo}/pull/{번호}" ` +
      '또는 "{owner}/{repo}#{번호}" 형식을 사용하세요.',
  );
}

/**
 * PR의 모든 변경 파일을 가져온다. GitHub API는 기본 30개씩 페이지네이션하므로
 * `octokit.paginate`로 전체를 순회한다.
 */
export async function fetchPullRequestFiles(
  octokit: Octokit,
  ref: PullRequestRef,
): Promise<FileDiff[]> {
  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner: ref.owner,
    repo: ref.repo,
    pull_number: ref.pullNumber,
    per_page: 100,
  });

  return files.map((file): FileDiff => {
    const diff: FileDiff = {
      filename: file.filename,
      status: file.status as FileDiff['status'],
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
    };
    // GitHub은 바이너리 파일이나 너무 큰 diff에 대해서는 `patch`를 생략한다.
    if (file.patch !== undefined) diff.patch = file.patch;
    if (file.previous_filename !== undefined) diff.previousFilename = file.previous_filename;
    return diff;
  });
}
