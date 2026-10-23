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

// content: the message blocks (images, PDFs, then the instruction).
export async function askJson({ system, content, schema, effort = 'low', maxTokens = 4000 }) {
  const client = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY') });
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    // If the model declines, the API re-runs the request on its recommended
    // fallback model instead of returning nothing.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort, format: { type: 'json_schema', schema } },
    system,
    messages: [{ role: 'user', content }]
  });
  if (res.stop_reason === 'refusal') throw new Error('Could not read that one');
  if (res.stop_reason === 'max_tokens') throw new Error('That was too long to finish');
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return JSON.parse(text);
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
