import type { CaptureResponse } from "./types";

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "CAPTURE_ACTIVE_TAB") {
    return false;
  }

  captureActiveTab()
    .then(sendResponse)
    .catch((error: unknown) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "페이지를 읽을 수 없습니다."
      });
    });

  return true;
});

async function captureActiveTab(): Promise<CaptureResponse> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    return {
      ok: false,
      error: "활성 탭을 찾을 수 없습니다."
    };
  }

  const existingResponse = await sendCaptureMessage(tab.id).catch((error: unknown) => {
    if (isMissingContentScriptError(error)) {
      return null;
    }

    throw error;
  });

  if (existingResponse) {
    return existingResponse;
  }

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["assets/content-script.js"]
  });

  return sendCaptureMessage(tab.id);
}

function sendCaptureMessage(tabId: number) {
  return chrome.tabs.sendMessage(tabId, { type: "CAPTURE_PAGE" }) as Promise<CaptureResponse>;
}

function isMissingContentScriptError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /receiving end does not exist|could not establish connection/i.test(message);
}
