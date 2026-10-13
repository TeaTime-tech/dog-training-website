/* Account page (account.html). Needs supabaseClient.js and accountNav.js loaded first. */

// fill in the signed-in user's details, or send them to the login page
async function showAccount() {
    const user = await getSignedInUser();
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    const username = user.user_metadata && user.user_metadata.username;
    document.getElementById("account-username").textContent = username || "(not set)";
    document.getElementById("account-email").textContent = user.email;
    document.getElementById("account-created").textContent =
        new Date(user.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

    document.getElementById("account-details").hidden = false;
}

document.getElementById("logout-button").addEventListener("click", logOut);

showAccount();
