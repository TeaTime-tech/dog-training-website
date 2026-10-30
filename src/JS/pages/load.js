/* load.html (View Logs): totals, session and exercise tables, test data, and the Progress charts (command graph,
   training & exercise time, command timeline).
   Needs dogs.js, sessions.js and trainingData.js loaded first. */

// tell the totals section that sessions or exercises were edited on this page
function notifyTrainingDataChanged() {
    window.dispatchEvent(new CustomEvent("trainingdatachanged"));
}

/*which dog's sessions this page shows (load.html)*/

const VIEWING_DOG_STORAGE_KEY = "loadViewingDog";
const VIEWING_ALL_DOGS = "all";
const viewingDogRow = document.getElementById("viewing-dog-row");
const viewingDogSelect = document.getElementById("viewing-dog");
let viewingDogFilter = VIEWING_ALL_DOGS;

// true when a session or exercise belongs to the dog picked in "Switch dog" (every one when there are no dogs)
function matchesViewingDog(session) {
    if (viewingDogFilter === VIEWING_ALL_DOGS) return true;
    return session.dogId === viewingDogFilter;
}

const PAW_SVG = '<svg viewBox="0 0 120 112" aria-hidden="true" focusable="false"><ellipse cx="18" cy="46" rx="12" ry="15" transform="rotate(-25 18 46)"/><ellipse cx="42" cy="18" rx="12.5" ry="16" transform="rotate(-8 42 18)"/><ellipse cx="78" cy="18" rx="12.5" ry="16" transform="rotate(8 78 18)"/><ellipse cx="102" cy="46" rx="12" ry="15" transform="rotate(25 102 46)"/><path d="M60 52c-14 0-22 9-31 21-7 9-11 15-11 22 0 9 7 15 16 15 10 0 15-5 26-5s16 5 26 5c9 0 16-6 16-15 0-7-4-13-11-22-9-12-17-21-31-21Z"/></svg>';

// one pill per dog next to the page title; the picked one is filled with a paw. Clicking one switches the page to
// that dog through the (hidden) select, so everything else listens to the same "change" as before
function renderViewingDogChips(dogs) {
    const chips = document.getElementById("viewing-dog-chips");
    if (!chips) return;
    chips.replaceChildren(...dogs.map((dog) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "load-dog-chip";
        chip.setAttribute("role", "radio");
        const picked = dog.id === viewingDogSelect.value;
        chip.setAttribute("aria-checked", String(picked));
        chip.tabIndex = picked ? 0 : -1;
        chip.innerHTML = PAW_SVG;
        chip.append(dog.name);
        chip.addEventListener("click", () => {
            if (viewingDogSelect.value === dog.id) return;
            viewingDogSelect.value = dog.id;
            viewingDogSelect.dispatchEvent(new Event("change"));
            renderViewingDogChips(dogs);
            chips.querySelector('[aria-checked="true"]').focus();
        });
        return chip;
    }));
    // arrow keys move between dogs, like radio buttons
    chips.onkeydown = (event) => {
        const step = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 0;
        if (!step) return;
        event.preventDefault();
        const all = Array.from(chips.children);
        const index = all.findIndex((chip) => chip.getAttribute("aria-checked") === "true");
        all[(index + step + all.length) % all.length].click();
    };
}

// fill "Switch dog" with the account's dogs, starting on the last choice, else the current dog
async function loadViewingDogOptions() {
    if (!viewingDogSelect) return;
    let dogs = [];
    try {
        if (await getSignedInUser()) dogs = await getDogs();
    } catch (error) {
        console.error("Could not load dogs:", error);
    }
    if (dogs.length === 0) {
        viewingDogRow.hidden = true;
        viewingDogFilter = VIEWING_ALL_DOGS;
        return;
    }
    // exercises logged before they were tied to a dog belong to the dog you're training
    if (assignLooseExercises(dogs.some((dog) => dog.id === getCurrentDogId()) ? getCurrentDogId() : dogs[0].id)) {
        window.dispatchEvent(new CustomEvent("trainingdatachanged"));
    }

    viewingDogSelect.replaceChildren(...dogs.map((dog) => {
        const option = document.createElement("option");
        option.value = dog.id;
        option.textContent = dog.name;
        return option;
    }));

    let saved = null;
    try {
        saved = localStorage.getItem(VIEWING_DOG_STORAGE_KEY);
    } catch (error) {
        // storage blocked; start from the current dog
    }
    const previous = viewingDogFilter;
    const startingDog = dogs.find((dog) => dog.id === saved)
        || dogs.find((dog) => dog.id === getCurrentDogId())
        || dogs[0];
    viewingDogFilter = startingDog.id;
    viewingDogSelect.value = viewingDogFilter;
    renderViewingDogChips(dogs);
    viewingDogRow.hidden = false;
    if (viewingDogFilter !== previous) window.dispatchEvent(new CustomEvent("viewingdogchanged"));
}

if (viewingDogSelect) {
    viewingDogSelect.addEventListener("change", () => {
        viewingDogFilter = viewingDogSelect.value;
        try {
            localStorage.setItem(VIEWING_DOG_STORAGE_KEY, viewingDogFilter);
        } catch (error) {
            // storage blocked; the choice just won't be remembered
        }
        window.dispatchEvent(new CustomEvent("viewingdogchanged"));
    });
    loadViewingDogOptions();
    // pick up dogs added or removed since the page loaded
    window.addEventListener("sessionhistorysynced", (event) => {
        if (event.detail.changed) loadViewingDogOptions();
    });
}

/*load session history into a table (load.html)*/

const dataTableBodyEl = document.getElementById("data-table-body");

if (dataTableBodyEl) {
    const dateInput = document.getElementById("date");
    const dateClearButton = document.getElementById("date-clear");
    const dataTableBody = document.getElementById("data-table-body");
    const pageSizeSelect = document.getElementById("page-size");
    const prevPageButton = document.getElementById("prev-page");
    const nextPageButton = document.getElementById("next-page");
    const pageSelect = document.getElementById("page-select");
    const pageTotalLabel = document.getElementById("page-total-label");
    let editingIndex = null;
    let currentPage = 1;

    const SESSION_COLUMNS = 7;
    // rows whose details (location, weather, notes) are open, by history index; kept across redraws
    const openSessionDetails = new Set();

    // render a single-row message (e.g. "no sessions found") in place of the table body
    const showTableMessage = (message) => {
        dataTableBody.innerHTML = "";
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = SESSION_COLUMNS;
        cell.className = "log-table-message";
        cell.textContent = message;
        row.appendChild(cell);
        dataTableBody.appendChild(row);
    };

    // "Oct 16 · 9:05 AM" from a session's date and time
    const formatSessionWhen = (session) => {
        const parts = [];
        if (session.date) {
            const date = new Date(`${session.date}T00:00:00`);
            parts.push(Number.isNaN(date.getTime()) ? session.date : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric" }));
        }
        if (session.time) {
            const [hours, minutes] = session.time.split(":").map(Number);
            const time = new Date(2000, 0, 1, hours, minutes);
            parts.push(Number.isNaN(time.getTime()) ? session.time : time.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
        }
        return parts.join(" · ");
    };

    // a table cell with its column name, used as the label when rows turn into cards on phones
    const makeCell = (label, value, className) => {
        const cell = document.createElement("td");
        cell.dataset.label = label;
        if (className) cell.className = className;
        cell.textContent = value ?? "";
        return cell;
    };

    // a read-only row for one session (Edit/Delete at the end), plus a hidden row under it with location,
    // weather and notes that its ▸ button opens. Returns both rows
    function buildViewRow(session, index) {
        const row = document.createElement("tr");
        const details = [["Location", session.location], ["Weather", session.weather], ["Notes", session.notes]]
            .filter(([, value]) => value && value !== "N/A");

        const toggleCell = document.createElement("td");
        toggleCell.className = "col-toggle";
        const detailRow = document.createElement("tr");
        detailRow.className = "log-detail-row";
        detailRow.id = `session-details-${index}`;
        detailRow.hidden = !openSessionDetails.has(index);
        if (details.length) {
            const toggle = document.createElement("button");
            toggle.type = "button";
            toggle.className = "log-row-toggle";
            toggle.setAttribute("aria-expanded", String(!detailRow.hidden));
            toggle.setAttribute("aria-controls", detailRow.id);
            toggle.setAttribute("aria-label", `More about this ${session.command || "session"}`);
            toggle.textContent = "\u25B8";
            toggle.addEventListener("click", () => {
                detailRow.hidden = !detailRow.hidden;
                toggle.setAttribute("aria-expanded", String(!detailRow.hidden));
                if (detailRow.hidden) openSessionDetails.delete(index);
                else openSessionDetails.add(index);
            });
            toggleCell.appendChild(toggle);
        }
        row.appendChild(toggleCell);

        row.append(
            makeCell("Command", session.command, "col-command"),
            makeCell("Reps", session.repetitions),
            makeCell("Duration", formatDurationDisplay(session.duration)),
            makeCell("Score", session.score ? `${session.score}/10` : ""),
            makeCell("When", formatSessionWhen(session)),
        );

        const actionCell = document.createElement("td");
        actionCell.className = "col-actions";

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "restore-btn";
        editButton.textContent = "Edit";
        editButton.addEventListener("click", () => {
            editingIndex = index;
            renderSessionTable();
        });

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "hide-btn";
        deleteButton.textContent = "Delete";
        deleteButton.addEventListener("click", () => {
            if (!confirm("Delete this training session? This cannot be undone.")) {
                return;
            }
            const currentHistory = getSessionHistory();
            currentHistory.splice(index, 1);
            setSessionHistory(currentHistory);
            openSessionDetails.clear();
            notifyTrainingDataChanged();
            renderSessionTable();
        });

        actionCell.appendChild(editButton);
        actionCell.appendChild(deleteButton);
        row.appendChild(actionCell);

        const detailCell = document.createElement("td");
        detailCell.colSpan = SESSION_COLUMNS;
        const list = document.createElement("dl");
        list.className = "log-detail-list";
        details.forEach(([label, value]) => {
            const term = document.createElement("dt");
            term.textContent = label;
            const description = document.createElement("dd");
            description.textContent = value;
            list.append(term, description);
        });
        detailCell.appendChild(list);
        detailRow.appendChild(detailCell);

        const rows = document.createDocumentFragment();
        rows.append(row, detailRow);
        return rows;
    }

    // a labelled field for the edit form
    const makeEditField = (label, control) => {
        const field = document.createElement("label");
        field.className = "log-edit-field";
        const name = document.createElement("span");
        name.textContent = label;
        field.append(name, control);
        return field;
    };

    // an edit form for one session, spanning the whole row, with every field and Save/Cancel
    function buildEditRow(session, index) {
        const row = document.createElement("tr");
        row.className = "log-edit-row";

        const commandSelectEdit = document.createElement("select");
        const commandNames = getVisibleCommandNames();
        if (session.command && !commandNames.includes(session.command)) {
            commandNames.push(session.command);
        }
        commandNames.forEach((name) => {
            const option = document.createElement("option");
            option.value = name;
            option.textContent = name;
            commandSelectEdit.appendChild(option);
        });
        commandSelectEdit.value = session.command ?? "";

        const makeInput = (type, value) => {
            const input = document.createElement("input");
            input.type = type;
            input.value = value ?? "";
            return input;
        };
        const repetitionsInput = makeInput("text", session.repetitions);
        const durationInput = makeInput("text", session.duration);
        const locationInput = makeInput("text", session.location);
        const weatherInput = makeInput("text", session.weather);
        const dateInputEdit = makeInput("date", session.date);
        const timeInputEdit = makeInput("time", session.time);
        const notesInput = makeInput("text", session.notes);

        // "—" (no score) or 1-10
        const scoreSelect = document.createElement("select");
        ["", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].forEach((value) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value || "\u2014";
            scoreSelect.appendChild(option);
        });
        scoreSelect.value = session.score ?? "";

        const cell = document.createElement("td");
        cell.colSpan = SESSION_COLUMNS;
        const form = document.createElement("div");
        form.className = "log-edit-form";
        form.append(
            makeEditField("Command", commandSelectEdit),
            makeEditField("Reps", repetitionsInput),
            makeEditField("Duration", durationInput),
            makeEditField("Score", scoreSelect),
            makeEditField("Date", dateInputEdit),
            makeEditField("Time", timeInputEdit),
            makeEditField("Location", locationInput),
            makeEditField("Weather", weatherInput),
        );
        const notesField = makeEditField("Notes", notesInput);
        notesField.classList.add("log-edit-field--wide");
        form.appendChild(notesField);

        const actions = document.createElement("div");
        actions.className = "log-edit-actions";

        const saveButton = document.createElement("button");
        saveButton.type = "button";
        saveButton.className = "row-save-btn";
        saveButton.textContent = "Save";
        saveButton.addEventListener("click", () => {
            const currentHistory = getSessionHistory();
            currentHistory[index] = {
                ...currentHistory[index],
                command: commandSelectEdit.value,
                repetitions: repetitionsInput.value.trim(),
                duration: durationInput.value.trim(),
                location: locationInput.value.trim(),
                weather: weatherInput.value.trim(),
                score: scoreSelect.value,
                date: dateInputEdit.value,
                time: timeInputEdit.value,
                notes: notesInput.value.trim(),
            };
            setSessionHistory(currentHistory);
            notifyTrainingDataChanged();
            editingIndex = null;
            renderSessionTable();
        });

        const cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.className = "row-cancel-btn";
        cancelButton.textContent = "Cancel";
        cancelButton.addEventListener("click", () => {
            editingIndex = null;
            renderSessionTable();
        });

        actions.append(saveButton, cancelButton);
        form.appendChild(actions);
        cell.appendChild(form);
        row.appendChild(cell);
        return row;
    }

    // rebuild the page-select options (1..totalPages) and enable/disable the prev/next buttons
    function updatePaginationControls(totalPages, totalMatches) {
        pageSelect.innerHTML = "";
        pageSelect.disabled = totalMatches === 0;
        pageTotalLabel.textContent = totalMatches === 0 ? "" : `of ${totalPages}`;

        for (let page = 1; page <= totalPages; page += 1) {
            const option = document.createElement("option");
            option.value = String(page);
            option.textContent = String(page);
            pageSelect.appendChild(option);
        }
        pageSelect.value = String(currentPage);

        prevPageButton.disabled = currentPage <= 1;
        nextPageButton.disabled = currentPage >= totalPages;
    }

    // filter by date, sort newest first, paginate, and render the session history table
    function renderSessionTable() {
        const sessionHistory = getSessionHistory();

        const matches = sessionHistory
            .map((session, index) => ({ session, index }))
            .filter(({ session }) => matchesViewingDog(session))
            .filter(({ session }) => !dateInput.value || session.date === dateInput.value)
            .sort((a, b) => {
                const dateCompare = (b.session.date || "").localeCompare(a.session.date || "");
                if (dateCompare !== 0) {
                    return dateCompare;
                }
                return (b.session.time || "").localeCompare(a.session.time || "");
            });

        const pageSize = Number(pageSizeSelect.value) || 10;
        const totalPages = Math.max(1, Math.ceil(matches.length / pageSize));
        currentPage = Math.min(Math.max(currentPage, 1), totalPages);

        const startIndex = (currentPage - 1) * pageSize;
        const pageMatches = matches.slice(startIndex, startIndex + pageSize);

        dataTableBody.innerHTML = "";

        if (matches.length === 0) {
            showTableMessage(
                dateInput.value ? "No session found for that date." : "No saved sessions found."
            );
        } else {
            pageMatches.forEach(({ session, index }) => {
                const row = index === editingIndex ? buildEditRow(session, index) : buildViewRow(session, index);
                dataTableBody.appendChild(row);
            });
        }

        updatePaginationControls(totalPages, matches.length);
    }

    // picking a date narrows the table to that day; "Show all" clears it
    const applyDateFilter = () => {
        editingIndex = null;
        currentPage = 1;
        dateClearButton.hidden = !dateInput.value;
        renderSessionTable();
    };
    dateInput.addEventListener("change", applyDateFilter);
    dateClearButton.addEventListener("click", () => {
        dateInput.value = "";
        applyDateFilter();
    });

    // newest sessions show as soon as the page opens
    renderSessionTable();

    // sessions from the account arrived (or test data was added); refresh the table unless a row is mid-edit
    window.addEventListener("sessionhistorysynced", (event) => {
        if (event.detail.changed && editingIndex === null) renderSessionTable();
    });
    window.addEventListener("trainingdatachanged", () => {
        if (editingIndex === null) renderSessionTable();
    });

    // a different dog was picked; start back on page 1
    window.addEventListener("viewingdogchanged", () => {
        editingIndex = null;
        currentPage = 1;
        renderSessionTable();
    });

    pageSizeSelect.addEventListener("change", () => {
        currentPage = 1;
        renderSessionTable();
    });

    pageSelect.addEventListener("change", () => {
        currentPage = Number(pageSelect.value) || 1;
        renderSessionTable();
    });

    prevPageButton.addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage -= 1;
            renderSessionTable();
        }
    });

    nextPageButton.addEventListener("click", () => {
        currentPage += 1;
        renderSessionTable();
    });
}

/*load exercise history into a table (load.html)*/

const exerciseTableBodyEl = document.getElementById("exercise-table-body");

if (exerciseTableBodyEl) {
    const exerciseDateInput = document.getElementById("exercise-date");
    const exerciseDateClearButton = document.getElementById("exercise-date-clear");
    const exerciseTableBody = document.getElementById("exercise-table-body");
    const exercisePageSizeSelect = document.getElementById("exercise-page-size");
    const exercisePrevPageButton = document.getElementById("exercise-prev-page");
    const exerciseNextPageButton = document.getElementById("exercise-next-page");
    const exercisePageSelect = document.getElementById("exercise-page-select");
    const exercisePageTotalLabel = document.getElementById("exercise-page-total-label");
    let editingExerciseIndex = null;
    let currentExercisePage = 1;

    // render a single-row message (e.g. "no exercises found") in place of the table body
    const showExerciseTableMessage = (message) => {
        exerciseTableBody.innerHTML = "";
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 6;
        cell.textContent = message;
        row.appendChild(cell);
        exerciseTableBody.appendChild(row);
    };

    // build a read-only table row for one exercise, with Edit/Delete buttons
    function buildExerciseViewRow(exercise, index) {
        const row = document.createElement("tr");
        // labels name each cell when rows turn into cards on phones
        const amount = isDistanceExercise(exercise) ? formatExerciseDistance(exercise) : formatDurationDisplay(exercise.duration);
        [["Name", exercise.name], ["Duration / distance", amount], ["Notes", exercise.notes], ["Date", exercise.date], ["Time", exercise.time]]
            .forEach(([label, value]) => {
                const cell = document.createElement("td");
                cell.dataset.label = label;
                cell.textContent = value ?? "";
                row.appendChild(cell);
            });

        const actionCell = document.createElement("td");

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "restore-btn";
        editButton.textContent = "Edit";
        editButton.addEventListener("click", () => {
            editingExerciseIndex = index;
            renderExerciseTable();
        });

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "hide-btn";
        deleteButton.textContent = "Delete";
        deleteButton.addEventListener("click", () => {
            if (!confirm("Delete this exercise? This cannot be undone.")) {
                return;
            }
            const currentHistory = getExerciseHistory();
            currentHistory.splice(index, 1);
            setExerciseHistory(currentHistory);
            notifyTrainingDataChanged();
            renderExerciseTable();
        });

        actionCell.appendChild(editButton);
        actionCell.appendChild(deleteButton);
        row.appendChild(actionCell);

        return row;
    }

    // build an editable table row with input fields and Save/Cancel buttons
    function buildExerciseEditRow(exercise, index) {
        const row = document.createElement("tr");

        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.value = exercise.name ?? "";

        // the duration, or the distance and its unit for an exercise logged by distance
        const amountInput = buildExerciseAmountInput(exercise);

        const notesInput = document.createElement("input");
        notesInput.type = "text";
        notesInput.value = exercise.notes ?? "";

        const dateInputEdit = document.createElement("input");
        dateInputEdit.type = "date";
        dateInputEdit.value = exercise.date ?? "";

        const timeInputEdit = document.createElement("input");
        timeInputEdit.type = "time";
        timeInputEdit.value = exercise.time ?? "";

        [nameInput, amountInput.field, notesInput, dateInputEdit, timeInputEdit].forEach((field) => {
            const cell = document.createElement("td");
            cell.appendChild(field);
            row.appendChild(cell);
        });

        const actionCell = document.createElement("td");

        const saveButton = document.createElement("button");
        saveButton.type = "button";
        saveButton.className = "row-save-btn";
        saveButton.textContent = "Save";
        saveButton.addEventListener("click", () => {
            const name = nameInput.value.trim();
            if (!name) {
                alert("Please enter an exercise name.");
                return;
            }
            const amount = amountInput.read();
            if (!amount) return;

            const currentHistory = getExerciseHistory();
            currentHistory[index] = {
                ...currentHistory[index],
                name,
                ...amount,
                notes: notesInput.value.trim(),
                date: dateInputEdit.value,
                time: timeInputEdit.value,
            };
            setExerciseHistory(currentHistory);
            notifyTrainingDataChanged();
            editingExerciseIndex = null;
            renderExerciseTable();
        });

        const cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.className = "row-cancel-btn";
        cancelButton.textContent = "Cancel";
        cancelButton.addEventListener("click", () => {
            editingExerciseIndex = null;
            renderExerciseTable();
        });

        actionCell.appendChild(saveButton);
        actionCell.appendChild(cancelButton);
        row.appendChild(actionCell);

        return row;
    }

    // rebuild the page-select options and enable/disable the prev/next buttons
    function updateExercisePaginationControls(totalPages, totalMatches) {
        exercisePageSelect.innerHTML = "";
        exercisePageSelect.disabled = totalMatches === 0;
        exercisePageTotalLabel.textContent = totalMatches === 0 ? "" : `of ${totalPages}`;

        for (let page = 1; page <= totalPages; page += 1) {
            const option = document.createElement("option");
            option.value = String(page);
            option.textContent = String(page);
            exercisePageSelect.appendChild(option);
        }
        exercisePageSelect.value = String(currentExercisePage);

        exercisePrevPageButton.disabled = currentExercisePage <= 1;
        exerciseNextPageButton.disabled = currentExercisePage >= totalPages;
    }

    // filter by date, sort newest first, paginate, and render the exercise history table
    function renderExerciseTable() {
        const exerciseHistory = getExerciseHistory();

        const matches = exerciseHistory
            .map((exercise, index) => ({ exercise, index }))
            .filter(({ exercise }) => matchesViewingDog(exercise))
            .filter(({ exercise }) => !exerciseDateInput.value || exercise.date === exerciseDateInput.value)
            .sort((a, b) => {
                const dateCompare = (b.exercise.date || "").localeCompare(a.exercise.date || "");
                if (dateCompare !== 0) {
                    return dateCompare;
                }
                return (b.exercise.time || "").localeCompare(a.exercise.time || "");
            });

        const pageSize = Number(exercisePageSizeSelect.value) || 10;
        const totalPages = Math.max(1, Math.ceil(matches.length / pageSize));
        currentExercisePage = Math.min(Math.max(currentExercisePage, 1), totalPages);

        const startIndex = (currentExercisePage - 1) * pageSize;
        const pageMatches = matches.slice(startIndex, startIndex + pageSize);

        exerciseTableBody.innerHTML = "";

        if (matches.length === 0) {
            showExerciseTableMessage(
                exerciseDateInput.value ? "No exercise found for that date." : "No saved exercises found."
            );
        } else {
            pageMatches.forEach(({ exercise, index }) => {
                const row = index === editingExerciseIndex
                    ? buildExerciseEditRow(exercise, index)
                    : buildExerciseViewRow(exercise, index);
                exerciseTableBody.appendChild(row);
            });
        }

        updateExercisePaginationControls(totalPages, matches.length);
    }

    // picking a date narrows the table to that day; "Show all" clears it
    const applyExerciseDateFilter = () => {
        editingExerciseIndex = null;
        currentExercisePage = 1;
        exerciseDateClearButton.hidden = !exerciseDateInput.value;
        renderExerciseTable();
    };
    exerciseDateInput.addEventListener("change", applyExerciseDateFilter);
    exerciseDateClearButton.addEventListener("click", () => {
        exerciseDateInput.value = "";
        applyExerciseDateFilter();
    });

    // a different dog was picked; start back on page 1
    window.addEventListener("viewingdogchanged", () => {
        editingExerciseIndex = null;
        currentExercisePage = 1;
        renderExerciseTable();
    });
    // exercises from the account arrived: redraw the table (unless mid-edit) and the totals
    window.addEventListener("exercisessynced", (event) => {
        if (!event.detail.changed) return;
        if (editingExerciseIndex === null) renderExerciseTable();
        window.dispatchEvent(new CustomEvent("trainingdatachanged"));
    });

    // newest exercises show as soon as the page opens, and again after test data or edits elsewhere on the page
    renderExerciseTable();
    window.addEventListener("trainingdatachanged", () => {
        if (editingExerciseIndex === null) renderExerciseTable();
    });

    exercisePageSizeSelect.addEventListener("change", () => {
        currentExercisePage = 1;
        renderExerciseTable();
    });

    exercisePageSelect.addEventListener("change", () => {
        currentExercisePage = Number(exercisePageSelect.value) || 1;
        renderExerciseTable();
    });

    exercisePrevPageButton.addEventListener("click", () => {
        if (currentExercisePage > 1) {
            currentExercisePage -= 1;
            renderExerciseTable();
        }
    });

    exerciseNextPageButton.addEventListener("click", () => {
        currentExercisePage += 1;
        renderExerciseTable();
    });
}

/*generate random sessions/exercises to try out load.html (testing utility)*/

const seedTestDataButton = document.getElementById("seed-test-data");
// only offered when the site runs from this computer (a file or a local server), never on the live site
const isLocalSite = window.location.protocol === "file:" || ["localhost", "127.0.0.1", ""].includes(window.location.hostname);

if (seedTestDataButton && isLocalSite) {
    document.getElementById("load-test-data").hidden = false;
    const SEED_COMMANDS = ["sit", "stay", "come"];
    const SEED_REPETITIONS = ["N/A", "1", "2", "3", "4", "5"];
    const SEED_DURATIONS = ["5", "10", "15", "20", "30", "1", "1:30", "2:00", "3:30"];
    const SEED_EXERCISE_DURATIONS = ["30", "45", "10:00", "15:00", "20:00"];
    const SEED_DISTRACTIONS = ["none", "other dogs", "people", "squirrels", "birds"];
    const SEED_LOCATIONS = ["home", "park", "street"];
    const SEED_WEATHER = ["", "sunny", "cloudy", "rainy", "windy", "indoors"];
    const SEED_SCORES = ["", "4", "5", "6", "7", "8", "9", "10"];
    const SEED_NOTES = ["", "", "Great focus today.", "Struggled with distractions.", "Fast response time.", "Needs more practice."];
    const SEED_EXERCISE_NAMES = ["Walk", "Fetch", "Tug of war", "Agility drill", "Swim", "Off-leash recall practice"];
    const SEED_EXERCISE_NOTES = ["", "", "Good energy.", "Tired quickly.", "Loved it."];

    const randomItem = (list) => list[Math.floor(Math.random() * list.length)];
    const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

    // a random ISO date within the last `days` days
    const randomRecentDateIso = (days) => {
        const date = new Date();
        date.setDate(date.getDate() - randomInt(0, days));
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    };

    const randomTime = () => `${String(randomInt(7, 20)).padStart(2, "0")}:${String(randomInt(0, 59)).padStart(2, "0")}`;

    const generateRandomSessions = (count) => {
        const commandNames = getAllCommandNames();
        const commandPool = commandNames.length ? commandNames : SEED_COMMANDS;
        return Array.from({ length: count }, () => ({
            command: randomItem(commandPool),
            repetitions: randomItem(SEED_REPETITIONS),
            duration: randomItem(SEED_DURATIONS),
            distractions: randomItem(SEED_DISTRACTIONS),
            location: randomItem(SEED_LOCATIONS),
            weather: randomItem(SEED_WEATHER),
            score: randomItem(SEED_SCORES),
            date: randomRecentDateIso(21),
            time: randomTime(),
            sessionStartTime: "",
            sessionEndTime: "",
            sessionTotalMinutes: null,
            notes: randomItem(SEED_NOTES),
        }));
    };

    const generateRandomExercises = (count) => Array.from({ length: count }, () => ({
        dogId: viewingDogFilter === VIEWING_ALL_DOGS ? null : viewingDogFilter,
        name: randomItem(SEED_EXERCISE_NAMES),
        duration: randomItem(SEED_EXERCISE_DURATIONS),
        notes: randomItem(SEED_EXERCISE_NOTES),
        date: randomRecentDateIso(21),
        time: randomTime(),
    }));

    seedTestDataButton.addEventListener("click", () => {
        if (!confirm("Add 25 random test sessions and 15 random test exercises to your saved data?")) {
            return;
        }

        const sessionHistory = getSessionHistory();
        const exerciseHistory = getExerciseHistory();

        setSessionHistory(sessionHistory.concat(generateRandomSessions(25)));
        localStorage.setItem(
            "exerciseHistory",
            JSON.stringify(exerciseHistory.concat(generateRandomExercises(15)))
        );
        // the tables, totals and charts all redraw on this
        notifyTrainingDataChanged();

        alert("Test data added.");
    });
}

// forcibly dismiss a Plotly chart's hover tooltip. Plotly.Fx.unhover doesn't always remove the
// rendered hover label DOM (it can get stuck on screen after a fast mouse-out), so also clear
// the hoverlayer's contents directly as a hard fallback.
function clearPlotlyHover(plotEl) {
    if (!plotEl || typeof Plotly === "undefined") {
        return;
    }
    Plotly.Fx.unhover(plotEl);
    plotEl.querySelectorAll(".hoverlayer").forEach((hoverLayer) => {
        hoverLayer.innerHTML = "";
    });
}

/*graph styling shared by the command graph and the training & exercise time graph (load.html)*/

// site palette, reused so the graphs match the rest of the app (Fitbit-style cards)
const GRAPH_COLORS = {
    ink: "#2F4030",
    moss: "#5A7A4E",
    brass: "#B8925A",
    clay: "#E8DFC9",
    muted: "#6B6456",
    white: "#FFFDF8",
};

const GRAPH_AXIS_STYLE = {
    gridcolor: GRAPH_COLORS.clay,
    zeroline: false,
    showline: false,
    tickfont: { family: "Newsreader, serif", color: GRAPH_COLORS.muted, size: 12 },
    title: { font: { family: "Newsreader, serif", color: GRAPH_COLORS.muted, size: 12 } },
};

const GRAPH_LAYOUT_BASE = {
    font: { family: "Newsreader, serif", color: GRAPH_COLORS.ink },
    paper_bgcolor: GRAPH_COLORS.white,
    plot_bgcolor: GRAPH_COLORS.white,
    margin: { t: 56, r: 24, b: 48, l: 56 },
    bargap: 0.35,
    bargroupgap: 0.15,
    hoverlabel: {
        bgcolor: GRAPH_COLORS.white,
        bordercolor: GRAPH_COLORS.clay,
        font: { family: "Newsreader, serif", color: GRAPH_COLORS.ink },
    },
};

const GRAPH_CONFIG = { responsive: true, displayModeBar: false };

/*chart text and spacing grow with the page: base.css scales the root font size on big screens, and Plotly sizes are in
  px, so every chart is drawn through plotChart, which multiplies its sizes by the same amount*/

const plottedCharts = new Set();

// how much bigger the page is than the 16px phone size
function chartScale() {
    return (parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16) / 16;
}

// a copy of a layout or trace list with font sizes, margins, marker sizes, line widths and bar corners scaled.
// data values (x, y, base...) are left alone
function scaleChartSizes(value, scale, key = "", parentKey = "") {
    if (Array.isArray(value)) return value.map((item) => scaleChartSizes(item, scale, key, parentKey));
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, scaleChartSizes(child, scale, childKey, key)]));
    }
    if (typeof value !== "number") return value;
    const isSize = ["size", "width", "cornerradius"].includes(key) && ["font", "tickfont", "marker", "line"].includes(parentKey);
    const isMargin = parentKey === "margin" && ["t", "r", "b", "l", "pad"].includes(key);
    return isSize || isMargin ? Math.round(value * scale * 10) / 10 : value;
}

// fill in the font sizes Plotly would otherwise default to, so they scale too
function withDefaultChartFonts(layout) {
    const font = (base, size) => ({ ...(base || {}), size: (base && base.size) || size });
    const filled = { ...layout, font: font(layout.font, 12), hoverlabel: { ...(layout.hoverlabel || {}), font: font(layout.hoverlabel && layout.hoverlabel.font, 13) } };
    if (layout.title) {
        const title = typeof layout.title === "string" ? { text: layout.title } : layout.title;
        filled.title = { ...title, font: font(title.font, 17) };
    }
    if (layout.legend) filled.legend = { ...layout.legend, font: font(layout.legend.font, 12) };
    return filled;
}

// the charts are written with the light colors; each is swapped for its token's current value (dark mode)
const CHART_COLOR_TOKENS = {
    "#2f4030": "--ink",
    "#5a7a4e": "--moss",
    "#b8925a": "--brass",
    "#e8dfc9": "--clay",
    "#6b6456": "--muted",
    "#fffdf8": "--surface",
};

// a copy of a layout or trace list with its colors matched to the current theme
function themeChartColors(value) {
    if (Array.isArray(value)) return value.map(themeChartColors);
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, themeChartColors(child)]));
    }
    const token = typeof value === "string" && CHART_COLOR_TOKENS[value.toLowerCase()];
    if (token) {
        const themed = window.getComputedStyle(document.documentElement).getPropertyValue(token).trim();
        return themed || value;
    }
    return value;
}

// redraw one chart from its saved layout at the current size and theme
function drawChart(chartEl, scale = chartScale()) {
    const { data, layout, config } = chartEl.chartBase;
    return Plotly.react(chartEl, themeChartColors(scaleChartSizes(data, scale)), themeChartColors(scaleChartSizes(layout, scale)), config);
}

// draw (or redraw) a chart at the page's current size and theme; returns Plotly's promise
function plotChart(chartEl, data, layout, config = GRAPH_CONFIG) {
    chartEl.chartBase = { data, layout: withDefaultChartFonts(layout), config };
    plottedCharts.add(chartEl);
    return drawChart(chartEl);
}

// light/dark switched: redraw every chart in the new colors
window.addEventListener("themechange", () => {
    plottedCharts.forEach((chartEl) => {
        if (chartEl.isConnected && chartEl.chartBase && typeof Plotly !== "undefined") drawChart(chartEl);
    });
});

// when the window changes size enough to change the page's scale, redraw every chart at the new size
let lastChartScale = chartScale();
let chartResizeTimer = null;
window.addEventListener("resize", () => {
    clearTimeout(chartResizeTimer);
    chartResizeTimer = setTimeout(() => {
        const scale = chartScale();
        if (scale === lastChartScale) return;
        lastChartScale = scale;
        plottedCharts.forEach((chartEl) => {
            if (!chartEl.isConnected || !chartEl.chartBase) return;
            drawChart(chartEl, scale);
        });
    }, 150);
});

// build a bar trace (Daily) or a line trace (Monthly/Yearly) depending on the timeframe
const buildGraphTrace = (traceType, name, x, y, color, yaxisId) => {
    if (traceType === "bar") {
        // offsetgroup forces bars to sit side by side even though they're on different y-axes
        // ("group" barmode alone doesn't reliably space bars that span more than one y-axis)
        return {
            name,
            x,
            y,
            type: "bar",
            yaxis: yaxisId,
            offsetgroup: yaxisId,
            marker: { color, cornerradius: 6 },
        };
    }
    return {
        name,
        x,
        y,
        type: "scatter",
        mode: "lines+markers",
        yaxis: yaxisId,
        line: { color, width: 3, shape: "linear" },
        marker: { color, size: 7 },
    };
};

/*view command metrics over time as a graph (load.html)*/

const graphCommandSelect = document.getElementById("graph-command");

if (graphCommandSelect) {
    getAllCommandNames().forEach((name) => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        graphCommandSelect.appendChild(option);
    });

    const graphMetricSelect = document.getElementById("graph-metric");
    const graphTimeframeSelect = document.getElementById("graph-timeframe");
    const graphChartTypeSelect = document.getElementById("graph-chart-type");
    const graphDayPicker = document.getElementById("graph-day-picker");
    const graphDayPickerLabel = document.getElementById("graph-day-picker-label");
    const graphMonthPicker = document.getElementById("graph-month-picker");
    const graphMonthPickerLabel = document.getElementById("graph-month-picker-label");
    const graphYearPicker = document.getElementById("graph-year-picker");
    const graphYearPickerLabel = document.getElementById("graph-year-picker-label");
    const graphPlotEl = document.getElementById("tester");
    const graphStatSummary = document.getElementById("graph-stat-summary");

    // Plotly's mouseout hover-dismiss can miss when the cursor leaves quickly, leaving the
    // tooltip stuck on screen - force-clear it whenever the pointer leaves the chart area
    graphPlotEl.addEventListener("mouseleave", () => clearPlotlyHover(graphPlotEl));

    // default the day/month pickers to today, and show only the one matching the current "Group by"
    const graphNow = new Date();
    const graphTodayIso = `${graphNow.getFullYear()}-${String(graphNow.getMonth() + 1).padStart(2, "0")}-${String(graphNow.getDate()).padStart(2, "0")}`;
    graphDayPicker.value = graphTodayIso;
    graphMonthPicker.value = graphTodayIso.slice(0, 7);
    graphYearPicker.value = graphTodayIso.slice(0, 4);

    const updateGraphPickerVisibility = () => {
        const timeframe = graphTimeframeSelect.value;
        graphDayPicker.hidden = timeframe !== "daily";
        graphDayPickerLabel.hidden = timeframe !== "daily";
        graphMonthPicker.hidden = timeframe !== "monthly";
        graphMonthPickerLabel.hidden = timeframe !== "monthly";
        graphYearPicker.hidden = timeframe !== "yearly";
        graphYearPickerLabel.hidden = timeframe !== "yearly";
    };

    graphTimeframeSelect.addEventListener("change", updateGraphPickerVisibility);
    updateGraphPickerVisibility();

    // bucket key for one session, depending on the chosen "Group by":
    // Day -> time of day (within the picked day), Month -> exact date (within the picked month),
    // Yearly -> month (within the picked year), All Time -> a single bucket
    const getGraphBucketKey = (session, timeframe) => {
        if (timeframe === "daily") {
            return session.time || "Unknown time";
        }
        if (timeframe === "monthly") {
            return session.date;
        }
        if (timeframe === "yearly") {
            return session.date.slice(0, 7);
        }
        return "All time";
    };

    const GRAPH_MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    // sum repetitions/duration per bucket so multiple sessions in the same bucket combine into one bar
    const groupSessionsByTimeframe = (matches, timeframe) => {
        const buckets = new Map();

        matches.forEach((session) => {
            const key = getGraphBucketKey(session, timeframe);
            if (!buckets.has(key)) {
                buckets.set(key, { repetitions: 0, duration: 0 });
            }
            const bucket = buckets.get(key);
            bucket.repetitions += Number(session.repetitions) || 0;
            bucket.duration += parseStoredDurationSeconds(session.duration) || 0;
        });

        // Yearly always shows all 12 months so the whole year lines up: empty months are 0,
        // and months that haven't happened yet are left blank so lines don't drop to 0
        if (timeframe === "yearly") {
            const year = graphYearPicker.value || graphTodayIso.slice(0, 4);
            const monthKeys = GRAPH_MONTH_NAMES.map((_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
            const valueFor = (key, field) => {
                if (key > graphTodayIso.slice(0, 7)) return null;
                return buckets.has(key) ? buckets.get(key)[field] : 0;
            };
            return {
                labels: GRAPH_MONTH_NAMES,
                repetitions: monthKeys.map((key) => valueFor(key, "repetitions")),
                durations: monthKeys.map((key) => valueFor(key, "duration")),
            };
        }

        const keys = Array.from(buckets.keys()).sort();
        return {
            labels: keys,
            repetitions: keys.map((key) => buckets.get(key).repetitions),
            durations: keys.map((key) => buckets.get(key).duration),
        };
    };

    // build one stat tile (value + label) for the All Time summary
    const buildGraphStatTile = (value, label, variant) => {
        const tile = document.createElement("div");
        tile.className = variant ? `stat-tile stat-tile--${variant}` : "stat-tile";
        const valueEl = document.createElement("span");
        valueEl.className = "stat-value";
        valueEl.textContent = value;
        const labelEl = document.createElement("span");
        labelEl.className = "stat-label";
        labelEl.textContent = label;
        tile.appendChild(valueEl);
        tile.appendChild(labelEl);
        return tile;
    };

    // draw the graph for the current options (called whenever one changes, the dog changes, or sessions arrive)
    const drawCommandGraph = () => {
        if (typeof Plotly === "undefined") return;
        const sessionHistory = getSessionHistory();
        const selectedCommand = graphCommandSelect.value;
        const selectedMetric = graphMetricSelect.value;
        const selectedTimeframe = graphTimeframeSelect.value;
        const selectedChartType = graphChartTypeSelect.value;

        let matches = sessionHistory
            .filter((session) => session.command === selectedCommand && session.date && matchesViewingDog(session))
            .sort((a, b) => a.date.localeCompare(b.date));

        if (selectedTimeframe === "daily") {
            const pickedDay = graphDayPicker.value || graphTodayIso;
            matches = matches.filter((session) => session.date === pickedDay);
        } else if (selectedTimeframe === "monthly") {
            const pickedMonth = graphMonthPicker.value || graphTodayIso.slice(0, 7);
            matches = matches.filter((session) => session.date.slice(0, 7) === pickedMonth);
        } else if (selectedTimeframe === "yearly") {
            const pickedYear = graphYearPicker.value || graphTodayIso.slice(0, 4);
            matches = matches.filter((session) => session.date.slice(0, 4) === pickedYear);
        }

        const { labels: dates, repetitions, durations } = groupSessionsByTimeframe(matches, selectedTimeframe);

        // All Time collapses to a single bucket - show it as stat tiles instead of a one-point chart
        if (selectedTimeframe === "all") {
            graphPlotEl.hidden = true;
            graphStatSummary.hidden = false;
            graphStatSummary.innerHTML = "";

            const totalRepetitions = repetitions[0] || 0;
            const totalDurationSeconds = durations[0] || 0;

            if (selectedMetric === "repetitions" || selectedMetric === "both") {
                graphStatSummary.appendChild(
                    buildGraphStatTile(totalRepetitions, `All-time repetitions — ${selectedCommand}`, "moss")
                );
            }
            if (selectedMetric === "duration" || selectedMetric === "both") {
                graphStatSummary.appendChild(
                    buildGraphStatTile(
                        formatDurationDisplay(String(totalDurationSeconds)),
                        `All-time duration — ${selectedCommand}`,
                        "brass"
                    )
                );
            }
            return;
        }

        graphPlotEl.hidden = false;
        graphStatSummary.hidden = true;

        // Day/Month/Yearly are all discrete breakdowns of a picked period, so bar is the sensible default
        const traceType = selectedChartType === "auto" ? "bar" : selectedChartType;
        const timeframeTitle = {
            daily: `${graphDayPicker.value || graphTodayIso}`,
            monthly: `${graphMonthPicker.value || graphTodayIso.slice(0, 7)}`,
            yearly: `${graphYearPicker.value || graphTodayIso.slice(0, 4)}`,
        }[selectedTimeframe];

        // a year of sessions adds up to a lot of seconds, so Yearly plots duration in minutes
        const durationInMinutes = selectedTimeframe === "yearly";
        const durationLabel = durationInMinutes ? "Duration (minutes)" : "Duration (seconds)";
        const durationValues = durationInMinutes
            ? durations.map((seconds) => (seconds === null ? null : Math.round((seconds / 60) * 10) / 10))
            : durations;

        // hover shows "Repetitions: 12" and "Duration: 4 min 30 sec" rather than raw axis numbers
        const repetitionsHover = (trace) => ({ ...trace, hovertemplate: "Repetitions: %{y}<extra></extra>" });
        const durationHover = (trace) => ({
            ...trace,
            customdata: durations.map((seconds) => (seconds === null ? "" : formatDurationDisplay(String(seconds)))),
            hovertemplate: "Duration: %{customdata}<extra></extra>",
        });

        // Yearly labels are month names, which Plotly would otherwise try to read as dates
        const xaxis = {
            ...GRAPH_AXIS_STYLE,
            gridcolor: "transparent",
            ...(selectedTimeframe === "yearly" ? { type: "category" } : {}),
        };

        let data;
        let layout;

        if (selectedMetric === "both") {
            data = [
                repetitionsHover(buildGraphTrace(traceType, "Repetitions", dates, repetitions, GRAPH_COLORS.moss, "y1")),
                durationHover(buildGraphTrace(traceType, durationLabel, dates, durationValues, GRAPH_COLORS.brass, "y2")),
            ];
            layout = {
                ...GRAPH_LAYOUT_BASE,
                // room on the right for the second axis's title
                margin: { ...GRAPH_LAYOUT_BASE.margin, r: 64 },
                title: { text: `${timeframeTitle} Repetitions & Duration: ${selectedCommand}` },
                barmode: traceType === "bar" ? "group" : undefined,
                // hovering a month (or day/time) shows both values together
                hovermode: "x unified",
                xaxis,
                yaxis: { ...GRAPH_AXIS_STYLE, rangemode: "tozero", title: { ...GRAPH_AXIS_STYLE.title, text: "Repetitions" } },
                yaxis2: {
                    ...GRAPH_AXIS_STYLE,
                    gridcolor: "transparent",
                    rangemode: "tozero",
                    title: { ...GRAPH_AXIS_STYLE.title, text: durationLabel },
                    overlaying: "y",
                    side: "right",
                },
                legend: { orientation: "h", font: { family: "Newsreader, serif", color: GRAPH_COLORS.muted } },
            };
        } else {
            const showDuration = selectedMetric === "duration";
            const metricLabel = showDuration ? durationLabel : "Repetitions";
            const trace = buildGraphTrace(
                traceType,
                metricLabel,
                dates,
                showDuration ? durationValues : repetitions,
                GRAPH_COLORS.moss,
                "y1"
            );
            data = [showDuration ? durationHover(trace) : repetitionsHover(trace)];
            layout = {
                ...GRAPH_LAYOUT_BASE,
                title: { text: `${timeframeTitle} ${metricLabel}: ${selectedCommand}` },
                xaxis,
                yaxis: { ...GRAPH_AXIS_STYLE, rangemode: "tozero", title: { ...GRAPH_AXIS_STYLE.title, text: metricLabel } },
            };
        }

        plotChart(document.getElementById("tester"), data, layout);
    };

    [graphCommandSelect, graphMetricSelect, graphTimeframeSelect, graphChartTypeSelect, graphDayPicker, graphMonthPicker, graphYearPicker]
        .forEach((control) => control.addEventListener("change", drawCommandGraph));
    window.addEventListener("viewingdogchanged", drawCommandGraph);
    window.addEventListener("trainingdatachanged", drawCommandGraph);
    window.addEventListener("sessionhistorysynced", (event) => {
        if (event.detail.changed) drawCommandGraph();
    });
    drawCommandGraph();
}

/*total training and exercise time: all-time tiles plus a day/week/month/year graph (load.html)*/

const totalsTiles = document.getElementById("totals-tiles");

if (totalsTiles) {
    const totalsGroupSelect = document.getElementById("totals-group");
    const totalsShowSelect = document.getElementById("totals-show");
    const totalsChartTypeSelect = document.getElementById("totals-chart-type");
    const totalsChartEl = document.getElementById("totals-chart");
    const TOTALS_MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    totalsChartEl.addEventListener("mouseleave", () => clearPlotlyHover(totalsChartEl));

    // time spent on one session: its length (Session Duration) if entered, else its Duration
    const sessionTrainingSeconds = (session) => {
        const minutes = Number(session.sessionTotalMinutes);
        if (Number.isFinite(minutes) && minutes > 0) return minutes * 60;
        return parseStoredDurationSeconds(session.duration) || 0;
    };

    const exerciseSeconds = (exercise) => parseStoredDurationSeconds(exercise.duration) || 0;

    // "X hr Y min" (or "X min" / "X sec") for a number of seconds
    const formatTotalTime = (seconds) => {
        if (seconds > 0 && seconds < 60) return `${Math.round(seconds)} sec`;
        const totalMinutes = Math.round(seconds / 60);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        if (hours === 0) return `${minutes} min`;
        return minutes ? `${hours} hr ${minutes} min` : `${hours} hr`;
    };

    // the picked dog's exercises (every one when there are no dogs)
    const readExercises = () => getExerciseHistory().filter((exercise) => matchesViewingDog(exercise));

    // a Date for a "YYYY-MM-DD" string, at local midnight
    const parseIsoDate = (iso) => {
        const [year, month, day] = iso.split("-").map(Number);
        return new Date(year, month - 1, day);
    };

    // the Monday that starts a date's week
    const weekStart = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7));

    // the buckets to plot for a grouping, oldest first: a key (see bucketKeyFor) and a label
    const buildTotalsBuckets = (group, allDates) => {
        const today = new Date();
        const buckets = [];
        if (group === "daily") {
            // the last 30 days
            for (let i = 29; i >= 0; i -= 1) {
                const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
                buckets.push({ key: localDateString(day), label: `${TOTALS_MONTH_NAMES[day.getMonth()]} ${day.getDate()}` });
            }
        } else if (group === "weekly") {
            // the last 12 weeks, Monday to Sunday
            const thisWeek = weekStart(today);
            for (let i = 11; i >= 0; i -= 1) {
                const start = new Date(thisWeek.getFullYear(), thisWeek.getMonth(), thisWeek.getDate() - i * 7);
                buckets.push({ key: localDateString(start), label: `${TOTALS_MONTH_NAMES[start.getMonth()]} ${start.getDate()}` });
            }
        } else if (group === "monthly") {
            // the last 12 months; the year is shown on the first month and on each January
            for (let i = 11; i >= 0; i -= 1) {
                const month = new Date(today.getFullYear(), today.getMonth() - i, 1);
                const showYear = i === 11 || month.getMonth() === 0;
                const label = `${TOTALS_MONTH_NAMES[month.getMonth()]}${showYear ? ` ${month.getFullYear()}` : ""}`;
                buckets.push({ key: localDateString(month).slice(0, 7), label });
            }
        } else {
            // every year from the first logged date to this year
            const years = allDates.map((iso) => Number(iso.slice(0, 4))).filter(Number.isFinite);
            const firstYear = Math.min(today.getFullYear(), ...years);
            for (let year = firstYear; year <= today.getFullYear(); year += 1) {
                buckets.push({ key: String(year), label: String(year) });
            }
        }
        return buckets;
    };

    // which bucket a "YYYY-MM-DD" date falls in for a grouping
    const bucketKeyFor = (group, iso) => {
        if (group === "daily") return iso;
        if (group === "weekly") return localDateString(weekStart(parseIsoDate(iso)));
        if (group === "monthly") return iso.slice(0, 7);
        return iso.slice(0, 4);
    };

    // one stat tile (value + label)
    const buildTotalsTile = (value, label, variant) => {
        const tile = document.createElement("div");
        tile.className = `stat-tile stat-tile--${variant}`;
        const valueEl = document.createElement("span");
        valueEl.className = "stat-value";
        valueEl.textContent = value;
        const labelEl = document.createElement("span");
        labelEl.className = "stat-label";
        labelEl.textContent = label;
        tile.append(valueEl, labelEl);
        return tile;
    };

    // all-time tiles: training time and sessions (for the picked dog), exercise time and exercises
    const renderTotalsTiles = (sessions, exercises) => {
        const trainingTotal = sessions.reduce((sum, session) => sum + sessionTrainingSeconds(session), 0);
        const exerciseTotal = exercises.reduce((sum, exercise) => sum + exerciseSeconds(exercise), 0);
        totalsTiles.replaceChildren(
            buildTotalsTile(formatTotalTime(trainingTotal), "Total training time", "moss"),
            buildTotalsTile(String(sessions.length), `Training session${sessions.length === 1 ? "" : "s"} logged`, "moss"),
            buildTotalsTile(formatTotalTime(exerciseTotal), "Total exercise time", "brass"),
            buildTotalsTile(String(exercises.length), `Exercise${exercises.length === 1 ? "" : "s"} logged`, "brass"),
        );
    };

    // the training/exercise time graph for the picked grouping
    const renderTotalsChart = (sessions, exercises) => {
        const group = totalsGroupSelect.value;
        const show = totalsShowSelect.value;
        const allDates = [...sessions, ...exercises].map((item) => item.date).filter(Boolean);
        const buckets = buildTotalsBuckets(group, allDates);
        const indexByKey = new Map(buckets.map((bucket, i) => [bucket.key, i]));

        const trainingByBucket = buckets.map(() => 0);
        const exerciseByBucket = buckets.map(() => 0);
        sessions.forEach((session) => {
            const i = session.date ? indexByKey.get(bucketKeyFor(group, session.date)) : undefined;
            if (i !== undefined) trainingByBucket[i] += sessionTrainingSeconds(session);
        });
        exercises.forEach((exercise) => {
            const i = exercise.date ? indexByKey.get(bucketKeyFor(group, exercise.date)) : undefined;
            if (i !== undefined) exerciseByBucket[i] += exerciseSeconds(exercise);
        });

        // plot in hours once the biggest value passes 3 hours, otherwise minutes
        const shown = [];
        if (show !== "exercise") shown.push(...trainingByBucket);
        if (show !== "training") shown.push(...exerciseByBucket);
        const useHours = Math.max(0, ...shown) >= 3 * 3600;
        const toUnit = (seconds) => Math.round((seconds / (useHours ? 3600 : 60)) * 10) / 10;

        // same bar/line look as the command graph, with hover showing "1 hr 30 min" instead of raw numbers
        const labels = buckets.map((bucket) => bucket.label);
        const buildTimeTrace = (name, seconds, color) => ({
            ...buildGraphTrace(totalsChartTypeSelect.value, name, labels, seconds.map(toUnit), color, "y1"),
            // both traces share one y-axis, so give each its own slot to keep the bars side by side
            offsetgroup: name,
            customdata: seconds.map(formatTotalTime),
            hovertemplate: `${name}: %{customdata}<extra></extra>`,
        });
        const data = [];
        if (show !== "exercise") data.push(buildTimeTrace("Training time", trainingByBucket, GRAPH_COLORS.moss));
        if (show !== "training") data.push(buildTimeTrace("Exercise time", exerciseByBucket, GRAPH_COLORS.brass));

        const groupTitle = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" }[group];
        const showTitle = { both: "Training & Exercise Time", training: "Training Time", exercise: "Exercise Time" }[show];
        const unitLabel = `Time (${useHours ? "hours" : "minutes"})`;
        const layout = {
            ...GRAPH_LAYOUT_BASE,
            // weekly labels are each week's Monday
            title: { text: `${groupTitle} ${showTitle}${group === "weekly" ? " (weeks start Monday)" : ""}` },
            barmode: "group",
            hovermode: "x unified",
            xaxis: {
                ...GRAPH_AXIS_STYLE,
                gridcolor: "transparent",
                type: "category",
                // 30 daily labels don't fit, so show about every third day
                ...(group === "daily" ? { nticks: 10 } : {}),
            },
            yaxis: { ...GRAPH_AXIS_STYLE, rangemode: "tozero", title: { ...GRAPH_AXIS_STYLE.title, text: unitLabel } },
            legend: { orientation: "h", font: { family: "Newsreader, serif", color: GRAPH_COLORS.muted } },
            showlegend: data.length > 1,
        };
        plotChart(totalsChartEl, data, layout);
    };

    // redraw the tiles and graph from the latest sessions (picked dog only) and exercises
    const renderTrainingTotals = () => {
        const sessions = getSessionHistory().filter((session) => matchesViewingDog(session));
        const exercises = readExercises();
        renderTotalsTiles(sessions, exercises);
        if (typeof Plotly !== "undefined") renderTotalsChart(sessions, exercises);
    };

    [totalsGroupSelect, totalsShowSelect, totalsChartTypeSelect].forEach((select) => {
        select.addEventListener("change", renderTrainingTotals);
    });
    window.addEventListener("viewingdogchanged", renderTrainingTotals);
    window.addEventListener("trainingdatachanged", renderTrainingTotals);
    window.addEventListener("sessionhistorysynced", (event) => {
        if (event.detail.changed) renderTrainingTotals();
    });
    renderTrainingTotals();
}

/*command history timeline, a Gantt-style chart (load.html)*/

const ganttChartEl = document.getElementById("gantt-chart");

if (ganttChartEl) {
    const GANTT_COLORS = {
        ink: "#2F4030",
        moss: "#5A7A4E",
        clay: "#E8DFC9",
        muted: "#6B6456",
        white: "#FFFDF8",
    };
    const GANTT_DAY_MS = 24 * 60 * 60 * 1000; // each practiced day is drawn one day wide
    const ganttBreakSelect = document.getElementById("gantt-break");

    // Plotly's mouseout hover-dismiss can miss when the cursor leaves quickly, leaving the
    // tooltip stuck on screen - force-clear it whenever the pointer leaves the chart area
    ganttChartEl.addEventListener("mouseleave", () => clearPlotlyHover(ganttChartEl));

    // custom circular hover badge, positioned in the plot's own coordinate space
    const ganttHoverBadge = document.getElementById("gantt-hover-badge");
    const ganttArea = document.getElementById("gantt-area");

    function showGanttHoverBadge(command, count, point, mouseEvent) {
        if (!ganttHoverBadge || !ganttArea) {
            return;
        }

        let left;
        let top;

        if (point && point.bbox) {
            // bbox is relative to the plot's own box - position from there so the badge stays
            // centered on the bar regardless of where along its length the cursor is
            const chartRect = ganttChartEl.getBoundingClientRect();
            const areaRect = ganttArea.getBoundingClientRect();
            left = chartRect.left - areaRect.left + (point.bbox.x0 + point.bbox.x1) / 2;
            top = chartRect.top - areaRect.top + (point.bbox.y0 + point.bbox.y1) / 2;
        } else if (mouseEvent) {
            const areaRect = ganttArea.getBoundingClientRect();
            left = mouseEvent.clientX - areaRect.left;
            top = mouseEvent.clientY - areaRect.top;
        } else {
            return;
        }

        ganttHoverBadge.style.left = `${left}px`;
        ganttHoverBadge.style.top = `${top}px`;
        ganttHoverBadge.innerHTML = "";

        const countEl = document.createElement("span");
        countEl.className = "gantt-hover-badge-count";
        countEl.textContent = `${count}×`;

        const labelEl = document.createElement("span");
        labelEl.className = "gantt-hover-badge-label";
        labelEl.textContent = command;

        ganttHoverBadge.appendChild(countEl);
        ganttHoverBadge.appendChild(labelEl);
        ganttHoverBadge.hidden = false;
    }

    function hideGanttHoverBadge() {
        if (ganttHoverBadge) {
            ganttHoverBadge.hidden = true;
        }
    }

    ganttChartEl.addEventListener("mouseleave", hideGanttHoverBadge);

    // whole days from one "YYYY-MM-DD" date to another (local dates, so daylight saving doesn't matter)
    const ganttDaysBetween = (fromIso, toIso) => {
        const [fy, fm, fd] = fromIso.split("-").map(Number);
        const [ty, tm, td] = toIso.split("-").map(Number);
        return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / GANTT_DAY_MS);
    };

    // the "YYYY-MM-DD" date one day after another
    const ganttNextDay = (iso) => {
        const [year, month, day] = iso.split("-").map(Number);
        return localDateString(new Date(year, month - 1, day + 1));
    };

    // split each command's practiced dates into stretches, starting a new one after a long enough gap
    const buildPracticeStretches = (sessionsByCommand, breakDays) => {
        const stretchesByCommand = new Map();
        sessionsByCommand.forEach((countsByDate, command) => {
            const dates = Array.from(countsByDate.keys()).sort();
            const stretches = [];
            dates.forEach((date) => {
                const current = stretches[stretches.length - 1];
                if (current && ganttDaysBetween(current.last, date) <= breakDays) {
                    current.last = date;
                    current.count += countsByDate.get(date);
                } else {
                    stretches.push({ first: date, last: date, count: countsByDate.get(date) });
                }
            });
            stretchesByCommand.set(command, stretches);
        });
        return stretchesByCommand;
    };

    function renderCommandTimeline() {
        const sessionHistory = getSessionHistory();

        // how many sessions of each command were logged on each date
        const sessionsByCommand = new Map();
        sessionHistory.forEach((session) => {
            if (!session.command || !session.date || !matchesViewingDog(session)) {
                return;
            }
            if (!sessionsByCommand.has(session.command)) {
                sessionsByCommand.set(session.command, new Map());
            }
            const countsByDate = sessionsByCommand.get(session.command);
            countsByDate.set(session.date, (countsByDate.get(session.date) || 0) + 1);
        });

        const breakDays = Number(ganttBreakSelect && ganttBreakSelect.value) || 7;
        const stretchesByCommand = buildPracticeStretches(sessionsByCommand, breakDays);
        const commands = Array.from(stretchesByCommand.keys()).sort().reverse();

        Plotly.purge(ganttChartEl);
        ganttChartEl.innerHTML = "";

        if (commands.length === 0) {
            const empty = document.createElement("p");
            empty.className = "subhead";
            empty.textContent = "No sessions logged yet.";
            ganttChartEl.appendChild(empty);
            return;
        }

        // one bar per stretch, from its first practiced day to the end of its last
        const barCommands = [];
        const bases = [];
        const spans = [];
        const counts = [];
        // a faint dotted line across each break, so the stretches still read as one command
        const breakX = [];
        const breakY = [];
        commands.forEach((command) => {
            const stretches = stretchesByCommand.get(command);
            stretches.forEach((stretch, i) => {
                barCommands.push(command);
                bases.push(stretch.first);
                spans.push((ganttDaysBetween(stretch.first, stretch.last) + 1) * GANTT_DAY_MS);
                counts.push(stretch.count);
                const next = stretches[i + 1];
                if (next) {
                    breakX.push(ganttNextDay(stretch.last), next.first, null);
                    breakY.push(command, command, null);
                }
            });
        });

        const data = [
            {
                type: "bar",
                orientation: "h",
                x: spans,
                y: barCommands,
                base: bases,
                marker: { color: GANTT_COLORS.moss, cornerradius: 6 },
                // "none" draws nothing, but the bar still emits plotly_hover/unhover events for
                // its whole rendered width, so hovering anywhere on the bar shows our own circular
                // badge (positioned at the bar's center via the hover point's bbox) instead of
                // Plotly's rectangular tooltip following the cursor
                hoverinfo: "none",
            },
            {
                type: "scatter",
                mode: "lines",
                x: breakX,
                y: breakY,
                line: { color: GANTT_COLORS.muted, width: 1.5, dash: "dot" },
                connectgaps: false,
                hoverinfo: "skip",
                showlegend: false,
            },
        ];

        const layout = {
            font: { family: "Newsreader, serif", color: GANTT_COLORS.ink },
            paper_bgcolor: GANTT_COLORS.white,
            plot_bgcolor: GANTT_COLORS.white,
            margin: { t: 24, r: 24, b: 48, l: 100 },
            showlegend: false,
            xaxis: {
                type: "date",
                title: { text: "Date", font: { family: "Newsreader, serif", color: GANTT_COLORS.muted, size: 12 } },
                gridcolor: GANTT_COLORS.clay,
                tickfont: { family: "Newsreader, serif", color: GANTT_COLORS.muted, size: 12 },
            },
            yaxis: {
                automargin: true,
                tickfont: { family: "Newsreader, serif", color: GANTT_COLORS.ink, size: 13 },
            },
        };

        plotChart(ganttChartEl, data, layout).then(() => {
            if (typeof ganttChartEl.removeAllListeners === "function") {
                ganttChartEl.removeAllListeners("plotly_hover");
                ganttChartEl.removeAllListeners("plotly_unhover");
            }

            ganttChartEl.on("plotly_hover", (eventData) => {
                const point = eventData.points && eventData.points[0];
                if (!point || point.curveNumber !== 0 || typeof point.pointIndex !== "number") {
                    return;
                }
                // the badge counts the sessions in the hovered stretch
                showGanttHoverBadge(barCommands[point.pointIndex], counts[point.pointIndex], point, eventData.event);
            });

            ganttChartEl.on("plotly_unhover", hideGanttHoverBadge);
        });
    }

    if (ganttBreakSelect) {
        ganttBreakSelect.addEventListener("change", renderCommandTimeline);
    }

    renderCommandTimeline();

    window.addEventListener("sessionhistorysynced", (event) => {
        if (event.detail.changed) renderCommandTimeline();
    });
    window.addEventListener("viewingdogchanged", renderCommandTimeline);
}

/*tab strips (load.html): Logs (Sessions | Exercises) and Progress (three charts). Each strip switches its own panels.
  Charts drawn while their tab was hidden have no width, so opening a tab resizes its chart to fit*/

document.querySelectorAll('.load-tabs[role="tablist"]').forEach((tablist) => {
    const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));

    // show one tab's panel, hide the strip's others, and fit a chart in it to the now-visible card
    const selectTab = (tab, focus = false) => {
        tabs.forEach((other) => {
            const selected = other === tab;
            other.setAttribute("aria-selected", String(selected));
            other.tabIndex = selected ? 0 : -1;
            document.getElementById(other.getAttribute("aria-controls")).hidden = !selected;
        });
        if (focus) tab.focus();
        const chart = document.getElementById(tab.getAttribute("aria-controls")).querySelector(".graph-plot");
        if (chart && typeof Plotly !== "undefined" && chart.data) Plotly.Plots.resize(chart);
    };

    tabs.forEach((tab, index) => {
        tab.addEventListener("click", () => selectTab(tab));
        // arrow keys move between tabs, like a native tab strip
        tab.addEventListener("keydown", (event) => {
            const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
            if (!step) return;
            event.preventDefault();
            selectTab(tabs[(index + step + tabs.length) % tabs.length], true);
        });
    });
});
