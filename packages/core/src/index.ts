export type RunMode = "read" | "edit";
export type BrowserAction = "summarize" | "translate" | "analyze" | "document";
export type TranslationTarget = "ko" | "en" | "ja" | "zh";
export type DocumentFormat = "markdown" | "html";
export type ModelSelection = "auto" | string;

export type ThreadSummary = {
  id: string;
  title: string;
  cwd: string;
  model: string;
  updatedAt: string;
};

export type BrokerHealth = {
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

export type BrokerSettings = {
  defaultModel: string;
  actionModels: Record<BrowserAction, ModelSelection>;
  allowedOrigins: string[];
  maxPageTextChars: number;
};

export type RunStreamRequest = {
  prompt: string;
  threadId?: string;
  cwd: string;
  model: string;
  mode: RunMode;
  appName: string;
};

export type BrowserPagePayload = {
  title: string;
  url: string;
  text: string;
  selectionText?: string;
  lang?: string;
  isSensitive?: boolean;
};

export type BrowserActionStreamRequest = {
  action: BrowserAction;
  page: BrowserPagePayload;
  model?: string;
  threadId?: string;
  source: "chrome-extension";
  options?: {
    targetLanguage?: TranslationTarget;
    documentFormat?: DocumentFormat;
    customInstruction?: string;
  };
};

export type AssistantEvent =
  | {
      type: "thread";
      threadId: string;
    }
  | {
      type: "message";
      text: string;
    }
  | {
      type: "status";
      label: string;
    }
  | {
      type: "done";
    };
