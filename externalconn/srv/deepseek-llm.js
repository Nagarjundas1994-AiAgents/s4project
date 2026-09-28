import cds from '@sap/cds';
import { ChatOpenAI } from '@langchain/openai';

const LOG = cds.log('deepseek-llm');

/**
 * DeepSeek chat model for @cap-js/agents (A2A ReAct loop).
 *
 * DeepSeek exposes an OpenAI-compatible API, so we reuse LangChain's
 * ChatOpenAI with a custom baseURL. This gives us full tool-calling
 * support (bindTools) required by `createAgent`.
 *
 * Config resolution (first hit wins):
 *   model   : cds.requires.llm.model > cds.requires.deepseek.credentials.model
  *             > DEEPSEEK_MODEL env > 'deepseek-flash'
 *   apiKey  : cds.requires.llm.credentials.apiKey > cds.requires.deepseek.credentials.apiKey
 *             > DEEPSEEK_API_KEY env
 *   baseURL : cds.requires.llm.credentials.url > cds.requires.deepseek.credentials.url
 *             > DEEPSEEK_BASE_URL env > 'https://api.deepseek.com'
 *
 * NOTE: ChatOpenAI appends `/chat/completions` itself, so baseURL must be
 * the origin (https://api.deepseek.com), NOT the full .../chat/completions URL.
 */
export function resolveDeepSeekConfig(extra = {}) {
  const llmReq = cds.env.requires?.llm ?? {};
  const llmCreds = llmReq.credentials ?? {};
  const dsReq = cds.env.requires?.deepseek ?? {};
  const dsCreds = dsReq.credentials ?? {};

  const rawUrl =
    extra.url || llmCreds.url || dsCreds.url || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
  // Strip trailing /chat/completions or /v1 etc. — ChatOpenAI adds the path itself
  const baseURL = String(rawUrl)
    .replace(/\/chat\/completions\/?$/, '')
    .replace(/\/+$/, '');

  const model =
    extra.model || llmReq.model || llmCreds.model || dsCreds.model || process.env.DEEPSEEK_MODEL || 'deepseek-flash';

  const apiKey =
    extra.apiKey || llmCreds.apiKey || dsCreds.apiKey || process.env.DEEPSEEK_API_KEY || '';

  const temperature = extra.temperature ?? llmReq.temperature ?? 0;
  const maxTokens = extra.max_tokens ?? extra.maxTokens ?? llmReq.max_tokens ?? 4096;

  return { apiKey, baseURL, model, temperature, maxTokens };
}

export default class DeepSeekChatModel extends ChatOpenAI {
  constructor(name, options = {}) {
    const cfg = resolveDeepSeekConfig(options.credentials || options);
    if (!cfg.apiKey) {
      throw new Error(
        `[${name}] DeepSeek API key missing. Set DEEPSEEK_API_KEY in externalconn/.env ` +
          `or cds.requires.llm.credentials.apiKey. Got baseURL=${cfg.baseURL} model=${cfg.model}. ` +
          `See srv/deepseek.js header.`
      );
    }
    super({
      model: cfg.model,
      apiKey: cfg.apiKey,
      configuration: { baseURL: cfg.baseURL },
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
      // pass through any extra langchain opts (e.g. streaming flags from agents)
      ...options.chatOptions,
    });
    this.name = name;
    this.options = options;
    LOG.info(`DeepSeek LLM initialised for '${name}': model=${cfg.model} baseURL=${cfg.baseURL}`);
  }
}

// Required so @cap-js/agents treats this as a CDS service class
// (same marker as MockChatModel / ChatAnthropicService).
DeepSeekChatModel._is_service_class = true;
