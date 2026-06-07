import type { BrowserAction, BrowserPagePayload, DocumentFormat, TranslationTarget } from "@codex-spark/core";

export type NormalizedBrowserPage = BrowserPagePayload & {
  effectiveText: string;
  truncated: boolean;
};

const DEFAULT_MAX_CHARS = 60000;

export function normalizeBrowserPage(page: BrowserPagePayload, maxChars = DEFAULT_MAX_CHARS): NormalizedBrowserPage {
  const selection = cleanText(page.selectionText ?? "");
  const body = cleanText(page.text);
  const sourceText = selection || body;
  const effectiveText = sourceText.slice(0, maxChars);

  return {
    ...page,
    title: cleanText(page.title).slice(0, 300),
    url: page.url,
    text: body,
    selectionText: selection || undefined,
    effectiveText,
    truncated: sourceText.length > maxChars
  };
}

export type BrowserPromptOptions = {
  targetLanguage?: TranslationTarget;
  documentFormat?: DocumentFormat;
  customInstruction?: string;
};

const SYSTEM_GUIDE = [
  "너는 한국어로 답하는 정확성 우선 어시스턴트야.",
  "원문에 없는 사실을 지어내지 말고, 불확실하면 불확실하다고 표시해.",
  "추측과 사실은 구분해서 보여줘."
].join(" ");

export function buildFollowupPrompt(question: string) {
  const trimmed = cleanText(question).slice(0, 5000);

  return [
    SYSTEM_GUIDE,
    "이 대화의 앞선 분석 대상 페이지와 직전 답변 맥락을 유지한 채 이어지는 질문에 답해줘.",
    "맥락에서 확인되지 않는 내용은 모른다고 말하고 임의로 지어내지 마.",
    `질문: ${trimmed}`
  ].join("\n\n");
}

export function buildBrowserPrompt(action: BrowserAction, page: NormalizedBrowserPage, options: BrowserPromptOptions = {}) {
  const header = [
    `URL: ${page.url}`,
    `Title: ${page.title || "(untitled)"}`,
    page.lang ? `Language: ${page.lang}` : undefined,
    page.selectionText ? "Scope: selected text" : "Scope: visible page text",
    page.truncated ? "Note: content was truncated before analysis." : undefined
  ]
    .filter(Boolean)
    .join("\n");

  const instruction = instructionFor(action, options);

  return `${SYSTEM_GUIDE}\n\n${instruction}\n\n${header}\n\n--- CONTENT ---\n${page.effectiveText}`;
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function instructionFor(action: BrowserAction, options: BrowserPromptOptions) {
  const base = baseInstructionFor(action, options);
  const customInstruction = cleanText(options.customInstruction ?? "").slice(0, 5000);

  if (customInstruction) {
    return `${base}\n\n추가 사용자 요청(우선 반영): ${customInstruction}`;
  }

  return base;
}

function baseInstructionFor(action: BrowserAction, options: BrowserPromptOptions) {
  if (action === "summarize") {
    return [
      "다음 웹페이지를 요약해줘.",
      "출력 형식:",
      "1. 한 줄 결론",
      "2. 핵심 요약 5개 이하",
      "3. 중요한 사실/수치",
      "4. 사용자가 기억할 점",
      "의견이나 해석보다 원문 내용 압축을 우선해."
    ].join("\n");
  }

  if (action === "analyze") {
    return [
      "다음 웹페이지의 의미를 분석해줘.",
      "출력 형식:",
      "1. 글의 의도",
      "2. 숨은 전제",
      "3. 이해관계자/맥락",
      "4. 신뢰도 리스크",
      "5. 반론 가능성",
      "6. 사용자가 취할 행동",
      "단순 요약이 아니라 해석과 판단을 분리해서 보여줘."
    ].join("\n");
  }

  if (action === "translate") {
    const target = languageLabel(options.targetLanguage ?? "ko");

    return [
      `다음 웹페이지 또는 선택 영역을 ${target}로 번역해줘.`,
      "출력 형식:",
      "1. 자연스러운 번역문",
      "2. 애매한 표현/전문용어 메모",
      "기술 용어와 고유명사는 의미가 흐려지지 않게 유지해."
    ].join("\n");
  }

  const format = options.documentFormat ?? "markdown";

  if (format === "html") {
    return [
      "다음 웹페이지 내용을 재사용 가능한 HTML 문서로 변환해줘.",
      "출력 형식:",
      "<article> 루트 요소를 사용하고, <h1>, <section>, <h2>, <ul>, <p>로 구조화해.",
      "인라인 스타일, script, 외부 리소스는 넣지 마.",
      "원문을 그대로 복붙하지 말고 문서형으로 재구성해."
    ].join("\n");
  }

  return [
    "다음 웹페이지 내용을 재사용 가능한 Markdown 문서로 변환해줘.",
    "출력 형식:",
    "# 제목",
    "## 요약",
    "## 핵심 내용",
    "## 체크리스트",
    "## 참고 메모",
    "원문을 그대로 복붙하지 말고 문서형으로 재구성해."
  ].join("\n");
}

function languageLabel(language: TranslationTarget) {
  return {
    ko: "한국어",
    en: "영어",
    ja: "일본어",
    zh: "중국어"
  }[language];
}
