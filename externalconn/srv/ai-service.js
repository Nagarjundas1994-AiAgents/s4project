import cds from '@sap/cds';
import { answerWithDeepSeek, isDeepSeekConfigured } from './deepseek.js';
import DeepSeekChatModel from './deepseek-llm.js';

/**
 * AIAssistantService — native AI grounded on Books (sqlite) + S/4 (live OData v2).
 *
 * LLM backend: DeepSeek (OpenAI-compatible https://api.deepseek.com/chat/completions).
 * - Put your key in DEEPSEEK_API_KEY env var (see srv/deepseek.js header).
 * - If no key is set, actions fall back to grounded extractive answers
 *   so MCP/OData clients still see working output.
 */
export class AIAssistantService extends cds.ApplicationService {
  async init() {
    // Real LLM for the A2A ReAct loop (@cap-js/agents `buildModel`).
    // AIAssistantService is annotated with @agent (srv/ai-agent.cds),
    // so without this it falls back to llm-mock ("No real LLM was invoked").
    this.on('buildModel', async () => new DeepSeekChatModel('AIAssistantService', {}));
    // Explicit handlers with inline arrows (method names differ from action
    // names so CAP does not create colliding framework stubs).
    this.on('askBooks', async (req) => this.handleAskBooks(req));
    this.on('askBusinessPartner', async (req) => this.handleAskBusinessPartner(req));
    this.on('askAll', async (req) => this.handleAskAll(req));
    return super.init();
  }

  // ---------- local Books grounding ----------
  async groundBooks(question = '', limit = 5) {
    const q = (question || '').toLowerCase();
    const { Books } = cds.entities('sap.capire.bookshop');

    // naive keyword extraction: words >= 4 chars
    const keywords = q.split(/[^a-z0-9]+/i).filter((w) => w.length >= 4).slice(0, 5);

    let books = [];
    try {
      if (keywords.length) {
        // OR-search on title/descr (tagged-template where = safe params)
        const seen = new Set();
        for (const k of keywords) {
          const pat = `%${k}%`;
          const rows = await SELECT.from(Books).where`title like ${pat} or descr like ${pat}`.limit(limit);
          for (const r of rows) if (!seen.has(r.ID)) { seen.add(r.ID); books.push(r); }
          if (books.length >= limit) break;
        }
        books = books.slice(0, limit);
      }
      if (!books.length) books = await SELECT.from(Books).limit(limit);
      // enrich author name
      const authors = cds.entities('sap.capire.bookshop').Authors;
      for (const b of books) {
        if (b.author_ID && !b.author) {
          try {
            const a = await SELECT.one.from(authors).where({ ID: b.author_ID });
            if (a) b.authorName = a.name;
          } catch { /* ignore */ }
        }
      }
    } catch (e) {
      return { rows: [], note: `Books query failed: ${e.message}` };
    }
    return { rows: books, keywords };
  }

  // ---------- S/4 grounding ----------
  async groundS4(question = '', limit = 5) {
    const q = (question || '').toLowerCase();
    let entity = 'BusinessPartners';
    if (q.includes('address') || q.includes('city') || q.includes('berlin') || q.includes('postal')) entity = 'BusinessPartnerAddresses';
    else if (q.includes('supplier')) entity = 'Suppliers';
    else if (q.includes('customer')) entity = 'Customers';

    try {
      // Reuse the S/4 CAP service so auth/passthrough stays in one place
      const s4srv = await cds.connect.to('S4BusinessPartnerService');
      const rows = await s4srv.run(SELECT.from(s4srv.entities[entity]).limit(limit));
      return { rows, entity };
    } catch (e) {
      return { rows: [], entity, note: `S/4 query failed: ${e.message}` };
    }
  }

  // ---------- LLM polish via DeepSeek (replaces AI Core) ----------
  async polishWithDeepSeek(question, contextLabel, rows) {
    if (!isDeepSeekConfigured()) return null;
    try {
      return await answerWithDeepSeek(question, contextLabel, rows);
    } catch (e) {
      cds.log('ai').warn('DeepSeek call failed, using grounded fallback:', e.message);
      return null;
    }
  }

  fmtRows(rows, maxChars = 3000) {
    const s = JSON.stringify(rows, null, 2);
    return s.length > maxChars ? s.slice(0, maxChars) + '\n... (truncated)' : s;
  }

  async handleAskBooks(req) {
    const question = req.data?.question;
    if (!question) return req.error(400, 'Please provide `question`.');
    const g = await this.groundBooks(question, 5);
    const llm = await this.polishWithDeepSeek(question, 'Books', g.rows);
    if (llm) return llm;
    const names = g.rows.map((b) => ` - ${b.title}${b.authorName ? ` by ${b.authorName}` : ''} (ID=${b.ID}, stock=${b.stock ?? '?'})`).join('\n');
    return [
      `Books grounding for: "${question}"`,
      g.keywords?.length ? `keywords: ${g.keywords.join(', ')}` : 'showing top 5 books',
      names || '(no books found)',
      g.note ? `note: ${g.note}` : '',
    ].filter(Boolean).join('\n');
  }

  async handleAskBusinessPartner(req) {
    const question = req.data?.question;
    if (!question) return req.error(400, 'Please provide `question`.');
    const g = await this.groundS4(question, 5);
    const llm = await this.polishWithDeepSeek(question, `S/4 ${g.entity}`, g.rows);
    if (llm) return llm;
    return [
      `S/4 grounding [${g.entity}] for: "${question}"`,
      this.fmtRows(g.rows),
      g.note ? `note: ${g.note}` : '',
      'Source: live S/4HANA Cloud API_BUSINESS_PARTNER via S4BusinessPartnerService.',
    ].filter(Boolean).join('\n');
  }

  async handleAskAll(req) {
    const question = req.data?.question;
    if (!question) return req.error(400, 'Please provide `question`.');
    const [b, s] = await Promise.all([this.groundBooks(question, 3), this.groundS4(question, 3)]);
    const llm = await this.polishWithDeepSeek(question, 'Books + S/4', { Books: b.rows, [s.entity]: s.rows });
    if (llm) return llm;
    return [
      `Combined grounding for: "${question}"`,
      '[Books]',
      b.rows.map((x) => ` - ${x.title} (ID=${x.ID})`).join('\n') || '(none)',
      `[S/4:${s.entity}]`,
      this.fmtRows(s.rows, 2000),
      'Tip: call askBooks / askBusinessPartner for deeper drill-down.',
    ].join('\n');
  }
}
