import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  BookOpen,
  Copy,
  FileText,
  Info,
  Languages,
  Loader2,
  Moon,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  Sun
} from "lucide-react";
import type { BrowserAction, CapturedPage, CaptureResponse } from "./types";
import "./sidepanel.css";

const brokerUrl = "http://127.0.0.1:17333";
const promptStorageKey = "codex-spark.promptTemplates.v1";
const themeStorageKey = "codex-spark.theme.v1";

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
  const [result, setResult] = useState("");
  const [status, setStatus] = useState("현재 탭을 읽고 작업을 선택하세요.");
  const [runningAction, setRunningAction] = useState<BrowserAction | null>(null);
  const [targetLanguage, setTargetLanguage] = useState("ko");
  const [documentFormat, setDocumentFormat] = useState("markdown");
  const [copied, setCopied] = useState(false);
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplates>(() => readPromptTemplates());
  const [brokerSettings, setBrokerSettings] = useState<BrokerSettings | null>(null);
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

  async function capturePage() {
    setStatus("현재 탭을 읽는 중입니다.");
    const response = (await chrome.runtime.sendMessage({ type: "CAPTURE_ACTIVE_TAB" })) as CaptureResponse;

    if (!response.ok) {
      setStatus(response.error);
      return null;
    }

    setPage(response.page);
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
        const settings = await settingsResponse.json();
        setBrokerSettings(normalizeBrokerSettings(settings));
      }

      if (modelsResponse.ok) {
        setModelOptions(extractModelOptions(await modelsResponse.json()));
      }
    } catch {
      setBrokerSettings(null);
      setModelOptions([]);
    }
  }

  async function patchBrokerSettings(nextSettings: BrokerSettings) {
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

      setBrokerSettings(normalizeBrokerSettings(await response.json()));
      await refreshHealth();
    } catch (error) {
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

  async function runAction(action: BrowserAction) {
    setRunningAction(action);
    setResult("");
    setActiveTab("work");

    try {
      const activePage = page ?? (await capturePage());

      if (!activePage) {
        return;
      }

      if (activePage.isSensitive) {
        setStatus("비밀번호, 결제, 로그인 페이지는 기본 정책상 분석하지 않습니다.");
        return;
      }

      setStatus("Broker에 분석 요청을 보내는 중입니다.");

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
        })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      if (!response.body) {
        throw new Error("스트리밍 응답을 열 수 없습니다.");
      }

      await readSse(response.body);
      setStatus("완료");
    } catch (error) {
      const message = error instanceof Error ? error.message : "요청 중 오류가 발생했습니다.";
      setStatus(message);

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
    } finally {
      setRunningAction(null);
    }
  }

  async function readSse(body: ReadableStream<Uint8Array>) {
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

        if (typeof payload.label === "string") {
          setStatus(payload.label);
        }

        if (typeof payload.text === "string") {
          setResult((current) => `${current}${current ? "\n\n" : ""}${payload.text}`);
        }

        if (typeof payload.delta === "string") {
          setResult((current) => `${current}${payload.delta}`);
        }

        if (typeof payload.error === "string") {
          throw new Error(payload.error);
        }
      }
    }
  }

  async function copyResult() {
    if (!result.trim()) {
      return;
    }

    await navigator.clipboard.writeText(result);
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
    setPromptTemplates(defaultPromptTemplates);
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
            {status}
          </section>

          <section className="resultShell">
            <div className="resultToolbar">
              <strong>산출물</strong>
              <button aria-label="산출물 복사" disabled={!result.trim()} onClick={() => void copyResult()} title="산출물 복사" type="button">
                <Copy size={15} />
                {copied ? "복사됨" : "Copy"}
              </button>
            </div>
            <article className="result">{result || "결과가 여기에 표시됩니다."}</article>
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

          <div className="settingsHeader">
            <div>
              <strong>프롬프트 설정</strong>
              <span>기본값은 현재 만족한 출력 기준과 동일합니다. 수정 시에만 Broker로 override를 보냅니다.</span>
            </div>
            <button onClick={resetPromptTemplates} type="button">
              <RotateCcw size={14} /> 기본값
            </button>
          </div>

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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SidePanel />
  </React.StrictMode>
);
