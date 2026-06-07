import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  BookOpen,
  Copy,
  Eraser,
  FileText,
  Info,
  Languages,
  Loader2,
  Moon,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Settings,
  ShieldAlert,
  Sparkles,
  Square,
  Sun
} from "lucide-react";
import type { BrowserAction, CapturedPage, CaptureResponse } from "./types";
import "./sidepanel.css";

const brokerUrl = "http://127.0.0.1:17333";
const promptStorageKey = "codex-spark.promptTemplates.v1";
const promptBackupStorageKey = "codex-spark.promptTemplates.lastBackup.v1";
const themeStorageKey = "codex-spark.theme.v1";
const brokerSettingsStorageKey = "codex-spark.brokerSettings.v1";

type ModelHealth = {
  name: string;
  status: "mock" | "connected" | "error";
  detail: string;
};

type BrokerHealthStatus = {
  status: "unknown" | "connected" | "error";
  detail: string;
};

type BrokerSettings = {
  defaultModel: string;
  actionModels: Record<BrowserAction, string>;
  allowedOrigins: string[];
  maxPageTextChars: number;
};

type ModelOption = {
  id: string;
  name?: string;
};

type PanelTab = "work" | "details" | "settings";
type ThemeMode = "light" | "dark";
type PromptTemplates = Record<BrowserAction, string>;
type Exchange = {
  id: string;
  kind: BrowserAction | "followup";
  question: string;
  content: string;
};

const actions: Array<{
  id: BrowserAction;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
}> = [
  { id: "summarize", label: "요약", shortLabel: "요약", icon: <BookOpen size={16} /> },
  { id: "translate", label: "번역", shortLabel: "번역", icon: <Languages size={16} /> },
  { id: "analyze", label: "의미 분석", shortLabel: "의미", icon: <Search size={16} /> },
  { id: "document", label: "문서화", shortLabel: "문서", icon: <FileText size={16} /> }
];

const defaultPromptTemplates: PromptTemplates = {
  summarize: [
    "다음 웹페이지를 요약해줘.",
    "출력 형식:",
    "1. 한 줄 결론",
    "2. 핵심 요약 5개 이하",
    "3. 중요한 사실/수치",
    "4. 사용자가 기억할 점",
    "의견이나 해석보다 원문 내용 압축을 우선해."
  ].join("\n"),
  analyze: [
    "다음 웹페이지의 의미를 분석해줘.",
    "출력 형식:",
    "1. 글의 의도",
    "2. 숨은 전제",
    "3. 이해관계자/맥락",
    "4. 신뢰도 리스크",
    "5. 반론 가능성",
    "6. 사용자가 취할 행동",
    "단순 요약이 아니라 해석과 판단을 분리해서 보여줘."
  ].join("\n"),
  translate: [
    "다음 웹페이지 또는 선택 영역을 {targetLanguage}로 번역해줘.",
    "출력 형식:",
    "1. 자연스러운 번역문",
    "2. 애매한 표현/전문용어 메모",
    "기술 용어와 고유명사는 의미가 흐려지지 않게 유지해."
  ].join("\n"),
  document: [
    "다음 웹페이지 내용을 재사용 가능한 {documentFormat} 문서로 변환해줘.",
    "출력 형식:",
    "# 제목",
    "## 요약",
    "## 핵심 내용",
    "## 체크리스트",
    "## 참고 메모",
    "원문을 그대로 복붙하지 말고 문서형으로 재구성해."
  ].join("\n")
};

function SidePanel() {
  const [activeTab, setActiveTab] = useState<PanelTab>("work");
  const [theme, setTheme] = useState<ThemeMode>(() => readTheme());
  const [page, setPage] = useState<CapturedPage | null>(null);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [followupInput, setFollowupInput] = useState("");
  const [followupRunning, setFollowupRunning] = useState(false);
  const [status, setStatus] = useState("현재 탭을 읽고 작업을 선택하세요.");
  const [runningAction, setRunningAction] = useState<BrowserAction | null>(null);
  const [targetLanguage, setTargetLanguage] = useState("ko");
  const [documentFormat, setDocumentFormat] = useState("markdown");
  const [copied, setCopied] = useState(false);
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplates>(() => readPromptTemplates());
  const [promptBackupAvailable, setPromptBackupAvailable] = useState(() => hasPromptTemplateBackup());
  const [promptResetNotice, setPromptResetNotice] = useState(false);
  const [brokerSettings, setBrokerSettings] = useState<BrokerSettings | null>(() => readCachedBrokerSettings());
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [healthChecking, setHealthChecking] = useState(false);
  const [healthCheckedAt, setHealthCheckedAt] = useState("확인 전");
  const [brokerHealth, setBrokerHealth] = useState<BrokerHealthStatus>({
    status: "unknown",
    detail: "Broker 상태 확인 전"
  });
  const [modelHealth, setModelHealth] = useState<ModelHealth>({
    name: "gpt-5.3-codex-spark",
    status: "mock",
    detail: "Broker 상태 확인 전"
  });
  const [lastError, setLastError] = useState<{ code: string; message: string; at: string } | null>(null);
  const [sensitiveOverride, setSensitiveOverride] = useState(false);
  const [blockedAction, setBlockedAction] = useState<BrowserAction | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const resettingRef = useRef(false);

  useEffect(() => {
    void refreshHealth();
    void refreshBrokerSettings();
  }, []);

  useEffect(() => {
    localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(promptStorageKey, JSON.stringify(promptTemplates));
  }, [promptTemplates]);

  const pageSummary = useMemo(() => {
    if (!page) {
      return "페이지 정보 없음";
    }

    const source = page.selectionText ? "선택 영역" : "전체 페이지";
    const count = page.selectionText?.length ?? page.text.length;

    return `${source} · ${count.toLocaleString()}자`;
  }, [page]);

  const transcript = useMemo(() => buildTranscript(exchanges).trim(), [exchanges]);
  const streaming = Boolean(runningAction) || followupRunning;

  async function capturePage() {
    setStatus("현재 탭을 읽는 중입니다.");
    const response = (await chrome.runtime.sendMessage({ type: "CAPTURE_ACTIVE_TAB" })) as CaptureResponse;

    if (!response.ok) {
      setStatus(response.error);
      return null;
    }

    setPage(response.page);
    setSensitiveOverride(false);
    setBlockedAction(null);
    setStatus(response.page.isSensitive ? "민감 페이지로 감지되어 자동 분석을 막았습니다." : "페이지를 읽었습니다.");
    return response.page;
  }

  async function refreshHealth() {
    setHealthChecking(true);

    try {
      const response = await fetch(`${brokerUrl}/health`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const health = await response.json();
      setBrokerHealth({
        status: "connected",
        detail: `${brokerUrl} 응답 확인`
      });

      if (health?.model?.name && health?.model?.status) {
        setModelHealth(health.model);

        if (health.model.status !== "error") {
          setLastError(null);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setBrokerHealth({
        status: "error",
        detail: "Broker에 연결할 수 없습니다."
      });
      setModelHealth({
        name: "알 수 없음",
        status: "error",
        detail: "Broker에 연결할 수 없습니다."
      });
      setLastError({
        code: classifyErrorCode(error),
        message,
        at: new Date().toLocaleTimeString()
      });
    } finally {
      setHealthCheckedAt(new Date().toLocaleTimeString());
      setHealthChecking(false);
    }
  }

  async function refreshBrokerSettings() {
    try {
      const [settingsResponse, modelsResponse] = await Promise.all([
        fetch(`${brokerUrl}/settings`),
        fetch(`${brokerUrl}/models`)
      ]);

      if (settingsResponse.ok) {
        const settings = normalizeBrokerSettings(await settingsResponse.json());
        setBrokerSettings(settings);
        writeCachedBrokerSettings(settings);
      }

      if (modelsResponse.ok) {
        setModelOptions(extractModelOptions(await modelsResponse.json()));
      }
    } catch {
      setModelOptions([]);
    }
  }

  async function patchBrokerSettings(nextSettings: BrokerSettings) {
    const previousSettings = brokerSettings;
    setBrokerSettings(nextSettings);
    setSettingsSaving(true);

    try {
      const response = await fetch(`${brokerUrl}/settings`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          defaultModel: nextSettings.defaultModel,
          actionModels: nextSettings.actionModels
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const settings = normalizeBrokerSettings(await response.json());
      setBrokerSettings(settings);
      writeCachedBrokerSettings(settings);
      await refreshHealth();
    } catch (error) {
      setBrokerSettings(previousSettings);
      const message = error instanceof Error ? error.message : String(error);
      setLastError({
        code: classifyErrorCode(error),
        message,
        at: new Date().toLocaleTimeString()
      });
    } finally {
      setSettingsSaving(false);
    }
  }

  function updateDefaultModel(model: string) {
    const current = brokerSettings ?? defaultBrokerSettings();
    void patchBrokerSettings({
      ...current,
      defaultModel: model
    });
  }

  function updateActionModel(action: BrowserAction, model: string) {
    const current = brokerSettings ?? defaultBrokerSettings();
    void patchBrokerSettings({
      ...current,
      actionModels: {
        ...current.actionModels,
        [action]: model
      }
    });
  }

  async function runAction(action: BrowserAction, options: { force?: boolean } = {}) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setRunningAction(action);
    setExchanges([]);
    setThreadId(null);
    setActiveModel(null);
    setFollowupInput("");
    setActiveTab("work");

    try {
      const activePage = page ?? (await capturePage());

      if (!activePage) {
        return;
      }

      const allowSensitive = options.force || sensitiveOverride;

      if (activePage.isSensitive && !allowSensitive) {
        setBlockedAction(action);
        setStatus("비밀번호, 결제, 로그인 페이지는 기본 정책상 분석하지 않습니다.");
        return;
      }

      setBlockedAction(null);
      setStatus("Broker에 분석 요청을 보내는 중입니다.");
      await refreshHealth();

      appendExchange({ id: createExchangeId(), kind: action, question: "", content: "" });

      const response = await fetch(`${brokerUrl}/browser/${action}/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action,
          page: activePage,
          source: "chrome-extension",
          options: {
            targetLanguage,
            documentFormat,
            customInstruction: customInstructionFor(action)
          }
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      if (!response.body) {
        throw new Error("스트리밍 응답을 열 수 없습니다.");
      }

      await consumeStream(response.body);
      await refreshHealth();
      setStatus("완료");
    } catch (error) {
      if (isAbortError(error)) {
        handleAborted();
      } else {
        handleStreamError(error);
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setRunningAction(null);
    }
  }

  function forceBlockedAction() {
    if (!blockedAction || runningAction) {
      return;
    }

    const action = blockedAction;
    setSensitiveOverride(true);
    setBlockedAction(null);
    void runAction(action, { force: true });
  }

  async function runFollowup() {
    const question = followupInput.trim();

    if (!question || !threadId || followupRunning || runningAction) {
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setFollowupRunning(true);
    setStatus("이전 대화에 이어서 질문하는 중입니다.");
    appendExchange({ id: createExchangeId(), kind: "followup", question, content: "" });

    try {
      const response = await fetch(`${brokerUrl}/browser/followup/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          threadId,
          prompt: question,
          model: activeModel ?? undefined,
          source: "chrome-extension"
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      if (!response.body) {
        throw new Error("스트리밍 응답을 열 수 없습니다.");
      }

      await consumeStream(response.body);
      setFollowupInput("");
      setStatus("완료");
    } catch (error) {
      if (isAbortError(error)) {
        handleAborted();
      } else {
        handleStreamError(error);
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setFollowupRunning(false);
    }
  }

  function stopRun() {
    if (!abortRef.current) {
      return;
    }

    setStatus("작업을 중단하는 중입니다.");
    abortRef.current.abort();
  }

  function resetWorkspace() {
    if (abortRef.current) {
      resettingRef.current = true;
      abortRef.current.abort();
    }

    abortRef.current = null;
    setExchanges([]);
    setThreadId(null);
    setActiveModel(null);
    setFollowupInput("");
    setBlockedAction(null);
    setCopied(false);
    setStatus("현재 탭을 읽고 작업을 선택하세요.");
  }

  function handleAborted() {
    // A reset already cleared the workspace, so skip the "중단됨" marker.
    if (resettingRef.current) {
      resettingRef.current = false;
      return;
    }

    setStatus("중단됨");
    appendToLastExchange("⏹ 중단됨", "\n\n");
  }

  function appendExchange(exchange: Exchange) {
    setExchanges((current) => [...current, exchange]);
  }

  function appendToLastExchange(chunk: string, separator = "") {
    setExchanges((current) => {
      if (current.length === 0) {
        return current;
      }

      const next = [...current];
      const last = next[next.length - 1];
      const prefix = last.content && separator ? separator : "";
      next[next.length - 1] = { ...last, content: `${last.content}${prefix}${chunk}` };
      return next;
    });
  }

  function handleStreamError(error: unknown) {
    const message = error instanceof Error ? error.message : "요청 중 오류가 발생했습니다.";
    setStatus(message);
    appendToLastExchange(`⚠️ ${message}`, "\n\n");

    if (isNetworkError(error)) {
      setBrokerHealth({
        status: "error",
        detail: "Broker에 연결할 수 없습니다."
      });
      setModelHealth({
        name: modelHealth.name,
        status: "error",
        detail: "Broker에 연결할 수 없습니다."
      });
    }

    setLastError({
      code: classifyErrorCode(error),
      message,
      at: new Date().toLocaleTimeString()
    });
  }

  async function consumeStream(body: ReadableStream<Uint8Array>) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";

      for (const chunk of chunks) {
        const dataLine = chunk.split("\n").find((line) => line.startsWith("data: "));

        if (!dataLine) {
          continue;
        }

        const payload = JSON.parse(dataLine.slice(6));

        if (typeof payload.threadId === "string") {
          setThreadId(payload.threadId);
        }

        if (typeof payload.model === "string") {
          setActiveModel(payload.model);
        }

        if (typeof payload.label === "string") {
          setStatus(payload.label);
        }

        if (typeof payload.delta === "string") {
          appendToLastExchange(payload.delta);
        } else if (typeof payload.text === "string") {
          appendToLastExchange(payload.text, "\n\n");
        }

        if (typeof payload.error === "string") {
          throw new Error(payload.error);
        }
      }
    }
  }

  async function copyResult() {
    const transcript = buildTranscript(exchanges);

    if (!transcript.trim()) {
      return;
    }

    await navigator.clipboard.writeText(transcript);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1300);
  }

  function updatePromptTemplate(action: BrowserAction, value: string) {
    setPromptTemplates((current) => ({
      ...current,
      [action]: value
    }));
  }

  function resetPromptTemplates() {
    if (!arePromptTemplatesEqual(promptTemplates, defaultPromptTemplates)) {
      writePromptTemplateBackup(promptTemplates);
      setPromptBackupAvailable(true);
    }

    setPromptTemplates(defaultPromptTemplates);
    setPromptResetNotice(true);
  }

  function restorePromptTemplates() {
    const backup = readPromptTemplateBackup();

    if (!backup) {
      setPromptBackupAvailable(false);
      setPromptResetNotice(false);
      return;
    }

    setPromptTemplates(backup);
    setPromptBackupAvailable(true);
    setPromptResetNotice(false);
  }

  function customInstructionFor(action: BrowserAction) {
    const template = promptTemplates[action].trim();

    if (!template || template === defaultPromptTemplates[action].trim()) {
      return undefined;
    }

    return template
      .replaceAll("{targetLanguage}", languageLabel(targetLanguage))
      .replaceAll("{documentFormat}", documentFormat === "html" ? "HTML" : "Markdown");
  }

  return (
    <main className="panel" data-theme={theme}>
      <header className="hero">
        <div className="mark">
          <Sparkles size={18} />
        </div>
        <div className="heroText">
          <h1>Codex Spark</h1>
          <p>현재 페이지를 읽고 Spark로 정리합니다.</p>
        </div>
        <button className="themeButton" onClick={() => setTheme(theme === "light" ? "dark" : "light")} type="button">
          {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
        </button>
      </header>

      <nav className="tabs" aria-label="패널 탭">
        <button className={activeTab === "work" ? "active" : ""} onClick={() => setActiveTab("work")} type="button">
          작업
        </button>
        <button className={activeTab === "details" ? "active" : ""} onClick={() => setActiveTab("details")} type="button">
          <Info size={14} /> 정보
        </button>
        <button className={activeTab === "settings" ? "active" : ""} onClick={() => setActiveTab("settings")} type="button">
          <Settings size={14} /> 설정
        </button>
      </nav>

      {activeTab === "work" ? (
        <>
          <section className="pageBox compactCard">
            <button className="captureButton" onClick={() => void capturePage()} type="button">
              현재 탭 읽기
            </button>
            <div>
              <strong>{page?.title || "아직 읽은 페이지가 없습니다."}</strong>
              <span>{pageSummary}</span>
            </div>
          </section>

          <section className="actions">
            {actions.map((action) => (
              <button
                disabled={Boolean(runningAction)}
                key={action.id}
                onClick={() => void runAction(action.id)}
                type="button"
              >
                {runningAction === action.id ? <Loader2 className="spin" size={16} /> : action.icon}
                {action.label}
              </button>
            ))}
          </section>

          <section className="options compactOptions">
            <label>
              번역 언어
              <select value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)}>
                <option value="ko">한국어</option>
                <option value="en">영어</option>
                <option value="ja">일본어</option>
                <option value="zh">중국어</option>
              </select>
            </label>
            <label>
              문서 형식
              <select value={documentFormat} onChange={(event) => setDocumentFormat(event.target.value)}>
                <option value="markdown">Markdown</option>
                <option value="html">HTML</option>
              </select>
            </label>
          </section>

          <section className="status">
            <span className={`signal ${modelHealth.status}`} />
            <span className="statusText">{status}</span>
            {streaming ? (
              <button className="stopButton" onClick={stopRun} title="작업 중단" type="button">
                <Square size={13} />
                중단
              </button>
            ) : null}
          </section>

          {blockedAction ? (
            <section className="sensitiveNotice" role="alert">
              <div className="sensitiveNoticeHeader">
                <ShieldAlert size={15} />
                <strong>민감 페이지로 감지됨</strong>
              </div>
              <p>비밀번호·결제·로그인 정보가 포함될 수 있어 자동 분석을 막았습니다. 직접 확인했고 안전하다면 그대로 진행할 수 있습니다.</p>
              <button disabled={Boolean(runningAction)} onClick={forceBlockedAction} type="button">
                그래도 {exchangeHeading(blockedAction)} 실행
              </button>
            </section>
          ) : null}

          <section className="resultShell">
            <div className="resultToolbar">
              <strong>산출물</strong>
              <div className="resultToolbarActions">
                <button
                  aria-label="결과 초기화"
                  disabled={exchanges.length === 0 && !streaming}
                  onClick={resetWorkspace}
                  title="결과 초기화"
                  type="button"
                >
                  <Eraser size={15} />
                  초기화
                </button>
                <button aria-label="산출물 복사" disabled={!transcript} onClick={() => void copyResult()} title="산출물 복사" type="button">
                  <Copy size={15} />
                  {copied ? "복사됨" : "Copy"}
                </button>
              </div>
            </div>
            <article className="result">
              {exchanges.length === 0 ? (
                <span className="resultPlaceholder">결과가 여기에 표시됩니다.</span>
              ) : (
                <div className="conversation">
                  {exchanges.map((exchange, index) => (
                    <div className="exchange" key={exchange.id}>
                      <div className="exchangeHeading">
                        <span className="exchangeRole">
                          {exchange.kind === "followup" ? "질문" : exchangeHeading(exchange.kind)}
                        </span>
                        {exchange.kind === "followup" ? <span className="exchangeQuestion">{exchange.question}</span> : null}
                      </div>
                      <div className="exchangeBody">
                        {exchange.content || (streaming && index === exchanges.length - 1 ? "…" : "")}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
            <div className="composer">
              <textarea
                placeholder={threadId ? "이 페이지에 대해 이어서 질문하기 (Enter 전송 · Shift+Enter 줄바꿈)" : "먼저 요약·번역·분석·문서화를 실행하면 이어서 질문할 수 있습니다."}
                value={followupInput}
                disabled={!threadId || followupRunning || Boolean(runningAction)}
                onChange={(event) => setFollowupInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void runFollowup();
                  }
                }}
                rows={2}
              />
              <button
                aria-label="후속 질문 보내기"
                disabled={!threadId || followupRunning || Boolean(runningAction) || !followupInput.trim()}
                onClick={() => void runFollowup()}
                type="button"
              >
                {followupRunning ? <Loader2 className="spin" size={16} /> : <Send size={16} />}
              </button>
            </div>
          </section>
        </>
      ) : null}

      {activeTab === "details" ? (
        <section className="stackPanel">
          <div className="modelBox detailCard connectionCard">
            <div className="connectionHeader">
              <div>
                <span className={`signal ${brokerHealth.status === "connected" ? "connected" : brokerHealth.status === "error" ? "error" : "mock"}`} />
                <strong>연결 상태</strong>
              </div>
              <button disabled={healthChecking} onClick={() => void refreshHealth()} type="button">
                <RefreshCw className={healthChecking ? "spin" : ""} size={14} />
                Refresh
              </button>
            </div>

            <div className="connectionRows">
              <ConnectionStatus
                label="Broker"
                status={brokerHealth.status}
                detail={brokerHealth.detail}
              />
              <ConnectionStatus
                label="Codex app-server / Spark"
                status={modelHealth.status}
                detail={`${modelHealth.name} · ${modelHealth.detail}`}
              />
            </div>

            <small>마지막 확인: {healthCheckedAt}</small>
          </div>

          {modelHealth.status === "error" && lastError ? (
            <div className="errorBox">
              <div className="errorHeader">
                <span className="signal error" />
                <strong>Codex 연결 오류</strong>
                <code>{lastError.code}</code>
              </div>
              <p>{lastError.message}</p>
              <small>발생 시각: {lastError.at} · Broker: {brokerUrl}</small>
              <button onClick={() => void refreshHealth()} type="button">
                다시 연결 시도
              </button>
            </div>
          ) : null}

          <div className="detailGrid">
            <Detail label="Broker" value={brokerUrl} />
            <Detail label="페이지 제목" value={page?.title || "읽은 페이지 없음"} />
            <Detail label="URL" value={page?.url || "-"} />
            <Detail label="범위" value={page?.selectionText ? "선택 영역" : page ? "전체 페이지" : "-"} />
            <Detail label="문자 수" value={page ? `${(page.selectionText?.length ?? page.text.length).toLocaleString()}자` : "-"} />
            <Detail label="언어" value={page?.lang || "-"} />
          </div>
        </section>
      ) : null}

      {activeTab === "settings" ? (
        <section className="stackPanel">
          <div className="settingsHeader">
            <div>
              <strong>모델 정책</strong>
              <span>최종 모델 결정은 Broker가 합니다. Chrome 확장은 선택 UI만 제공합니다.</span>
            </div>
            <button onClick={() => void refreshBrokerSettings()} type="button">
              <RefreshCw size={14} /> 모델 새로고침
            </button>
          </div>

          <div className="modelPolicy">
            <label>
              기본 모델
              <ModelSelect
                value={brokerSettings?.defaultModel ?? "gpt-5.3-codex-spark"}
                models={modelOptions}
                includeAuto={false}
                disabled={settingsSaving}
                onChange={updateDefaultModel}
              />
            </label>

            {actions.map((action) => (
              <label key={action.id}>
                {action.shortLabel} 모델
                <ModelSelect
                  value={brokerSettings?.actionModels?.[action.id] ?? "auto"}
                  models={modelOptions}
                  includeAuto
                  disabled={settingsSaving}
                  onChange={(model) => updateActionModel(action.id, model)}
                />
              </label>
            ))}

            <small>{settingsSaving ? "Broker 설정 저장 중" : "auto는 Broker 기본 모델과 fallback 정책을 사용합니다."}</small>
          </div>

          <div className="themeSetting">
            <span>화면 모드</span>
            <div>
              <button className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")} type="button">
                <Sun size={14} /> Light
              </button>
              <button className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")} type="button">
                <Moon size={14} /> Dark
              </button>
            </div>
          </div>

          <div className="settingsHeader promptSettingsHeader">
            <div>
              <strong>프롬프트 설정</strong>
              <span>기본값은 현재 만족한 출력 기준과 동일합니다. 수정 시에만 Broker로 override를 보냅니다.</span>
            </div>
            <div className="promptActions">
              {promptBackupAvailable ? (
                <button onClick={restorePromptTemplates} type="button">
                  최근 프롬프트 복구
                </button>
              ) : null}
              <button onClick={resetPromptTemplates} type="button">
                <RotateCcw size={14} /> 기본 프롬프트로 복원
              </button>
            </div>
          </div>

          {promptResetNotice ? (
            <div className="promptUndo" role="status">
              <span>기본 프롬프트로 복원했습니다.</span>
              <button onClick={restorePromptTemplates} type="button">
                되돌리기
              </button>
              <button aria-label="알림 닫기" onClick={() => setPromptResetNotice(false)} type="button">
                닫기
              </button>
            </div>
          ) : null}

          <div className="promptList">
            {actions.map((action) => (
              <label className="promptEditor" key={action.id}>
                <span>{action.shortLabel} 프롬프트</span>
                <textarea
                  spellCheck={false}
                  value={promptTemplates[action.id]}
                  onChange={(event) => updatePromptTemplate(action.id, event.target.value)}
                />
              </label>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function ModelSelect({
  value,
  models,
  includeAuto,
  disabled,
  onChange
}: {
  value: string;
  models: ModelOption[];
  includeAuto: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <select disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)}>
      {includeAuto ? <option value="auto">auto</option> : null}
      {models.map((model) => (
        <option key={model.id} value={model.id}>
          {model.id}
        </option>
      ))}
      {value && value !== "auto" && !models.some((model) => model.id === value) ? (
        <option value={value}>{value}</option>
      ) : null}
    </select>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="detailItem">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ConnectionStatus({
  label,
  status,
  detail
}: {
  label: string;
  status: BrokerHealthStatus["status"] | ModelHealth["status"];
  detail: string;
}) {
  return (
    <div className="connectionRow">
      <span className={`signal ${status === "connected" ? "connected" : status === "error" ? "error" : "mock"}`} />
      <div>
        <strong>{label}: {connectionStatusLabel(status)}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

function readTheme(): ThemeMode {
  const stored = localStorage.getItem(themeStorageKey);
  return stored === "dark" ? "dark" : "light";
}

function readPromptTemplates(): PromptTemplates {
  try {
    const parsed = JSON.parse(localStorage.getItem(promptStorageKey) ?? "{}") as Partial<PromptTemplates>;

    return {
      summarize: typeof parsed.summarize === "string" ? parsed.summarize : defaultPromptTemplates.summarize,
      translate: typeof parsed.translate === "string" ? parsed.translate : defaultPromptTemplates.translate,
      analyze: typeof parsed.analyze === "string" ? parsed.analyze : defaultPromptTemplates.analyze,
      document: typeof parsed.document === "string" ? parsed.document : defaultPromptTemplates.document
    };
  } catch {
    return defaultPromptTemplates;
  }
}

function readPromptTemplateBackup(): PromptTemplates | null {
  try {
    const stored = localStorage.getItem(promptBackupStorageKey);

    return stored ? normalizePromptTemplates(JSON.parse(stored) as Partial<PromptTemplates>) : null;
  } catch {
    return null;
  }
}

function writePromptTemplateBackup(templates: PromptTemplates) {
  localStorage.setItem(promptBackupStorageKey, JSON.stringify(templates));
}

function hasPromptTemplateBackup() {
  return Boolean(readPromptTemplateBackup());
}

function normalizePromptTemplates(value: Partial<PromptTemplates>): PromptTemplates {
  return {
    summarize: typeof value.summarize === "string" ? value.summarize : defaultPromptTemplates.summarize,
    translate: typeof value.translate === "string" ? value.translate : defaultPromptTemplates.translate,
    analyze: typeof value.analyze === "string" ? value.analyze : defaultPromptTemplates.analyze,
    document: typeof value.document === "string" ? value.document : defaultPromptTemplates.document
  };
}

function arePromptTemplatesEqual(left: PromptTemplates, right: PromptTemplates) {
  return actions.every((action) => left[action.id] === right[action.id]);
}

function readCachedBrokerSettings(): BrokerSettings | null {
  try {
    const stored = localStorage.getItem(brokerSettingsStorageKey);

    return stored ? normalizeBrokerSettings(JSON.parse(stored) as Partial<BrokerSettings>) : null;
  } catch {
    return null;
  }
}

function writeCachedBrokerSettings(settings: BrokerSettings) {
  localStorage.setItem(brokerSettingsStorageKey, JSON.stringify(settings));
}

function defaultBrokerSettings(): BrokerSettings {
  return {
    defaultModel: "gpt-5.3-codex-spark",
    actionModels: {
      summarize: "auto",
      translate: "auto",
      analyze: "auto",
      document: "auto"
    },
    allowedOrigins: [],
    maxPageTextChars: 60000
  };
}

function normalizeBrokerSettings(value: Partial<BrokerSettings>): BrokerSettings {
  return {
    ...defaultBrokerSettings(),
    ...value,
    actionModels: {
      ...defaultBrokerSettings().actionModels,
      ...(value.actionModels ?? {})
    }
  };
}

function extractModelOptions(value: unknown): ModelOption[] {
  const modelResponse = value as { data?: ModelOption[]; models?: ModelOption[] };
  const models = modelResponse.data ?? modelResponse.models ?? [];

  return models
    .map((model) => ({
      id: model.id ?? model.name ?? "",
      name: model.name
    }))
    .filter((model) => model.id);
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }

  return error instanceof Error && error.name === "AbortError";
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return /failed to fetch|networkerror|연결할 수 없|err_connection|err_network/i.test(message);
}

function classifyErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (error instanceof TypeError || /failed to fetch/i.test(message)) {
    return "ERR_BROKER_UNREACHABLE";
  }

  const httpMatch = message.match(/HTTP\s+(\d{3})/);
  if (httpMatch) {
    return `ERR_HTTP_${httpMatch[1]}`;
  }

  if (/timeout/i.test(message)) {
    return "ERR_TIMEOUT";
  }

  if (/abort/i.test(message)) {
    return "ERR_ABORTED";
  }

  return "ERR_UNKNOWN";
}

function connectionStatusLabel(status: BrokerHealthStatus["status"] | ModelHealth["status"]) {
  return {
    connected: "초록",
    mock: "노랑",
    unknown: "노랑",
    error: "빨강"
  }[status];
}

function languageLabel(language: string) {
  return {
    ko: "한국어",
    en: "영어",
    ja: "일본어",
    zh: "중국어"
  }[language] ?? "한국어";
}

function createExchangeId() {
  return `ex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function exchangeHeading(kind: Exchange["kind"]) {
  return actions.find((action) => action.id === kind)?.label ?? "결과";
}

function buildTranscript(exchanges: Exchange[]) {
  return exchanges
    .map((exchange) => {
      const heading = exchange.kind === "followup" ? `질문: ${exchange.question}` : exchangeHeading(exchange.kind);
      return `## ${heading}\n\n${exchange.content}`.trim();
    })
    .join("\n\n");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SidePanel />
  </React.StrictMode>
);
