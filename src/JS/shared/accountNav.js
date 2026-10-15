/* Top-nav account links. Needs supabaseClient.js loaded first.
   Signed out: the page's "Create Account" / "Login" links stay as they are.
   Signed in: they become the user's username + email (linking to settings.html) and "Log Out". */

// fill a nav link with the user's display name (else sign-up username, if set) followed by their email
function fillAccountLink(link, user) {
    const metadata = user.user_metadata || {};
    const username = metadata.display_name || metadata.username;
    link.textContent = "";
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
    // forget the selected dog so the next account never tags sessions with this account's dog
    localStorage.removeItem("currentDogId");
    if (supabaseClient) await supabaseClient.auth.signOut();
    window.location.href = "index.html";
}

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
}

updateAccountNav();
