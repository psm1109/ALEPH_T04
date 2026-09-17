# 달러노트

한국수출입은행 Open API의 미국 달러 기준환율을 매일 저장하고, 한국 시간 기준 바로 전날의 기록과 비교하는 공개 정보판입니다.

주요 기능:

- 실제 공개 원천의 USD 기준환율 조회
- Supabase 날짜별 원자료 및 출처 메타데이터 저장
- 오늘과 바로 전날의 환율 변화 계산
- 최근 7일·30일 차트와 일별 기록 표시
- 원자료·저장값·화면값 일치 확인
- 공개 합성 fixture를 이용한 장애·보존·회복 재생
- Vercel Cron을 이용한 매일 정오 KST 자동 수집

## 빠른 시작

Node.js 24를 사용하며 외부 npm 패키지나 별도 빌드 과정은 없습니다.

```sh
node --env-file-if-exists=.env server.mjs
```

- 실제 정보판: `http://localhost:3000`
- 합성 장애 재생: `http://localhost:3000/replay`

npm을 사용할 수 있다면 `npm run dev` 또는 `npm start`도 지원합니다.

## 환경변수

`.env.example`을 참고해 프로젝트 루트에 `.env`를 만듭니다.

| 이름 | 용도 |
| --- | --- |
| `api_key` | 한국수출입은행 Open API 인증키 |
| `SUPABASE_URL` | Supabase 프로젝트 URL |
| `SUPABASE_SECRET_KEY` | 서버 전용 Supabase Secret key |
| `CRON_SECRET` | Vercel Cron 수집 API 인증 |
| `PORT` | 로컬 서버 포트, 기본값 `3000` |

키 값은 브라우저 코드, 네트워크 응답, Git 기록, 문서에 포함하지 않습니다. `.env`는 Git에서 제외되어 있습니다.

## Supabase 설정

Supabase SQL Editor에서 [`supabase/schema.sql`](supabase/schema.sql)을 전체 실행합니다. 이미 테이블이 있어도 기존 기록을 삭제하지 않고 필요한 컬럼과 함수를 보완합니다.

### 저장 정보

`exchange_rates`는 날짜별로 다음 정보를 보존합니다.

| 필드 | 의미 |
| --- | --- |
| `rate_date` | `Asia/Seoul` 기준 환율 날짜 |
| `raw_response` | 공개 원천의 실제 USD 응답 |
| `rate` | `deal_bas_r`에서 DB가 계산한 숫자 |
| `fetched_at` | API 응답 수신 시각 |
| `source_observed_at` | 공개 원천을 실제로 관측한 시각 |
| `source_published_at` | 원천 발표 시각, API 미제공으로 `NULL` |
| `source_name` | 한국수출입은행 |
| `source_url` | 실제 Open API 주소 |
| `unit` | `원 / 1 USD` |

`exchange_fetch_runs`는 날짜별 마지막 수집 결과를 `pending`, `success`, `no_data`, `error`로 기록합니다.

서버가 DB 값을 읽을 때 원자료·환율·통화·출처 URL·관측 시각·단위가 일치하는지 다시 검사합니다. 일치하지 않는 값은 화면에 전달하지 않습니다.

### 과거 실제 데이터 적재

```sh
node --env-file=.env scripts/backfill.mjs --days=7
```

`--days=1`부터 `--days=30`까지 지원합니다. 실제 API 응답만 저장하고 기존 날짜는 덮어쓰지 않으며, 빈 응답에는 임의의 환율을 만들지 않습니다.

## 데이터 처리 원칙

- 요청 주소는 `https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON`입니다.
- 요청에는 `authkey`, `searchdate=yyyymmdd`, `data=AP01`을 사용합니다.
- `result=1`, `cur_unit=USD`, 공백 제거 후 `cur_nm=미국달러`인 항목 한 건만 선택합니다.
- 표시값은 `deal_bas_r`, 단위는 `원 / 1 USD`입니다.
- 날짜 계산과 표시는 `Asia/Seoul`을 기준으로 합니다.
- 원천이 정확한 발표 시각을 제공하지 않으므로 출처 시각을 임의로 만들지 않습니다.
- 오늘과 바로 전날 기록이 모두 있을 때만 전일 대비를 계산합니다.
- 이전 영업일을 어제 기록으로 대신 사용하지 않습니다.
- 실패나 빈 응답은 마지막 정상값을 삭제하거나 덮어쓰지 않습니다.
- 저장되지 않은 실조회값은 화면에서 `미저장`으로 구분합니다.
- 차트는 데이터가 없는 날짜를 선으로 연결하지 않습니다.

## 자동 수집

[`vercel.json`](vercel.json)의 Cron은 매일 UTC 03:00, 한국 시간 정오 12:00에 Production의 `/api/collect`를 호출합니다.

```text
0 3 * * *
```

Vercel Hobby에서는 실제 실행이 12:00~12:59 KST 사이일 수 있습니다.

- `/api/collect`는 `CRON_SECRET` Bearer 인증을 요구합니다.
- 정상 저장된 날짜는 다시 수집하지 않습니다.
- 실패 또는 빈 응답은 최소 10분 간격으로 다시 시도할 수 있습니다.
- 화면 방문 시 오늘 기록이 없으면 수집을 시도합니다.
- Cron은 로컬 서버에서는 자동 실행되지 않습니다.

수동 호출 예시:

```sh
node --env-file=.env --input-type=module -e "const r=await fetch('https://YOUR-PROJECT.vercel.app/api/collect',{headers:{Authorization:'Bearer '+process.env.CRON_SECRET}}); console.log(r.status,await r.text())"
```

## 합성 장애 재생

`/replay` 화면에서는 공개 fixture로 다음 장애를 재생할 수 있습니다.

- 응답 시간 초과
- 외부 원천 인증 거절
- 호출 제한
- 오프라인
- 응답 형식 변경

합성 재생은 운영 Supabase, 실제 API, `.env`를 사용하지 않습니다. 각 요청은 독립된 메모리 상태에서 계산되므로 여러 사용자의 실행이 서로 영향을 주지 않습니다.

실패 상태에서는 마지막 정상값 105와 기존 일별 기록 한 건을 유지합니다. 다시 조회하면 회복 fixture를 재생해 `fresh / none`, 값 120, 일별 기록 두 건, 전일 대비 15를 확인할 수 있습니다.

CLI에서도 같은 검사를 실행할 수 있습니다.

```sh
node scripts/replay-fixtures.mjs
node scripts/replay-fixtures.mjs T04-TIMEOUT
```

## 검증

### 전체 자동 테스트

```sh
node --test --test-isolation=none tests/*.test.mjs
```

외부 연결 없이 정상 수집, 실패 보존, 날짜 계산, 동시 수집, DB 오류, Cron 인증, fixture 상태 전이를 검사합니다.

### 실제 원자료·저장값·화면값 확인

```sh
node --env-file=.env scripts/verify-live.mjs
```

실제 기록 한 건의 원자료, 저장값, 출처 URL, 관측 시각, 단위, 화면용 API 값을 비교합니다. 오늘 기록이 없으면 실제 수집이 발생할 수 있습니다. DB에서 직접 확인하려면 [`supabase/verify.sql`](supabase/verify.sql)을 사용합니다.

### 공개 package 무결성 확인

```sh
node scripts/verify-public-package.mjs "공개 package 폴더 경로"
```

다음 항목을 검사합니다.

- 공개 package ID와 계약 버전
- 조건 개수와 fixture 개수
- 공개 파일의 크기와 SHA-256
- fixture canonical SHA-256
- 프로젝트 fixture와 공개 정본의 내용 일치

하나라도 다르면 종료 코드 1을 반환합니다.

## 짧은 확인 방법

1. 배포된 결과물의 `/replay`로 이동합니다.
2. 장애 종류를 선택하고 마지막 정상값과 오류별 안내를 확인한 뒤 `다시 조회`를 누릅니다.
3. 실패 시 `stale`, 마지막 값 105, 행 1건이 보이고 회복 후 `fresh / none`, 값 120, 행 2건, 변화 15가 보이면 통과입니다.

안 될 때는 오류 상태 대신 API 연결 실패 안내가 표시됩니다. `/api/replay?scenario=baseline` 응답과 Vercel 함수 로그를 확인합니다.

## Vercel 배포

1. 저장소를 Vercel 프로젝트에 연결합니다.
2. Framework Preset은 `Other`, Root Directory는 프로젝트 루트로 지정합니다.
3. Build Command는 비우고 Output Directory는 `public`으로 설정합니다.
4. Node.js 24와 필요한 환경변수를 Production에 등록합니다.
5. Supabase에서 최신 `supabase/schema.sql`을 실행합니다.
6. 배포 후 `/`, `/replay`, `/api/dashboard`, `/api/replay?scenario=baseline`을 확인합니다.

환경변수를 변경하거나 SQL 구조를 바꾼 경우 재배포와 DB 적용을 각각 확인해야 합니다.

## 프로젝트 구조

```text
api/[action].js                   Vercel 서버리스 진입점
app.mjs                           대시보드·수집·재생 API 라우팅
rates.mjs                         한국수출입은행 조회 및 USD 검증
storage.mjs                       Supabase 접근과 저장값 재검증
replay.mjs                        합성 상태 전이
replay-service.mjs                무상태 재생 시나리오
public/                            실제 정보판과 장애 재생 화면
fixtures/                          공개 합성 fixture 9종
supabase/schema.sql               DB 스키마·권한·수집 함수
supabase/verify.sql               저장값 확인 SQL
scripts/backfill.mjs              과거 실제 데이터 적재
scripts/replay-fixtures.mjs       합성 실패 CLI 검사
scripts/verify-live.mjs           실제 저장값 검사
scripts/verify-public-package.mjs 공개 package 무결성 검사
tests/                             자동 테스트
vercel.json                       배포·Cron·보안 헤더 설정
```

## 보안

- `.env`와 실제 비밀값은 Git에 포함하지 않습니다.
- 브라우저에는 Supabase Secret key와 외부 API 인증키를 전달하지 않습니다.
- RLS를 활성화하고 `anon`, `authenticated` 역할의 테이블 접근을 차단합니다.
- 인증키가 포함된 외부 요청 URL과 Supabase 오류 본문을 사용자 응답에 노출하지 않습니다.
