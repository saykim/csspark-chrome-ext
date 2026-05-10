export type BrowserAction = "summarize" | "translate" | "analyze" | "document";

export type CapturedPage = {
  title: string;
  url: string;
  text: string;
  selectionText?: string;
  lang?: string;
  isSensitive?: boolean;
};

export type CaptureResponse =
  | {
      ok: true;
      page: CapturedPage;
    }
  | {
      ok: false;
      error: string;
    };
