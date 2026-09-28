import cds from '@sap/cds';

const DEFAULT_BASE_URL = 'https://api.deepseek.com/chat/completions';
const DEFAULT_MODEL = 'deepseek-flash'; // current DeepSeek lineup: deepseek-flash (V4.1 Flash), deepseek-v4-pro

/**
 * Where to put your DeepSeek API key (pick ONE):
 *
 *  Option A (recommended, local dev): create a file `.env` in the
 *   `externalconn/` folder (next to package.json) with:
 *     DEEPSEEK_API_KEY=sk-xxxx
 *
 *  Option B: set an environment variable before starting cds:
 *   PowerShell:  $env:DEEPSEEK_API_KEY="sk-xxxx"; cds watch
 *   cmd / Linux: set DEEPSEEK_API_KEY=sk-xxxx
 *
 *  Option C: package.json -> cds.requires.deepseek.credentials.apiKey
 *   (not recommended for secrets — use env var instead).
 */
export function getDeepSeekConfig() {
  const required = cds.env.requires?.deepseek ?? {};
  const creds = required.credentials ?? {};
  const apiKey = creds.apiKey || process.env.DEEPSEEK_API_KEY || '';
  // credentials.url may be the bare origin (for ChatOpenAI, which appends the
  // path itself) or the full .../chat/completions URL. Raw fetch needs the full path.
  const raw = creds.url || process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL;
  const baseURL = /\/chat\/completions\/?$/.test(raw)
    ? raw
    : raw.replace(/\/+$/, '') + '/chat/completions';
  const model = creds.model || process.env.DEEPSEEK_MODEL || DEFAULT_MODEL;
  return { apiKey, baseURL, model };
}

export function isDeepSeekConfigured() {
  return !!getDeepSeekConfig().apiKey;
}

/**
 * Raw OpenAI-compatible chat call to DeepSeek.
 * @param {Array<{role:string, content:string}>} messages
 * @param {object} [opts] e.g. { temperature, max_tokens }
 */
export async function chatWithDeepSeek(messages, opts = {}) {
  const { apiKey, baseURL, model } = getDeepSeekConfig();
  if (!apiKey) {
    throw new Error(
      'DeepSeek API key missing. Set DEEPSEEK_API_KEY env var (see srv/deepseek.js header).'
    );
  }
  const res = await fetch(baseURL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.max_tokens ?? 1000,
      stream: false,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`DeepSeek call failed (${res.status}): ${text.slice(0, 500)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error(`Unexpected DeepSeek response: ${JSON.stringify(data).slice(0, 500)}`);
  return content;
}

/**
 * Convenience: ask DeepSeek a grounded question.
 * @param {string} question user question
 * @param {string} contextLabel e.g. 'Books' / 'S/4 BusinessPartners'
 * @param {unknown} contextData JSON-serializable grounding rows
 */
export async function answerWithDeepSeek(question, contextLabel, contextData) {
  const contextStr = JSON.stringify(contextData, null, 2).slice(0, 12000);
  const system = [
    'You are a helpful assistant for an SAP CAP application.',
    `Answer ONLY from the provided ${contextLabel} JSON context.`,
    'If the answer is not in the context, say so explicitly.',
    'Be concise. Cite IDs / names where relevant.',
  ].join(' ');
  return chatWithDeepSeek([
    { role: 'system', content: system },
    {
      role: 'user',
      content: `Question: ${question}\n\n${contextLabel} context (JSON):\n${contextStr}`,
    },
  ]);
}
