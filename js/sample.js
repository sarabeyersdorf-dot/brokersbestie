// Demo listings so a new agent (or a broker being shown the app) sees it full
// rather than empty. Every row is flagged `sample`: it never syncs to a team,
// and Settings has one button to clear it all. Codes and people are made up.

export function sampleData({ now = new Date() } = {}) {
  const today = now;
  // The phone's own date, not UTC: after 5 PM in California UTC is already tomorrow.
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const plus = (n) => iso(new Date(today.getTime() + n * 86400000));
  const P1 = 'sample-p1', P2 = 'sample-p2', P3 = 'sample-p3', P4 = 'sample-p4', P5 = 'sample-p5';
  // A tour for today a couple of hours from now (Today shows "Up next");
  // opened late in the evening it is this morning's tour, already shown, so
  // Today shows the wrap-up instead.
  const nowMin = today.getHours() * 60 + today.getMinutes();
  const late = nowMin + 120 + 120 > 22 * 60;
  const t0 = late ? 600 : Math.ceil((nowMin + 120) / 15) * 15;
  const shown = (s) => (late ? { ...s, shown: true, shown_at: today.toISOString() } : s);
  return {
    properties: [
      { id: P1, address: '100 Sample Ridge Rd', city: 'Murphys, CA', status: 'listing', price: 799000, mls: '000000001', occupancy: 'O', well: true, septic: true, hoa: 'None', solar: 'Owned', directions: 'GPS stops short. Past the mailboxes, second drive on the right.', showing_notes: 'Text the owner 2 hours ahead. Friendly dog in the side yard.', lat: 38.137, lng: -120.455, gate_lat: 38.1378, gate_lng: -120.4561, heads_up: ['Cattle guard', 'Steep drive'], list_date: plus(-12) },
      { id: P2, address: '200 Example St', city: 'Angels Camp, CA', status: 'escrow', price: 349000, mls: '000000002', occupancy: 'V', coe_date: plus(15), showing_notes: 'Vacant. Go direct.', lat: 38.064, lng: -120.540 },
      { id: P3, address: '300 Demo Ct', city: 'Murphys, CA', status: 'closed', price: 450000, occupancy: 'V', lat: 38.171, lng: -120.418 },
      { id: P4, address: '305 Cedar Hollow Ln', city: 'Murphys, CA', status: 'tour', price: 625000, occupancy: 'V', showing_notes: 'Vacant. Lockbox on the back door.', lat: 38.142, lng: -120.468, heads_up: ['Low branches'] },
      { id: P5, address: '12 Oak Knoll Ct', city: 'Arnold, CA', status: 'tour', price: 540000, occupancy: 'O', showing_notes: 'Seller home with a cat. Shoes off.', lat: 38.255, lng: -120.351 }
    ],
    access: [
      { id: 'sample-a1', property_id: P1, kind: 'gate', label: 'Gate', code: '#2580', location_note: 'Keypad on the left post' },
      { id: 'sample-a2', property_id: P1, kind: 'alarm', label: 'Alarm', code: '7319', location_note: 'Panel inside the garage door' },
      { id: 'sample-a3', property_id: P1, kind: 'lockbox', label: 'Supra #18', location_note: 'Hose bib, left of the porch', status: 'out' },
      { id: 'sample-a4', property_id: P1, kind: 'sign', label: 'For Sale sign', location_note: 'Street frontage, east corner', status: 'out' },
      { id: 'sample-a5', property_id: P1, kind: 'utility', label: 'Septic lids', location_note: 'Back lawn, 20 ft off the deck' },
      { id: 'sample-a6', property_id: P2, kind: 'lockbox', label: 'Supra #31', code: '', location_note: 'On the gas meter', status: 'out' },
      { id: 'sample-a7', property_id: P2, kind: 'door', label: 'Side door', code: '5521', location_note: 'Keypad by the garage' },
      { id: 'sample-a8', property_id: P3, kind: 'sign', label: 'Sign + Sold rider', location_note: 'Front yard', status: 'out' }
    ],
    people: [
      { id: 'sample-m1', property_id: P1, name: 'Pat Sample', role: 'Seller', phone: '2095550101' },
      { id: 'sample-m2', property_id: P2, name: 'Jordan Sample', role: 'Escrow officer', phone: '2095550102', email: 'escrow@example.com' },
      { id: 'sample-m3', property_id: P2, name: 'Morgan Sample', role: "Buyer's agent", phone: '2095550103' }
    ],
    notes: [
      { id: 'sample-n1', property_id: P2, text: 'Seller is leaving the fridge and washer.' }
    ],
    dates: [
      { id: 'sample-d1', property_id: P2, label: 'Appraisal contingency', due: plus(4) },
      { id: 'sample-d2', property_id: P2, label: 'Close of escrow', due: plus(15) }
    ],
    tasks: [
      { id: 'sample-t1', property_id: P2, text: 'Order the home warranty', due: iso(today) }
    ],
    tours: [
      { id: 'sample-tour1', name: 'Smith · home tour', buyer: 'Jo Smith', buyer_phone: '2095550120', date: iso(today), start_minutes: t0 - 30, start_place: 'Office', miles: 38, stops: [
        shown({ id: 'sample-s1', address: '305 Cedar Hollow Ln, Murphys, CA', property_id: P4, occ: 'V', arrive: t0, leg_minutes: 22, leg_miles: 14, confirmed: true, code: '4417', code_label: 'Lockbox', agent: 'Kim Ray', agent_phone: '2095550111', ...(late ? { reaction: 'love' } : {}) }),
        shown({ id: 'sample-s2', address: '100 Sample Ridge Rd, Murphys, CA', property_id: P1, occ: 'O', arrive: t0 + 45, leg_minutes: 9, leg_miles: 4, confirmed: true, agent: 'Kelly Moore', agent_phone: '2095550113', ...(late ? { reaction: 'pricey' } : {}) }),
        shown({ id: 'sample-s3', address: '12 Oak Knoll Ct, Arnold, CA', property_id: P5, occ: 'O', arrive: t0 + 90, leg_minutes: 18, leg_miles: 12, confirmed: false, code: '#0912', agent: 'Lee Park', agent_phone: '2095550112', ...(late ? { reaction: 'again' } : {}) })
      ] },
      { id: 'sample-tour0', name: 'Smith · home tour', buyer: 'Jo Smith', date: plus(-6), start_minutes: 540, miles: 41, finished: true, stops: [
        { id: 'sample-s0a', address: '44 Pine Gulch Rd, Murphys, CA', occ: 'V', arrive: 570, shown: true, reaction: 'nope', reaction_note: 'Too close to the highway' },
        { id: 'sample-s0b', address: '9 Vista Ln, Angels Camp, CA', occ: 'O', arrive: 630, shown: true, reaction: 'maybe' }
      ] }
    ],
    events: [
      { id: 'sample-e1', title: 'Showing · buyer from Sonora', kind: 'showing', date: plus(1), start_minutes: 660, minutes: 30, property_id: P1, showing_agent: 'Dana Fox', showing_agent_phone: '2095550130' },
      { id: 'sample-e2', title: 'Inspection', kind: 'inspection', date: plus(2), start_minutes: 540, minutes: 120, property_id: P2 }
    ],
    visitors: [
      { id: 'sample-v1', property_id: P1, oh_date: plus(-2), first_name: 'Chris', last_name: 'Lane', phone: '2095550140', has_agent: false, also_selling: true, timeframe: '1-3 months', consent: true },
      { id: 'sample-v2', property_id: P1, oh_date: plus(-2), first_name: 'Sam', last_name: 'Ortiz', email: 'sam@example.com', has_agent: true, agent_name: 'Riley Ames', timeframe: 'Just looking', consent: false }
    ],
    vendors: [
      { id: 'sample-vd1', name: 'Taylor Brooks', company: 'Foothill Home Inspections', trade: 'Inspector', phone: '2095550150', favorite: true },
      { id: 'sample-vd2', name: 'Casey Reed', company: 'Gold Country Title', trade: 'Title / escrow', phone: '2095550151' }
    ],
    contacts: [
      { id: 'sample-c1', name: 'Jo Smith', phone: '2095550120', kind: 'buyer' },
      { id: 'sample-c2', name: 'Pat Sample', phone: '2095550101', kind: 'seller' }
    ],
    trips: [
      { id: 'sample-r1', date: plus(-3), purpose: 'Listing appointment', from_place: 'Office', to_place: 'Murphys', miles: 16, property_id: P1 }
    ]
  };
}
