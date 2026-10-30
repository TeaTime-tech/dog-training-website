/* Exercise history (walks, fetch, swims...): kept in localStorage ("exerciseHistory") and synced with the signed-in
   account's exercises rows in Supabase (supabase/exercises.sql), the same way sessions.js syncs training sessions.
   Needs supabaseClient.js and sessions.js (for readStoredJson and newSessionId) loaded first.

   Pages read with getExerciseHistory() and write the whole list with setExerciseHistory(); never write the key
   directly, or edits and deletes won't reach the account. Each exercise gets an id (shared with its row), updatedAt,
   dogId (the dog it was logged for, or null), and the sync flags inCloud and dirty. An exercise is tracked by time
   (duration) or by distance (distance + distanceUnit, as entered); the other one is left empty. Sync runs on every page that
   loads this file; pages listen for "exercisessynced" (detail.changed) to redraw. */

const EXERCISE_HISTORY_KEY = "exerciseHistory";
const DELETED_EXERCISE_IDS_KEY = "deletedExerciseIds";
const EXERCISE_HISTORY_OWNER_KEY = "exerciseHistoryOwner";
const EXERCISE_FETCH_PAGE_SIZE = 1000;
const DISTANCE_UNIT_KEY = "distanceUnit";
const DISTANCE_UNITS = ["mi", "km", "m", "ft"];

// the Settings > Units distance unit, the one the exercise form starts on (default mi)
function getDistanceUnit() {
    try {
        const unit = localStorage.getItem(DISTANCE_UNIT_KEY);
        return DISTANCE_UNITS.includes(unit) ? unit : "mi";
    } catch (error) {
        return "mi";
    }
}

// true when an exercise was logged by distance instead of time
function isDistanceExercise(exercise) {
    return exercise.distance !== undefined && exercise.distance !== null && exercise.distance !== "";
}

// an exercise's distance as entered, e.g. "2.5 mi"; "" when it was logged by time
function formatExerciseDistance(exercise) {
    if (!isDistanceExercise(exercise)) return "";
    return `${exercise.distance} ${DISTANCE_UNITS.includes(exercise.distanceUnit) ? exercise.distanceUnit : "mi"}`;
}

// a distance typed into a form as a stored number string, or null when it isn't a positive number
function parseDistanceInput(text) {
    const value = String(text).trim();
    if (!/^\d*\.?\d+$/.test(value) || Number(value) <= 0) return null;
    return String(Number(value));
}

// an exercise's fields without the sync bookkeeping, for spotting real edits
function exerciseContent(exercise) {
    const { updatedAt, inCloud, dirty, ...content } = exercise;
    return JSON.stringify(content);
}

// every exercise, giving any saved before syncing an id so they can be uploaded
function getExerciseHistory() {
    const history = readStoredJson(EXERCISE_HISTORY_KEY, []);
    if (!Array.isArray(history)) return [];
    const missingIds = history.filter((exercise) => !exercise.id);
    if (missingIds.length) {
        const now = new Date().toISOString();
        missingIds.forEach((exercise) => {
            exercise.id = newSessionId();
            exercise.updatedAt = now;
            exercise.dirty = true;
        });
        localStorage.setItem(EXERCISE_HISTORY_KEY, JSON.stringify(history));
    }
    return history;
}

// save the full exercise list, work out what was added, edited or removed, and sync it to the account
function setExerciseHistory(history) {
    const previous = new Map(readStoredJson(EXERCISE_HISTORY_KEY, []).filter((e) => e.id).map((e) => [e.id, e]));
    const now = new Date().toISOString();

    history.forEach((exercise) => {
        const before = exercise.id && previous.get(exercise.id);
        if (!before) {
            exercise.id = exercise.id || newSessionId();
            if (exercise.dogId === undefined) {
                exercise.dogId = typeof getCurrentDogId === "function" ? getCurrentDogId() : null;
            }
            exercise.updatedAt = now;
            exercise.dirty = true;
        } else if (exerciseContent(before) !== exerciseContent(exercise)) {
            exercise.updatedAt = now;
            exercise.dirty = true;
        }
        previous.delete(exercise.id);
    });

    // whatever is left was removed; remember the ones the account has so they get deleted there too
    const removedIds = [...previous.values()].filter((e) => e.inCloud).map((e) => e.id);
    if (removedIds.length) {
        const deletedIds = readStoredJson(DELETED_EXERCISE_IDS_KEY, []);
        localStorage.setItem(DELETED_EXERCISE_IDS_KEY, JSON.stringify([...deletedIds, ...removedIds]));
    }

    localStorage.setItem(EXERCISE_HISTORY_KEY, JSON.stringify(history));
    return syncExercises();
}

// true when an exercise belongs to a dog; with no dog given (signed out, no dogs) every exercise counts
function exerciseBelongsToDog(exercise, dogId) {
    return !dogId || exercise.dogId === dogId;
}

// exercises logged before they were tied to a dog go to this dog (the one being trained); returns how many moved
function assignLooseExercises(dogId) {
    if (!dogId) return 0;
    const history = getExerciseHistory();
    let moved = 0;
    history.forEach((exercise) => {
        if (!exercise.dogId) {
            exercise.dogId = dogId;
            moved += 1;
        }
    });
    if (moved) setExerciseHistory(history);
    return moved;
}

// the edit field for an exercise's duration (a text box), or its distance and unit; read() returns the fields to
// save, or null (after an alert) when the distance isn't a positive number
function buildExerciseAmountInput(exercise) {
    if (!isDistanceExercise(exercise)) {
        const input = document.createElement("input");
        input.type = "text";
        input.value = exercise.duration ?? "";
        return { field: input, read: () => ({ duration: input.value.trim() }) };
    }

    const wrap = document.createElement("span");
    wrap.className = "exercise-distance-edit";
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "decimal";
    input.value = exercise.distance;
    const unitSelect = document.createElement("select");
    unitSelect.setAttribute("aria-label", "Distance unit");
    DISTANCE_UNITS.forEach((unit) => unitSelect.add(new Option(unit, unit)));
    unitSelect.value = DISTANCE_UNITS.includes(exercise.distanceUnit) ? exercise.distanceUnit : "mi";
    wrap.append(input, unitSelect);

    const read = () => {
        const distance = parseDistanceInput(input.value);
        if (distance === null) {
            alert("Distance must be a number above 0, like 2 or 1.5.");
            return null;
        }
        return { duration: "", distance, distanceUnit: unitSelect.value };
    };
    return { field: wrap, read };
}

// a local exercise as an exercises row
function exerciseToRow(exercise, accountId) {
    return {
        id: exercise.id,
        account_id: accountId,
        dog_id: exercise.dogId ?? null,
        name: exercise.name || "Exercise",
        duration: exercise.duration || null,
        distance: isDistanceExercise(exercise) ? Number(exercise.distance) : null,
        distance_unit: isDistanceExercise(exercise) ? exercise.distanceUnit || "mi" : null,
        notes: exercise.notes || null,
        exercise_date: exercise.date || localDateString(),
        exercise_time: exercise.time || null,
        updated_at: exercise.updatedAt,
    };
}

// an exercises row as a local exercise
function rowToExercise(row) {
    return {
        id: row.id,
        dogId: row.dog_id,
        name: row.name,
        duration: row.duration ?? "",
        distance: row.distance === null || row.distance === undefined ? "" : String(Number(row.distance)),
        distanceUnit: row.distance_unit ?? "",
        notes: row.notes ?? "",
        date: row.exercise_date,
        time: row.exercise_time ? row.exercise_time.slice(0, 5) : "",
        updatedAt: row.updated_at,
        inCloud: true,
    };
}

// every exercises row for the signed-in account, a page at a time
async function fetchAllExerciseRows() {
    const rows = [];
    for (let from = 0; ; from += EXERCISE_FETCH_PAGE_SIZE) {
        const { data, error } = await supabaseClient
            .from("exercises")
            .select("*")
            .order("id")
            .range(from, from + EXERCISE_FETCH_PAGE_SIZE - 1);
        if (error) throw error;
        rows.push(...data);
        if (data.length < EXERCISE_FETCH_PAGE_SIZE) return rows;
    }
}

// one sync pass: push deletes, pull the account's exercises, merge, upload local changes.
// returns true when synced, null when signed out / Supabase not set up, false on error
async function runExerciseSync() {
    const user = await getSignedInUser();
    if (!user) return null;

    try {
        let local = getExerciseHistory();
        const startingSnapshot = localStorage.getItem(EXERCISE_HISTORY_KEY);
        let deletedIds = readStoredJson(DELETED_EXERCISE_IDS_KEY, []);

        // this browser's copy belongs to a different account: start from this account's exercises instead
        const owner = localStorage.getItem(EXERCISE_HISTORY_OWNER_KEY);
        const otherOwner = owner && owner !== user.id;
        if (otherOwner) {
            local = [];
            deletedIds = [];
        }

        if (deletedIds.length) {
            const { error } = await supabaseClient.from("exercises").delete().in("id", deletedIds);
            if (error) throw error;
        }

        const rows = await fetchAllExerciseRows();
        const rowsById = new Map(rows.map((row) => [row.id, row]));

        const merged = [];
        const toUpload = [];
        local.forEach((exercise) => {
            const row = rowsById.get(exercise.id);
            if (!row) {
                // in the account before but gone now: deleted on another device
                if (exercise.inCloud) return;
                toUpload.push(exercise);
                merged.push(exercise);
                return;
            }
            rowsById.delete(exercise.id);
            const cloudIsNewer = new Date(row.updated_at) > new Date(exercise.updatedAt);
            if (exercise.dirty && !cloudIsNewer) {
                toUpload.push(exercise);
                merged.push(exercise);
            } else if (cloudIsNewer) {
                merged.push(rowToExercise(row));
            } else {
                merged.push({ ...exercise, inCloud: true });
            }
        });
        // exercises logged on other devices
        rowsById.forEach((row) => merged.push(rowToExercise(row)));

        if (toUpload.length) {
            const { error } = await supabaseClient
                .from("exercises")
                .upsert(toUpload.map((exercise) => exerciseToRow(exercise, user.id)));
            if (error) throw error;
            toUpload.forEach((exercise) => {
                exercise.inCloud = true;
                delete exercise.dirty;
            });
        }

        const remainingDeletes = readStoredJson(DELETED_EXERCISE_IDS_KEY, []).filter((id) => !deletedIds.includes(id));
        localStorage.setItem(DELETED_EXERCISE_IDS_KEY, JSON.stringify(otherOwner ? [] : remainingDeletes));

        // a page saved while this ran; the follow-up sync it queued will merge from the new copy
        if (localStorage.getItem(EXERCISE_HISTORY_KEY) !== startingSnapshot) return true;

        const before = (otherOwner ? [] : readStoredJson(EXERCISE_HISTORY_KEY, [])).map(exerciseContent).join("\n");
        localStorage.setItem(EXERCISE_HISTORY_KEY, JSON.stringify(merged));
        localStorage.setItem(EXERCISE_HISTORY_OWNER_KEY, user.id);

        const changed = otherOwner || before !== merged.map(exerciseContent).join("\n");
        window.dispatchEvent(new CustomEvent("exercisessynced", { detail: { changed, uploaded: toUpload.length } }));
        return true;
    } catch (error) {
        // the table isn't there until supabase/exercises.sql is run; exercises stay in this browser meanwhile
        console.error("Could not sync exercises:", error);
        return false;
    }
}

let exerciseSyncRunning = null;
let exerciseSyncQueued = null;

// sync with the account; if a sync is already running, run one more right after it (not one per call)
function syncExercises() {
    if (!exerciseSyncRunning) {
        exerciseSyncRunning = runExerciseSync().finally(() => {
            exerciseSyncRunning = null;
        });
        return exerciseSyncRunning;
    }
    if (!exerciseSyncQueued) {
        exerciseSyncQueued = exerciseSyncRunning.then(() => {
            exerciseSyncQueued = null;
            return syncExercises();
        });
    }
    return exerciseSyncQueued;
}

// before signing out: upload anything pending, then clear this browser's copy if it all made it.
// returns false (and keeps the local copy) if the upload failed
async function clearExercisesForLogOut() {
    const result = await syncExercises();
    if (result === false) return false;
    localStorage.removeItem(EXERCISE_HISTORY_KEY);
    localStorage.removeItem(DELETED_EXERCISE_IDS_KEY);
    localStorage.removeItem(EXERCISE_HISTORY_OWNER_KEY);
    return true;
}

syncExercises();
