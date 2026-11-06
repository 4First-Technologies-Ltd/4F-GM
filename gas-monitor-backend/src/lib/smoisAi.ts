/**
 * Claude access for SMOIS (phase 4).
 *
 * Off unless ANTHROPIC_API_KEY is set. The model comes from SMOIS_AI_MODEL.
 * Callers pass only data the requesting admin may see; no contact details or
 * message bodies are ever sent. Output is a draft for a person to review.
 */
const API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-5-5';

export const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY && process.env.SMOIS_AI_ENABLED !== 'false';
export const aiModel = () => process.env.SMOIS_AI_MODEL || DEFAULT_MODEL;

/** Per-admin hourly limit, in memory: enough to stop a runaway loop on one instance. */
const hits = new Map<string, number[]>();
export function aiRateLimited(adminId: string, perHour = 30): boolean {
  const now = Date.now();
  const recent = (hits.get(adminId) ?? []).filter((t) => now - t < 3600_000);
  if (recent.length >= perHour) {
    hits.set(adminId, recent);
    return true;
  }
  hits.set(adminId, [...recent, now]);
  return false;
}

export class AiError extends Error {}

export async function askClaude(system: string, user: string, maxTokens = 1200): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new AiError('The AI assistant is not configured');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: aiModel(), max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] })
    });
    if (!res.ok) {
      // Never echo the provider body: it can contain request details.
      console.warn('[smois-ai] provider error', res.status);
      throw new AiError('The AI assistant could not answer right now. Try again shortly.');
    }
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (json.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n').trim();
    if (!text) throw new AiError('The AI assistant returned nothing');
    return text;
  } catch (e) {
    if (e instanceof AiError) throw e;
    console.warn('[smois-ai] request failed', (e as Error).name);
    throw new AiError('The AI assistant could not be reached');
  } finally {
    clearTimeout(timer);
  }
}

export const ANALYST_SYSTEM = [
  'You help the management of a Nigerian gas-technology company understand its social media department.',
  'Answer ONLY from the JSON data supplied. Never invent or estimate a number.',
  'If the data needed is missing, say it is not available. A null value means "not recorded", never zero.',
  'State the reporting period you used. Say whether figures were entered by hand or estimated, using the "source" fields.',
  'Show how any calculation was made. Do not credit shared account growth to individual people.',
  'Do not give employment verdicts; describe measured work only. Keep answers short and plain.'
].join(' ');

export const WRITER_SYSTEM = [
  'You draft social media copy for a Nigerian gas-technology company (the 4FG Smart Gas Monitor).',
  'Write clear, honest, friendly copy. Do not invent product claims, prices, statistics or customer quotes.',
  'Respect the platform limits mentioned. Return only the requested copy, no preamble.'
].join(' ');
