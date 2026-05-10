# Codex Spark Browser Assistant 사용/이전 가이드

이 문서는 다른 컴퓨터에서 AI에게 이 프로젝트를 내려받아 설치하고 실행시키기 위한 지시서다.

## 1. 프로젝트 목적

이 프로젝트는 개인용 스마트 브라우저 Assistant다.

구조는 다음과 같다.

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

핵심 목표:

- Chrome 확장에서 현재 탭/선택 영역을 읽는다.
- 요약, 번역, 의미 분석, 문서화를 실행한다.
- Local Broker가 Codex app-server와 연결한다.
- OpenAI API key를 직접 쓰지 않고 `codex login` 기반 인증을 사용한다.
- Tauri 앱은 Broker와 Codex app-server를 켜고 끄는 관리 앱 역할을 한다.

## 2. 새 컴퓨터에서 필요한 것

필수:

```text
Node.js
pnpm
Rust / Cargo
Tauri prerequisites
Codex CLI
Chrome Browser
```

macOS 기준 권장 설치 확인:

```bash
node -v
npm -v
pnpm -v
rustc --version
cargo --version
codex --version
```

pnpm이 없으면:

```bash
npm i -g pnpm
```

Codex CLI가 없으면:

```bash
npm i -g @openai/codex
```

Codex 로그인:

```bash
codex login
```

Spark 접근 확인:

```bash
codex -m gpt-5.3-codex-spark "Reply with OK."
```

## 3. 프로젝트 내려받기

```bash
git clone <REPO_URL>
cd codex-spark-app
pnpm install
```

`<REPO_URL>`은 실제 GitHub 저장소 URL로 바꾼다.

## 4. 개발 실행 방식

### 4.1 Tauri 관리 앱 실행

```bash
pnpm dev:desktop
```

Tauri 앱에서 `Start Engine`을 누르면 다음 두 프로세스를 실행해야 한다.

```text
Codex app-server: ws://127.0.0.1:4500
Broker: http://127.0.0.1:17333
```

상태 화면에서 다음처럼 보여야 한다.

```text
Codex app-server 4500 실행 중
Broker 17333 실행 중
모델 상태 초록
```

### 4.2 수동 실행 방식

Tauri 앱 없이 수동으로 실행하려면 터미널 두 개를 사용한다.

터미널 1:

```bash
codex app-server --listen ws://127.0.0.1:4500
```

터미널 2:

```bash
pnpm dev:broker
```

Broker 상태 확인:

```bash
curl http://127.0.0.1:17333/health
```

## 5. Chrome Extension 빌드와 설치

빌드:

```bash
pnpm --filter @codex-spark/browser-extension build
```

Chrome에서 설치:

```text
1. chrome://extensions 열기
2. Developer mode 켜기
3. Load unpacked 클릭
4. apps/browser-extension/dist 선택
```

설치 후 사용:

```text
1. 분석할 웹페이지 열기
2. Chrome Extension side panel 열기
3. 현재 탭 읽기 클릭
4. 요약 / 번역 / 의미 분석 / 문서화 실행
5. 정보 탭에서 Broker와 Codex 연결 상태 확인
```

## 6. Tauri 앱 빌드

개발 중에는 빌드가 꼭 필요 없다.

개발 실행:

```bash
pnpm dev:desktop
```

배포 앱 빌드:

```bash
pnpm --filter @codex-spark/desktop tauri build
```

빌드 결과 위치:

```text
apps/desktop/src-tauri/target/release/bundle/macos/Codex Spark.app
apps/desktop/src-tauri/target/release/bundle/dmg/Codex Spark_0.1.0_aarch64.dmg
```

주의:

현재 Tauri 앱은 완전한 독립 앱이 아니다. 앱 내부에 Broker가 번들링되어 있지 않고, 프로젝트 루트를 찾아 `pnpm --filter @codex-spark/broker dev`로 Broker를 실행한다.

따라서 다른 컴퓨터에서도 프로젝트 소스, Node.js, pnpm, Codex CLI가 필요하다.

## 7. Windows에서 실행할 때

Windows에서도 구조는 동일하다.

수동 실행:

```powershell
codex app-server --listen ws://127.0.0.1:4500
pnpm dev:broker
```

다만 현재 Tauri의 자동 Start/Stop 로직은 macOS 중심이다.

Windows에서 Tauri 앱 자동 실행/종료까지 안정화하려면 Rust 코드에서 별도 처리가 필요하다.

필요한 방향:

```text
macOS/Linux: /bin/zsh 또는 shell + process group kill
Windows: powershell/cmd + taskkill /PID <pid> /T /F
```

즉 Windows에서는 먼저 수동 실행으로 검증하고, 이후 Tauri Windows 실행 로직을 구현한다.

## 8. 자주 나는 오류와 조치

### 8.1 Broker 연결 실패

증상:

```text
Broker에 연결할 수 없습니다.
Load failed
ERR_BROKER_UNREACHABLE
```

확인:

```bash
curl http://127.0.0.1:17333/health
```

조치:

```bash
pnpm dev:broker
```

또는 Tauri 앱에서 `Start Engine` 클릭.

### 8.2 Codex app-server 연결 실패

증상:

```text
모델 상태 빨강
Codex 연결 오류
```

확인:

```bash
lsof -nP -iTCP:4500 -sTCP:LISTEN
```

조치:

```bash
codex app-server --listen ws://127.0.0.1:4500
```

Codex 로그인 확인:

```bash
codex login
codex -m gpt-5.3-codex-spark "Reply with OK."
```

### 8.3 Tauri 앱에서 프로젝트 루트를 찾지 못함

증상:

```text
프로젝트 루트를 찾을 수 없습니다.
```

조치:

환경변수로 프로젝트 루트를 지정한다.

```bash
export CODEX_SPARK_REPO_ROOT="/path/to/codex-spark-app"
```

그 다음 앱을 다시 실행한다.

### 8.4 Stop Engine이 안 되는 경우

확인:

```bash
lsof -nP -iTCP:17333 -sTCP:LISTEN
lsof -nP -iTCP:4500 -sTCP:LISTEN
```

수동 종료 macOS:

```bash
lsof -ti tcp:17333 | xargs kill -9
lsof -ti tcp:4500 | xargs kill -9
```

Windows:

```powershell
netstat -ano | findstr :17333
netstat -ano | findstr :4500
taskkill /PID <PID> /T /F
```

## 9. GitHub에 올릴 때 제외해야 할 것

이미 `.gitignore`에 포함되어야 한다.

```gitignore
node_modules
dist
target
.env
.env.*
*.sqlite
*.sqlite3
.omx/
**/.omx/
.claude/settings.local.json
.codex/
**/auth.json
**/codex-app-server-token
```

절대 올리면 안 되는 것:

```text
~/.codex/auth.json
~/.codex/codex-app-server-token
.env
.omx 로그
개인 실행 로그
```

## 10. AI에게 맡길 때 사용할 지시문

다른 컴퓨터에서 AI에게 아래처럼 지시하면 된다.

```text
이 저장소는 Codex Spark Browser Assistant 프로젝트다.
목표는 Chrome Extension + Local Broker + Codex app-server + Tauri 관리 앱을 실행하는 것이다.

먼저 README 대신 howtouse.md를 읽고, 현재 OS에 맞게 설치 상태를 확인해라.
Node.js, pnpm, Rust/Cargo, Codex CLI가 있는지 확인하고 없으면 설치 안내를 해라.
그 다음 pnpm install을 실행하고, Codex CLI 로그인을 확인해라.

실행 검증 순서는 다음이다.
1. codex -m gpt-5.3-codex-spark "Reply with OK." 확인
2. codex app-server --listen ws://127.0.0.1:4500 실행 또는 Tauri Start Engine 사용
3. pnpm dev:broker 실행 또는 Tauri Start Engine 사용
4. curl http://127.0.0.1:17333/health 확인
5. Chrome Extension을 빌드하고 apps/browser-extension/dist를 Load unpacked로 설치
6. Chrome Extension에서 정보 탭 Refresh로 Broker와 Codex 상태가 초록인지 확인

문제가 생기면 임의로 구조를 바꾸지 말고, 포트 4500과 17333 상태, Codex 로그인 상태, Broker /health 응답부터 확인해라.
```

## 11. 현재 한계

현재 프로젝트는 `소스 기반 로컬 사용`에 적합하다.

아직 완전한 독립 배포 앱은 아니다.

완전한 앱 배포를 위해 남은 일:

```text
Broker를 Tauri sidecar로 번들링
또는 Broker를 단일 바이너리로 패키징
또는 Broker 기능을 Rust/Tauri 쪽으로 일부 흡수
Windows용 Start/Stop Engine 구현
설정 저장소 정리
요청 로그 영속화
```

## 12. 핵심 원칙

이 프로젝트를 수정할 때는 다음 원칙을 지킨다.

```text
모델 중심이 아니라 작업 중심으로 설계한다.
앱은 UX를 담당한다.
Broker는 실행과 정책을 담당한다.
Codex app-server는 Codex/Spark 연결을 담당한다.
사용자는 현재 페이지에서 버튼으로 AI 역할을 실행한다.
```
