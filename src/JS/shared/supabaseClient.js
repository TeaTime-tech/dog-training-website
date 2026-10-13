/* Supabase connection. Load after the supabase-js CDN script and before any script that talks to the database.
   Find both values in the Supabase dashboard: Project Settings > API.
   The anon (public) key is safe to ship in the browser; row level security in supabase/*.sql protects the data.
   Never put the service_role key here. */

const SUPABASE_URL = "https://xmkwwhohmzrihrzebqzo.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhta3d3aG9obXpyaWhyemVicXpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4NzEzMDYsImV4cCI6MjEwNjQ0NzMwNn0.9xWmw-iNX7vzS1K_mKKgb2iN-RQETLYJwTWANZ2Eg0w";

// null when the keys haven't been filled in or the CDN script didn't load (e.g. offline),
// so pages keep working on localStorage alone
const supabaseClient = window.supabase && !SUPABASE_URL.includes("YOUR-PROJECT-ID")
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

// the signed-in user, or null if signed out / Supabase unavailable
async function getSignedInUser() {
    if (!supabaseClient) return null;
    const { data } = await supabaseClient.auth.getSession();
    return data.session ? data.session.user : null;
}

// today's date as YYYY-MM-DD in the browser's time zone
function localDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}
