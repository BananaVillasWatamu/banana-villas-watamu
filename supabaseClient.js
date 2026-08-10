// Public Supabase config — safe to expose in the browser, access is
// restricted by the Row Level Security policies in supabase/schema.sql.
// Fill these in from Supabase dashboard -> Project Settings -> API.
const SUPABASE_URL = 'https://fczgozewxssmiuktkejd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjemdvemV3eHNzbWl1a3RrZWpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzODYzNDQsImV4cCI6MjEwMTk2MjM0NH0.mUkmHYHlXVfPz_gvWe-gniec0KsisF6BmHcyvEjVpqQ';

// Named sbClient (not `supabase`) to avoid clashing with the `supabase`
// global the CDN script exposes.
const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
