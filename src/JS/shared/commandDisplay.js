/* Per-command display settings: which fields show for each command on the Log form and Today page.
   Cached in localStorage ("commandDisplaySettings", keyed by lowercase command name) and synced with the
   signed-in account's account_settings.command_display. Needs supabaseClient.js loaded first. */

const COMMAND_DISPLAY_STORAGE_KEY = "commandDisplaySettings";
// set while a local change hasn't reached the account yet, so the next sync uploads it instead of overwriting it
const COMMAND_DISPLAY_PENDING_KEY = "commandDisplayPending";
// the account id the cached settings belong to, so another account never inherits them
const COMMAND_DISPLAY_OWNER_KEY = "commandDisplayOwner";

// every field a command can show or hide; score and weather aren't logged yet, so their settings have no effect
const COMMAND_DISPLAY_FIELDS = ["score", "repetitions", "duration", "location", "distractions", "weather"];

// all saved settings, or {} if none are saved or storage is unreadable
function readAllCommandDisplay() {
    try {
        return JSON.parse(localStorage.getItem(COMMAND_DISPLAY_STORAGE_KEY)) || {};
    } catch {
        return {};
    }
}

// which fields show for a command, as { field: true/false }; fields never turned off show
function getCommandDisplay(command) {
    const saved = readAllCommandDisplay()[String(command || "").toLowerCase()] || {};
    return Object.fromEntries(COMMAND_DISPLAY_FIELDS.map((field) => [field, saved[field] !== false]));
}

// save which fields show for a command in this browser, then send it to the account
function setCommandDisplay(command, display) {
    const all = readAllCommandDisplay();
    all[String(command || "").toLowerCase()] = Object.fromEntries(
        COMMAND_DISPLAY_FIELDS.map((field) => [field, display[field] !== false])
    );
    try {
        localStorage.setItem(COMMAND_DISPLAY_STORAGE_KEY, JSON.stringify(all));
        localStorage.setItem(COMMAND_DISPLAY_PENDING_KEY, "1");
    } catch (error) {
        console.error("Could not save display settings:", error);
    }
    return syncCommandDisplay();
}

// upload this browser's settings to the account; true when saved
async function uploadCommandDisplay(user) {
    const { error } = await supabaseClient
        .from("account_settings")
        .upsert(
            { account_id: user.id, command_display: readAllCommandDisplay(), updated_at: new Date().toISOString() },
            { onConflict: "account_id" }
        );
    if (error) throw error;
    localStorage.removeItem(COMMAND_DISPLAY_PENDING_KEY);
    return true;
}

// sync with the account: upload a pending local change, otherwise take the account's copy.
// fires "commanddisplaysynced" (detail.changed) so pages can redraw. Returns false on error, null when signed out
async function syncCommandDisplay() {
    const user = await getSignedInUser();
    if (!user) return null;

    try {
        // this browser's settings belong to a different account: start from this account's instead
        const owner = localStorage.getItem(COMMAND_DISPLAY_OWNER_KEY);
        if (owner && owner !== user.id) clearCommandDisplayForLogOut();
        localStorage.setItem(COMMAND_DISPLAY_OWNER_KEY, user.id);

        const { data, error } = await supabaseClient.from("account_settings").select("command_display").maybeSingle();
        if (error) throw error;
        const accountCopy = data && data.command_display;
        const hasAccountCopy = accountCopy && Object.keys(accountCopy).length > 0;

        // a change made here is waiting, or the account has nothing yet: this browser's copy wins
        if (localStorage.getItem(COMMAND_DISPLAY_PENDING_KEY) || !hasAccountCopy) {
            if (Object.keys(readAllCommandDisplay()).length > 0) await uploadCommandDisplay(user);
            window.dispatchEvent(new CustomEvent("commanddisplaysynced", { detail: { changed: false } }));
            return true;
        }

        const changed = JSON.stringify(accountCopy) !== JSON.stringify(readAllCommandDisplay());
        if (changed) localStorage.setItem(COMMAND_DISPLAY_STORAGE_KEY, JSON.stringify(accountCopy));
        window.dispatchEvent(new CustomEvent("commanddisplaysynced", { detail: { changed } }));
        return true;
    } catch (error) {
        console.error("Could not sync display settings:", error);
        return false;
    }
}

// before signing out (or when another account signs in): forget this browser's copy
function clearCommandDisplayForLogOut() {
    localStorage.removeItem(COMMAND_DISPLAY_STORAGE_KEY);
    localStorage.removeItem(COMMAND_DISPLAY_PENDING_KEY);
    localStorage.removeItem(COMMAND_DISPLAY_OWNER_KEY);
}

if (supabaseClient) syncCommandDisplay();
