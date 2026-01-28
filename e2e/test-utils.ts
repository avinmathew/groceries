import { Page, TestInfo } from '@playwright/test';

export async function clearClientState(page: Page) {
  await page.context().clearCookies();
  await page.goto('./');
  await page.evaluate(async () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // ignore storage access errors in restricted contexts
    }
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase('GroceriesOfflineDB');
      request.onsuccess = () => resolve(null);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
  });
}

type DebugCollector = {
  attach: (testInfo: TestInfo, page: Page) => Promise<void>;
};

export function setupDebugging(page: Page): DebugCollector {
  const consoleMessages: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];
  const apiResponses: string[] = [];

  page.on('console', (msg) => {
    const location = msg.location();
    const locationText = location.url
      ? ` (${location.url}:${location.lineNumber}:${location.columnNumber})`
      : '';
    consoleMessages.push(`[${msg.type()}] ${msg.text()}${locationText}`);
  });

  page.on('pageerror', (error) => {
    pageErrors.push(error.stack || error.message || String(error));
  });

  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? 'unknown';
    requestFailures.push(`[requestfailed] ${request.method()} ${request.url()} - ${failure}`);
  });

  page.on('response', (response) => {
    const url = response.url();
    if (url.includes('/api/')) {
      apiResponses.push(`[response] ${response.status()} ${response.request().method()} ${url}`);
    }
  });

  const attachText = async (testInfo: TestInfo, name: string, lines: string[]) => {
    if (!lines.length) return;
    await testInfo.attach(name, {
      body: lines.join('\n'),
      contentType: 'text/plain',
    });
  };

  return {
    async attach(testInfo, page) {
      if (testInfo.status === testInfo.expectedStatus) return;

      await attachText(testInfo, 'console.log', consoleMessages);
      await attachText(testInfo, 'page-errors.log', pageErrors);
      await attachText(testInfo, 'request-failures.log', requestFailures);
      await attachText(testInfo, 'api-responses.log', apiResponses);

      let lastUrl = 'page closed';
      if (!page.isClosed()) {
        try {
          lastUrl = page.url();
        } catch {
          lastUrl = 'page closed';
        }
      }

      await testInfo.attach('last-url.txt', {
        body: lastUrl,
        contentType: 'text/plain',
      });

      if (!page.isClosed()) {
        try {
          const html = await page.content();
          await testInfo.attach('page-content.html', {
            body: html,
            contentType: 'text/html',
          });
        } catch {
          // ignore failures while collecting debug content
        }
      }
    },
  };
}
