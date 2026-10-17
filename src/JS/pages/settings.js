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
    displayNameInput.value = metadata.display_name || metadata.username || "";
    emailChangeInput.placeholder = `Current: ${user.email}`;
    showStatus(accountStatus, "");
    accountFields.disabled = false;
    return user;
}

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

/* weight and distance units: saved in this browser when "Save Settings" is clicked.
   The weight unit is what My Dogs and the dog chart show weights in (getWeightUnit in dogs.js) */

const WEIGHT_UNIT_STORAGE_KEY = "weightUnit";
const DISTANCE_UNIT_STORAGE_KEY = "distanceUnit";
const weightUnitSelect = document.getElementById("weight-unit");
const distanceUnitSelect = document.getElementById("distance-unit");
const unitsStatus = document.getElementById("units-status");

weightUnitSelect.value = getWeightUnit();
distanceUnitSelect.value = localStorage.getItem(DISTANCE_UNIT_STORAGE_KEY) || distanceUnitSelect.value;

document.getElementById("save-settings").addEventListener("click", () => {
    localStorage.setItem(WEIGHT_UNIT_STORAGE_KEY, weightUnitSelect.value);
    localStorage.setItem(DISTANCE_UNIT_STORAGE_KEY, distanceUnitSelect.value);
    const unitName = weightUnitSelect.value === "kg" ? "kilograms" : "pounds";
    showStatus(unitsStatus, `Saved. Dog weights now show in ${unitName} on this device.`);
});

/* export: download this browser's training data, plus the account's cloud data if signed in */

const EXPORT_TABLES = ["dogs", "training_sessions", "dog_task_progress", "account_settings"];
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

// the signed-in account's rows from each exported table (RLS limits them to this user)
async function collectCloudData() {
    const cloud = {};
    for (const table of EXPORT_TABLES) {
        const { data, error } = await supabaseClient.from(table).select("*");
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

loadAccountSettings();
