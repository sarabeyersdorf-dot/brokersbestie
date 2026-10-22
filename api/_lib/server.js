// Shared by the server functions: who is asking, the database, and texting.
// Plain fetch against Supabase's REST API and Twilio's, so there are no
// packages to install or keep up to date.

export function env(name) {
  return process.env[name] || '';
}

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

// The signed-in user behind a request, checked with Supabase. null if none.
export async function caller(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || !env('SUPABASE_URL')) return null;
  const r = await fetch(`${env('SUPABASE_URL')}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: env('SUPABASE_ANON_KEY') || env('SUPABASE_SERVICE_ROLE_KEY') }
  });
  return r.ok ? r.json() : null;
}

// Service-role REST call. Only used for rows the code has already checked.
export async function db(path, { method = 'GET', body, prefer } = {}) {
  const r = await fetch(`${env('SUPABASE_URL')}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: env('SUPABASE_SERVICE_ROLE_KEY'),
      Authorization: `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`database ${r.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

export function e164(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return d ? `+${d}` : '';
}

export async function sendText(to, body) {
  const sid = env('TWILIO_ACCOUNT_SID');
  const tok = env('TWILIO_AUTH_TOKEN');
  const from = env('TWILIO_FROM');
  if (!sid || !tok || !from) throw new Error('Texting is not set up (TWILIO_* variables)');
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${tok}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: e164(to), From: from, Body: body })
  });
  if (!r.ok) throw new Error(`Twilio ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// The words the contact receives. One definition, used by "Send help now" and
// by the overdue job.
export function alertText(c, { overdue }) {
  const where = c.place || 'a showing';
  const who = c.meeting_name ? ` meeting ${c.meeting_name}${c.meeting_phone ? ` (${c.meeting_phone})` : ''}` : '';
  const map = c.lat != null ? ` Map: https://maps.google.com/?q=${c.lat},${c.lng}` : '';
  return overdue
    ? `Brokers Bestie safety alert: your teammate started a check-in at ${where}${who} and has not checked back in. Please call them now. If you can't reach them, call 911.${map}`
    : `Brokers Bestie: your teammate pressed SEND HELP at ${where}${who}. Call them now. If you can't reach them, call 911.${map}`;
}
