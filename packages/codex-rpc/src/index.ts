export type CodexRpcConfig = {
  url: string;
  token?: string;
  turnTimeoutMs?: number;
};

export type CodexRpcNotification = {
  method: string;
  params?: unknown;
};

export type CodexBrowserRunRequest = {
  prompt: string;
  model: string;
  threadId?: string;
  cwd?: string;
  serviceName?: string;
  signal?: AbortSignal;
  onNotification: (notification: CodexRpcNotification) => void;
};

export class CodexAbortError extends Error {
  constructor(message = "Codex turn was aborted by the client.") {
    super(message);
    this.name = "CodexAbortError";
  }
}

type JsonRpcId = number | string;

type JsonRpcMessage = {
  jsonrpc?: "2.0";
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
};

type WebSocketLike = {
  readyState: number;
  send: (data: string) => void;
  close: () => void;
  addEventListener: (type: string, listener: (event: any) => void, options?: { once?: boolean }) => void;
};

export class CodexRpcClient {
  constructor(private readonly config: CodexRpcConfig) {}

  get endpoint() {
    return this.config.url;
  }

  async listModels() {
    return this.withConnection((connection) => {
      return connection.request("model/list", {
        includeHidden: true
      });
    });
  }

  async runBrowserPrompt(request: CodexBrowserRunRequest) {
    const { signal } = request;

    if (signal?.aborted) {
      throw new CodexAbortError();
    }

    await this.withConnection(async (connection) => {
      let activeTurnId = "";
      let finishRun: (() => void) | null = null;
      let failRun: ((error: Error) => void) | null = null;

      const turnCompleted = new Promise<void>((resolve, reject) => {
        finishRun = resolve;
        failRun = reject;
      });

      const timeout = setTimeout(() => {
        failRun?.(new Error("Codex turn timed out before completion."));
      }, this.config.turnTimeoutMs ?? 600000);

      // Aborting closes the WebSocket connection, which causes the running turn
      // to stop on the Codex app-server side instead of finishing silently.
      const onAbort = () => {
        failRun?.(new CodexAbortError());
        connection.close();
      };

      if (signal) {
        signal.addEventListener("abort", onAbort, { once: true });

        // The connection may have been opened while the signal was already
        // aborted; addEventListener does not fire for an already-aborted signal.
        if (signal.aborted) {
          onAbort();
        }
      }

      connection.onClose = () => {
        failRun?.(new Error("Codex app-server connection closed before the turn completed."));
      };

      connection.onNotification = (notification) => {
        if (notification.method === "turn/completed") {
          const params = notification.params as { turn?: { id?: string } } | undefined;

          if (!activeTurnId || params?.turn?.id === activeTurnId) {
            request.onNotification(notification);
            finishRun?.();
          }

          return;
        }

        if (notification.method === "error") {
          const params = notification.params as { error?: unknown; willRetry?: boolean } | undefined;

          if (activeTurnId && !notificationBelongsToTurn(notification, activeTurnId)) {
            return;
          }

          request.onNotification(notification);

          if (!params?.willRetry) {
            failRun?.(new Error(formatCodexError(params?.error)));
          }

          return;
        }

        if (!activeTurnId) {
          return;
        }

        if (!notificationBelongsToTurn(notification, activeTurnId)) {
          return;
        }

        request.onNotification(notification);
      };

      connection.onServerRequest = (message) => {
        connection.rejectServerRequest(message.id, "Browser assistant mode does not allow server-initiated tool requests.");

        if (activeTurnId && !notificationBelongsToTurn(message, activeTurnId)) {
          return;
        }

        request.onNotification({
          method: "broker/serverRequest/rejected",
          params: {
            method: message.method
          }
        });
      };

      const threadResponse = request.threadId
        ? await connection.request("thread/resume", {
            threadId: request.threadId,
            model: request.model,
            cwd: request.cwd,
            approvalPolicy: "never",
            sandbox: "read-only",
            excludeTurns: true,
            persistExtendedHistory: false
          })
        : await connection.request("thread/start", {
            model: request.model,
            cwd: request.cwd,
            approvalPolicy: "never",
            sandbox: "read-only",
            serviceName: request.serviceName ?? "codex-spark-browser",
            ephemeral: false,
            experimentalRawEvents: false,
            persistExtendedHistory: false
          });

      const threadId = extractThreadId(threadResponse) ?? request.threadId;

      if (!threadId) {
        throw new Error("Codex app-server did not return a thread id.");
      }

      request.onNotification({
        method: "broker/thread",
        params: {
          threadId,
          thread: threadResponse
        }
      });

      const turnResponse = await connection.request("turn/start", {
        threadId,
        input: [
          {
            type: "text",
            text: request.prompt,
            text_elements: []
          }
        ],
        cwd: request.cwd,
        model: request.model,
        approvalPolicy: "never",
        sandboxPolicy: {
          type: "readOnly",
          networkAccess: false
        }
      });

      activeTurnId = extractTurnId(turnResponse) ?? "";

      request.onNotification({
        method: "broker/turn",
        params: {
          turnId: activeTurnId,
          turn: turnResponse
        }
      });

      try {
        await turnCompleted;
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", onAbort);
      }
    });
  }

  private async withConnection<T>(callback: (connection: CodexRpcConnection) => Promise<T>) {
    const connection = new CodexRpcConnection(this.config);

    try {
      await connection.connect();
      await connection.initialize();
      return await callback(connection);
    } finally {
      connection.close();
    }
  }
}

class CodexRpcConnection {
  private nextId = 1;
  private pending = new Map<JsonRpcId, PendingRequest>();
  private ws: WebSocketLike | null = null;

  onNotification: ((notification: CodexRpcNotification) => void) | null = null;
  onServerRequest: ((message: { id: JsonRpcId; method: string; params?: unknown }) => void) | null = null;
  onClose: (() => void) | null = null;

  constructor(private readonly config: CodexRpcConfig) {}

  async connect() {
    if (this.config.token) {
      throw new Error("CODEX_WS_TOKEN is set, but this Broker currently supports local loopback app-server without WebSocket auth headers.");
    }

    if (typeof WebSocket === "undefined") {
      throw new Error("WebSocket runtime is unavailable. Use Node.js 22+ for the Broker.");
    }

    const ws = new WebSocket(this.config.url) as WebSocketLike;
    this.ws = ws;

    ws.addEventListener("message", (event) => {
      this.handleMessage(String(event.data));
    });

    ws.addEventListener("close", () => {
      this.rejectAllPending(new Error("Codex app-server connection closed."));
      this.onClose?.();
    });

    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve(), { once: true });
      ws.addEventListener(
        "error",
        () => {
          reject(new Error(`Cannot connect to Codex app-server at ${this.config.url}. Start it with: codex app-server --listen ${this.config.url}`));
        },
        { once: true }
      );
    });
  }

  async initialize() {
    await this.request("initialize", {
      clientInfo: {
        name: "codex-spark-broker",
        title: "Codex Spark Broker",
        version: "0.1.0"
      },
      capabilities: {
        experimentalApi: true
      }
    });

    this.notify("initialized");
  }

  request(method: string, params?: unknown) {
    const id = this.nextId++;
    const message: JsonRpcMessage = {
      jsonrpc: "2.0",
      id,
      method
    };

    if (params !== undefined) {
      message.params = params;
    }

    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });

      try {
        this.send(message);
      } catch (error) {
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error("Failed to send Codex JSON-RPC request."));
      }
    });
  }

  notify(method: string, params?: unknown) {
    const message: JsonRpcMessage = {
      jsonrpc: "2.0",
      method
    };

    if (params !== undefined) {
      message.params = params;
    }

    this.send(message);
  }

  rejectServerRequest(id: JsonRpcId, message: string) {
    this.send({
      jsonrpc: "2.0",
      id,
      error: {
        code: -32000,
        message
      }
    });
  }

  close() {
    if (this.ws?.readyState === 1) {
      this.ws.close();
    }
  }

  private send(message: JsonRpcMessage) {
    if (!this.ws || this.ws.readyState !== 1) {
      throw new Error("Codex app-server WebSocket is not open.");
    }

    this.ws.send(JSON.stringify(message));
  }

  private handleMessage(raw: string) {
    let message: JsonRpcMessage;

    try {
      message = JSON.parse(raw) as JsonRpcMessage;
    } catch {
      this.onNotification?.({
        method: "broker/protocol/error",
        params: {
          message: "Invalid JSON-RPC message from Codex app-server."
        }
      });
      return;
    }

    const hasId = Object.prototype.hasOwnProperty.call(message, "id");
    const hasMethod = typeof message.method === "string";

    if (hasId && !hasMethod) {
      const pending = this.pending.get(message.id as JsonRpcId);

      if (!pending) {
        return;
      }

      this.pending.delete(message.id as JsonRpcId);

      if (message.error) {
        pending.reject(new Error(message.error.message || "Codex app-server JSON-RPC error."));
        return;
      }

      pending.resolve(message.result);
      return;
    }

    if (hasId && hasMethod) {
      this.onServerRequest?.({
        id: message.id as JsonRpcId,
        method: message.method as string,
        params: message.params
      });
      return;
    }

    if (hasMethod) {
      this.onNotification?.({
        method: message.method as string,
        params: message.params
      });
    }
  }

  private rejectAllPending(error: Error) {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }

    this.pending.clear();
  }
}

function extractThreadId(response: unknown) {
  const value = response as { thread?: { id?: string } } | undefined;
  return value?.thread?.id;
}

function extractTurnId(response: unknown) {
  const value = response as { turn?: { id?: string } } | undefined;
  return value?.turn?.id;
}

function notificationBelongsToTurn(notification: { params?: unknown }, turnId: string) {
  const value = notification.params as { turnId?: unknown; turn?: { id?: unknown } } | undefined;

  if (!value || typeof value !== "object") {
    return false;
  }

  if (typeof value.turnId === "string") {
    return value.turnId === turnId;
  }

  if (typeof value.turn?.id === "string") {
    return value.turn.id === turnId;
  }

  return false;
}

function formatCodexError(error: unknown) {
  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }

  return "Codex turn failed.";
}
