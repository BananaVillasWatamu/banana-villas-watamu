// Public Supabase config — safe to expose in the browser, access is
// restricted by the Row Level Security policies in supabase/schema.sql.
// Fill these in from Supabase dashboard -> Project Settings -> API.
const SUPABASE_URL = 'https://fczgozewxssmiuktkejd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjemdvemV3eHNzbWl1a3RrZWpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzODYzNDQsImV4cCI6MjEwMTk2MjM0NH0.mUkmHYHlXVfPz_gvWe-gniec0KsisF6BmHcyvEjVpqQ';

// Named sbClient (not `supabase`) to avoid clashing with the `supabase`
// global the CDN script exposes.
//
// That global comes from a <script> tag pointing at unpkg. If it's blocked
// (ad blockers catch CDNs), slow, or down, every loader on the page quietly
// falls back to the markup baked into the HTML — the built-in hero image,
// gallery and FAQs — and nothing says why. Say why.
if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error(
        '[Banana Villas] The Supabase library did not load, so nothing on this page ' +
        'is coming from the dashboard: the header slider, gallery, reviews and FAQs ' +
        'are all showing their built-in fallbacks. Check that ' +
        'https://unpkg.com/@supabase/supabase-js@2 is reachable from this browser.'
    );
}

const sbClient = window.supabase
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : undefined;
