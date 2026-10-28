// The team's billing state on the server: one place, used by /api/billing,
// the AI features (ai.js refuse) and CRM sync. The database itself enforces
// read-only with bb_can_write() (db/022); this answers the same question for
// server routes, which run with the service key and would otherwise bypass it.

import { db } from './server.js';
import { entitlement } from '../../js/billing.js';

export async function billingEnforced() {
  const rows = await db('bb_config?key=eq.billing_enforced&select=value').catch(() => []);
  return !!(rows[0] && rows[0].value === 'true');
}

export async function teamBilling(teamId) {
  const [b, t, m] = await Promise.all([
    db(`billing?team_id=eq.${teamId}&select=*`),
    db(`teams?id=eq.${teamId}&select=created_at`),
    db(`team_members?team_id=eq.${teamId}&select=user_id`)
  ]);
  return { billing: b[0] || null, created: t[0] && t[0].created_at, seats: Math.max(1, m.length) };
}

// null when the team may use paid features, else a plain-words refusal.
export async function lapsedReason(teamId) {
  if (!(await billingEnforced())) return null;
  const { billing, created } = await teamBilling(teamId);
  return entitlement(billing, created, { enforced: true }).canWrite ? null : 'Your trial or plan has ended. Choose a plan in Settings → Your plan to use this again.';
}
