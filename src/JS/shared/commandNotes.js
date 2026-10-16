/* Per-command notes: free text about each command (cues, hand signals, what works), written on the Commands page.
   Cached in localStorage ("commandNotes", keyed by lowercase command name) and synced with the signed-in
   account's account_settings.command_notes. Needs supabaseClient.js loaded first. */

const COMMAND_NOTES_STORAGE_KEY = "commandNotes";
// set while a local change hasn't reached the account yet, so the next sync uploads it instead of overwriting it
const COMMAND_NOTES_PENDING_KEY = "commandNotesPending";
// the account id the cached notes belong to, so another account never inherits them
const COMMAND_NOTES_OWNER_KEY = "commandNotesOwner";

// all saved notes, or {} if none are saved or storage is unreadable
function readAllCommandNotes() {
    try {
        return JSON.parse(localStorage.getItem(COMMAND_NOTES_STORAGE_KEY)) || {};
    } catch {
        return {};
    }
}

// one command's notes, or "" if it has none
function getCommandNote(command) {
    return readAllCommandNotes()[String(command || "").toLowerCase()] || "";
}

// save a command's notes in this browser (blank removes them), then send them to the account
function setCommandNote(command, text) {
    const all = readAllCommandNotes();
    const key = String(command || "").toLowerCase();
    const trimmed = String(text || "").trim();
    if (trimmed) {
        all[key] = trimmed;
    } else {
        delete all[key];
    }
    try {
        localStorage.setItem(COMMAND_NOTES_STORAGE_KEY, JSON.stringify(all));
        localStorage.setItem(COMMAND_NOTES_PENDING_KEY, "1");
    } catch (error) {
        console.error("Could not save command notes:", error);
    }
    return syncCommandNotes();
}

// move a renamed command's notes to its new name (nothing to do if it had none)
function renameCommandNote(oldName, newName) {
    const note = getCommandNote(oldName);
    if (!note || String(oldName).toLowerCase() === String(newName).toLowerCase()) return Promise.resolve(null);
    const all = readAllCommandNotes();
    delete all[String(oldName).toLowerCase()];
    all[String(newName).toLowerCase()] = note;
    try {
        localStorage.setItem(COMMAND_NOTES_STORAGE_KEY, JSON.stringify(all));
        localStorage.setItem(COMMAND_NOTES_PENDING_KEY, "1");
    } catch (error) {
        console.error("Could not save command notes:", error);
    }
    return syncCommandNotes();
}

// sync with the account: upload a pending local change, otherwise take the account's copy.
// fires "commandnotessynced" (detail.changed) so pages can redraw. Returns false on error, null when signed out
async function syncCommandNotes() {
    if (!supabaseClient) return null;
    const user = await getSignedInUser();
    if (!user) return null;

    try {
        // this browser's notes belong to a different account: start from this account's instead
        const owner = localStorage.getItem(COMMAND_NOTES_OWNER_KEY);
        if (owner && owner !== user.id) clearCommandNotesForLogOut();
        localStorage.setItem(COMMAND_NOTES_OWNER_KEY, user.id);

        if (localStorage.getItem(COMMAND_NOTES_PENDING_KEY)) {
            const { error } = await supabaseClient
                .from("account_settings")
                .upsert(
                    { account_id: user.id, command_notes: readAllCommandNotes(), updated_at: new Date().toISOString() },
                    { onConflict: "account_id" }
                );
            if (error) throw error;
            localStorage.removeItem(COMMAND_NOTES_PENDING_KEY);
            window.dispatchEvent(new CustomEvent("commandnotessynced", { detail: { changed: false } }));
            return true;
        }

        const { data, error } = await supabaseClient.from("account_settings").select("command_notes").maybeSingle();
        if (error) throw error;
        const accountCopy = (data && data.command_notes) || {};
        const changed = JSON.stringify(accountCopy) !== JSON.stringify(readAllCommandNotes());
        if (changed) localStorage.setItem(COMMAND_NOTES_STORAGE_KEY, JSON.stringify(accountCopy));
        window.dispatchEvent(new CustomEvent("commandnotessynced", { detail: { changed } }));
        return true;
    } catch (error) {
        console.error("Could not sync command notes:", error);
        return false;
    }
}

// before signing out (or when another account signs in): forget this browser's copy
function clearCommandNotesForLogOut() {
    localStorage.removeItem(COMMAND_NOTES_STORAGE_KEY);
    localStorage.removeItem(COMMAND_NOTES_PENDING_KEY);
    localStorage.removeItem(COMMAND_NOTES_OWNER_KEY);
}

if (supabaseClient) syncCommandNotes();
