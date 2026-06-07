import type { CapturedPage } from "./types";

const contentWindow = window as typeof window & {
  __codexSparkContentLoaded?: boolean;
};

if (!contentWindow.__codexSparkContentLoaded) {
  contentWindow.__codexSparkContentLoaded = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "CAPTURE_PAGE") {
      return false;
    }

    sendResponse({
      ok: true,
      page: capturePage()
    });

    return true;
  });
}

function capturePage(): CapturedPage {
  const selectionText = window.getSelection()?.toString().trim() || undefined;
  const text = document.body?.innerText ?? "";

  return {
    title: document.title,
    url: location.href,
    text: cleanText(text).slice(0, 120000),
    selectionText: selectionText ? cleanText(selectionText).slice(0, 120000) : undefined,
    lang: document.documentElement.lang || navigator.language,
    isSensitive: isSensitivePage()
  };
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function isSensitivePage() {
  const url = location.href.toLowerCase();
  const sensitiveUrl = /\b(account|billing|checkout|payment|password|signin|login|auth)\b/.test(url);

  return hasVisiblePasswordField() || sensitiveUrl;
}

function hasVisiblePasswordField() {
  const fields = document.querySelectorAll<HTMLInputElement>('input[type="password"]');

  for (const field of fields) {
    if (isElementVisible(field)) {
      return true;
    }
  }

  return false;
}

function isElementVisible(element: HTMLElement) {
  const style = window.getComputedStyle(element);

  if (style.visibility === "hidden" || style.display === "none" || style.opacity === "0") {
    return false;
  }

  const rect = element.getBoundingClientRect();

  return rect.width > 0 && rect.height > 0;
}
