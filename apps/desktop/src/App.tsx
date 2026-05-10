import { invoke } from "@tauri-apps/api/core";
import {
  Activity,
  CheckCircle2,
  Database,
  Globe2,
  ListChecks,
  Play,
  Power,
  RefreshCw,
  Settings,
  Sparkles,
  Square,
  XCircle
} from "lucide-react";
import { useEffect, useState } from "react";

const brokerUrl = "http://127.0.0.1:17333";

type BrokerHealth = {
  ok: boolean;
  name: string;
  version: string;
  mode?: string;
  model?: {
    name: string;
    status: "mock" | "connected" | "error";
    detail: string;
  };
};

type BrokerSettings = {
  defaultModel: string;
  allowedOrigins: string[];
  maxPageTextChars: number;
};

type RecentRequest = {
  id: string;
  action: string;
  title: string;
  url: string;
  createdAt: string;
};

type EngineStatus = {
  app_server_running: boolean;
  broker_running: boolean;
  app_server_managed: boolean;
  broker_managed: boolean;
  message: string;
};

type AdminSection = "status" | "requests" | "settings";

const emptyEngineStatus: EngineStatus = {
  app_server_running: false,
  broker_running: false,
  app_server_managed: false,
  broker_managed: false,
  message: "엔진 상태 확인 전"
};

export function App() {
  const [activeSection, setActiveSection] = useState<AdminSection>("status");
  const [health, setHealth] = useState<BrokerHealth | null>(null);
  const [settings, setSettings] = useState<BrokerSettings | null>(null);
  const [requests, setRequests] = useState<RecentRequest[]>([]);
  const [engineStatus, setEngineStatus] = useState<EngineStatus>(emptyEngineStatus);
  const [error, setError] = useState<string | null>(null);
  const [engineBusy, setEngineBusy] = useState(false);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    await Promise.all([refreshEngineStatus(), refreshBrokerData()]);
  }

  async function refreshEngineStatus() {
    try {
      const status = await invoke<EngineStatus>("engine_status");
      setEngineStatus(status);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : String(statusError));
    }
  }

  async function refreshBrokerData() {
    try {
      const [healthResponse, settingsResponse, requestsResponse] = await Promise.all([
        fetch(`${brokerUrl}/health`),
        fetch(`${brokerUrl}/settings`),
        fetch(`${brokerUrl}/requests`)
      ]);

      if (!healthResponse.ok || !settingsResponse.ok || !requestsResponse.ok) {
        throw new Error("Broker 응답을 확인할 수 없습니다.");
      }

      setHealth(await healthResponse.json());
      setSettings(await settingsResponse.json());
      setRequests((await requestsResponse.json()).requests ?? []);
      setError(null);
    } catch (refreshError) {
      setHealth(null);
      setSettings(null);
      setRequests([]);
      setError(refreshError instanceof Error ? refreshError.message : "Broker에 연결할 수 없습니다.");
    }
  }

  async function startEngine() {
    setEngineBusy(true);

    try {
      const status = await invoke<EngineStatus>("start_engine");
      setEngineStatus(status);
      await refreshBrokerData();
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : String(startError));
    } finally {
      setEngineBusy(false);
    }
  }

  async function stopEngine() {
    setEngineBusy(true);

    try {
      const status = await invoke<EngineStatus>("stop_engine");
      setEngineStatus(status);
      await refreshBrokerData();
    } catch (stopError) {
      setError(stopError instanceof Error ? stopError.message : String(stopError));
    } finally {
      setEngineBusy(false);
    }
  }

  const engineReady = engineStatus.app_server_running && engineStatus.broker_running && health?.model?.status === "connected";

  return (
    <main className="adminShell">
      <aside className="adminSidebar">
        <div className="brand">
          <div className="brandMark">
            <Sparkles size={18} />
          </div>
          <div>
            <strong>Codex Spark</strong>
            <span>Local Engine</span>
          </div>
        </div>

        <nav className="adminNav">
          <button className={activeSection === "status" ? "active" : ""} onClick={() => setActiveSection("status")} type="button">
            <Activity size={16} />
            상태
          </button>
          <button className={activeSection === "requests" ? "active" : ""} onClick={() => setActiveSection("requests")} type="button">
            <ListChecks size={16} />
            요청 로그
          </button>
          <button className={activeSection === "settings" ? "active" : ""} onClick={() => setActiveSection("settings")} type="button">
            <Settings size={16} />
            설정
          </button>
        </nav>
      </aside>

      <section className="adminMain">
        <header className="adminHeader">
          <div>
            <h1>{sectionTitle(activeSection)}</h1>
            <p>{sectionDescription(activeSection)}</p>
          </div>
          <button className="refreshButton" onClick={() => void refresh()} type="button">
            <RefreshCw size={16} />
            새로고침
          </button>
        </header>

        {error ? <div className="errorBanner">{error}</div> : null}

        {activeSection === "status" ? (
          <>
            <section className="engineHero">
              <div>
                <span className={engineReady ? "engineDot goodDot" : "engineDot badDot"} />
                <div>
                  <strong>{engineReady ? "엔진 실행 중" : "엔진 확인 필요"}</strong>
                  <p>{engineStatus.message}</p>
                </div>
              </div>
              <div className="engineActions">
                <button disabled={engineBusy} onClick={() => void startEngine()} type="button">
                  <Play size={16} />
                  Start Engine
                </button>
                <button disabled={engineBusy} onClick={() => void stopEngine()} type="button">
                  <Square size={16} />
                  Stop Engine
                </button>
              </div>
            </section>

            <div className="adminGrid">
              <section className="panelCard">
                <div className="panelTitle">
                  <Power size={17} />
                  <h2>로컬 프로세스</h2>
                </div>
                <div className="metric">
                  <span>Codex app-server</span>
                  <strong className={engineStatus.app_server_running ? "good" : "bad"}>
                    {engineStatus.app_server_running ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                    {engineStatus.app_server_running ? "4500 실행 중" : "중지"}
                  </strong>
                </div>
                <div className="metric">
                  <span>app-server 실행 주체</span>
                  <strong>{managedLabel(engineStatus.app_server_running, engineStatus.app_server_managed)}</strong>
                </div>
                <div className="metric">
                  <span>Broker</span>
                  <strong className={engineStatus.broker_running ? "good" : "bad"}>
                    {engineStatus.broker_running ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                    {engineStatus.broker_running ? "17333 실행 중" : "중지"}
                  </strong>
                </div>
                <div className="metric">
                  <span>Broker 실행 주체</span>
                  <strong>{managedLabel(engineStatus.broker_running, engineStatus.broker_managed)}</strong>
                </div>
              </section>

              <section className="panelCard">
                <div className="panelTitle">
                  <Globe2 size={17} />
                  <h2>Broker</h2>
                </div>
                <div className="metric">
                  <span>상태</span>
                  <strong className={health?.ok ? "good" : "bad"}>
                    {health?.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                    {health?.ok ? "실행 중" : "확인 필요"}
                  </strong>
                </div>
                <div className="metric">
                  <span>모드</span>
                  <strong>{health?.mode ?? "browser-assistant"}</strong>
                </div>
                <div className="metric">
                  <span>모델</span>
                  <strong>{health?.model?.name ?? "gpt-5.3-codex-spark"}</strong>
                </div>
                <div className="metric">
                  <span>모델 상태</span>
                  <strong className={health?.model?.status === "connected" ? "good" : health?.model?.status === "error" ? "bad" : "warn"}>
                    {health?.model?.status === "connected" ? "초록" : health?.model?.status === "error" ? "빨강" : "노랑"}
                  </strong>
                </div>
                <div className="metric">
                  <span>주소</span>
                  <strong>127.0.0.1:17333</strong>
                </div>
              </section>
            </div>
          </>
        ) : null}

        {activeSection === "requests" ? (
          <section className="panelCard wide sectionOnly">
            <div className="panelTitle">
              <Database size={17} />
              <h2>최근 브라우저 요청</h2>
            </div>
            <div className="requestList">
              {requests.length === 0 ? (
                <p>아직 기록된 요청이 없습니다. Chrome 확장에서 페이지 분석을 실행하면 여기에 표시됩니다.</p>
              ) : (
                requests.map((request) => (
                  <article key={request.id}>
                    <strong>{request.title}</strong>
                    <span>{request.action} · {new Date(request.createdAt).toLocaleString()}</span>
                    <small>{request.url}</small>
                  </article>
                ))
              )}
            </div>
          </section>
        ) : null}

        {activeSection === "settings" ? (
          <section className="panelCard sectionOnly settingsPanel">
            <div className="panelTitle">
              <Settings size={17} />
              <h2>설정</h2>
            </div>
            <div className="metric">
              <span>기본 모델</span>
              <strong>{settings?.defaultModel ?? "gpt-5.3-codex-spark"}</strong>
            </div>
            <div className="metric">
              <span>본문 제한</span>
              <strong>{settings?.maxPageTextChars?.toLocaleString() ?? "60,000"}자</strong>
            </div>
            <div className="originList">
              {(settings?.allowedOrigins ?? ["chrome-extension://*"]).map((origin) => (
                <code key={origin}>{origin}</code>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

function managedLabel(running: boolean, managed: boolean) {
  if (!running) {
    return "중지됨";
  }

  return managed ? "Tauri가 시작함" : "외부에서 실행됨";
}

function sectionTitle(section: AdminSection) {
  return {
    status: "브라우저 AI 엔진 관리",
    requests: "요청 로그",
    settings: "설정"
  }[section];
}

function sectionDescription(section: AdminSection) {
  return {
    status: "터미널 명령 대신 이 앱에서 Codex app-server와 Broker를 시작하고 상태를 확인합니다.",
    requests: "Chrome 확장에서 실행한 최근 페이지 분석 요청을 확인합니다.",
    settings: "Broker 기본 모델, 본문 제한, 허용 Origin을 확인합니다."
  }[section];
}
