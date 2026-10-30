/* dogs.html: a card for each of the account's dogs (profile and training stats), picking which one is
   being trained, and adding, editing or deleting dogs.
   Needs supabaseClient.js, shared/dogs.js, sessions.js and trainingData.js loaded first. */

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
const deleteUnassignedButton = document.getElementById("delete-unassigned-btn");

let accountDogs = [];
let editingDogId = null;
// cards opened or closed by hand, so redraws keep them that way
const openDogIds = new Set();
const closedDogIds = new Set();

// show a status line above the dog list (in red when it's an error)
function showDogsStatus(text, isError) {
    dogsStatus.textContent = text;
    dogsStatus.classList.toggle("dogs-error", Boolean(isError));
}

// a small text-style button for a dog card
function makeRowButton(text, className, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    button.addEventListener("click", onClick);
    return button;
}

// "3 years old", "1 year 4 months old", "5 months old" from a "YYYY-MM-DD" birthday
function formatDogAge(birthday) {
    const [year, month, day] = birthday.split("-").map(Number);
    const today = new Date();
    let months = (today.getFullYear() - year) * 12 + (today.getMonth() + 1 - month);
    if (today.getDate() < day) months -= 1;
    if (months < 1) return "under 1 month old";
    if (months < 12) return `${months} month${months === 1 ? "" : "s"} old`;
    const years = Math.floor(months / 12);
    const extraMonths = months % 12;
    if (years >= 2 || extraMonths === 0) return `${years} year${years === 1 ? "" : "s"} old`;
    return `1 year ${extraMonths} month${extraMonths === 1 ? "" : "s"} old`;
}

// "Today", "Yesterday", "5 days ago" or a date, for a "YYYY-MM-DD" day
function formatLastTrained(dateString) {
    const [year, month, day] = dateString.split("-").map(Number);
    const [ty, tm, td] = localDateString().split("-").map(Number);
    const daysAgo = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(year, month - 1, day)) / 86400000);
    if (daysAgo <= 0) return "Today";
    if (daysAgo === 1) return "Yesterday";
    if (daysAgo < 30) return `${daysAgo} days ago`;
    return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// "X hr Y min" (or "X min") for a number of seconds
function formatTrainingTime(seconds) {
    const totalMinutes = Math.round(seconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) return `${minutes} min`;
    return minutes ? `${hours} hr ${minutes} min` : `${hours} hr`;
}

// session count, training time, commands practiced and last training day for one dog
function getDogStats(dogId) {
    const sessions = getSessionHistory().filter((session) => session.dogId === dogId);
    let seconds = 0;
    let lastDate = "";
    const commands = new Set();
    sessions.forEach((session) => {
        // a session's length (Session Duration) if entered, else its Duration, as on View Logs
        const minutes = Number(session.sessionTotalMinutes);
        seconds += Number.isFinite(minutes) && minutes > 0 ? minutes * 60 : parseStoredDurationSeconds(session.duration) || 0;
        if (session.command) commands.add(session.command.toLowerCase());
        if (session.date && session.date > lastDate) lastDate = session.date;
    });
    return { sessions: sessions.length, seconds, commands: commands.size, lastDate };
}

// one stat tile: a value over a label
function makeStatTile(value, label, variant) {
    const tile = document.createElement("div");
    tile.className = variant ? `stat-tile stat-tile--${variant}` : "stat-tile";
    const valueEl = document.createElement("span");
    valueEl.className = "stat-value";
    valueEl.textContent = value;
    const labelEl = document.createElement("span");
    labelEl.className = "stat-label";
    labelEl.textContent = label;
    tile.append(valueEl, labelEl);
    return tile;
}

// a labeled field for the edit form
function makeEditField(labelText, control) {
    const field = document.createElement("div");
    field.className = "field";
    const label = document.createElement("label");
    label.htmlFor = control.id;
    label.textContent = labelText;
    field.append(label, control);
    return field;
}

// a dog's card in edit mode: name, breed, birthday and notes with Save / Cancel
function renderDogEditForm(dog, card) {
    const form = document.createElement("form");
    form.className = "dog-edit-form";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.id = `edit-name-${dog.id}`;
    nameInput.value = dog.name;
    nameInput.maxLength = 50;
    nameInput.required = true;

    const breedInput = document.createElement("input");
    breedInput.type = "text";
    breedInput.id = `edit-breed-${dog.id}`;
    breedInput.value = dog.breed || "";
    breedInput.maxLength = 60;
    breedInput.placeholder = "e.g. Border Collie";

    const birthdayInput = document.createElement("input");
    birthdayInput.type = "date";
    birthdayInput.id = `edit-birthday-${dog.id}`;
    birthdayInput.value = dog.birthday || "";
    birthdayInput.max = localDateString();

    const notesInput = document.createElement("textarea");
    notesInput.id = `edit-notes-${dog.id}`;
    notesInput.value = dog.notes || "";
    notesInput.maxLength = 1000;
    notesInput.placeholder = "Temperament, health, favorite rewards...";

    const pair = document.createElement("div");
    pair.className = "dog-edit-pair";
    pair.append(makeEditField("Breed", breedInput), makeEditField("Birthday", birthdayInput));

    const actions = document.createElement("div");
    actions.className = "dog-card-actions";
    const saveButton = document.createElement("button");
    saveButton.type = "submit";
    saveButton.className = "row-save-btn";
    saveButton.textContent = "Save";
    actions.append(saveButton, makeRowButton("Cancel", "row-cancel-btn", cancelEdit));

    form.append(makeEditField("Name", nameInput), pair, makeEditField("Notes", notesInput), actions);
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        saveButton.disabled = true;
        await saveDogProfile(dog, {
            name: nameInput.value,
            breed: breedInput.value,
            birthday: birthdayInput.value,
            notes: notesInput.value,
        });
        saveButton.disabled = false;
    });
    form.addEventListener("keydown", (event) => {
        if (event.key === "Escape") cancelEdit();
    });

    card.append(form);
    setTimeout(() => nameInput.focus(), 0);
}

// one dog's card: a collapsible name row ("Training now" or a button to switch to it) over the profile,
// stats, and edit/delete
function renderDogCard(dog) {
    const card = document.createElement("li");
    card.className = "dog-card";
    const isCurrent = dog.id === getCurrentDogId();
    card.classList.toggle("dog-card--current", isCurrent);

    if (dog.id === editingDogId) {
        renderDogEditForm(dog, card);
        return card;
    }

    // the name row is the toggle; the current dog starts open, the rest start closed
    const details = document.createElement("details");
    details.open = openDogIds.has(dog.id) || (isCurrent && !closedDogIds.has(dog.id));
    details.addEventListener("toggle", () => {
        if (details.open) {
            openDogIds.add(dog.id);
            closedDogIds.delete(dog.id);
        } else {
            openDogIds.delete(dog.id);
            closedDogIds.add(dog.id);
        }
    });

    const header = document.createElement("summary");
    header.className = "collapsible-toggle dog-card-header";
    const name = document.createElement("h3");
    name.className = "dog-name";
    name.textContent = dog.name;
    header.append(name);
    if (isCurrent) {
        const badge = document.createElement("span");
        badge.className = "current-dog-badge";
        badge.textContent = "Training now";
        header.append(badge);
    } else {
        // preventDefault so clicking the button doesn't also open or close the card
        header.append(makeRowButton("Train this dog", "row-save-btn", (event) => {
            event.preventDefault();
            selectDog(dog);
        }));
    }
    details.append(header);
    card.append(details);

    const body = document.createElement("div");
    body.className = "dog-card-body";
    details.append(body);

    const profileBits = [dog.breed, dog.birthday && formatDogAge(dog.birthday), formatDogWeight(dog.profile)].filter(Boolean);
    if (profileBits.length) {
        const meta = document.createElement("p");
        meta.className = "dog-meta";
        meta.textContent = profileBits.join(" · ");
        body.append(meta);
    }
    if (dog.notes) {
        const notes = document.createElement("p");
        notes.className = "dog-notes";
        notes.textContent = dog.notes;
        body.append(notes);
    }

    const stats = getDogStats(dog.id);
    const statRow = document.createElement("div");
    statRow.className = "stat-row dog-stats";
    statRow.append(
        makeStatTile(String(stats.sessions), stats.sessions === 1 ? "Session" : "Sessions", "moss"),
        makeStatTile(formatTrainingTime(stats.seconds), "Training time", "brass"),
        makeStatTile(String(stats.commands), stats.commands === 1 ? "Command" : "Commands"),
        makeStatTile(stats.lastDate ? formatLastTrained(stats.lastDate) : "Not yet", "Last trained"),
    );
    body.append(statRow);

    const actions = document.createElement("div");
    actions.className = "dog-card-actions";
    // the full chart (health, care, behavior) lives on its own page
    const chartLink = document.createElement("a");
    chartLink.className = "row-save-btn dog-chart-link";
    chartLink.href = `dog.html?id=${encodeURIComponent(dog.id)}`;
    chartLink.textContent = "Open dog chart";
    actions.append(
        chartLink,
        makeRowButton("Edit profile", "restore-btn", () => startEdit(dog)),
        makeRowButton("Delete", "hide-btn delete-dog-btn", () => removeDog(dog)),
    );
    body.append(actions);
    return card;
}

// redraw the list from accountDogs
function renderDogList() {
    dogList.replaceChildren(...accountDogs.map(renderDogCard));
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
    openDogIds.add(dog.id);
    closedDogIds.delete(dog.id);
    renderDogList();
    showDogsStatus(`Now training ${dog.name}. New sessions are logged for ${dog.name}.`);
}

// switch a card into edit mode
function startEdit(dog) {
    editingDogId = dog.id;
    renderDogList();
}

// leave edit mode without saving
function cancelEdit() {
    editingDogId = null;
    renderDogList();
}

// save a dog's name and profile
async function saveDogProfile(dog, profile) {
    try {
        const updated = await updateDog(dog.id, profile);
        accountDogs = accountDogs.map((d) => (d.id === updated.id ? updated : d));
        editingDogId = null;
        renderDogList();
        showDogsStatus(`Saved ${updated.name}'s profile.`);
    } catch (error) {
        console.error("Could not save dog:", error);
        showDogsStatus(`Couldn't save ${dog.name}: ${error.message}`, true);
    }
}

// delete a dog after confirming; its sessions go too, so remove them from this browser as well
async function removeDog(dog) {
    const sessionCount = getSessionHistory().filter((session) => session.dogId === dog.id).length;
    const exerciseCount = getExerciseHistory().filter((exercise) => exercise.dogId === dog.id).length;
    const logged = [
        sessionCount && `${sessionCount} training session${sessionCount === 1 ? "" : "s"}`,
        exerciseCount && `${exerciseCount} exercise${exerciseCount === 1 ? "" : "s"}`,
    ].filter(Boolean).join(" and ");
    const sessionWarning = logged ? ` This also permanently deletes the ${logged} logged for ${dog.name}.` : "";
    if (!confirm(`Delete ${dog.name}?${sessionWarning} This can't be undone.`)) return;

    try {
        await deleteDog(dog.id);
        // the account already dropped them; also drop copies not uploaded yet, which could no longer upload
        if (sessionCount) {
            setSessionHistory(getSessionHistory().filter((session) => session.dogId !== dog.id));
        }
        if (exerciseCount) {
            setExerciseHistory(getExerciseHistory().filter((exercise) => exercise.dogId !== dog.id));
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
    renderDogList();
    showDogsStatus(`Assigned ${unassigned.length} session${unassigned.length === 1 ? "" : "s"} to ${dog.name}.`);
});

// permanently delete every session without a dog, here and on the account
deleteUnassignedButton.addEventListener("click", () => {
    const history = getSessionHistory();
    const count = history.filter((session) => !session.dogId).length;
    if (!count) return;
    const noun = `${count} session${count === 1 ? "" : "s"}`;
    if (!confirm(`Delete ${noun} that ${count === 1 ? "isn't" : "aren't"} assigned to a dog? This can't be undone.`)) return;
    setSessionHistory(history.filter((session) => session.dogId));
    renderDogList();
    showDogsStatus(`Deleted ${noun} without a dog.`);
});

// sessions from the account arrived; stats and the unassigned count may have changed.
// while a card is being edited, only the unassigned count redraws so typing isn't lost
window.addEventListener("sessionhistorysynced", (event) => {
    if (!event.detail.changed || dogListSection.hidden) return;
    if (editingDogId) renderUnassignedSessions();
    else renderDogList();
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
        showDogsStatus(`Added ${dog.name}. New sessions are logged for ${dog.name}. Use Edit profile to add a breed and birthday.`);
    } catch (error) {
        console.error("Could not add dog:", error);
        showDogsStatus(`Couldn't add dog: ${error.message}`, true);
    } finally {
        submitButton.disabled = false;
    }
});

loadDogsPage();
