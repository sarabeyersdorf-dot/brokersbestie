// Demo listings so a new agent (or a broker being shown the app) sees it full
// rather than empty. Every row is flagged `sample`: it never syncs to a team,
// and Settings has one button to clear it all. Codes and people are made up.

export function sampleData() {
  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const plus = (n) => iso(new Date(today.getTime() + n * 86400000));
  const P1 = 'sample-p1', P2 = 'sample-p2', P3 = 'sample-p3';
  return {
    properties: [
      { id: P1, address: '100 Sample Ridge Rd', city: 'Murphys, CA', status: 'listing', price: 799000, mls: '000000001', occupancy: 'O', well: true, septic: true, hoa: 'None', solar: 'Owned', directions: 'GPS stops short. Past the mailboxes, second drive on the right.', showing_notes: 'Text the owner 2 hours ahead. Friendly dog in the side yard.', lat: 38.137, lng: -120.455 },
      { id: P2, address: '200 Example St', city: 'Angels Camp, CA', status: 'escrow', price: 349000, mls: '000000002', occupancy: 'V', coe_date: plus(15), showing_notes: 'Vacant. Go direct.', lat: 38.064, lng: -120.540 },
      { id: P3, address: '300 Demo Ct', city: 'Valley Springs, CA', status: 'closed', price: 450000, occupancy: 'V', lat: 38.191, lng: -120.829 }
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
    trips: [
      { id: 'sample-r1', date: plus(-3), purpose: 'Listing appointment', from_place: 'Office', to_place: 'Murphys', miles: 16, property_id: P1 }
    ]
  };
}
