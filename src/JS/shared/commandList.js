/* Which commands an account has added and removed. Kept per account: cached in localStorage ("customCommands",
   "hiddenCommands") and synced with the signed-in account's account_settings.custom_commands / hidden_commands.
   Signed out, the lists belong to this browser only, and an account's lists are cleared from the browser when it logs out.
   Loaded on every page, after supabaseClient.js. */

const CUSTOM_COMMANDS_KEY = "customCommands";
const HIDDEN_COMMANDS_KEY = "hiddenCommands";
// set while a local change hasn't reached the account yet, so the next sync uploads it instead of overwriting it
const COMMAND_LIST_PENDING_KEY = "commandListPending";
// the account id the cached lists belong to; unset while signed out
const COMMAND_LIST_OWNER_KEY = "commandListOwner";

// a stored list of names, or [] if it's missing or unreadable
function readCommandList(key) {
    try {
        const list = JSON.parse(localStorage.getItem(key));
        return Array.isArray(list) ? list : [];
    } catch {
        return [];
    }
}

// commands this account (or this browser, signed out) added
function getCustomCommands() {
    return readCommandList(CUSTOM_COMMANDS_KEY);
}

// lowercase names of commands this account (or this browser, signed out) removed
function getHiddenCommands() {
    return readCommandList(HIDDEN_COMMANDS_KEY);
}

// save both lists in this browser, then send them to the account
function saveCommandLists(customCommands, hiddenCommands) {
    try {
        localStorage.setItem(CUSTOM_COMMANDS_KEY, JSON.stringify(customCommands));
        localStorage.setItem(HIDDEN_COMMANDS_KEY, JSON.stringify(hiddenCommands));
        if (localStorage.getItem(COMMAND_LIST_OWNER_KEY)) localStorage.setItem(COMMAND_LIST_PENDING_KEY, "1");
    } catch (error) {
        console.error("Could not save the command list:", error);
    }
    return syncCommandList();
}

function saveCustomCommands(customCommands) {
    return saveCommandLists(customCommands, getHiddenCommands());
}

function saveHiddenCommands(hiddenCommands) {
    return saveCommandLists(getCustomCommands(), hiddenCommands);
}

// tell pages the lists changed under them so they can redraw
function announceCommandListSynced(changed) {
    window.dispatchEvent(new CustomEvent("commandlistsynced", { detail: { changed } }));
}

// sync with the account: upload a pending local change, otherwise take the account's copy.
// an account that has never saved lists adopts this browser's (so lists made before signing up carry over).
// fires "commandlistsynced" (detail.changed). Returns false on error, null when signed out
async function syncCommandList() {
    const user = await getSignedInUser();
    if (!user) {
        // an account's lists are still here after it signed out somewhere they weren't cleared: drop them
        if (localStorage.getItem(COMMAND_LIST_OWNER_KEY)) {
            clearCommandListForLogOut();
            announceCommandListSynced(true);
        }
        return null;
    }

    try {
        // these lists belong to a different account: start from this account's instead
        const owner = localStorage.getItem(COMMAND_LIST_OWNER_KEY);
        if (owner && owner !== user.id) clearCommandListForLogOut();
        const adopting = !owner || owner !== user.id;
        const before = JSON.stringify([getCustomCommands(), getHiddenCommands()]);

        const { data, error } = await supabaseClient
            .from("account_settings")
            .select("custom_commands, hidden_commands")
            .maybeSingle();
        if (error) throw error;
        const hasAccountCopy = data && (data.custom_commands !== null || data.hidden_commands !== null);

        // a change made here is waiting, or the account has nothing yet: this browser's copy wins
        if (localStorage.getItem(COMMAND_LIST_PENDING_KEY) || !hasAccountCopy) {
            const { error: saveError } = await supabaseClient
                .from("account_settings")
                .upsert(
                    {
                        account_id: user.id,
                        custom_commands: getCustomCommands(),
                        hidden_commands: getHiddenCommands(),
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: "account_id" }
                );
            if (saveError) throw saveError;
            localStorage.removeItem(COMMAND_LIST_PENDING_KEY);
            localStorage.setItem(COMMAND_LIST_OWNER_KEY, user.id);
            announceCommandListSynced(before !== JSON.stringify([getCustomCommands(), getHiddenCommands()]));
            return true;
        }

        localStorage.setItem(CUSTOM_COMMANDS_KEY, JSON.stringify(data.custom_commands || []));
        localStorage.setItem(HIDDEN_COMMANDS_KEY, JSON.stringify(data.hidden_commands || []));
        localStorage.setItem(COMMAND_LIST_OWNER_KEY, user.id);
        const changed = adopting || before !== JSON.stringify([getCustomCommands(), getHiddenCommands()]);
        announceCommandListSynced(changed);
        return true;
    } catch (error) {
        console.error("Could not sync the command list:", error);
        return false;
    }
}

// before signing out (or when another account signs in): forget this account's lists, back to the defaults
function clearCommandListForLogOut() {
    localStorage.removeItem(CUSTOM_COMMANDS_KEY);
    localStorage.removeItem(HIDDEN_COMMANDS_KEY);
    localStorage.removeItem(COMMAND_LIST_PENDING_KEY);
    localStorage.removeItem(COMMAND_LIST_OWNER_KEY);
}

if (supabaseClient) syncCommandList();
