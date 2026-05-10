# Codex Spark Browser Assistant

개인용 스마트 브라우저 Assistant입니다. Chrome 확장에서 현재 탭/선택 영역을 읽고, 로컬 Broker를 통해 Codex app-server와 Codex Spark에 요약, 번역, 의미 분석, 문서화를 요청합니다.

## 핵심 구조

```text
Chrome Extension
        ↓
Local Broker
        ↓
Codex app-server
        ↓
Codex Spark

Tauri Desktop App
        ↓
Broker / app-server 상태 관리
```

## 주요 기능

- 현재 탭 본문 읽기
- 선택 영역 우선 분석
- 요약, 번역, 의미 분석, Markdown/HTML 문서화
- 결과 스트리밍 표시
- 산출물 Copy
- Broker / Codex 연결 상태 확인
- Tauri 관리 앱에서 엔진 시작/중지

## 빠른 시작

필수 도구:

```bash
node -v
pnpm -v
cargo --version
codex --version
```

설치:

```bash
git clone https://github.com/saykim/csspark-chrome-ext.git
cd csspark-chrome-ext
pnpm install
```

Codex 로그인:

```bash
codex login
codex -m gpt-5.3-codex-spark "Reply with OK."
```

## 실행

Tauri 관리 앱:

```bash
pnpm dev:desktop
```

앱에서 `Start Engine`을 누르면 아래 두 프로세스를 실행합니다.

```text
Codex app-server: ws://127.0.0.1:4500
Broker: http://127.0.0.1:17333
```

수동 실행도 가능합니다.

```bash
codex app-server --listen ws://127.0.0.1:4500
pnpm dev:broker
```

상태 확인:

```bash
curl http://127.0.0.1:17333/health
```

## Chrome Extension 설치

```bash
pnpm --filter @codex-spark/browser-extension build
```

Chrome에서:

```text
chrome://extensions
Developer mode 켜기
Load unpacked
apps/browser-extension/dist 선택
```

## Tauri 앱 빌드

```bash
pnpm --filter @codex-spark/desktop tauri build
```

빌드 결과:

```text
apps/desktop/src-tauri/target/release/bundle/macos/Codex Spark.app
```

## 보안 원칙

- Broker는 `127.0.0.1`에만 바인딩합니다.
- Chrome 확장은 사용자가 클릭한 현재 탭만 읽습니다.
- OpenAI API key를 브라우저 확장에 넣지 않습니다.
- 기본 흐름은 `codex login` 기반 Codex 인증을 사용합니다.
- `.omx`, `.codex`, `auth.json`, token 파일은 Git에 포함하지 않습니다.

## 현재 한계

현재는 소스 기반 로컬 사용에 적합합니다. 완전한 독립 배포 앱은 아닙니다.

다른 컴퓨터에서 사용하려면 Node.js, pnpm, Rust/Cargo, Codex CLI, 프로젝트 소스가 필요합니다.

향후 개선 방향:

- Broker sidecar 번들링
- Windows용 Tauri Start/Stop Engine 구현
- 사용자 정의 역할/프롬프트 확장
- 요청 로그 영속화

## 자세한 문서

- [howtouse.md](./howtouse.md): 다른 컴퓨터에서 설치/실행하는 가이드
- [concept.md](./concept.md): 역할 기반 AI 서비스 개발 개념
- [docs/PRD.md](./docs/PRD.md): 제품 요구사항 문서
- [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md): 개발 문서
