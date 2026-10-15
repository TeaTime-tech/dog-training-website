/* dogs.html: list the account's dogs, pick which one is being trained, and add, rename or delete dogs.
   Needs supabaseClient.js, shared/dogs.js and sessions.js loaded first. */

const dogsStatus = document.getElementById("dogs-status");
const dogListSection = document.getElementById("dog-list-section");
const addDogSection = document.getElementById("add-dog-section");
const dogList = document.getElementById("dog-list");
const dogListEmpty = document.getElementById("dog-list-empty");
const addDogForm = document.getElementById("add-dog-form");
const newDogNameInput = document.getElementById("new-dog-name");
const unassignedSection = document.getElementById("unassigned-section");
const unassignedSummary = document.getElementById("unassigned-summary");
const assignForm = document.getElementById("assign-form");
const assignDogSelect = document.getElementById("assign-dog");

let accountDogs = [];
let renamingDogId = null;

// show a status line above the dog list (in red when it's an error)
function showDogsStatus(text, isError) {
    dogsStatus.textContent = text;
    dogsStatus.classList.toggle("dogs-error", Boolean(isError));
}

// a small text-style button for a dog row
function makeRowButton(text, className, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    button.addEventListener("click", onClick);
    return button;
}

// one dog's row: name, "Training now" or a button to switch to it, and rename/delete
function renderDogRow(dog) {
    const row = document.createElement("li");
    row.className = "dog-row";

    if (dog.id === renamingDogId) {
        const input = document.createElement("input");
        input.type = "text";
        input.className = "dog-rename-input";
        input.value = dog.name;
        input.maxLength = 50;
        input.setAttribute("aria-label", `New name for ${dog.name}`);
        const save = () => saveDogName(dog, input.value);
        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") save();
            if (event.key === "Escape") cancelRename();
        });
        const actions = document.createElement("div");
        actions.className = "dog-row-actions";
        actions.append(
            makeRowButton("Save", "row-save-btn", save),
            makeRowButton("Cancel", "row-cancel-btn", cancelRename),
        );
        row.append(input, actions);
        setTimeout(() => input.focus(), 0);
        return row;
    }

    const name = document.createElement("span");
    name.className = "dog-name";
    name.textContent = dog.name;

    const actions = document.createElement("div");
    actions.className = "dog-row-actions";
    if (dog.id === getCurrentDogId()) {
        const badge = document.createElement("span");
        badge.className = "current-dog-badge";
        badge.textContent = "Training now";
        actions.append(badge);
    } else {
        actions.append(makeRowButton("Train this dog", "row-save-btn", () => selectDog(dog)));
    }
    actions.append(
        makeRowButton("Rename", "restore-btn", () => startRename(dog)),
        makeRowButton("Delete", "hide-btn delete-dog-btn", () => removeDog(dog)),
    );

    row.append(name, actions);
    return row;
}

// redraw the list from accountDogs
function renderDogList() {
    dogList.replaceChildren(...accountDogs.map(renderDogRow));
    dogListEmpty.hidden = accountDogs.length > 0;
    renderUnassignedSessions();
}

// show "Sessions Without a Dog" when there are dogs to give them to, with the current dog preselected
function renderUnassignedSessions() {
    const count = getSessionHistory().filter((session) => !session.dogId).length;
    unassignedSection.hidden = count === 0 || accountDogs.length === 0;
    if (unassignedSection.hidden) return;

    unassignedSummary.textContent = `${count} training session${count === 1 ? " isn't" : "s aren't"} assigned to a dog, so ${count === 1 ? "it doesn't" : "they don't"} show on View Logs.`;
    const picked = assignDogSelect.value || getCurrentDogId();
    assignDogSelect.replaceChildren(...accountDogs.map((dog) => {
        const option = document.createElement("option");
        option.value = dog.id;
        option.textContent = dog.name;
        return option;
    }));
    if (accountDogs.some((dog) => dog.id === picked)) assignDogSelect.value = picked;
}

// load the account's dogs, keep the selected dog valid, and draw the page
async function loadDogsPage() {
    const user = await getSignedInUser();
    if (!user) {
        dogsStatus.textContent = "";
        const loginLink = document.createElement("a");
        loginLink.href = "login.html";
        loginLink.textContent = "Log in";
        dogsStatus.append(loginLink, " to see and add your dogs.");
        return;
    }
    try {
        accountDogs = await getDogs();
        if (!accountDogs.some((dog) => dog.id === getCurrentDogId())) {
            setCurrentDogId(accountDogs.length ? accountDogs[0].id : null);
        }
        showDogsStatus("");
        dogListSection.hidden = false;
        addDogSection.hidden = false;
        renderDogList();
    } catch (error) {
        console.error("Could not load dogs:", error);
        showDogsStatus(`Couldn't load your dogs: ${error.message}`, true);
    }
}

// make a dog the one new sessions are logged for
function selectDog(dog) {
    setCurrentDogId(dog.id);
    renderDogList();
    showDogsStatus(`Now training ${dog.name}. New sessions are logged for ${dog.name}.`);
}

// switch a row into rename mode
function startRename(dog) {
    renamingDogId = dog.id;
    renderDogList();
}

// leave rename mode without saving
function cancelRename() {
    renamingDogId = null;
    renderDogList();
}

// save a new name for a dog
async function saveDogName(dog, newName) {
    const oldName = dog.name;
    try {
        const updated = await renameDog(dog.id, newName);
        accountDogs = accountDogs.map((d) => (d.id === updated.id ? updated : d));
        renamingDogId = null;
        renderDogList();
        showDogsStatus(`Renamed ${oldName} to ${updated.name}.`);
    } catch (error) {
        console.error("Could not rename dog:", error);
        showDogsStatus(`Couldn't rename ${dog.name}: ${error.message}`, true);
    }
}

// delete a dog after confirming; its sessions go too, so remove them from this browser as well
async function removeDog(dog) {
    const sessionCount = getSessionHistory().filter((session) => session.dogId === dog.id).length;
    const sessionWarning = sessionCount
        ? ` This also permanently deletes the ${sessionCount} training session${sessionCount === 1 ? "" : "s"} logged for ${dog.name}.`
        : "";
    if (!confirm(`Delete ${dog.name}?${sessionWarning} This can't be undone.`)) return;

    try {
        await deleteDog(dog.id);
        // the account already dropped them; also drop copies not uploaded yet, which could no longer upload
        if (sessionCount) {
            setSessionHistory(getSessionHistory().filter((session) => session.dogId !== dog.id));
        }
        accountDogs = accountDogs.filter((d) => d.id !== dog.id);
        if (!getCurrentDogId() && accountDogs.length) setCurrentDogId(accountDogs[0].id);
        renderDogList();
        const current = accountDogs.find((d) => d.id === getCurrentDogId());
        showDogsStatus(current ? `Deleted ${dog.name}. Now training ${current.name}.` : `Deleted ${dog.name}.`);
    } catch (error) {
        console.error("Could not delete dog:", error);
        showDogsStatus(`Couldn't delete ${dog.name}: ${error.message}`, true);
    }
}

// give every session without a dog to the picked dog; the edit syncs them to the account
assignForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const dog = accountDogs.find((d) => d.id === assignDogSelect.value);
    if (!dog) return;
    const history = getSessionHistory();
    const unassigned = history.filter((session) => !session.dogId);
    if (!unassigned.length) return;
    unassigned.forEach((session) => {
        session.dogId = dog.id;
    });
    setSessionHistory(history);
    renderUnassignedSessions();
    showDogsStatus(`Assigned ${unassigned.length} session${unassigned.length === 1 ? "" : "s"} to ${dog.name}.`);
});

// sessions from the account arrived; the unassigned count may have changed
window.addEventListener("sessionhistorysynced", (event) => {
    if (event.detail.changed && !dogListSection.hidden) renderUnassignedSessions();
});

addDogForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = addDogForm.querySelector("button");
    submitButton.disabled = true;
    try {
        const dog = await createDog(newDogNameInput.value);
        accountDogs.push(dog);
        setCurrentDogId(dog.id);
        newDogNameInput.value = "";
        renderDogList();
        showDogsStatus(`Added ${dog.name}. New sessions are logged for ${dog.name}.`);
    } catch (error) {
        console.error("Could not add dog:", error);
        showDogsStatus(`Couldn't add dog: ${error.message}`, true);
    } finally {
        submitButton.disabled = false;
    }
});

loadDogsPage();
