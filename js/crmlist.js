// The CRMs Bestie connects to, in the order Settings shows them. One list for
// the phone (Settings) and the server (api/_lib/crms.js): add a CRM here and
// give it a connector there. `soon` = shown but not connectable yet.
export const CRM_CHOICES = [
  { id: 'fub', label: 'Follow Up Boss', keyLabel: 'Follow Up Boss API key', help: 'In Follow Up Boss: Admin → API → Create API Key.', brings: 'your deals become properties (address, price, close date), the people on them become contacts, and appointments you made in Follow Up Boss go on the calendar' },
  { id: 'kvcore', label: 'kvCORE / BoldTrail', beta: true, keyLabel: 'kvCORE API token', help: 'In kvCORE: Lead Engine → Lead Dropbox → My API Tokens → make a “User” token. It lasts a year.', brings: 'your transactions become properties (address, price, close date) and their clients become contacts. kvCORE does not share appointments' },
  { id: 'lofty', label: 'Lofty', beta: true, keyLabel: 'Lofty API key', help: 'In Lofty: Settings → Integrations → API → create a key.', brings: 'your transactions become properties (address, price, close date), their leads become contacts, and Lofty appointments go on the calendar' },
  { id: 'cinc', label: 'CINC (coming soon)', soon: true, help: 'CINC only lets approved partner apps connect. Brokers Bestie is applying; until then, use Bestie on its own or with another CRM.' },
  { id: 'feed', label: 'Another CRM (Bestie feed link)' }
];
export const KEY_CRMS = CRM_CHOICES.filter((c) => !c.soon && c.id !== 'feed').map((c) => c.id);
