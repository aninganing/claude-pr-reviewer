# Claude PR Reviewer

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Aning%20Claude%20PR%20Reviewer-blue?logo=github)](https://github.com/marketplace/actions/aning-claude-pr-reviewer)

Claude API로 pull request의 diff를 자동 리뷰하고, 결과를 PR 코멘트로 남기는 GitHub Action입니다.

기한이 촉박한 프로젝트에서는 코드 리뷰가 뒤로 밀리기 쉽고, 그 사이 컨벤션 불일치와 사소한 휴먼 에러가 누적됩니다. 이 프로젝트는 GitLab Webhook + API + Claude API 조합으로 사내에서 구현했던 자동 리뷰 시스템을, GitHub 생태계에서 별도 인프라 없이 바로 쓸 수 있는 형태(GitHub Action)로 다시 설계한 것입니다.

## 사용법

리포지토리에 `.github/workflows/review.yml`을 추가하세요.

```yaml
name: Claude PR Review

on:
  pull_request_target:
    types: [opened, synchronize]

permissions:
  contents: read
  pull-requests: write

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aninganing/claude-pr-reviewer@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

리포지토리 Settings → Secrets and variables → Actions에 `ANTHROPIC_API_KEY`를 등록해야 합니다.
`GITHUB_TOKEN`은 GitHub Actions가 자동으로 제공합니다.

> `@v1`은 최신 v1.x 패치를 자동으로 따라가는 floating 태그입니다. 특정 버전에 고정하고 싶으면
> `@v1.0.1`처럼 패치 버전까지 명시하세요.
> [Releases](https://github.com/aninganing/claude-pr-reviewer/releases)에서 버전별 변경 내역을 확인할 수 있습니다.

> **왜 `pull_request_target`인가**: fork에서 온 PR은 `pull_request` 이벤트에서 시크릿을 받지 못해 이 액션이 아예 동작하지 않습니다.
> `pull_request_target`을 쓰면 fork PR도 리뷰할 수 있습니다.
> 이 액션은 PR의 코드를 checkout하거나 실행하지 않고 GitHub API로 diff **텍스트**만 읽어 Claude 프롬프트에 넣을 뿐이라, 안전하게 이 이벤트를 쓸 수 있습니다 (자세한 근거는 [`.github/workflows/review.yml`](.github/workflows/review.yml)의 주석 참고).
> 워크플로우를 수정할 때 `actions/checkout`에 `ref: ${{ github.event.pull_request.head.sha }}`를 추가해 PR의 코드를 직접 checkout/실행하지 않도록 주의하세요.
> — 그 조합은 시크릿 유출로 이어질 수 있습니다.

### 브랜치 → develop → main 흐름을 쓴다면

기능 브랜치를 `develop`으로 먼저 병합하고 `develop`을 다시 `main`으로 병합하는 방식을 쓴다면, `develop → main` PR은 이미 각 기능 브랜치 PR에서 리뷰된 내용을 그대로 옮기는 것뿐이라 다시 리뷰할 필요가 없습니다. `jobs.<job_id>.if`로 이 경우만 건너뛸 수 있습니다:

```yaml
jobs:
  review:
    if: |
      !(github.event.pull_request.base.ref == 'main' &&
        (github.event.pull_request.head.ref == 'develop' ||
         github.event.pull_request.head.ref == 'dev'))
    runs-on: ubuntu-latest
    steps:
      # ...
```

이 리포 자신도 [`.github/workflows/review.yml`](.github/workflows/review.yml)에서 같은 방식을 씁니다.

## 입력 (inputs)

| 이름                | 필수   | 기본값                     | 설명                                                                  |
| ------------------- | ------ | -------------------------- | --------------------------------------------------------------------- |
| `github-token`      | 예     | -                          | PR 파일 조회 및 코멘트 게시에 쓰는 토큰. 보통 `secrets.GITHUB_TOKEN`. |
| `anthropic-api-key` | 예     | -                          | Claude API 키. `secrets.ANTHROPIC_API_KEY`.                           |
| `rules-path`        | 아니오 | `.github/review-rules.yml` | 컨벤션 룰 YAML 파일 경로. 파일이 없으면 룰 없이 진행합니다.           |
| `comment-style`     | 아니오 | `both`                     | 코멘트 게시 방식. 아래 참고.                                          |

## 출력 (outputs)

| 이름          | 설명                       |
| ------------- | -------------------------- |
| `issue-count` | Claude가 보고한 이슈 개수. |

## `comment-style`

- **`summary`** — 발견된 모든 이슈를 표로 정리한 요약 코멘트 하나만 남깁니다.
- **`inline`** — 각 이슈를 실제 코드 줄에 인라인 코멘트로 남깁니다. diff에 표시되지 않는
  줄(hunk 범위 밖)이라 인라인으로 달 수 없는 이슈는 자동으로 요약 코멘트로 대체됩니다.
- **`both`** (기본값) — 인라인 코멘트와, 전체 이슈가 담긴 요약 코멘트를 함께 남깁니다.

같은 PR에 다시 push하면(재실행) 이전 요약 코멘트를 새로 만들지 않고 갱신합니다.

## 컨벤션 룰 설정

`.github/review-rules.yml`에 팀 컨벤션을 정의할 수 있습니다. 예시는 [`examples/review-rules.example.yml`](examples/review-rules.example.yml)을 참고하세요.

```yaml
language: ko
comment_style: both
ignore_patterns:
  - '**/*.generated.ts'
rules:
  - id: no-console-log
    description: '프로덕션 코드에 console.log를 남기지 마세요.'
    applies_to:
      - 'src/**/*.ts'
    severity: warning
```

룰 파일이 없어도 액션은 정상 동작합니다(컨벤션 룰 없이 일반적인 버그/휴먼 에러 위주로 리뷰).

## 큰 PR 처리

- 리뷰 대상 diff가 너무 크면(기본 약 5만 토큰) 작은 파일부터 채우고 나머지는 이번 리뷰에서 제외한 뒤 요약 코멘트에 안내합니다.
- 그래도 프롬프트 전체가 예산을 넘으면 Claude를 호출하지 않고 "PR이 너무 커서 자동 리뷰를 생략했습니다"라는 코멘트만 남깁니다 (액션 자체는 실패시키지 않습니다).

## 로컬에서 테스트하기

리포를 clone한 뒤 아래처럼 실행하면 실제로 코멘트를 게시하지 않고 로컬에서 결과를 확인할 수 있습니다.

```bash
npm install
npm run cli -- <PR_URL 또는 owner/repo#번호> --dry-run --print-prompt
```

`ANTHROPIC_API_KEY` 환경 변수(또는 `ant auth login`)를 설정하면 `--dry-run` 없이 실행해 실제 Claude 응답까지 로컬에서 확인할 수 있습니다.

## 라이선스

[MIT](LICENSE)
