/* settings.html: account and app settings. Needs supabaseClient.js, accountNav.js and dogs.js loaded first. */

// the old local-only password check is gone; drop its leftover hash
localStorage.removeItem("userPasswordAuth");

const accountStatus = document.getElementById("account-status");
const accountFields = document.getElementById("account-fields");
const displayNameInput = document.getElementById("display-name");
const emailChangeInput = document.getElementById("email-change");
const currentPasswordChangeInput = document.getElementById("current-password-change");
const passwordChangeInput = document.getElementById("password-change");

// show a status line under a section heading
function showStatus(element, text) {
    element.textContent = text;
}

// run an account change with the fields disabled so it can't be double-submitted
async function withAccountFieldsLocked(task) {
    accountFields.disabled = true;
    try {
        await task();
    } finally {
        accountFields.disabled = false;
    }
}

// fill in the account section for the signed-in user, or explain why it's unavailable
async function loadAccountSettings() {
    const user = await getSignedInUser();
    if (!user) {
        accountStatus.textContent = "";
        const loginLink = document.createElement("a");
        loginLink.href = "login.html";
        loginLink.textContent = "Log in";
        accountStatus.append(loginLink, " to change your display name, email or password.");
        return null;
    }

    const metadata = user.user_metadata || {};
    showAvatarPreview(user);
    displayNameInput.value = metadata.display_name || metadata.username || "";
    emailChangeInput.placeholder = `Current: ${user.email}`;
    showStatus(accountStatus, "");
    accountFields.disabled = false;
    return user;
}

/* profile picture: shrink the chosen photo to a 256 x 256 JPEG in the browser, then save it to the account
   (setAccountAvatar in accountNav.js also updates the top bar) */

const avatarPreview = document.getElementById("avatar-preview");
const avatarInput = document.getElementById("avatar-input");
const avatarRemoveButton = document.getElementById("avatar-remove");
const avatarStatus = document.getElementById("avatar-status");
const AVATAR_SIZE = 256;

const showAvatarStatus = (text, isError) => {
    avatarStatus.textContent = text;
    avatarStatus.classList.toggle("avatar-status--error", Boolean(isError));
};

// the preview circle: the saved picture or the name's first letter; Remove only when there's a picture
function showAvatarPreview(user) {
    const fresh = makeAvatar(user, "avatar avatar--large");
    avatarPreview.replaceChildren(...fresh.childNodes);
    avatarRemoveButton.hidden = !getCachedAvatar(user.id);
}

// a square crop from the middle of an image file, as a JPEG data: URL
async function shrinkPhoto(file) {
    const url = URL.createObjectURL(file);
    try {
        const image = await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("That file isn't a picture this browser can open."));
            img.src = url;
        });
        const side = Math.min(image.naturalWidth, image.naturalHeight);
        const canvas = document.createElement("canvas");
        canvas.width = AVATAR_SIZE;
        canvas.height = AVATAR_SIZE;
        canvas.getContext("2d").drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
        return canvas.toDataURL("image/jpeg", 0.85);
    } finally {
        URL.revokeObjectURL(url);
    }
}

avatarInput.addEventListener("change", () => withAccountFieldsLocked(async () => {
    const file = avatarInput.files[0];
    avatarInput.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
        showAvatarStatus("Please choose a picture file.", true);
        return;
    }
    if (file.size > 15 * 1024 * 1024) {
        showAvatarStatus("That picture is over 15 MB. Please choose a smaller one.", true);
        return;
    }
    try {
        showAvatarStatus("Saving...");
        await setAccountAvatar(await shrinkPhoto(file));
        showAvatarPreview(await getSignedInUser());
        showAvatarStatus("Saved.");
    } catch (error) {
        console.error("Could not save profile picture:", error);
        showAvatarStatus(error.message || "Couldn't save that picture.", true);
    }
}));

avatarRemoveButton.addEventListener("click", () => withAccountFieldsLocked(async () => {
    if (!confirm("Remove your profile picture?")) return;
    try {
        await setAccountAvatar(null);
        showAvatarPreview(await getSignedInUser());
        showAvatarStatus("Removed.");
    } catch (error) {
        console.error("Could not remove profile picture:", error);
        showAvatarStatus(error.message || "Couldn't remove the picture.", true);
    }
}));

// the account's picture arrived (accountNav.js loads it after the page opens)
window.addEventListener("avatarchanged", async () => {
    const user = await getSignedInUser();
    if (user) showAvatarPreview(user);
});

/* change display name: saved in the account_settings table, and on the login's metadata so the nav
   can show it without an extra query */

document.getElementById("change-display-name").addEventListener("click", () => withAccountFieldsLocked(async () => {
    const newName = displayNameInput.value.trim();
    if (!newName) {
        showStatus(accountStatus, "Please enter a display name.");
        return;
    }

    const user = await getSignedInUser();
    const { error: tableError } = await supabaseClient
        .from("account_settings")
        .upsert({ account_id: user.id, display_name: newName, updated_at: new Date().toISOString() });
    if (tableError) {
        console.error("Could not save display name to account_settings:", tableError);
        showStatus(accountStatus, `Couldn't change display name: ${tableError.message}`);
        return;
    }

    const { data, error } = await supabaseClient.auth.updateUser({ data: { display_name: newName } });
    if (error) {
        showStatus(accountStatus, `Couldn't change display name: ${error.message}`);
        return;
    }

    const navLink = document.querySelector(".nav-account-link");
    if (navLink) fillAccountLink(navLink, data.user);
    showStatus(accountStatus, "Display name updated.");
}));

/* change email: Supabase emails a confirmation link before the change takes effect */

document.getElementById("change-email").addEventListener("click", () => withAccountFieldsLocked(async () => {
    const newEmail = emailChangeInput.value.trim();
    if (!newEmail || !newEmail.includes("@")) {
        showStatus(accountStatus, "Please enter a valid email address.");
        return;
    }

    const { error } = await supabaseClient.auth.updateUser({ email: newEmail });
    if (error) {
        showStatus(accountStatus, `Couldn't change email: ${error.message}`);
        return;
    }

    emailChangeInput.value = "";
    showStatus(accountStatus, `Check ${newEmail} for a confirmation link to finish changing your email.`);
}));

/* change password: confirm the current password by signing in with it, then set the new one */

document.getElementById("change-password").addEventListener("click", () => withAccountFieldsLocked(async () => {
    const currentPassword = currentPasswordChangeInput.value;
    const newPassword = passwordChangeInput.value;

    if (!currentPassword) {
        showStatus(accountStatus, "Please enter your current password.");
        return;
    }
    if (newPassword.length < 8) {
        showStatus(accountStatus, "Please enter a new password of at least 8 characters.");
        return;
    }

    const user = await getSignedInUser();
    const { error: signInError } = await supabaseClient.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
    });
    if (signInError) {
        showStatus(accountStatus, "Current password is incorrect.");
        return;
    }

    const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
    if (error) {
        showStatus(accountStatus, `Couldn't change password: ${error.message}`);
        return;
    }

    currentPasswordChangeInput.value = "";
    passwordChangeInput.value = "";
    showStatus(accountStatus, "Password updated.");
}));

/* theme: follow the device, or always light / dark (theme.js does the work) */

const themeChoiceSelect = document.getElementById("theme-choice");
themeChoiceSelect.value = getThemeChoice();
themeChoiceSelect.addEventListener("change", () => setThemeChoice(themeChoiceSelect.value));
// the top bar button changed it
window.addEventListener("themechange", () => {
    themeChoiceSelect.value = getThemeChoice();
});

/* weight and distance units: saved in this browser as soon as one is picked.
   The weight unit is what My Dogs and the dog chart show weights in (getWeightUnit in dogs.js); the distance unit
   is the one Today's Add Exercise starts on (getDistanceUnit in exercises.js) */

const WEIGHT_UNIT_STORAGE_KEY = "weightUnit";
const DISTANCE_UNIT_STORAGE_KEY = "distanceUnit";
const weightUnitSelect = document.getElementById("weight-unit");
const distanceUnitSelect = document.getElementById("distance-unit");
const unitsStatus = document.getElementById("units-status");

weightUnitSelect.value = getWeightUnit();
distanceUnitSelect.value = getDistanceUnit();

const UNIT_NAMES = { lb: "pounds", kg: "kilograms", mi: "miles", km: "kilometers", m: "meters", ft: "feet" };

weightUnitSelect.addEventListener("change", () => {
    localStorage.setItem(WEIGHT_UNIT_STORAGE_KEY, weightUnitSelect.value);
    showStatus(unitsStatus, `Saved. Dog weights show in ${UNIT_NAMES[weightUnitSelect.value]} on this device.`);
});
distanceUnitSelect.addEventListener("change", () => {
    localStorage.setItem(DISTANCE_UNIT_STORAGE_KEY, distanceUnitSelect.value);
    showStatus(unitsStatus, `Saved. Exercises by distance start in ${UNIT_NAMES[distanceUnitSelect.value]} on this device.`);
});

/* clear history: delete the logged sessions or exercises of one dog (or all of them). setSessionHistory and
   setExerciseHistory sync the deletes to the account */

const CLEAR_ALL_DOGS = "all";
const clearDogRow = document.getElementById("clear-dog-row");
const clearDogSelect = document.getElementById("clear-dog");
const clearSessionsButton = document.getElementById("clear-sessions");
const clearExercisesButton = document.getElementById("clear-exercises");
const clearStatus = document.getElementById("clear-status");

// the picked dog's id, or null for every dog (also when there are no dogs)
const pickedClearDog = () => (clearDogSelect.value && clearDogSelect.value !== CLEAR_ALL_DOGS ? clearDogSelect.value : null);
const pickedClearDogName = () => (pickedClearDog() ? clearDogSelect.selectedOptions[0].textContent : "");
const inClearScope = (item) => !pickedClearDog() || item.dogId === pickedClearDog();

// show how many of each there are for the picked dog, and disable a button with nothing to clear
function updateClearButtons() {
    const sessions = getSessionHistory().filter(inClearScope).length;
    const exercises = getExerciseHistory().filter(inClearScope).length;
    clearSessionsButton.textContent = `Clear session history (${sessions})`;
    clearExercisesButton.textContent = `Clear exercise history (${exercises})`;
    clearSessionsButton.disabled = sessions === 0;
    clearExercisesButton.disabled = exercises === 0;
}

// fill the dog picker when signed in with dogs, starting on the dog you're training
async function loadClearDogs() {
    let dogs = [];
    try {
        if (await getSignedInUser()) dogs = await getDogs();
    } catch (error) {
        console.error("Could not load dogs:", error);
    }
    clearDogRow.hidden = dogs.length === 0;
    clearDogSelect.replaceChildren(
        ...dogs.map((dog) => new window.Option(dog.name, dog.id)),
        new window.Option("All dogs", CLEAR_ALL_DOGS),
    );
    clearDogSelect.value = dogs.some((dog) => dog.id === getCurrentDogId()) ? getCurrentDogId() : CLEAR_ALL_DOGS;
    updateClearButtons();
}

// delete the picked dog's items from one history after confirming; returns how many went
async function clearHistory(kind, getHistory, setHistory) {
    const history = getHistory();
    const kept = history.filter((item) => !inClearScope(item));
    const removed = history.length - kept.length;
    if (!removed) return;
    const name = pickedClearDogName();
    const whose = name ? ` for ${name}` : clearDogRow.hidden ? "" : " for all dogs";
    const noun = `${kind}${removed === 1 ? "" : "s"}`;
    if (!confirm(`Permanently delete all ${removed} logged ${noun}${whose}? This can't be undone.`)) return;
    showStatus(clearStatus, "Deleting...");
    const synced = await setHistory(kept);
    showStatus(clearStatus, synced === false
        ? `Deleted ${removed} ${noun}${whose} on this device. Couldn't reach your account yet; it will retry next time.`
        : `Deleted ${removed} ${noun}${whose}.`);
    updateClearButtons();
}

clearDogSelect.addEventListener("change", () => {
    showStatus(clearStatus, "");
    updateClearButtons();
});
clearSessionsButton.addEventListener("click", () => clearHistory("session", getSessionHistory, setSessionHistory));
clearExercisesButton.addEventListener("click", () => clearHistory("exercise", getExerciseHistory, setExerciseHistory));
window.addEventListener("sessionhistorysynced", updateClearButtons);
window.addEventListener("exercisessynced", updateClearButtons);
updateClearButtons();
loadClearDogs();

/* export: download this browser's training data, plus the account's cloud data if signed in */

// every table that holds the account's data (RLS limits each to this user)
const EXPORT_TABLES = ["dogs", "training_sessions", "exercises", "training_goals", "task_lists", "task_list_items",
    "dog_task_progress", "dog_task_attempts", "account_settings"];
const exportStatus = document.getElementById("export-status");

// every app value in localStorage, skipping Supabase's own login session ("sb-..." keys)
function collectLocalData() {
    const local = {};
    for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key.startsWith("sb-")) continue;
        const value = localStorage.getItem(key);
        try {
            local[key] = JSON.parse(value);
        } catch {
            local[key] = value;
        }
    }
    return local;
}

// true for "this table doesn't exist" (its setup file hasn't been run), which export and delete skip
function isMissingTable(error) {
    return ["42P01", "PGRST205"].includes(error.code);
}

// the signed-in account's rows from each exported table (RLS limits them to this user); tables not set up yet are skipped
async function collectCloudData() {
    const cloud = {};
    for (const table of EXPORT_TABLES) {
        const { data, error } = await supabaseClient.from(table).select("*");
        if (error && isMissingTable(error)) continue;
        if (error) throw new Error(`${table}: ${error.message}`);
        cloud[table] = data;
    }
    return cloud;
}

// save an object as a .json file
function downloadJson(fileName, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

document.getElementById("export-data").addEventListener("click", async () => {
    showStatus(exportStatus, "Preparing export...");
    const exportData = { exportedAt: new Date().toISOString(), local: collectLocalData() };

    const user = await getSignedInUser();
    if (user) {
        try {
            exportData.account = { email: user.email };
            exportData.cloud = await collectCloudData();
        } catch (error) {
            console.error("Could not export cloud data:", error);
            showStatus(exportStatus, `Couldn't export cloud data (${error.message}). Downloaded this browser's data only.`);
            downloadJson(`dog-training-export-${localDateString()}.json`, exportData);
            return;
        }
    }

    downloadJson(`dog-training-export-${localDateString()}.json`, exportData);
    showStatus(exportStatus, user ? "Downloaded." : "Downloaded this browser's data. Log in to include your cloud data too.");
});


/* delete my data: every row of the account's data (deleting the dogs also deletes their CGC progress and attempts),
   then this browser's copy. The login stays; only Supabase can delete the account itself */

const deleteDataInput = document.getElementById("delete-data-confirm");
const deleteDataButton = document.getElementById("delete-data");
const deleteDataStatus = document.getElementById("delete-data-status");
// rows owned through account_id, children before parents; task lists stay so the CGC checklist still has its steps
const DELETE_TABLES = ["training_sessions", "exercises", "training_goals", "dogs", "account_settings"];
// kept in this browser: the login (sb-...) and the light/dark choice
const KEEP_LOCAL_KEYS = ["theme"];

deleteDataInput.addEventListener("input", () => {
    deleteDataButton.disabled = deleteDataInput.value.trim() !== "DELETE";
});

deleteDataButton.addEventListener("click", async () => {
    if (deleteDataInput.value.trim() !== "DELETE") return;
    const user = await getSignedInUser();
    const where = user ? "in your account and on this device" : "on this device";
    if (!confirm(`Delete all your training data ${where}? This can't be undone.`)) return;

    deleteDataButton.disabled = true;
    deleteDataInput.disabled = true;
    showStatus(deleteDataStatus, "Deleting...");
    if (user) {
        for (const table of DELETE_TABLES) {
            const { error } = await supabaseClient.from(table).delete().eq("account_id", user.id);
            if (error && !isMissingTable(error)) {
                console.error(`Could not delete ${table}:`, error);
                showStatus(deleteDataStatus, `Stopped: couldn't delete ${table.replace(/_/g, " ")} (${error.message}). Nothing on this device was removed; try again.`);
                deleteDataInput.disabled = false;
                deleteDataButton.disabled = false;
                return;
            }
        }
    }

    // this browser's copy goes too, so nothing is uploaded again on the next page
    Object.keys(localStorage)
        .filter((key) => !key.startsWith("sb-") && !KEEP_LOCAL_KEYS.includes(key))
        .forEach((key) => localStorage.removeItem(key));
    showStatus(deleteDataStatus, "All your data is deleted. Reloading...");
    setTimeout(() => window.location.reload(), 1200);
});


/* feedback: a problem, idea or anything else, sent to the feedback table (supabase/feedback.sql). Signed in, it's
   sent as that account with its email filled in for a reply; signed out, anonymously */

const feedbackForm = document.getElementById("feedback-form");
const feedbackMessage = document.getElementById("feedback-message");
const feedbackCount = document.getElementById("feedback-count");
const feedbackEmail = document.getElementById("feedback-email");
const feedbackSend = document.getElementById("feedback-send");
const feedbackStatus = document.getElementById("feedback-status");
const FEEDBACK_MAX = 2000;

feedbackMessage.addEventListener("input", () => {
    feedbackCount.textContent = `${feedbackMessage.value.length} / ${FEEDBACK_MAX}`;
});

// the signed-in account's email, ready for a reply (they can clear it)
getSignedInUser().then((user) => {
    if (user && !feedbackEmail.value) feedbackEmail.value = user.email || "";
});

feedbackForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = feedbackMessage.value.trim();
    const email = feedbackEmail.value.trim();
    if (!message) {
        showStatus(feedbackStatus, "Please write a message first.");
        feedbackMessage.focus();
        return;
    }
    if (email && !feedbackEmail.checkValidity()) {
        showStatus(feedbackStatus, "That email doesn't look right. Fix it or leave it blank.");
        feedbackEmail.focus();
        return;
    }
    if (!supabaseClient) {
        showStatus(feedbackStatus, "Feedback can't be sent right now. Please try again later.");
        return;
    }

    feedbackSend.disabled = true;
    showStatus(feedbackStatus, "Sending...");
    const user = await getSignedInUser();
    // no .select() afterwards: the table is send-only, so asking for the row back would be refused
    const { error } = await supabaseClient.from("feedback").insert({
        account_id: user ? user.id : null,
        kind: feedbackForm.querySelector('input[name="feedback-kind"]:checked').value,
        message: message.slice(0, FEEDBACK_MAX),
        contact_email: email || null,
        page: "settings",
        user_agent: navigator.userAgent.slice(0, 500),
    });
    feedbackSend.disabled = false;

    if (error) {
        console.error("Could not send feedback:", error);
        showStatus(feedbackStatus, isMissingTable(error)
            ? "Feedback isn't set up yet: run supabase/feedback.sql in Supabase."
            : `Couldn't send it (${error.message}). Please try again.`);
        return;
    }
    feedbackMessage.value = "";
    feedbackCount.textContent = `0 / ${FEEDBACK_MAX}`;
    showStatus(feedbackStatus, email ? `Thanks! We'll reply to ${email} if we need to.` : "Thanks! Your feedback was sent.");
});

loadAccountSettings();
