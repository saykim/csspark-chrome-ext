import Fastify, { type FastifyReply } from "fastify";
import { buildBrowserPrompt, normalizeBrowserPage } from "@codex-spark/adapters";
import { CodexRpcClient, type CodexRpcNotification } from "@codex-spark/codex-rpc";
import type {
  BrokerSettings,
  BrowserAction,
  BrowserActionStreamRequest,
  DocumentFormat,
  RunStreamRequest,
  TranslationTarget,
  ThreadSummary
} from "@codex-spark/core";

const PORT = Number(process.env.PORT ?? 17333);
const HOST = "127.0.0.1";
const CODEX_WS = process.env.CODEX_WS ?? "ws://127.0.0.1:4500";
const DEFAULT_MODEL = process.env.CODEX_MODEL ?? "gpt-5.3-codex-spark";

const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "tauri://localhost"
];

const settings: BrokerSettings = {
  defaultModel: DEFAULT_MODEL,
  actionModels: {
    summarize: "auto",
    translate: "auto",
    analyze: "auto",
    document: "auto"
  },
  allowedOrigins: ["chrome-extension://*", ...allowedOrigins],
  maxPageTextChars: 60000
};

const app = Fastify({
  logger: true
});

const rpc = new CodexRpcClient({
  url: CODEX_WS,
  token: process.env.CODEX_WS_TOKEN
});

const demoThreads: ThreadSummary[] = [
  {
    id: "browser-demo",
    title: "브라우저 페이지 분석",
    cwd: "browser",
    model: DEFAULT_MODEL,
    updatedAt: new Date().toISOString()
  }
];

const recentRequests: Array<{
  id: string;
  action: BrowserAction;
  title: string;
  url: string;
  createdAt: string;
}> = [];

app.addHook("onRequest", async (request, reply) => {
  const origin = request.headers.origin;

  if (origin && isAllowedOrigin(origin)) {
    reply.header("Access-Control-Allow-Origin", origin);
    reply.header("Vary", "Origin");
  }

  reply.header("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  reply.header("Access-Control-Allow-Headers", "Content-Type");

  if (origin && !isAllowedOrigin(origin)) {
    reply.code(403).send({ error: "Origin is not allowed" });
  }
});

app.get("/health", async () => {
  return {
    ok: true,
    name: "codex-spark-broker",
    version: "0.1.0",
    mode: "browser-assistant",
    model: await getModelHealth()
  };
});

app.get("/models", async (_, reply) => {
  try {
    return await rpc.listModels();
  } catch (error) {
    reply.code(502);
    return {
      error: getErrorMessage(error)
    };
  }
});

app.get("/threads", async () => {
  return {
    threads: demoThreads
  };
});

app.get("/settings", async () => {
  return settings;
});

app.patch<{ Body: Partial<BrokerSettings> }>("/settings", async (request) => {
  if (typeof request.body.defaultModel === "string" && request.body.defaultModel.trim()) {
    settings.defaultModel = request.body.defaultModel.trim();
  }

  if (request.body.actionModels && typeof request.body.actionModels === "object") {
    for (const action of ["summarize", "translate", "analyze", "document"] satisfies BrowserAction[]) {
      const model = request.body.actionModels[action];

      if (typeof model === "string" && model.trim()) {
        settings.actionModels[action] = model.trim();
      }
    }
  }

  if (typeof request.body.maxPageTextChars === "number" && request.body.maxPageTextChars > 1000) {
    settings.maxPageTextChars = Math.min(request.body.maxPageTextChars, 160000);
  }

  return settings;
});

app.get("/requests", async () => {
  return {
    requests: recentRequests.slice(0, 20)
  };
});

app.post<{ Body: BrowserActionStreamRequest }>("/browser/summarize/stream", async (request, reply) => {
  return streamBrowserAction("summarize", request.body, reply, request.headers.origin);
});

app.post<{ Body: BrowserActionStreamRequest }>("/browser/translate/stream", async (request, reply) => {
  return streamBrowserAction("translate", request.body, reply, request.headers.origin);
});

app.post<{ Body: BrowserActionStreamRequest }>("/browser/analyze/stream", async (request, reply) => {
  return streamBrowserAction("analyze", request.body, reply, request.headers.origin);
});

app.post<{ Body: BrowserActionStreamRequest }>("/browser/document/stream", async (request, reply) => {
  return streamBrowserAction("document", request.body, reply, request.headers.origin);
});

app.post<{ Body: RunStreamRequest }>("/runs/stream", async (request, reply) => {
  const body = request.body;

  if (!body || typeof body.prompt !== "string" || !body.prompt.trim()) {
    reply.code(400);
    return { error: "prompt is required" };
  }

  startSse(reply, request.headers.origin);
  writeSse(reply, "thread", { threadId: body.threadId ?? `thread-${Date.now()}` });
  writeSse(reply, "status", { label: "Broker 연결 완료" });
  writeSse(reply, "message", {
    text: "이 엔드포인트는 데스크톱 관리 앱 호환용 mock입니다. 브라우저 분석은 /browser/*/stream 엔드포인트를 사용합니다."
  });
  writeSse(reply, "message", { text: `요청 내용: ${body.prompt}` });
  writeSse(reply, "done", { ok: true });
  reply.raw.end();
});

app.options("*", async (_, reply) => {
  reply.send();
});

await app.listen({
  host: HOST,
  port: PORT
});

function isAllowedOrigin(origin: string) {
  return origin.startsWith("chrome-extension://") || allowedOrigins.includes(origin);
}

async function streamBrowserAction(
  action: BrowserAction,
  body: BrowserActionStreamRequest,
  reply: FastifyReply,
  origin: string | undefined
) {
  const error = validateBrowserRequest(action, body);

  if (error) {
    reply.code(400);
    return { error };
  }

  const page = normalizeBrowserPage(body.page, settings.maxPageTextChars);
  const prompt = buildBrowserPrompt(action, page, body.options);
  const requestId = `browser-${Date.now()}`;
  const model = await resolveModel(action, body.model);

  recentRequests.unshift({
    id: requestId,
    action,
    title: page.title || "(untitled)",
    url: page.url,
    createdAt: new Date().toISOString()
  });

  startSse(reply, origin);
  writeSse(reply, "status", { label: "페이지 내용 정리 완료" });
  writeSse(reply, "status", { label: `${model} 연결 시도 중` });

  try {
    await rpc.runBrowserPrompt({
      prompt,
      model,
      threadId: body.threadId,
      cwd: process.cwd(),
      serviceName: "codex-spark-browser",
      onNotification: (notification) => {
        forwardCodexNotification(reply, notification);
      }
    });

    writeSse(reply, "done", { ok: true, requestId, truncated: page.truncated, model });
  } catch (error) {
    writeSse(reply, "error", {
      error: getErrorMessage(error)
    });
  } finally {
    reply.raw.end();
  }
}

function validateBrowserRequest(action: BrowserAction, body: BrowserActionStreamRequest) {
  if (!body || body.action !== action) {
    return "action does not match endpoint";
  }

  if (body.source !== "chrome-extension") {
    return "source must be chrome-extension";
  }

  if (!body.page || typeof body.page.url !== "string" || typeof body.page.text !== "string") {
    return "page.url and page.text are required";
  }

  if (body.page.isSensitive) {
    return "sensitive pages are blocked by default";
  }

  if (!body.page.text.trim() && !body.page.selectionText?.trim()) {
    return "page text or selected text is required";
  }

  if (body.options?.targetLanguage && !isTranslationTarget(body.options.targetLanguage)) {
    return "targetLanguage must be ko, en, ja, or zh";
  }

  if (body.options?.documentFormat && !isDocumentFormat(body.options.documentFormat)) {
    return "documentFormat must be markdown or html";
  }

  return null;
}

function startSse(reply: FastifyReply, origin: string | undefined) {
  const headers: Record<string, string> = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  };

  if (origin && isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }

  reply.raw.writeHead(200, headers);
}

function writeSse(reply: FastifyReply, event: string, payload: unknown) {
  reply.raw.write(`event: ${event}\n`);
  reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function isTranslationTarget(value: string): value is TranslationTarget {
  return ["ko", "en", "ja", "zh"].includes(value);
}

function isDocumentFormat(value: string): value is DocumentFormat {
  return ["markdown", "html"].includes(value);
}

async function getModelHealth() {
  try {
    const models = await rpc.listModels();
    const selectedModel = findModel(models, settings.defaultModel);

    return {
      name: selectedModel?.id ?? settings.defaultModel,
      status: "connected" as const,
      detail: selectedModel
        ? "Codex app-server 연결됨"
        : "Codex app-server는 연결됐지만 기본 모델이 model/list에서 확인되지 않았습니다."
    };
  } catch (error) {
    return {
      name: settings.defaultModel,
      status: "error" as const,
      detail: getErrorMessage(error)
    };
  }
}

async function resolveModel(action: BrowserAction, requestModel?: string) {
  const actionModel = settings.actionModels[action];
  const preferred = normalizeModelSelection(requestModel) ?? normalizeModelSelection(actionModel) ?? settings.defaultModel;

  try {
    const models = await rpc.listModels();
    const preferredModel = findModel(models, preferred);

    if (preferredModel?.id || preferredModel?.name) {
      return preferredModel.id ?? preferredModel.name ?? preferred;
    }

    const defaultModel = findModel(models, settings.defaultModel);

    if (defaultModel?.id || defaultModel?.name) {
      return defaultModel.id ?? defaultModel.name ?? settings.defaultModel;
    }

    const [firstModel] = extractModelList(models);
    return firstModel?.id ?? firstModel?.name ?? preferred;
  } catch {
    return preferred;
  }
}

function normalizeModelSelection(value: string | undefined) {
  const normalized = value?.trim();

  if (!normalized || normalized === "auto") {
    return undefined;
  }

  return normalized;
}

function findModel(models: unknown, modelId: string) {
  return extractModelList(models).find((model) => model.id === modelId || model.name === modelId);
}

function extractModelList(models: unknown) {
  const value = models as { data?: Array<{ id?: string; name?: string }>; models?: Array<{ id?: string; name?: string }> };
  return value.data ?? value.models ?? [];
}

function forwardCodexNotification(reply: FastifyReply, notification: CodexRpcNotification) {
  const params = notification.params as Record<string, any> | undefined;

  if (notification.method === "broker/thread") {
    writeSse(reply, "thread", {
      threadId: params?.threadId
    });
    return;
  }

  if (notification.method === "broker/turn") {
    writeSse(reply, "status", {
      label: "Codex Spark 응답 생성 중"
    });
    return;
  }

  if (notification.method === "item/agentMessage/delta" && typeof params?.delta === "string") {
    writeSse(reply, "delta", {
      delta: params.delta
    });
    return;
  }

  if (notification.method === "turn/plan/updated") {
    writeSse(reply, "status", {
      label: "Codex 작업 계획 업데이트"
    });
    return;
  }

  if (notification.method === "turn/completed") {
    writeSse(reply, "status", {
      label: "Codex 응답 완료"
    });
    return;
  }

  if (notification.method === "broker/serverRequest/rejected") {
    writeSse(reply, "status", {
      label: "브라우저 모드에서 도구 실행 요청을 차단했습니다."
    });
    return;
  }

  if (notification.method === "error") {
    writeSse(reply, "error", {
      error: getErrorMessage(params?.error ?? "Codex turn failed.")
    });
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}
