/* Shared helpers for reading training data out of localStorage. Used by log, load, and today pages. */

// combine built-in and custom command names, de-duplicated
function getAllCommandNames() {
    const builtInCommands = ["sit", "stay", "come"];
    const savedCommands = JSON.parse(localStorage.getItem("customCommands")) || [];
    return [...new Set([...builtInCommands, ...savedCommands])];
}

/*format a stored duration value (e.g. "5", "1", "1:30") as "X sec"/"X min Y sec"*/
function formatDurationDisplay(value) {
    if (value === undefined || value === null || value === "" || value === "N/A") {
        return value ?? "";
    }

    const knownLabels = {
        "1": "1 min",
        "1:30": "1 min 30 sec",
    };
    if (knownLabels[value]) {
        return knownLabels[value];
    }

    if (value.includes(":")) {
        const [minutesPart, secondsPart] = value.split(":");
        const minutesNum = Number(minutesPart);
        const secondsNum = Number(secondsPart);
        if (!Number.isNaN(minutesNum) && !Number.isNaN(secondsNum)) {
            return secondsNum > 0 ? `${minutesNum} min ${secondsNum} sec` : `${minutesNum} min`;
        }
        return value;
    }

    const totalSeconds = Number(value);
    if (!Number.isNaN(totalSeconds)) {
        const minutesNum = Math.floor(totalSeconds / 60);
        const secondsNum = totalSeconds % 60;
        if (minutesNum === 0) {
            return `${secondsNum} sec`;
        }
        return secondsNum > 0 ? `${minutesNum} min ${secondsNum} sec` : `${minutesNum} min`;
    }

    return value;
}

/*parse a stored duration value (e.g. "5", "1", "1:30") into raw seconds, or null if not parseable*/
function parseStoredDurationSeconds(value) {
    if (typeof value !== "string" || value === "" || value === "N/A") {
        return null;
    }
    if (value.includes(":")) {
        const [minutesPart, secondsPart] = value.split(":").map(Number);
        if (Number.isNaN(minutesPart) || Number.isNaN(secondsPart)) {
            return null;
        }
        return minutesPart * 60 + secondsPart;
    }
    const seconds = Number(value);
    return Number.isNaN(seconds) ? null : seconds;
}


/* Daily goals, synced with Supabase training_goals + account_settings.active_goal_type. Needs supabaseClient.js loaded first. */

// localStorage is the instant-render cache; these are the same keys today.js already reads
const GOAL_CACHE_KEYS = {
    sessions: "todaySessionGoal",
    minutes: "todayMinutesGoal",
    commands: "todayCommandsGoal",
};
const GOAL_TYPE_CACHE_KEY = "todayGoalType";
const GOAL_TYPES = Object.keys(GOAL_CACHE_KEYS);
// the account id the cached goals belong to, so another account never inherits them
const GOALS_OWNER_KEY = "goalsOwner";

// save a daily goal in this browser and, when signed in, in the account (dogId null = all dogs)
async function saveGoal(goalType, target, dogId = null) {
    if (!GOAL_CACHE_KEYS[goalType]) return;
    localStorage.setItem(GOAL_CACHE_KEYS[goalType], String(target));

    const user = await getSignedInUser();
    if (!user) return;

    try {
        let query = supabaseClient
            .from("training_goals")
            .select("id")
            .eq("goal_type", goalType)
            .eq("period", "daily");
        query = dogId ? query.eq("dog_id", dogId) : query.is("dog_id", null);
        const { data: existing, error: findError } = await query.maybeSingle();
        if (findError) throw findError;

        const row = { target, is_active: true, updated_at: new Date().toISOString() };
        const { error } = existing
            ? await supabaseClient.from("training_goals").update(row).eq("id", existing.id)
            : await supabaseClient.from("training_goals").insert({ account_id: user.id, goal_type: goalType, period: "daily", dog_id: dogId, ...row });
        if (error) throw error;
    } catch (error) {
        console.error("Could not save goal:", error);
    }
}

// save which goal type the Today ring tracks
async function saveActiveGoalType(goalType) {
    if (!GOAL_CACHE_KEYS[goalType]) return;
    localStorage.setItem(GOAL_TYPE_CACHE_KEY, goalType);

    const user = await getSignedInUser();
    if (!user) return;

    // upsert on account_id so a brand-new account gets its settings row
    const { error } = await supabaseClient
        .from("account_settings")
        .upsert({ account_id: user.id, active_goal_type: goalType, updated_at: new Date().toISOString() }, { onConflict: "account_id" });
    if (error) console.error("Could not save goal type:", error);
}

// pull the account's goals into the local cache; fires 'goalssynced' if anything changed
async function syncGoals(dogId = null) {
    const user = await getSignedInUser();
    if (!user) return;

    try {
        let query = supabaseClient
            .from("training_goals")
            .select("goal_type, target")
            .eq("period", "daily")
            .eq("is_active", true);
        query = dogId ? query.eq("dog_id", dogId) : query.is("dog_id", null);
        const [goalsResult, settingsResult] = await Promise.all([
            query,
            supabaseClient.from("account_settings").select("active_goal_type").maybeSingle(),
        ]);
        if (goalsResult.error) throw goalsResult.error;

        let changed = false;

        // this browser's goals belong to a different account: drop them instead of uploading them
        const owner = localStorage.getItem(GOALS_OWNER_KEY);
        if (owner && owner !== user.id) {
            clearCachedGoals();
            changed = true;
        }
        localStorage.setItem(GOALS_OWNER_KEY, user.id);

        const setIfDifferent = (key, value) => {
            if (localStorage.getItem(key) !== String(value)) {
                localStorage.setItem(key, String(value));
                changed = true;
            }
        };
        goalsResult.data.forEach((goal) => {
            if (GOAL_CACHE_KEYS[goal.goal_type]) setIfDifferent(GOAL_CACHE_KEYS[goal.goal_type], goal.target);
        });
        const activeType = settingsResult.data && settingsResult.data.active_goal_type;
        if (GOAL_CACHE_KEYS[activeType]) setIfDifferent(GOAL_TYPE_CACHE_KEY, activeType);

        // first sign-in on an account with no saved goals: upload what this browser already had
        const savedTypes = new Set(goalsResult.data.map((goal) => goal.goal_type));
        for (const type of GOAL_TYPES) {
            const local = Number(localStorage.getItem(GOAL_CACHE_KEYS[type]));
            if (!savedTypes.has(type) && Number.isFinite(local) && local > 0) {
                await saveGoal(type, local, dogId);
            }
        }
        const localType = localStorage.getItem(GOAL_TYPE_CACHE_KEY);
        if (!GOAL_CACHE_KEYS[activeType] && GOAL_CACHE_KEYS[localType]) {
            await saveActiveGoalType(localType);
        }

        window.dispatchEvent(new CustomEvent("goalssynced", { detail: { changed } }));
    } catch (error) {
        console.error("Could not sync goals:", error);
    }
}

// remove every cached goal from this browser
function clearCachedGoals() {
    GOAL_TYPES.forEach((type) => localStorage.removeItem(GOAL_CACHE_KEYS[type]));
    localStorage.removeItem(GOAL_TYPE_CACHE_KEY);
    localStorage.removeItem(GOALS_OWNER_KEY);
}

// before signing out: goals already live in the account, so just clear this browser's copy
function clearGoalsForLogOut() {
    clearCachedGoals();
}

if (supabaseClient) syncGoals();
