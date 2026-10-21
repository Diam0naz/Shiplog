import { NextResponse } from "next/server";

/**
 * Shared themed HTML response for OAuth callback pages.
 * Matches the app's design system (paper/card/ink/yellow/sea).
 */
function themedResponse(
  title: string,
  message: string,
  status: number = 200,
  options: { showClose?: boolean; isError?: boolean } = {}
): NextResponse {
  const { showClose = true, isError = false } = options;
  const accentColor = isError ? "var(--coral, #e85d5d)" : "var(--sea, #1b7461)";
  const accentBg = isError ? "color-mix(in srgb, var(--coral, #e85d5d) 15%, transparent)" : "color-mix(in srgb, var(--sea, #1b7461) 15%, transparent)";

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title} — shiplog</title>
  <style>
    :root {
      color-scheme: light dark;
      /* Page */
      --paper: #eceee8;
      --paper-2: #e2e6dd;
      --card: #f7f8f4;
      --ink: #0d2133;
      --ink-2: #3a4d5d;
      --ink-3: #566873;
      --rule: #c3cbc2;
      --rule-strong: #9aa8a2;
      /* Accents */
      --yellow: #f5c518;
      --navy: #0d2133;
      --sea: #1b7461;
      --coral: #e85d5d;
      --logo-bg: #0d2133;
      /* Terminals */
      --deck: #0c1b2a;
      --deck-2: #112638;
      --deck-3: #081624;
      --deck-fg: #e6edf2;
      --deck-dim: #8fa3b3;
      --deck-rule: #263d52;
      --deck-ok: #5cd6b0;
      --deck-edge: #0d2133;
      --focus: var(--ink);
      --font-body: system-ui, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
      --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --paper: #0a1622;
        --paper-2: #07111b;
        --card: #0f2030;
        --ink: #e8eef2;
        --ink-2: #aabbc8;
        --ink-3: #8499a8;
        --rule: #1f3549;
        --rule-strong: #34506a;
        --sea: #5cd6b0;
        --coral: #f47c7c;
        --logo-bg: #1b3b57;
        --deck: #0c1b2a;
        --deck-edge: #2a4259;
      }
    }
    *,
    *::before,
    *::after { box-sizing: border-box; }
    * { margin: 0; padding: 0; }
    html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
    body {
      min-height: 100dvh;
      background: var(--paper);
      color: var(--ink);
      font-family: var(--font-body);
      font-size: 1rem;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: var(--card);
      border: 1.5px solid var(--ink);
      border-radius: 4px;
      padding: 3rem 2rem;
      text-align: center;
      max-width: 420px;
      width: 100%;
      box-shadow: 4px 4px 0 var(--yellow);
    }
    .icon {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: ${accentColor};
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1.5rem;
      color: var(--paper);
      font-size: 32px;
      font-weight: 700;
    }
    h1 {
      font-weight: 800;
      font-size: 1.5rem;
      line-height: 1.2;
      letter-spacing: -0.01em;
      margin-bottom: 0.75rem;
    }
    p {
      color: var(--ink-2);
      font-size: 1rem;
      line-height: 1.6;
    }
    .details {
      margin-top: 1rem;
      padding: 1rem;
      background: ${accentBg};
      border: 1px solid ${accentColor};
      border-radius: 4px;
      font-family: var(--font-mono);
      font-size: 0.8125rem;
      color: var(--ink-2);
      text-align: left;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .brand {
      margin-top: 2rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--rule);
      font-size: 0.875rem;
      color: var(--ink-3);
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .close-hint {
      margin-top: 1rem;
      font-size: 0.875rem;
      color: var(--ink-3);
    }
    @media (prefers-reduced-motion: reduce) {
      .icon { animation: none; }
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${isError ? "✕" : "✓"}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    ${showClose ? '<p class="close-hint">You can close this tab and return to the CLI.</p>' : ''}
    <div class="brand">shiplog</div>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/**
 * Error response with themed page.
 */
function themedError(title: string, message: string, details?: string, status: number = 400): NextResponse {
  return themedResponse(title, message, status, { isError: true, showClose: true });
}

/**
 * Success response with themed page.
 */
function themedSuccess(title: string, message: string): NextResponse {
  return themedResponse(title, message, 200, { isError: false, showClose: true });
}

export { themedResponse, themedError, themedSuccess };