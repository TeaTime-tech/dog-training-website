/* Training session history: kept in localStorage ("sessionHistory") and synced with the signed-in
   account's training_sessions rows in Supabase. Needs supabaseClient.js.

   Pages read with getSessionHistory() and write with setSessionHistory(); never write the key directly,
   or edits and deletes won't reach the account. Each session gets an id (shared with its Supabase row),
   updatedAt, and two sync flags: inCloud (a row exists for it) and dirty (local changes not uploaded yet).
   Sync runs on every page that loads this file; pages listen for "sessionhistorysynced" to redraw. */

const SESSION_HISTORY_KEY = "sessionHistory";
const DELETED_SESSION_IDS_KEY = "deletedSessionIds";
const SESSION_HISTORY_OWNER_KEY = "sessionHistoryOwner";
const SESSION_FETCH_PAGE_SIZE = 1000;

// parse a localStorage JSON value, or the fallback if it's missing or broken
function readStoredJson(key, fallback) {
    try {
        return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
        return fallback;
    }
}

// a random UUID; crypto.randomUUID only exists on https/localhost, so build one by hand otherwise
function newSessionId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// a session's fields without the sync bookkeeping, for spotting real edits
function sessionContent(session) {
    const { updatedAt, inCloud, dirty, ...content } = session;
    return JSON.stringify(content);
}

// all sessions, giving any that predate syncing an id so they can be uploaded
function getSessionHistory() {
    const history = readStoredJson(SESSION_HISTORY_KEY, []);
    const missingIds = history.filter((session) => !session.id);
    if (missingIds.length) {
        const now = new Date().toISOString();
        missingIds.forEach((session) => {
            session.id = newSessionId();
            session.updatedAt = now;
            session.dirty = true;
        });
        localStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(history));
    }
    return history;
}

// save the full session list, work out what was added, edited or removed, and sync it to the account
function setSessionHistory(history) {
    const previous = new Map(readStoredJson(SESSION_HISTORY_KEY, []).filter((s) => s.id).map((s) => [s.id, s]));
    const now = new Date().toISOString();

    history.forEach((session) => {
        const before = session.id && previous.get(session.id);
        if (!before) {
            session.id = session.id || newSessionId();
            session.updatedAt = now;
            session.dirty = true;
        } else if (sessionContent(before) !== sessionContent(session)) {
            session.updatedAt = now;
            session.dirty = true;
        }
        previous.delete(session.id);
    });

    // whatever is left was removed; remember the ones the account has so they get deleted there too
    const removedIds = [...previous.values()].filter((s) => s.inCloud).map((s) => s.id);
    if (removedIds.length) {
        const deletedIds = readStoredJson(DELETED_SESSION_IDS_KEY, []);
        localStorage.setItem(DELETED_SESSION_IDS_KEY, JSON.stringify([...deletedIds, ...removedIds]));
    }

    localStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(history));
    return syncSessions();
}

// turn "N/A" / "" / "3" / null into a whole number or null
function toNullableInteger(value) {
    if (value === null || value === undefined || value === "" || value === "N/A") return null;
    const number = Number(value);
    return Number.isNaN(number) ? null : Math.round(number);
}

// a local session as a training_sessions row
function sessionToRow(session, accountId) {
    return {
        id: session.id,
        account_id: accountId,
        command: session.command,
        repetitions: toNullableInteger(session.repetitions),
        duration: session.duration && session.duration !== "N/A" ? session.duration : null,
        distractions: session.distractions || null,
        location: session.location || null,
        session_date: session.date || localDateString(),
        session_time: session.time || null,
        session_start_time: session.sessionStartTime || null,
        session_end_time: session.sessionEndTime || null,
        total_minutes: toNullableInteger(session.sessionTotalMinutes),
        notes: session.notes || null,
        updated_at: session.updatedAt,
    };
}

// a training_sessions row as a local session
function rowToSession(row) {
    return {
        id: row.id,
        command: row.command,
        repetitions: row.repetitions === null ? "" : String(row.repetitions),
        duration: row.duration ?? "",
        distractions: row.distractions ?? "",
        location: row.location ?? "",
        date: row.session_date,
        time: row.session_time ? row.session_time.slice(0, 5) : "",
        sessionStartTime: row.session_start_time ?? "",
        sessionEndTime: row.session_end_time ?? "",
        sessionTotalMinutes: row.total_minutes,
        notes: row.notes ?? "",
        updatedAt: row.updated_at,
        inCloud: true,
    };
}

// whether a not-yet-uploaded local session is the same one as a row (sessions saved before ids existed)
function isSameSession(row, session) {
    return row.command === session.command
        && row.session_date === session.date
        && (row.session_time || "").slice(0, 5) === (session.time || "").slice(0, 5);
}

// every training_sessions row for the signed-in account, a page at a time
async function fetchAllSessionRows() {
    const rows = [];
    for (let from = 0; ; from += SESSION_FETCH_PAGE_SIZE) {
        const { data, error } = await supabaseClient
            .from("training_sessions")
            .select("*")
            .order("id")
            .range(from, from + SESSION_FETCH_PAGE_SIZE - 1);
        if (error) throw error;
        rows.push(...data);
        if (data.length < SESSION_FETCH_PAGE_SIZE) return rows;
    }
}

// one sync pass: push deletes, pull the account's sessions, merge, upload local changes.
// returns true when synced, null when signed out / Supabase not set up, false on error
async function runSessionSync() {
    const user = await getSignedInUser();
    if (!user) return null;

    try {
        let local = getSessionHistory();
        const startingSnapshot = localStorage.getItem(SESSION_HISTORY_KEY);
        let deletedIds = readStoredJson(DELETED_SESSION_IDS_KEY, []);

        // this browser's copy belongs to a different account: start from this account's sessions instead
        const owner = localStorage.getItem(SESSION_HISTORY_OWNER_KEY);
        const otherOwner = owner && owner !== user.id;
        if (otherOwner) {
            local = [];
            deletedIds = [];
        }

        if (deletedIds.length) {
            const { error } = await supabaseClient.from("training_sessions").delete().in("id", deletedIds);
            if (error) throw error;
        }

        const rows = await fetchAllSessionRows();
        const rowsById = new Map(rows.map((row) => [row.id, row]));

        // sessions from before ids existed may already have a row (from the old upload); reuse its id
        const localIds = new Set(local.map((session) => session.id));
        const unclaimedRows = rows.filter((row) => !localIds.has(row.id));
        local.forEach((session) => {
            if (session.inCloud || rowsById.has(session.id)) return;
            const matchIndex = unclaimedRows.findIndex((row) => isSameSession(row, session));
            if (matchIndex === -1) return;
            session.id = unclaimedRows[matchIndex].id;
            unclaimedRows.splice(matchIndex, 1);
        });

        const merged = [];
        const toUpload = [];
        local.forEach((session) => {
            const row = rowsById.get(session.id);
            if (!row) {
                // in the account before but gone now: deleted on another device
                if (session.inCloud) return;
                toUpload.push(session);
                merged.push(session);
                return;
            }
            rowsById.delete(session.id);
            const cloudIsNewer = new Date(row.updated_at) > new Date(session.updatedAt);
            if (session.dirty && !cloudIsNewer) {
                toUpload.push(session);
                merged.push(session);
            } else if (cloudIsNewer) {
                merged.push(rowToSession(row));
            } else {
                merged.push({ ...session, inCloud: true });
            }
        });
        // sessions logged on other devices
        rowsById.forEach((row) => merged.push(rowToSession(row)));

        if (toUpload.length) {
            const { error } = await supabaseClient
                .from("training_sessions")
                .upsert(toUpload.map((session) => sessionToRow(session, user.id)));
            if (error) throw error;
            toUpload.forEach((session) => {
                session.inCloud = true;
                delete session.dirty;
            });
        }

        const remainingDeletes = readStoredJson(DELETED_SESSION_IDS_KEY, []).filter((id) => !deletedIds.includes(id));
        localStorage.setItem(DELETED_SESSION_IDS_KEY, JSON.stringify(otherOwner ? [] : remainingDeletes));

        // a page saved while this ran; the follow-up sync it queued will merge from the new copy
        if (localStorage.getItem(SESSION_HISTORY_KEY) !== startingSnapshot) return true;

        const before = (otherOwner ? [] : readStoredJson(SESSION_HISTORY_KEY, [])).map(sessionContent).join("\n");
        localStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(merged));
        localStorage.setItem(SESSION_HISTORY_OWNER_KEY, user.id);

        const changed = otherOwner || before !== merged.map(sessionContent).join("\n");
        window.dispatchEvent(new CustomEvent("sessionhistorysynced", {
            detail: { changed, uploaded: toUpload.length },
        }));
        return true;
    } catch (error) {
        console.error("Could not sync training sessions:", error);
        return false;
    }
}

let sessionSyncRunning = null;
let sessionSyncQueued = null;

// sync with the account; if a sync is already running, run one more right after it (not one per call)
function syncSessions() {
    if (!sessionSyncRunning) {
        sessionSyncRunning = runSessionSync().finally(() => {
            sessionSyncRunning = null;
        });
        return sessionSyncRunning;
    }
    if (!sessionSyncQueued) {
        sessionSyncQueued = sessionSyncRunning.then(() => {
            sessionSyncQueued = null;
            return syncSessions();
        });
    }
    return sessionSyncQueued;
}

// before signing out: upload anything pending, then clear this browser's copy if it all made it.
// returns false (and keeps the local copy) if the upload failed
async function clearSessionsForLogOut() {
    const result = await syncSessions();
    if (result === false) return false;
    localStorage.removeItem(SESSION_HISTORY_KEY);
    localStorage.removeItem(DELETED_SESSION_IDS_KEY);
    localStorage.removeItem(SESSION_HISTORY_OWNER_KEY);
    return true;
}

syncSessions();
