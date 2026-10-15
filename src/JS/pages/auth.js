/* Create-account and login forms (create.html, login.html). Needs supabaseClient.js, dogs.js and tasklists.js loaded first. */

const authMessage = document.getElementById("auth-message");

// show a status or error line under the form
function showAuthMessage(text, isError) {
    if (!authMessage) return;
    authMessage.textContent = text;
    authMessage.classList.toggle("auth-error", Boolean(isError));
}

// set up the user's starter data, then go to the home page
async function finishSignIn(user) {
    try {
        await ensureDefaultTaskLists(user.id);
    } catch (error) {
        console.error("Could not seed default task lists:", error);
    }
    // select one of the account's dogs (dogs are added on the settings page)
    try {
        await ensureFirstDog();
    } catch (error) {
        console.error("Could not select a dog:", error);
    }
    window.location.href = "index.html";
}

if (!supabaseClient) {
    showAuthMessage("Accounts aren't available yet: add your Supabase keys to src/JS/shared/supabaseClient.js.", true);
}

// already signed in: show account settings instead of the form
getSignedInUser().then((user) => {
    if (user) window.location.replace("settings.html");
});

const createForm = document.getElementById("inputSect");
if (createForm && supabaseClient) {
    createForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        showAuthMessage("Creating account...");

        const { data, error } = await supabaseClient.auth.signUp({
            email: document.getElementById("email").value.trim(),
            password: document.getElementById("password").value,
            options: { data: { username: document.getElementById("username").value.trim() } },
        });
        if (error) {
            showAuthMessage(error.message, true);
            return;
        }

        // with email confirmation on, there's no session until the user clicks the link
        if (data.session) {
            await finishSignIn(data.user);
        } else {
            showAuthMessage("Check your email to confirm your account, then log in.");
        }
    });
}

const loginForm = document.getElementById("login-form");
if (loginForm && supabaseClient) {
    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        showAuthMessage("Logging in...");

        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: document.getElementById("email").value.trim(),
            password: document.getElementById("password").value,
        });
        if (error) {
            showAuthMessage(error.message, true);
            return;
        }
        await finishSignIn(data.user);
    });
}
