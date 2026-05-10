# 개발 시작 가이드

## 현재 방향

Codex Spark App은 Chrome 확장 중심의 개인용 스마트 브라우저 도구입니다.

현재 구현된 범위:

- pnpm workspace
- Chrome Extension MVP
- Tauri 관리 앱
- Fastify 기반 로컬 Broker
- Browser 분석용 SSE API
- 페이지 본문 정리 adapter
- Codex RPC 패키지 자리

아직 실제 Codex app-server JSON-RPC 연결은 mock 상태입니다.

## 실행 순서

의존성 설치:

```bash
cd ~/path/to/codex-spark-app
pnpm install
```

Broker 실행:

```bash
pnpm dev:broker
```

Chrome 확장 빌드 감시:

```bash
pnpm dev:extension
```

Chrome에서 로드:

```text
chrome://extensions
-> Developer mode ON
-> Load unpacked
-> apps/browser-extension/dist 선택
```

Tauri 관리 앱 실행:

```bash
pnpm dev:desktop
```

## 주요 엔드포인트

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

## 다음 구현 순서

1. `packages/codex-rpc`에 실제 WebSocket JSON-RPC client 구현
2. Broker `/models`를 app-server `model/list`에 연결
3. `/browser/*/stream`을 `thread/start`, `thread/resume`, `turn/start`에 연결
4. app-server notification을 SSE로 Chrome 확장에 전달
5. Tauri 관리 앱에 설정 저장과 최근 요청 persistence 추가
