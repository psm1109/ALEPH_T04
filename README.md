# 달러노트

한국수출입은행 Open API의 미국 달러 을 Supabase에 일별로 기록하고, 바로 어제의 값과 비교하는 정보판입니다. 흰색·파란색 반응형 화면, 7일/30일 차트, 일별 기록, 데이터 검증 영역을 제공합니다.

## 실행

Node.js 24를 사용합니다. 외부 npm 의존성이나 별도 빌드 과정은 없습니다.

```sh
node --env-file-if-exists=.env server.mjs
```

http://localhost:3000 에서 확인합니다. npm이 설치된 환경에서는 `npm run dev` 또는 `npm start`도 사용할 수 있습니다. `npm run dev`는 서버 파일 변경 시 재시작합니다. 화면 파일 변경 후에는 브라우저를 새로고침하세요.

## Supabase 설정

1. Supabase 프로젝트의 SQL Editor에서 [`supabase/schema.sql`](supabase/schema.sql) 전체를 실행합니다.
2. Project Settings에서 프로젝트 URL과 서버용 Secret key를 찾아 `.env`에 등록합니다. 예시는 [`.env.example`](.env.example)에 있습니다.
3. 첫 조회 시 오늘 정상 데이터가 있으면 자동으로 저장합니다. 과거 기록도 불러오려면 아래 명령을 실행합니다.

```sh
node --env-file=.env scripts/backfill.mjs --days=7
```

`--days=1`~`--days=30`을 지원합니다. 실제 API 응답만 저장하며 기존 날짜는 덮어쓰지 않습니다. 휴일 등 빈 응답에는 환율을 만들지 않습니다. 과거 적재는 관리자 CLI에서만 가능하며 공개 API에서 날짜를 임의로 지정할 수 없습니다.

### 생성하는 테이블과 함수

| 대상 | 역할 |
| --- | --- |
| `exchange_rates` | 날짜당 USD 한 건, 원자료 JSON, 자동 계산한 환율, 실제 수신 시각 |
| `exchange_fetch_runs` | 날짜별 마지막 수집 결과: `pending`, `success`, `no_data`, `error` |
| `claim_exchange_fetch(date)` | 성공 날짜 중복 수집 방지 및 실패/미수신의 10분 재시도 간격 |
| `finish_exchange_fetch(...)` | 정상 원자료 저장과 수집 결과 갱신을 하나의 트랜잭션으로 수행 |

`rate`는 `raw_response.deal_bas_r`에서 생성되는 `numeric(12,2)` 컬럼입니다. 앱이 별도 숫자를 잘못 저장할 수 없으며, 서버가 DB에서 다시 읽을 때도 원자료와의 일치를 검사합니다. RLS를 활성화하고 `anon`/`authenticated` 역할의 접근을 차단했습니다. 서버용 키로만 접근하며 브라우저에 Supabase 키가 전달되지 않습니다.

## Vercel 배포

1. 이 폴더의 저장소를 Vercel 프로젝트로 연결합니다. **Framework Preset: Other**, **Root Directory: 이 프로젝트 루트**, **Node.js: 24.x**로 설정합니다.
2. `vercel.json`에 설정된 대로 **Output Directory는 `public`**, **Build Command는 비워 둡니다**. 별도의 `server.mjs` 시작 명령을 Vercel에 설정하지 않습니다.
3. Settings → Environment Variables에 아래 네 항목을 등록합니다. 최소한 **Production**에 등록해야 하며 Preview에서 확인하려면 Preview에도 등록합니다.
4. 배포 후 홈페이지를 열어 저장값 표시를 확인합니다. 환경변수를 바꾸면 재배포합니다.

| 변수 이름 | 등록할 값 | 용도 |
| --- | --- | --- |
| `api_key` | 기존 `.env`의 한국수출입은행 인증키 | 이름은 소문자 그대로 사용 |
| `SUPABASE_URL` | `https://프로젝트ID.supabase.co` 형식의 Project URL | 데이터 API 접속 주소 |
| `SUPABASE_SECRET_KEY` | Supabase Secret key (`sb_secret_...`) | 서버 전용 DB 접근 |
| `CRON_SECRET` | 충분히 긴 무작위 문자열 | 자동 수집 API 인증 |

변수 이름에 `NEXT_PUBLIC_`/`VITE_`를 붙이지 마세요. 키 값은 코드, 채팅, 커밋에 포함하지 않습니다. 구형 키가 필요한 프로젝트는 `SUPABASE_SERVICE_ROLE_KEY`도 지원하지만 신규 설정은 Secret key를 권장합니다. `PORT`는 로컬 전용이며 Vercel에는 필요 없습니다.

`CRON_SECRET`은 로컬 `.env`에 생성된 값을 Vercel에 동일하게 등록하면 됩니다. 아직 없다면 다음 명령으로 생성할 수 있습니다. 터미널에 출력되는 값은 공개하지 마세요.

```sh
node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(32).toString('hex'))"
```

### 자동 기록 시간

`vercel.json`의 `0 3 * * *`는 **매일 UTC 03:00 / 한국 시간 정오 12:00**입니다. Vercel Cron은 Production 배포에서 `/api/collect`를 호출하고 `CRON_SECRET`을 Bearer 토큰으로 전송합니다. API는 인증이 없으면 거부합니다.

Vercel Hobby의 실행 정밀도는 시간 단위이므로 실제 실행은 **12:00~12:59 KST** 사이일 수 있습니다. 정확히 12시에 실행된다고 보장하지 않습니다. [Vercel Cron 사용량 및 실행 정밀도](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Cron 인증 설정](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

- 정상 저장된 날짜는 중복 수집하거나 덮어쓰지 않습니다.
- 오늘 기록이 없으면 화면 조회 시에도 수집을 시도합니다. DB 잠금으로 전체 인스턴스에서 날짜당 10분에 한 번만 시도할 수 있습니다.
- 실패/빈 응답 시 다음 방문 또는 Cron 실행에서 재시도합니다. 방문자가 없고 정오 Cron도 실패한 날은 자동 재시도나 과거 보충을 보장하지 않습니다. 필요하면 `backfill`을 실행하세요.
- Vercel Cron은 로컬에서 실행되지 않습니다. 수동 실행은 Vercel Cron 화면의 Run 또는 아래 명령을 사용합니다.

```sh
# 배포 주소로 변경. 인증키는 명령문에 직접 쓰지 않고 .env에서 읽습니다.
node --env-file=.env --input-type=module -e "const r=await fetch('https://YOUR-PROJECT.vercel.app/api/collect',{headers:{Authorization:'Bearer '+process.env.CRON_SECRET}}); console.log(r.status,await r.text())"
```

## 표시 원칙

- 요청: `https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON`
- Query: `authkey=api_key`, `searchdate=yyyymmdd`, `data=AP01`.
- `result=1`, `cur_unit=USD`, 공백을 제거한 `cur_nm=미국달러`인 정확히 한 건만 선택합니다.
- 표시값은 **기준환율 `deal_bas_r`**, 단위는 **원 / 1 USD**입니다. 쉼표와 소수점 두 자리 표시는 숫자의 의미를 바꾸지 않습니다.
- **기준일**: 요청한 `searchdate`. **출처 시각**: API에서 제공하지 않으므로 `NULL` / “제공되지 않음”. **API 수신 시각**: 실제 응답 수신 시각. **화면 조회 시각**: 서버가 화면 요청에 응답한 시각. 모두 `Asia/Seoul (UTC+9)`로 표시합니다.
- 오전 11시 안내 문구는 화면에 포함하지만 이를 실제 수신된 출처 시각으로 만들어 저장하지 않습니다.
- 비교는 **한국 시간 기준 오늘과 바로 어제**의 기록이 모두 있을 때만 합니다. 이전 영업일을 어제라고 표시하지 않습니다.
- 빈 응답, 인증 실패, 한도 초과, 네트워크 오류, DB 오류를 구분합니다. 휴일/고시 지연 등의 구체적 원인은 API가 주지 않으므로 추정임을 밝힙니다.
- 오늘 데이터가 없으면 실제 기준일을 명시한 최근 저장값을 표시합니다. 과거값을 오늘 값으로 복제하지 않고 차트의 결측일은 선으로 연결하지 않습니다.
- Supabase 미연결/장애 시 API 직접 조회값은 **미저장**으로 표시합니다. 이때 직접 조회는 오늘과 어제만 수행하며 10분간 프로세스 메모리에서 재사용합니다. 영구 기록이 아니며 서버리스 인스턴스 간 캐시 공유도 보장하지 않습니다.
- 저장 기록은 API에서 최신 최대 60건을 읽고, 차트는 선택한 7/30 **달력일**을 표시합니다.

요청하신 안내 문구는 메인 환율 카드 바로 아래에 있습니다.

> 본 정보판은 한국수출입은행 Open API를 통해 데이터를 가져옵니다. 이 환율은 실시간 환율이 아니며, **당일 오전 11시경 고시된 하루 한 번의 기준 가격**입니다. 따라서 시간 시세와는 차이가 발생할 수 있습니다.

## 검증

```sh
node --test --test-isolation=none tests/*.test.mjs
node scripts/replay-fixtures.mjs
node scripts/verify-public-package.mjs "공개 package 폴더 경로"
node --env-file=.env scripts/verify-live.mjs
```

첫 명령은 외부 연결 없는 전체 테스트입니다. 정상/미수신/오류, 전일 비교, 한국 자정, 동시 수집, DB 실패, 인증키 비노출, Cron 인증과 공개 fixture 상태 전이를 검증합니다. 둘째 명령은 C26의 다섯 합성 실패 fixture를 각각 초기 상태에서 재생합니다. 특정 fixture만 확인하려면 ID를 인자로 전달합니다.

```sh
node scripts/replay-fixtures.mjs T04-TIMEOUT
```

fixture replay는 `fixtures/`의 공개 합성 JSON과 프로세스 메모리만 사용합니다. `.env`, 실제 한국수출입은행 API, 운영 Supabase에는 접근하지 않으므로 reset과 실패 재생이 실제 환율 기록을 변경하지 않습니다. 셋째 명령은 실제 연결을 사용해 정상 한 건의 원자료·DB 재조회값·화면용 API값을 비교합니다. 오늘 기록이 없으면 실제 수집을 수행할 수 있습니다.

공개 package 검증 명령은 `public-contract.json`과 `asset-manifest.json`의 package ID, 공개 파일 17개의 크기·SHA-256, fixture 9개의 canonical hash, 프로젝트에 포함된 fixture 내용까지 대조합니다. 하나라도 다르면 실패 종료 코드 1을 반환합니다.

배포된 사이트의 `/replay`에서는 다섯 실패 fixture를 직접 선택할 수 있습니다. 각 요청은 D1-A와 D1-B부터 전체 시퀀스를 새로 계산하는 무상태 방식이며, 실패 시 `stale`과 표준 `error_code`, 마지막 정상값 105, 일별 행 1건을 표시합니다. **다시 시도하여 회복 재생**을 누르면 TIMEOUT 뒤 RECOVER-D2 시퀀스를 계산해 `fresh / none`, 값 120, 행 2건, 전일 대비 15를 표시합니다. 이 공개 화면과 `/api/replay`도 운영 DB를 변경하지 않습니다.

DB에서 직접 확인할 SQL은 [`supabase/verify.sql`](supabase/verify.sql)입니다. 화면 하단 **데이터 확인**을 펼치면 원자료·저장값·화면값과 미국 달러 원본 JSON을 함께 확인할 수 있습니다.

## 파일 구성

```text
public/                 정적 화면, 스타일, 차트 및 표시 로직
api/[action].js         Vercel 서버리스 함수 진입점
app.mjs                 조회/수집 API와 인증, 재시도 정책
rates.mjs               한국수출입은행 API 및 USD 검증
storage.mjs             서버 전용 Supabase REST/RPC 접근
server.mjs              로컬 개발 서버 (공개 파일만 명시적으로 제공)
supabase/schema.sql     DB 테이블/권한/수집 함수
supabase/verify.sql     정상 한 건과 수집 상태 확인 SQL
scripts/backfill.mjs    실제 과거 데이터 초기 적재
scripts/replay-fixtures.mjs 공개 합성 fixture 재생 CLI
scripts/verify-public-package.mjs 공개 package ID·hash·fixture 대조
scripts/verify-live.mjs 실제 저장값 검증
fixtures/               T04 공개 합성 fixture 9종
replay.mjs              합성 전용 정규화·저장·오류 상태 전이
replay-service.mjs      무상태 합성 시나리오 API 서비스
tests/                  데이터 및 서버 동작 테스트
vercel.json             정적 파일, 서버리스 함수, Cron 설정
```

API 키를 조회 URL이나 오류 메시지로 로그에 남기지 않으며 `.env`는 Git에서 제외됩니다. [Supabase API 키 안내](https://supabase.com/docs/guides/getting-started/api-keys).
