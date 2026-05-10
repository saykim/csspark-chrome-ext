# Codex Spark Browser Assistant PRD

## 1. 제품 요약

Codex Spark Browser Assistant는 맥북에서 개인용으로 사용하는 브라우저 AI 분석 레이어입니다.

사용자는 Chrome 확장에서 현재 보고 있는 웹페이지나 선택한 텍스트를 요약, 번역, 의미 분석, 문서화할 수 있습니다. 확장은 로컬 Broker를 통해 Codex app-server에 연결하고, Codex CLI에 로그인된 인증 정보를 사용해 Codex 모델을 실행합니다.

기본 목표는 OpenAI Platform API key 없이, `codex login`으로 로그인된 Codex 인증을 사용해 개인용 스마트 브라우저를 만드는 것입니다.

```text
Chrome Extension
        |
        | localhost HTTP / SSE
        v
Codex Broker
        |
        | JSON-RPC / WebSocket
        v
Codex app-server
        |
        v
Codex 모델
```

## 2. 왜 만드는가

사용자는 Chrome/Safari에서 보는 웹페이지, 문서, 기술 자료를 바로 AI로 읽고 처리하고 싶습니다.

현재 불편한 점은 다음과 같습니다.

- ChatGPT/Claude/Codex 앱은 강력하지만 현재 탭의 본문과 선택 영역을 즉시 가져오는 흐름이 번거롭습니다.
- 웹페이지 요약, 번역, 의미 분석, 문서화를 브라우저 안에서 바로 실행하고 싶습니다.
- API key 기반 과금이 아니라 개인 Codex 로그인 기반 사용 흐름을 원합니다.
- Chrome 확장, Safari 확장, Tauri 관리 앱이 각각 Codex app-server 프로토콜을 직접 구현하지 않게 하고 싶습니다.
- 브라우저에서 읽은 페이지와 분석 결과를 thread/log로 남기고 싶습니다.

## 3. 제품 목표

- Chrome 확장 기반의 개인용 스마트 브라우저 도구를 만든다.
- OpenAI API key 없이 Codex CLI 로그인 기반으로 동작하게 한다.
- Codex app-server와 직접 통신하는 부분은 Broker 하나로 모은다.
- 현재 탭 title/url/text와 선택 영역을 읽어 분석 요청으로 보낸다.
- 요약, 번역, 의미 분석, 문서화 작업을 Side Panel에서 실행한다.
- Codex 응답과 작업 진행 상황을 실시간 스트리밍으로 보여준다.
- Tauri 앱은 Broker 상태, 설정, 로그, thread 관리용 관리 앱으로 둔다.
- Safari 확장은 Chrome MVP 안정화 후 포팅한다.

## 3.1 제품 방향성

이 제품의 방향성은 “상용 SaaS”가 아니라 “개인용 로컬 브라우저 AI 분석 레이어”입니다.

핵심 사용 맥락:

```text
내 맥북
내 Codex 로그인
내 Chrome 브라우저
내가 클릭한 현재 탭
내가 선택한 텍스트
내가 보는 요약 / 번역 / 의미 분석 / 문서화 결과
```

따라서 제품의 본질은 다음과 같습니다.

```text
개인용 Codex 기반 스마트 브라우저 보조 도구
```

이 앱은 ChatGPT, Claude, Codex 앱을 대체하지 않습니다. 현재 브라우저 탭의 문맥을 즉시 가져와 분석하는 데 집중합니다.

초기 사용 흐름은 다음을 우선합니다.

```text
1. 사용자가 Chrome에서 웹페이지를 연다.
2. Codex Spark 확장 Side Panel을 연다.
3. 현재 탭 또는 선택 영역을 읽는다.
4. 요약 / 번역 / 의미 분석 / 문서화 중 하나를 선택한다.
5. Broker가 Codex app-server로 요청을 전달한다.
6. 결과를 Side Panel에 스트리밍한다.
```

제품 판단 기준:

- 복잡한 계정 시스템보다 빠른 로컬 사용성을 우선한다.
- 자동 페이지 수집보다 사용자가 클릭한 탭만 읽는 흐름을 우선한다.
- 여러 클라이언트 확장을 고려하되, 첫 화면은 Chrome 확장 Side Panel에 집중한다.
- Broker는 Codex app-server 프로토콜을 숨기는 단일 adapter 역할에 집중한다.
- MVP는 “웹페이지를 매일 빠르게 읽고 정리하는 단순한 브라우저 도구”가 되는 것을 목표로 한다.

## 4. 만들지 않을 것

- 공개 SaaS 서비스로 만들지 않는다.
- 다른 사용자에게 Codex 계정을 공유하거나 재판매하지 않는다.
- Codex 사용량 제한을 우회하지 않는다.
- OpenAI API 기반의 상용 백엔드로 설계하지 않는다.
- 처음부터 복잡한 자동화, 백그라운드 작업 예약, 다중 사용자 권한 관리는 만들지 않는다.
- 처음부터 모든 웹사이트 자동 수집이나 브라우저 방문 기록 분석을 만들지 않는다.

## 5. 대상 사용자

주 사용자는 맥북에서 웹 문서, 기술 자료, 뉴스, 블로그, 레퍼런스를 자주 읽고 정리하는 개인 사용자입니다.

초기 사용 환경은 다음을 가정합니다.

```text
운영체제: macOS
인증: codex login 완료
실행 위치: 개인 맥북
주요 사용처: Chrome 브라우저, 이후 Safari 브라우저
```

## 6. 전체 구조

이 제품은 네 부분으로 나뉩니다.

```text
[Chrome Extension]
- 현재 탭 읽기
- 선택 영역 읽기
- Side Panel UI
- 요약 / 번역 / 의미 분석 / 문서화 버튼
- 스트리밍 결과 표시
        |
        | localhost HTTP / SSE
        v
[Codex Broker]
- 로컬 API 서버
- SQLite 저장소
- 브라우저 요청 로그
- 이벤트 스트리밍
- 페이지 본문 정리
- Codex app-server 연결
        |
        | ws://127.0.0.1:4500
        v
[Codex app-server]
- Codex CLI가 제공하는 로컬 서버
- Codex 로그인 인증 사용
        |
        v
[Codex 모델]
- 기본 후보: gpt-5.3-codex-spark
- 계정에서 사용 가능한 다른 Codex 모델

[Tauri Admin App]
- Broker 상태 확인
- 설정 관리
- 최근 요청 로그
- thread 관리
```

쉽게 말하면:

```text
Chrome 확장 = 사용자가 실제로 쓰는 화면
Broker = 중간 관리자
Codex app-server = Codex로 들어가는 로컬 문
Codex 모델 = 실제 작업하는 AI
Tauri 앱 = 관리 화면
```

## 7. 인증 방식

기본 인증은 Codex CLI 로그인입니다.

처음 한 번 사용자는 다음을 실행합니다.

```bash
npm i -g @openai/codex
codex login
```

이 앱은 기본 사용 흐름에서 OpenAI Platform API key를 요구하지 않습니다.

구분은 다음과 같습니다.

| 항목 | 필요 여부 | 설명 |
| --- | --- | --- |
| Codex 로그인 | 필요 | `codex login`으로 로그인 |
| OpenAI API key | 기본 흐름에서는 불필요 | API 토큰 과금 방식이 아님 |
| Broker 로컬 토큰 | 권장 | Tauri 앱만 Broker에 접근하게 보호 |
| app-server WebSocket token | 권장 또는 필요 | Broker만 Codex app-server에 붙게 보호 |

중요한 점은 “API가 전혀 없다”는 뜻이 아닙니다.

Chrome 확장/Tauri 관리 앱과 Broker 사이에는 `localhost` API가 있습니다. 다만 이것은 외부 OpenAI API가 아니라, 내 맥북 안에서만 동작하는 내부 통신입니다.

## 8. 사용량과 비용 관점

이 구조는 OpenAI API key를 직접 호출하지 않습니다. 대신 Codex CLI 로그인으로 연결된 ChatGPT/Codex 플랜의 Codex 사용량을 사용합니다.

```text
OpenAI API key 직접 호출
→ 토큰당 API 과금

codex login + Codex app-server 사용
→ ChatGPT/Codex 플랜의 Codex 사용량 차감
```

따라서 개인용으로는 API 비용 측면에서 유리할 수 있습니다.

하지만 이 앱이 Codex 사용량을 없애는 것은 아닙니다.

```text
Tauri 앱에서 요청
→ Broker
→ Codex app-server
→ Codex 모델
→ Codex 사용량 차감
```

즉, 이 제품은 사용량 우회 도구가 아니라 Codex를 더 편하게 쓰는 개인용 작업 환경입니다.

## 9. 핵심 사용 사례

### 9.1 브라우저 요약

사용자는 현재 웹페이지 또는 선택 영역을 요약할 수 있습니다.

- 3줄 요약
- 핵심 주장 정리
- 중요한 세부사항 정리
- 실행 가능한 액션 아이템 추출

### 9.2 번역

현재 페이지 또는 선택 영역을 자연스러운 한국어로 번역합니다.

- 기술 문서 번역
- 블로그/뉴스 번역
- 선택 문장 번역
- 용어를 유지한 자연스러운 번역

### 9.3 의미 분석

웹페이지의 의미와 맥락을 분석합니다.

- 핵심 의도
- 숨은 전제
- 찬반 논점
- 신뢰도 리스크
- 사용자가 취할 수 있는 행동

### 9.4 문서화

웹페이지 내용을 재사용 가능한 문서로 정리합니다.

- Markdown 노트
- PRD 초안
- 회의 자료
- 체크리스트
- 기술 문서 요약본

## 10. MVP 범위

첫 버전에서 반드시 만들 기능은 다음과 같습니다.

- Chrome Extension
- Manifest V3
- activeTab 기반 현재 탭 읽기
- content-script 기반 title/url/text/selectionText 추출
- Side Panel UI
- 요약 / 번역 / 의미 분석 / 문서화 버튼
- Broker SSE 응답 스트리밍
- 로컬 Broker 실행
- `/health` API
- `/models` API
- `/browser/summarize/stream` API
- `/browser/translate/stream` API
- `/browser/analyze/stream` API
- `/browser/document/stream` API
- Tauri 관리 앱
- Broker 상태 확인
- 최근 요청 로그
- 기본 설정 화면

## 11. MVP 이후 기능

나중에 추가할 기능입니다.

- Safari 확장
- PDF/문서 분석 adapter
- 웹페이지 분석 history
- thread 저장
- CLI client
- macOS 메뉴바 앱
- 알림 기능
- 모델 프로필 관리
- 프롬프트 템플릿
- 여러 탭 비교
- 로컬 검색/RAG

## 12. 추천 폴더 구조

```text
codex-spark-app/
  apps/
    browser-extension/
      src/
      public/

    desktop/
      src/
      src-tauri/

  packages/
    broker/
      src/
        server.ts
        routes/
        services/
        db/
        security/

    codex-rpc/
      src/
        client.ts
        protocol.ts

    core/
      src/
        types.ts
        events.ts
        config.ts

    adapters/
      src/
        web-page.ts
        files.ts
        documents.ts

  schemas/
    codex/

  docs/
    PRD.md
```

## 13. 주요 컴포넌트 설명

### 13.1 Tauri Desktop App

Broker를 관리하는 앱입니다.

역할:

- Broker 상태 표시
- 기본 모델 표시
- 허용 origin 표시
- 최근 브라우저 요청 표시
- 설정 관리

Tauri 앱은 메인 사용 화면이 아닙니다. 실제 웹페이지 분석은 Chrome 확장에서 수행합니다.

### 13.1.1 Chrome Extension

사용자가 실제로 사용하는 브라우저 UI입니다.

역할:

- 현재 탭 title/url/text 추출
- 선택 영역 우선 분석
- Side Panel 표시
- 요약 / 번역 / 의미 분석 / 문서화 실행
- Broker SSE 결과 표시

Chrome 확장은 Codex app-server와 직접 대화하지 않습니다. 오직 Broker API만 호출합니다.

### 13.2 Codex Broker

이 앱의 핵심 중간 서버입니다.

역할:

- Tauri 앱의 요청을 받는다.
- Chrome 확장의 요청을 받는다.
- Codex app-server와 JSON-RPC로 통신한다.
- 응답과 이벤트를 SSE로 다시 Chrome 확장/Tauri 앱에 전달한다.
- thread, run, event, approval request를 SQLite에 저장한다.
- 페이지 본문을 정리하고 너무 긴 내용을 제한한다.
- 일반 웹사이트가 직접 Broker에 접근하지 못하게 origin을 제한한다.

### 13.3 Codex RPC Package

Codex app-server 프로토콜을 감싸는 내부 패키지입니다.

역할:

- WebSocket 연결
- JSON-RPC request/response 관리
- app-server notification 처리
- server-initiated request 처리
- initialize, thread/start, thread/resume, turn/start 호출

이 패키지를 따로 두면 app-server 프로토콜이 바뀌어도 수정 범위를 줄일 수 있습니다.

### 13.4 Storage

SQLite를 사용합니다.

저장할 것:

- thread
- run
- event
- approval request
- settings

저장하지 말아야 할 것:

- Codex 로그인 토큰
- OpenAI 계정 인증 정보
- 민감한 시스템 credential

## 14. Broker API

초기 API는 다음과 같습니다.

```text
GET /health
GET /models
GET /threads
GET /settings
PATCH /settings
GET /requests
POST /browser/summarize/stream
POST /browser/translate/stream
POST /browser/analyze/stream
POST /browser/document/stream
```

### 14.1 POST /browser/:action/stream

브라우저 페이지 분석 작업을 시작하고 이벤트를 스트리밍으로 받는 API입니다.

요청 예시:

```json
{
  "action": "summarize",
  "page": {
    "title": "Example Page",
    "url": "https://example.com/article",
    "text": "page text...",
    "selectionText": "optional selected text",
    "lang": "ko"
  },
  "model": "gpt-5.3-codex-spark",
  "threadId": "optional-thread-id",
  "source": "chrome-extension"
}
```

응답은 Server-Sent Events입니다.

예상 이벤트:

```text
thread
status
message
error
done
```

## 15. 데이터 모델

### 15.1 threads

```text
id
title
app_name
cwd
model
created_at
updated_at
last_run_at
```

### 15.2 runs

```text
id
thread_id
turn_id
status
mode
model
cwd
prompt
created_at
completed_at
error_message
```

### 15.3 events

```text
id
run_id
event_type
payload_json
created_at
```

### 15.4 approval_requests

```text
id
run_id
thread_id
server_request_id
method
payload_json
status
created_at
resolved_at
resolution_json
```

### 15.5 settings

```text
key
value_json
updated_at
```

## 16. 보안 요구사항

기본 보안 원칙은 “로컬에서만, 사용자가 클릭한 탭만, 민감 페이지는 기본 차단”입니다.

이 제품은 개인용 로컬 앱이므로 엔터프라이즈급 인증/권한 시스템은 MVP 범위가 아닙니다. 하지만 Broker는 Codex 사용량과 브라우저 페이지 내용에 닿을 수 있으므로 최소 안전장치는 반드시 필요합니다.

보안 방향성:

```text
좋은 방향:
Chrome 확장 -> Broker
Tauri 관리 앱 -> Broker
허용된 개발 origin -> Broker
Broker -> Codex app-server

피해야 할 방향:
모든 웹사이트 -> Broker
방문한 모든 페이지 자동 수집
민감 페이지 자동 전송
브라우저 기록 전체 분석
```

필수 요구사항:

- Broker는 `127.0.0.1`에만 바인딩한다.
- Codex app-server도 `127.0.0.1`에만 바인딩한다.
- Chrome extension origin과 개발 origin만 Broker 접근을 허용한다.
- app-server WebSocket token을 사용한다.
- token 파일 권한은 제한한다.
- 확장은 activeTab 기반으로 사용자가 클릭한 현재 탭만 읽는다.
- 비밀번호, 결제, 로그인, 계정 페이지는 자동 분석하지 않는다.
- 페이지 본문이 너무 길면 Broker에서 길이를 제한한다.
- Codex 인증 파일이나 token 파일은 절대 git에 커밋하지 않는다.

MVP에서 과한 보안:

- 사용자 계정 시스템
- OAuth 로그인
- role 기반 권한 관리
- 조직/팀 권한
- 클라우드 배포 보안
- 다중 사용자 세션 관리

MVP에서도 필요한 최소 보안:

- wildcard CORS 금지
- Chrome Extension origin 또는 개발 서버 origin만 허용
- `/browser/*/stream` 요청 body 검증
- `action`은 `summarize`, `translate`, `analyze`, `document`만 허용
- `source`는 `chrome-extension`만 허용
- 민감 페이지는 기본 차단
- 본문 길이 제한

## 17. UX 요구사항

### 17.1 기본 화면

```text
Chrome Side Panel:
- 현재 탭 읽기
- 페이지 제목 / URL / 선택 영역 상태
- 요약 / 번역 / 의미 분석 / 문서화 버튼
- 스트리밍 결과

Tauri Admin:
- Broker 상태
- 기본 모델
- 허용 origin
- 최근 요청 로그
```

### 17.2 필수 컨트롤

- 현재 탭 읽기
- 요약 버튼
- 번역 버튼
- 의미 분석 버튼
- 문서화 버튼
- 스트리밍 결과 영역
- Broker 상태 확인
- 설정 화면

### 17.3 처리해야 할 상태

- Broker가 꺼져 있음
- Codex app-server가 꺼져 있음
- Codex 로그인이 되어 있지 않음
- 선택한 모델을 사용할 수 없음
- 작업 실행 중
- 작업 완료
- 작업 실패
- 승인 대기 중
- 스트리밍 연결 끊김

## 18. 모델 전략

기본 후보 모델:

```text
gpt-5.3-codex-spark
```

단, 실제 사용 가능한 모델은 계정과 Codex CLI 상태에 따라 다를 수 있습니다. 앱 시작 시 `/models`로 사용 가능한 모델을 조회해야 합니다.

모델 사용 기준:

```text
Spark에 적합:
- 짧은 코드 수정
- 문서 작성
- 번역
- 빠른 설명
- UI 문구 수정
- 작은 파일 분석

더 강한 Codex 모델에 적합:
- 큰 리팩터링
- 복잡한 디버깅
- 여러 파일 변경
- 아키텍처 설계
- 긴 작업
```

## 19. 추천 기술 스택

```text
Desktop shell: Tauri
Frontend: React + Vite + TypeScript
Broker: Node.js + Fastify + TypeScript
Streaming: SSE 우선, WebSocket은 추후
Database: SQLite
Query layer: Drizzle 또는 Kysely
Diff viewer: Monaco Editor 또는 react-diff-viewer
Package manager: pnpm
Monorepo: pnpm workspace 또는 Turborepo
```

추천 조합:

```text
Tauri + React/Vite + Fastify + SQLite + Drizzle
```

## 20. 구현 단계

### 20.1 1단계: Chrome Extension MVP

할 일:

- Manifest V3 기반 Chrome 확장을 만든다.
- `activeTab`, `scripting`, `sidePanel` 권한을 사용한다.
- 현재 탭 title/url/text/selectionText를 추출한다.
- Side Panel에 요약 / 번역 / 의미 분석 / 문서화 버튼을 만든다.
- Broker SSE 응답을 Side Panel에 스트리밍한다.

완료 기준:

- Chrome 확장에서 현재 탭을 읽고 mock 분석 결과를 표시한다.

### 20.1.1 MVP 개발 우선순위

초기 개발은 기능을 크게 벌리기보다 “작동하는 단순한 작업대”를 우선합니다.

우선순위:

```text
1. Chrome Extension UI를 단순하게 유지
   - 현재 탭 읽기
   - 요약
   - 번역
   - 의미 분석
   - 문서화
   - 스트리밍 결과

2. Broker 최소 안전장치 구현
   - wildcard CORS 제거
   - Chrome Extension origin 허용
   - 개발 origin 허용
   - 민감 페이지 차단
   - request body schema 검증

3. Codex app-server 실제 연결
   - initialize
   - model/list
   - thread/start
   - thread/resume
   - turn/start
   - event streaming

4. 승인 큐 구현
   - command/file change 요청 표시
   - 승인/거부 버튼
   - app-server로 approval response 전달

5. SQLite 저장
   - thread
   - run
   - event
   - browser request log
```

초기에는 다음을 만들지 않습니다.

```text
복잡한 대시보드
VS Code 확장
브라우저 자동화
PDF/RAG
클라우드 배포
다중 사용자 인증
```

### 20.2 2단계: Broker 브라우저 API

할 일:

- Fastify Broker 생성
- `/health` 추가
- `/models` 추가
- `/browser/summarize/stream` 추가
- `/browser/translate/stream` 추가
- `/browser/analyze/stream` 추가
- `/browser/document/stream` 추가
- page payload를 정리하고 길이를 제한한다.

완료 기준:

- 확장에서 네 가지 액션을 실행하면 Broker mock stream이 표시된다.

### 20.3 3단계: Tauri 관리 앱

할 일:

- 기존 채팅 UI를 관리 UI로 축소한다.
- Broker 상태를 표시한다.
- 기본 모델과 허용 origin을 표시한다.
- 최근 브라우저 요청 로그를 표시한다.

완료 기준:

- Tauri 앱에서 Broker 상태와 최근 요청을 확인할 수 있다.

### 20.4 4단계: Codex app-server 연결

할 일:

- Codex RPC WebSocket client 생성
- app-server initialize 흐름 구현
- Broker `/models`를 app-server `model/list`에 연결
- 브라우저 action 요청을 `thread/start`, `thread/resume`, `turn/start`로 연결
- Codex notification을 SSE로 Chrome 확장에 전달

완료 기준:

- Chrome 확장에서 Spark 응답이 스트리밍된다.

### 20.5 5단계: 저장 기능

할 일:

- SQLite 추가
- thread 저장
- run 저장
- event 저장
- browser request 저장
- 기존 thread resume 구현

완료 기준:

- 앱을 껐다 켜도 이전 브라우저 분석 thread를 이어갈 수 있다.

### 20.6 6단계: 분석 adapter

할 일:

- 웹페이지 fetch/extract adapter 추가
- Markdown/TXT 문서 adapter 추가
- PDF adapter 추가
- 프로젝트 요약 adapter 추가

완료 기준:

- URL과 로컬 문서를 앱에서 분석할 수 있다.

## 21. 주요 리스크

### 21.1 Codex app-server 프로토콜 변경

위험:

- Codex CLI 버전에 따라 app-server 프로토콜이 바뀔 수 있습니다.

대응:

- 설치된 Codex CLI 기준으로 schema를 생성한다.
- app-server 관련 코드는 `packages/codex-rpc`에 격리한다.

### 21.2 WebSocket 안정성

위험:

- app-server WebSocket 모드는 실험적일 수 있습니다.

대응:

- 로컬 전용으로 사용한다.
- 연결 실패와 재연결 상태를 UI에 명확히 보여준다.

### 21.3 사용량 소모

위험:

- 긴 작업, 큰 프로젝트 분석은 Codex 사용량을 많이 쓸 수 있습니다.

대응:

- 기본 모델은 Spark로 둔다.
- 기본 모드는 read-only로 둔다.
- 불필요하게 큰 context를 보내지 않는다.
- 작업 기록과 모델 사용 정보를 보여준다.

### 21.4 파일 안전성

위험:

- AI가 잘못된 파일 변경이나 위험한 명령을 요청할 수 있습니다.

대응:

- 작업 폴더 allowlist를 사용한다.
- 파일 변경과 명령 실행은 승인 후 진행한다.
- diff와 command preview를 보여준다.
- edit 모드는 사용자가 명시적으로 켠다.

## 22. 성공 기준

MVP 성공 기준:

- Tauri 앱을 실행할 수 있다.
- Broker가 Codex app-server에 연결된다.
- 사용자가 prompt를 보내고 스트리밍 응답을 볼 수 있다.
- thread를 생성하고 이어서 사용할 수 있다.
- 프로젝트 폴더를 선택할 수 있다.
- read-only 모드로 안전하게 질문할 수 있다.
- 파일 변경 또는 명령 실행 요청을 승인/거부할 수 있다.

장기 성공 기준:

- 사용자가 일상적인 개발/문서 작업에서 Codex CLI보다 이 앱을 더 자주 사용한다.
- 코딩, 문서 작성, 번역, 웹페이지 분석을 한 앱에서 처리한다.
- 같은 Broker를 데스크톱 앱, CLI, VS Code 확장이 함께 사용한다.

## 23. 미정 사항

- 현재 계정에서 실제로 사용 가능한 Codex 모델 목록은 무엇인가?
- Broker를 Tauri 앱이 자동 실행할 것인가, 별도 launch agent로 둘 것인가?
- SQLite DB는 개발 중에는 프로젝트 내부에 둘 것인가, macOS App Support 폴더에 둘 것인가?
- 웹페이지 분석은 단순 fetch 방식부터 시작할 것인가, 브라우저 연동부터 시작할 것인가?
- 프로젝트 memory를 어느 정도 자동 저장할 것인가?
- MVP에서 “이번 세션 동안 승인”까지 지원할 것인가, “이번만 승인”만 지원할 것인가?

## 24. 첫 구현 추천

처음에는 다음만 만듭니다.

```text
Fastify Broker
+ Codex RPC client
+ /runs/stream
+ SQLite thread 저장
+ Tauri 채팅 UI
```

처음부터 만들지 않을 것:

```text
VS Code 확장
브라우저 자동화
복잡한 RAG
다중 사용자 인증
클라우드 배포
```

첫 번째 실사용 목표는 단순합니다.

```text
데스크톱 앱에서 prompt 입력
→ Codex Spark 실행
→ 응답 스트리밍
→ thread 저장
→ 승인 요청 표시
```
