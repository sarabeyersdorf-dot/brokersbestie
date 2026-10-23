// The one place the app talks to Claude. Used by read-sheet (an MLS sheet in,
// property facts out) and assist (a spoken command in, an app action out).
// Answers are forced into a JSON shape, so the screen never has to guess.

import Anthropic from '@anthropic-ai/sdk';
import { env, caller } from './server.js';

export const MODEL = 'claude-opus-5-5';

// Each call costs money, so once accounts exist only a signed-in agent may
// make one. Returns an error message, or null when the request may go ahead.
export async function refuse(req) {
  if (!env('ANTHROPIC_API_KEY')) return { status: 503, error: 'Reading and voice commands are not switched on yet (ANTHROPIC_API_KEY).' };
  if (env('SUPABASE_URL') && !(await caller(req))) return { status: 401, error: 'Sign in to use this' };
  return null;
}

// A failure the agent can act on, in plain words. Problems with the account
// are never retried: a second request would fail the same way.
export class AiError extends Error {}
function accountProblem(e) {
  const msg = String((e && e.message) || '');
  if (e && e.status === 401) return 'The Anthropic API key in Vercel is not valid. Copy it again from console.anthropic.com.';
  if (/credit balance|billing/i.test(msg)) return 'The Anthropic account needs credit: console.anthropic.com → Billing.';
  if (e && e.status === 403) return 'The Anthropic key is not allowed to use this model.';
  if (e && e.status === 429) return 'Too many requests at once. Try again in a minute.';
  return null;
}

function parseJson(text) {
  try { return JSON.parse(text); } catch {}
  const m = String(text).match(/\{[\s\S]*\}/); // a reply with words around the JSON
  if (m) return JSON.parse(m[0]);
  throw new AiError('The answer came back in a shape Bestie could not read');
}

// content: the message blocks (images, PDFs, then the instruction).
// Tried in order, simplest last: a newer option the account or model does not
// take (a 400) falls back to the next shape rather than failing the agent.
export async function askJson({ system, content, schema, effort = 'low', maxTokens = 4000 }) {
  const client = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY') });
  const base = { model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] };
  const shaped = { ...base, output_config: { effort, format: { type: 'json_schema', schema } } };
  const asked = { ...base, system: `${system}\n\nAnswer with only a JSON object that matches this JSON schema, nothing else:\n${JSON.stringify(schema)}` };
  const tries = [
    // If the model declines, the API re-runs the request on its recommended
    // fallback model instead of returning nothing.
    () => client.beta.messages.create({ ...shaped, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }),
    () => client.messages.create(shaped),
    () => client.messages.create(asked)
  ];
  let last;
  for (const run of tries) {
    let res;
    try {
      res = await run();
    } catch (e) {
      const plain = accountProblem(e);
      if (plain) throw new AiError(plain);
      console.warn('Claude request failed', e && e.status, e && e.message);
      last = e;
      if (e && (e.status === 400 || e.status === 404)) continue;
      throw new AiError('Claude is not answering right now. Try again in a minute.');
    }
    if (res.stop_reason === 'refusal') throw new AiError('Claude would not read that one');
    if (res.stop_reason === 'max_tokens') throw new AiError('That was too long to finish');
    return parseJson(res.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
  }
  throw new AiError(`Claude turned the request down: ${String((last && last.message) || '').slice(0, 200)}`);
}

// Helpers for writing the schemas: every field is required and may be null,
// which is the shape structured output handles most reliably.
export const S = {
  str: { type: ['string', 'null'] },
  num: { type: ['number', 'null'] },
  bool: { type: ['boolean', 'null'] },
  oneOf: (values) => ({ type: ['string', 'null'], enum: [...values, null] }),
  obj: (props) => ({ type: 'object', additionalProperties: false, required: Object.keys(props), properties: props }),
  list: (items) => ({ type: 'array', items })
};
