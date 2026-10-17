/* Top-nav account links. Needs supabaseClient.js loaded first.
   Signed out: the page's "Create Account" / "Login" links stay as they are.
   Signed in: they become the user's profile picture, username + email (linking to settings.html) and "Log Out".
   The picture lives in account_settings.avatar (supabase/profile_picture.sql), cached in localStorage for a quick
   first paint; Settings changes it with setAccountAvatar(). */

const AVATAR_CACHE_KEY = "avatar";
const AVATAR_OWNER_KEY = "avatarOwner";

// the signed-in account's cached picture (a data: URL), or "" if none is cached for this account
function getCachedAvatar(userId) {
    try {
        return localStorage.getItem(AVATAR_OWNER_KEY) === userId ? localStorage.getItem(AVATAR_CACHE_KEY) || "" : "";
    } catch (error) {
        return "";
    }
}

function cacheAvatar(userId, avatar) {
    try {
        localStorage.setItem(AVATAR_OWNER_KEY, userId);
        if (avatar) localStorage.setItem(AVATAR_CACHE_KEY, avatar);
        else localStorage.removeItem(AVATAR_CACHE_KEY);
    } catch (error) {
        // storage full or blocked; the picture still shows after the account loads
    }
}

// a round avatar: the picture, or the first letter of the name on tan when there's none
function makeAvatar(user, className) {
    const metadata = user.user_metadata || {};
    const name = metadata.display_name || metadata.username || user.email || "?";
    const avatar = document.createElement("span");
    avatar.className = className;
    avatar.setAttribute("aria-hidden", "true");
    const picture = getCachedAvatar(user.id);
    if (picture) {
        const img = document.createElement("img");
        img.src = picture;
        img.alt = "";
        avatar.appendChild(img);
    } else {
        avatar.textContent = name.trim().charAt(0).toUpperCase();
    }
    return avatar;
}

// fill a nav link with the user's picture, display name (else sign-up username, if set) and email
function fillAccountLink(link, user) {
    const metadata = user.user_metadata || {};
    const username = metadata.display_name || metadata.username;
    link.textContent = "";
    link.append(makeAvatar(user, "avatar nav-avatar"));
    if (username) {
        const nameSpan = document.createElement("span");
        nameSpan.className = "nav-username";
        nameSpan.textContent = username;
        link.append(nameSpan);
    }
    const emailSpan = document.createElement("span");
    emailSpan.className = "nav-email";
    emailSpan.textContent = user.email;
    link.append(emailSpan);
}

// upload pending sessions and clear this browser's sessions and goals (if loaded), sign out, then go home
async function logOut() {
    if (typeof clearSessionsForLogOut === "function") {
        const cleared = await clearSessionsForLogOut();
        if (!cleared && !confirm("Some training sessions haven't synced to your account yet. They'll stay on this device. Log out anyway?")) return;
    }
    // pages without trainingData.js skip this; the next account's goal sync drops the old goals instead
    if (typeof clearGoalsForLogOut === "function") clearGoalsForLogOut();
    // send any display setting changes not uploaded yet, then forget them (the next account's sync also drops them)
    if (typeof clearCommandDisplayForLogOut === "function") {
        await syncCommandDisplay();
        clearCommandDisplayForLogOut();
    }
    // same for the account's added/removed commands, so the next person (or no account) starts from the defaults
    if (typeof clearCommandListForLogOut === "function") {
        await syncCommandList();
        clearCommandListForLogOut();
    }
    // same for command notes
    if (typeof clearCommandNotesForLogOut === "function") {
        await syncCommandNotes();
        clearCommandNotesForLogOut();
    }
    // forget the selected dog so the next account never tags sessions with this account's dog
    localStorage.removeItem("currentDogId");
    localStorage.removeItem(AVATAR_CACHE_KEY);
    localStorage.removeItem(AVATAR_OWNER_KEY);
    if (supabaseClient) await supabaseClient.auth.signOut();
    window.location.href = "index.html";
}

// mark the Directory menu link for the page you're on
function markCurrentNavLink() {
    const page = window.location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".nav-dropdown-menu a").forEach((link) => {
        if (link.getAttribute("href") === page) link.setAttribute("aria-current", "page");
    });
}

markCurrentNavLink();

// swap the nav's create/login links for account info when someone is signed in
async function updateAccountNav() {
    const createLink = document.querySelector('.top-nav a[href="create.html"]');
    const loginLink = document.querySelector('.top-nav a[href="login.html"]');
    if (!createLink || !loginLink) return;

    const user = await getSignedInUser();
    if (!user) return;

    fillAccountLink(createLink, user);
    createLink.classList.add("nav-account-link");
    createLink.href = "settings.html";

    loginLink.textContent = "Log Out";
    loginLink.href = "#";
    loginLink.addEventListener("click", (event) => {
        event.preventDefault();
        logOut();
    });

    // the cached picture showed straight away; now check the account's (it may have changed on another device)
    const avatar = await loadAccountAvatar(user);
    if (avatar !== null) fillAccountLink(createLink, user);
}

// the account's picture from account_settings, cached; "" for none, null if it couldn't be read
async function loadAccountAvatar(user) {
    try {
        const { data, error } = await supabaseClient.from("account_settings").select("avatar").maybeSingle();
        if (error) throw error;
        const avatar = (data && data.avatar) || "";
        cacheAvatar(user.id, avatar);
        window.dispatchEvent(new window.CustomEvent("avatarchanged", { detail: { avatar } }));
        return avatar;
    } catch (error) {
        // the column isn't there until supabase/profile_picture.sql is run; keep whatever is cached
        console.error("Could not load profile picture:", error);
        return null;
    }
}

// save (a data: URL) or remove (null) the signed-in account's picture, and update the top bar
async function setAccountAvatar(avatar) {
    const user = await getSignedInUser();
    if (!user) throw new Error("Please log in to change your profile picture.");
    const { error } = await supabaseClient
        .from("account_settings")
        .upsert({ account_id: user.id, avatar: avatar || null, updated_at: new Date().toISOString() }, { onConflict: "account_id" });
    if (error && error.code === "PGRST204") throw new Error("Profile pictures aren't set up yet. Run supabase/profile_picture.sql in Supabase.");
    if (error) throw error;
    cacheAvatar(user.id, avatar || "");
    const link = document.querySelector(".nav-account-link");
    if (link) fillAccountLink(link, user);
    window.dispatchEvent(new window.CustomEvent("avatarchanged", { detail: { avatar: avatar || "" } }));
}

updateAccountNav();
