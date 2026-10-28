// Showing confirmations -> what to add (2026-10-27). Pure, tested in
// test/showings.test.mjs. The reading is api/read-showings.js; this decides,
// for each showing found, which property it is (an exact street match, else
// a new "Other agent's" property), whether it is new, a change to one
// already on the calendar, or a cancellation, and which codes are new.
import { matchProperty } from './parse.js';

export const toMin = (hhmm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

export function planShowings(found, data) {
  const props = data.properties || [];
  const events = data.events || [];
  const access = data.access || [];
  return (found || []).filter((s) => s && s.address && s.date).map((s) => {
    const p = matchProperty(s.address, props);
    const start = toMin(s.start);
    const end = toMin(s.end);
    const same = p ? events.filter((e) => e.property_id === p.id && e.kind === 'showing' && e.date === s.date && !e.cancelled) : [];
    const existing = same.find((e) => e.start_minutes === start) || (same.length === 1 ? same[0] : null);
    const cancel = s.status === 'cancelled' || s.status === 'declined';
    let action;
    if (cancel) action = existing ? 'cancel' : 'skip';
    else if (existing && existing.start_minutes === start) action = 'same';
    else if (existing) action = 'move';
    else action = 'add';
    const known = new Set(access.filter((a) => p && a.property_id === p.id).map((a) => String(a.code || '').toUpperCase()));
    const newCodes = (s.access || []).filter((a) => a && a.code && !known.has(String(a.code).toUpperCase()));
    return {
      showing: s, property: p, existing, action, start, minutes: start != null && end != null && end > start ? end - start : 30,
      newCodes, checked: action === 'add' || action === 'move' || action === 'cancel'
    };
  });
}

export const ACTION_WORDS = { add: 'New', move: 'Time changed', cancel: 'Canceled', same: 'Already on your calendar', skip: 'Canceled (not on your calendar)' };
