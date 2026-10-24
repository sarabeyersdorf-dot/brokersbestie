// Filled in once the Supabase project exists (see README, "Turn on team mode").
// Both values are safe to publish: the anon key only reaches what the row-level
// security in db/001_schema.sql allows a signed-in team member to reach.
// Left empty, the app runs in phone-only mode: everything is saved on this
// device and nothing leaves it.
export const SUPABASE_URL = 'https://bycsdukxwzkahaxnkmgb.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5Y3NkdWt4d3prYWhheG5rbWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3NTg4OTQsImV4cCI6MjEwODMzNDg5NH0.wBBbeQDO94gy8k0neP1u3CtrtSP6uZrnNBgSTKLhziI';

// Automatic safety texts from the server. Off until Twilio is set up in Vercel
// AND the check-in job runs every 5 minutes (Vercel Pro; vercel.json). While
// off, every agent is told the truth: this phone buzzes and opens the text.
export const AUTO_SAFETY = false;

// Shown at the bottom of Settings and in feedback emails. Must equal VERSION
// in sw.js (test/install.test.mjs checks), so it says which copy a phone runs.
export const APP_VERSION = 'bb-v29';

// Dropbox Chooser app key (public by design; the domains it may be used on are
// set in the Dropbox App Console). Empty: "From Dropbox" explains the Files app
// route instead.
export const DROPBOX_APP_KEY = '';
