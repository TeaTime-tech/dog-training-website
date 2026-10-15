/* today.html: today's training summary, daily goals, and session list. */

/*today's training summary (today.html)*/

const TODAY_GOAL_STORAGE_KEY = "todaySessionGoal";
const TODAY_DEFAULT_SESSION_GOAL = 3;
const TODAY_MINUTES_GOAL_STORAGE_KEY = "todayMinutesGoal";
const TODAY_DEFAULT_MINUTES_GOAL = 30;
const TODAY_COMMANDS_GOAL_STORAGE_KEY = "todayCommandsGoal";
const TODAY_DEFAULT_COMMANDS_GOAL = 3;
const TODAY_GOAL_TYPE_STORAGE_KEY = "todayGoalType";
const TODAY_DEFAULT_GOAL_TYPE = "sessions";

// read a saved daily goal from storage, falling back to a default
function getSavedGoal(storageKey, defaultGoal) {
    const stored = Number(localStorage.getItem(storageKey));
    return Number.isFinite(stored) && stored > 0 ? stored : defaultGoal;
}

// wire up a "Save Goal" button to validate and persist a daily goal value (saveGoal also syncs it to the account)
function setupGoalEditor(goalType, storageKey, defaultGoal, input, button, unitNoun, onSave) {
    if (!input || !button) {
        return;
    }

    input.value = getSavedGoal(storageKey, defaultGoal);

    button.addEventListener("click", () => {
        const newGoal = Math.floor(Number(input.value));
        if (!Number.isFinite(newGoal) || newGoal < 1) {
            alert(`Please enter a goal of at least 1 ${unitNoun}.`);
            input.value = getSavedGoal(storageKey, defaultGoal);
            return;
        }

        saveGoal(goalType, newGoal);
        input.value = newGoal;
        if (onSave) {
            onSave();
        }
    });
}

const todaySessionList = document.getElementById("today-session-list");

if (todaySessionList) {
    const todayDateLabel = document.getElementById("today-date-label");
    const todayHeroTitle = document.getElementById("today-hero-title");
    const todayRingValue = document.getElementById("today-session-count");
    const todayRingGoalLabel = document.getElementById("today-session-goal-label");
    const todayRingProgress = document.getElementById("today-ring-progress");
    const todayCommandCount = document.getElementById("today-command-count");
    const todayTimeStat = document.getElementById("today-time-stat");
    const todayDeleteSelectedButton = document.getElementById("today-delete-selected");
    const todayGoalInput = document.getElementById("today-goal-input");
    const todayGoalSaveButton = document.getElementById("today-goal-save");
    const todayGoalMinutesInput = document.getElementById("today-goal-minutes-input");
    const todayGoalMinutesSaveButton = document.getElementById("today-goal-minutes-save");
    const todayGoalCommandsInput = document.getElementById("today-goal-commands-input");
    const todayGoalCommandsSaveButton = document.getElementById("today-goal-commands-save");
    const todayViewPrevButton = document.getElementById("today-view-prev-btn");
    const todayViewNextButton = document.getElementById("today-view-next-btn");
    const todayViewDateInput = document.getElementById("today-view-date");
    const todayViewTodayButton = document.getElementById("today-view-today-btn");
    const todayDateNavControls = document.getElementById("today-date-nav-controls");

    let editingSessionIndex = null;
    let renderTodayExercises = null;

    // today's real date as YYYY-MM-DD
    function getTodayIso() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    }

    // the date currently selected in the "Viewing" picker (defaults to today)
    function getViewedDateIso() {
        return (todayViewDateInput && todayViewDateInput.value) || getTodayIso();
    }

    // read the saved daily session goal, or fall back to the default
    function getTodaySessionGoal() {
        return getSavedGoal(TODAY_GOAL_STORAGE_KEY, TODAY_DEFAULT_SESSION_GOAL);
    }

    // enable the "Delete Selected" button only when at least one session is checked
    function updateTodayDeleteButtonState() {
        const anyChecked = todaySessionList.querySelector(".today-session-checkbox:checked") !== null;
        todayDeleteSelectedButton.disabled = !anyChecked;
    }

    // which goal type ("sessions"/"minutes"/"commands") the ring should track
    function getActiveGoalType() {
        const select = document.getElementById("today-goal-type");
        if (select && select.value) {
            return select.value;
        }
        return localStorage.getItem(TODAY_GOAL_TYPE_STORAGE_KEY) || TODAY_DEFAULT_GOAL_TYPE;
    }

    // build a read-only card for one session, with a checkbox and an Edit button
    function buildSessionViewCard(session, index) {
        const row = document.createElement("li");
        row.className = "today-session-row";

        const card = document.createElement("div");
        card.className = "today-session-card";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "today-session-checkbox";
        checkbox.dataset.index = String(index);
        checkbox.setAttribute("aria-label", `Select ${session.command || "session"} at ${session.time || ""}`);
        checkbox.addEventListener("change", updateTodayDeleteButtonState);

        const main = document.createElement("div");
        main.className = "today-session-main";

        const commandLine = document.createElement("span");
        commandLine.className = "today-session-command";
        commandLine.textContent = session.command || "";

        const metaParts = [session.time, session.location];
        if (session.distractions && session.distractions !== "none") {
            metaParts.push(session.distractions);
        }

        const metaLine = document.createElement("span");
        metaLine.className = "today-session-meta";
        metaLine.textContent = metaParts.filter(Boolean).join(" · ");

        main.appendChild(commandLine);
        main.appendChild(metaLine);

        if (session.notes) {
            const notesLine = document.createElement("span");
            notesLine.className = "today-session-notes";
            notesLine.textContent = session.notes;
            main.appendChild(notesLine);
        }

        const chipsWrap = document.createElement("div");
        chipsWrap.className = "today-session-chips";

        if (session.repetitions) {
            const repsChip = document.createElement("span");
            repsChip.className = "today-session-chip today-session-chip--reps";
            repsChip.textContent = session.repetitions === "N/A"
                ? "N/A reps"
                : `${session.repetitions} rep${session.repetitions === "1" ? "" : "s"}`;
            chipsWrap.appendChild(repsChip);
        }

        const durationChip = document.createElement("span");
        durationChip.className = "today-session-chip";
        durationChip.textContent = formatDurationDisplay(session.duration);
        chipsWrap.appendChild(durationChip);

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "restore-btn";
        editButton.textContent = "Edit";
        editButton.addEventListener("click", () => {
            editingSessionIndex = index;
            renderToday();
        });
        chipsWrap.appendChild(editButton);

        card.appendChild(main);
        card.appendChild(chipsWrap);
        row.appendChild(card);
        row.appendChild(checkbox);
        return row;
    }

    // build an editable card with input fields and Save/Cancel buttons
    function buildSessionEditCard(session, index) {
        const row = document.createElement("li");
        row.className = "today-session-row";

        const card = document.createElement("div");
        card.className = "today-session-card today-session-card--editing";

        const commandSelectEdit = document.createElement("select");
        const commandNames = getAllCommandNames();
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

        const repetitionsInput = document.createElement("input");
        repetitionsInput.type = "text";
        repetitionsInput.value = session.repetitions ?? "";

        const durationInput = document.createElement("input");
        durationInput.type = "text";
        durationInput.value = session.duration ?? "";

        const locationInput = document.createElement("input");
        locationInput.type = "text";
        locationInput.value = session.location ?? "";

        const dateInputEdit = document.createElement("input");
        dateInputEdit.type = "date";
        dateInputEdit.value = session.date ?? "";

        const timeInputEdit = document.createElement("input");
        timeInputEdit.type = "time";
        timeInputEdit.value = session.time ?? "";

        const notesInput = document.createElement("input");
        notesInput.type = "text";
        notesInput.value = session.notes ?? "";

        const addField = (labelText, field) => {
            const fieldRow = document.createElement("div");
            fieldRow.className = "field-row";
            const label = document.createElement("label");
            label.textContent = labelText;
            fieldRow.appendChild(label);
            fieldRow.appendChild(field);
            card.appendChild(fieldRow);
        };

        addField("Command:", commandSelectEdit);
        addField("Repetitions:", repetitionsInput);
        addField("Duration:", durationInput);
        addField("Location:", locationInput);
        addField("Date:", dateInputEdit);
        addField("Time:", timeInputEdit);
        addField("Notes:", notesInput);

        const actions = document.createElement("div");
        actions.className = "field-row";

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
                date: dateInputEdit.value,
                time: timeInputEdit.value,
                notes: notesInput.value.trim(),
            };
            setSessionHistory(currentHistory);
            editingSessionIndex = null;
            renderToday();
        });

        const cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.className = "row-cancel-btn";
        cancelButton.textContent = "Cancel";
        cancelButton.addEventListener("click", () => {
            editingSessionIndex = null;
            renderToday();
        });

        actions.appendChild(saveButton);
        actions.appendChild(cancelButton);
        card.appendChild(actions);

        row.appendChild(card);
        return row;
    }

    // render the progress ring, stats, and session list for the viewed date
    function renderToday() {
        const viewedDateIso = getViewedDateIso();
        const isViewingToday = viewedDateIso === getTodayIso();
        const viewedDate = new Date(`${viewedDateIso}T00:00:00`);

        todayDateLabel.textContent = viewedDate.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
        });
        todayHeroTitle.textContent = isViewingToday ? "Today's Training" : "Training";

        const sessionHistory = getSessionHistory();
        const todaysSessions = sessionHistory
            .map((session, index) => ({ session, index }))
            .filter(({ session }) => session.date === viewedDateIso)
            .sort((a, b) => (b.session.time || "").localeCompare(a.session.time || ""));

        const distinctCommandCount = new Set(todaysSessions.map(({ session }) => session.command)).size;
        const totalDurationSeconds = todaysSessions.reduce((sum, { session }) => {
            const seconds = parseStoredDurationSeconds(session.duration);
            return seconds === null ? sum : sum + seconds;
        }, 0);
        const totalDurationMinutes = Math.round(totalDurationSeconds / 60);

        // the ring tracks whichever goal type is selected in the Daily Goal dropdown
        const ringStatsByGoalType = {
            sessions: { value: todaysSessions.length, goal: getTodaySessionGoal(), unitNoun: "sessions" },
            minutes: {
                value: totalDurationMinutes,
                goal: getSavedGoal(TODAY_MINUTES_GOAL_STORAGE_KEY, TODAY_DEFAULT_MINUTES_GOAL),
                unitNoun: "min",
            },
            commands: {
                value: distinctCommandCount,
                goal: getSavedGoal(TODAY_COMMANDS_GOAL_STORAGE_KEY, TODAY_DEFAULT_COMMANDS_GOAL),
                unitNoun: "commands",
            },
        };
        const { value: ringValue, goal: ringGoal, unitNoun: ringUnitNoun } = ringStatsByGoalType[getActiveGoalType()];

        todayRingValue.textContent = ringValue;
        todayRingGoalLabel.textContent = `of ${ringGoal} ${ringUnitNoun}`;

        const ringCircumference = 2 * Math.PI * 52;
        const ringFraction = Math.min(ringValue / ringGoal, 1);
        todayRingProgress.style.strokeDashoffset = String(ringCircumference * (1 - ringFraction));

        todayCommandCount.textContent = distinctCommandCount;
        todayTimeStat.textContent = formatDurationDisplay(String(totalDurationSeconds));

        todaySessionList.innerHTML = "";

        if (todaysSessions.length === 0) {
            const empty = document.createElement("li");
            empty.className = "today-empty-state";
            empty.textContent = isViewingToday ? "No sessions logged today yet." : "No sessions logged on this date.";
            todaySessionList.appendChild(empty);
        } else {
            todaysSessions.forEach(({ session, index }) => {
                const row = index === editingSessionIndex
                    ? buildSessionEditCard(session, index)
                    : buildSessionViewCard(session, index);
                todaySessionList.appendChild(row);
            });
        }

        updateTodayDeleteButtonState();
    }

    todayDeleteSelectedButton.addEventListener("click", () => {
        const checkedBoxes = Array.from(
            todaySessionList.querySelectorAll(".today-session-checkbox:checked")
        );
        if (checkedBoxes.length === 0) {
            return;
        }

        const count = checkedBoxes.length;
        if (!confirm(`Delete ${count} selected session${count === 1 ? "" : "s"}? This cannot be undone.`)) {
            return;
        }

        const indicesToRemove = new Set(checkedBoxes.map((checkbox) => Number(checkbox.dataset.index)));
        const currentHistory = getSessionHistory();
        const updatedHistory = currentHistory.filter((_, index) => !indicesToRemove.has(index));
        setSessionHistory(updatedHistory);

        renderToday();
    });

    /*exercise log for today*/

    const todayExerciseList = document.getElementById("today-exercise-list");
    const todayExerciseDeleteSelectedButton = document.getElementById("today-exercise-delete-selected");

    if (todayExerciseList && todayExerciseDeleteSelectedButton) {
        let editingExerciseIndex = null;

        const updateTodayExerciseDeleteButtonState = () => {
            const anyChecked = todayExerciseList.querySelector(".today-session-checkbox:checked") !== null;
            todayExerciseDeleteSelectedButton.disabled = !anyChecked;
        };

        // build a read-only card for one exercise, with a checkbox and an Edit button
        const buildExerciseViewCard = (exercise, index) => {
            const row = document.createElement("li");
            row.className = "today-session-row";

            const card = document.createElement("div");
            card.className = "today-session-card";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.className = "today-session-checkbox";
            checkbox.dataset.index = String(index);
            checkbox.setAttribute("aria-label", `Select ${exercise.name || "exercise"} at ${exercise.time || ""}`);
            checkbox.addEventListener("change", updateTodayExerciseDeleteButtonState);

            const main = document.createElement("div");
            main.className = "today-session-main";

            const nameLine = document.createElement("span");
            nameLine.className = "today-session-command";
            nameLine.textContent = exercise.name || "";

            const metaLine = document.createElement("span");
            metaLine.className = "today-session-meta";
            metaLine.textContent = exercise.time || "";

            main.appendChild(nameLine);
            main.appendChild(metaLine);

            if (exercise.notes) {
                const notesLine = document.createElement("span");
                notesLine.className = "today-session-notes";
                notesLine.textContent = exercise.notes;
                main.appendChild(notesLine);
            }

            const chipsWrap = document.createElement("div");
            chipsWrap.className = "today-session-chips";

            if (exercise.duration) {
                const durationChip = document.createElement("span");
                durationChip.className = "today-session-chip";
                durationChip.textContent = formatDurationDisplay(exercise.duration);
                chipsWrap.appendChild(durationChip);
            }

            const editButton = document.createElement("button");
            editButton.type = "button";
            editButton.className = "restore-btn";
            editButton.textContent = "Edit";
            editButton.addEventListener("click", () => {
                editingExerciseIndex = index;
                renderTodayExercises();
            });
            chipsWrap.appendChild(editButton);

            card.appendChild(main);
            card.appendChild(chipsWrap);
            row.appendChild(card);
            row.appendChild(checkbox);
            return row;
        };

        // build an editable card with input fields and Save/Cancel buttons
        const buildExerciseEditCard = (exercise, index) => {
            const row = document.createElement("li");
            row.className = "today-session-row";

            const card = document.createElement("div");
            card.className = "today-session-card today-session-card--editing";

            const nameInput = document.createElement("input");
            nameInput.type = "text";
            nameInput.value = exercise.name ?? "";

            const durationInput = document.createElement("input");
            durationInput.type = "text";
            durationInput.value = exercise.duration ?? "";

            const notesInput = document.createElement("input");
            notesInput.type = "text";
            notesInput.value = exercise.notes ?? "";

            const dateInputEdit = document.createElement("input");
            dateInputEdit.type = "date";
            dateInputEdit.value = exercise.date ?? "";

            const timeInputEdit = document.createElement("input");
            timeInputEdit.type = "time";
            timeInputEdit.value = exercise.time ?? "";

            const addField = (labelText, field) => {
                const fieldRow = document.createElement("div");
                fieldRow.className = "field-row";
                const label = document.createElement("label");
                label.textContent = labelText;
                fieldRow.appendChild(label);
                fieldRow.appendChild(field);
                card.appendChild(fieldRow);
            };

            addField("Name:", nameInput);
            addField("Duration:", durationInput);
            addField("Notes:", notesInput);
            addField("Date:", dateInputEdit);
            addField("Time:", timeInputEdit);

            const actions = document.createElement("div");
            actions.className = "field-row";

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

                const currentHistory = JSON.parse(localStorage.getItem("exerciseHistory")) || [];
                currentHistory[index] = {
                    name,
                    duration: durationInput.value.trim(),
                    notes: notesInput.value.trim(),
                    date: dateInputEdit.value,
                    time: timeInputEdit.value,
                };
                localStorage.setItem("exerciseHistory", JSON.stringify(currentHistory));
                editingExerciseIndex = null;
                renderTodayExercises();
            });

            const cancelButton = document.createElement("button");
            cancelButton.type = "button";
            cancelButton.className = "row-cancel-btn";
            cancelButton.textContent = "Cancel";
            cancelButton.addEventListener("click", () => {
                editingExerciseIndex = null;
                renderTodayExercises();
            });

            actions.appendChild(saveButton);
            actions.appendChild(cancelButton);
            card.appendChild(actions);

            row.appendChild(card);
            return row;
        };

        renderTodayExercises = () => {
            const viewedDateIso = getViewedDateIso();
            const exerciseHistory = JSON.parse(localStorage.getItem("exerciseHistory")) || [];
            const todaysExercises = exerciseHistory
                .map((exercise, index) => ({ exercise, index }))
                .filter(({ exercise }) => exercise.date === viewedDateIso)
                .sort((a, b) => (b.exercise.time || "").localeCompare(a.exercise.time || ""));

            todayExerciseList.innerHTML = "";

            if (todaysExercises.length === 0) {
                const empty = document.createElement("li");
                empty.className = "today-empty-state";
                empty.textContent = viewedDateIso === getTodayIso()
                    ? "No exercises logged today yet."
                    : "No exercises logged on this date.";
                todayExerciseList.appendChild(empty);
            } else {
                todaysExercises.forEach(({ exercise, index }) => {
                    const row = index === editingExerciseIndex
                        ? buildExerciseEditCard(exercise, index)
                        : buildExerciseViewCard(exercise, index);
                    todayExerciseList.appendChild(row);
                });
            }

            updateTodayExerciseDeleteButtonState();
        };

        todayExerciseDeleteSelectedButton.addEventListener("click", () => {
            const checkedBoxes = Array.from(
                todayExerciseList.querySelectorAll(".today-session-checkbox:checked")
            );
            if (checkedBoxes.length === 0) {
                return;
            }

            const count = checkedBoxes.length;
            if (!confirm(`Delete ${count} selected exercise${count === 1 ? "" : "s"}? This cannot be undone.`)) {
                return;
            }

            const indicesToRemove = new Set(checkedBoxes.map((checkbox) => Number(checkbox.dataset.index)));
            const currentHistory = JSON.parse(localStorage.getItem("exerciseHistory")) || [];
            const updatedHistory = currentHistory.filter((_, index) => !indicesToRemove.has(index));
            localStorage.setItem("exerciseHistory", JSON.stringify(updatedHistory));

            renderTodayExercises();
        });

        renderTodayExercises();
    }

    /*"+ Add Session" popup (today.html)*/

    const addSessionButton = document.getElementById("today-add-session-btn");
    const addSessionOverlay = document.getElementById("add-session-overlay");
    const addSessionForm = document.getElementById("add-session-form");
    const addSessionCancelButton = document.getElementById("add-session-cancel");

    if (addSessionButton && addSessionOverlay && addSessionForm) {
        const addSessionCommandSelect = document.getElementById("add-session-command");
        const addSessionRepetitionsInput = document.getElementById("add-session-repetitions");
        const addSessionDurationInput = document.getElementById("add-session-duration");
        const addSessionDurationUnitSelect = document.getElementById("add-session-duration-unit");
        const addSessionNotesInput = document.getElementById("add-session-notes");
        const addSessionDateInput = document.getElementById("add-session-date");
        const addSessionTimeInput = document.getElementById("add-session-time");

        const openAddSessionModal = () => {
            addSessionCommandSelect.innerHTML = "";
            getAllCommandNames().forEach((name) => {
                const option = document.createElement("option");
                option.value = name;
                option.textContent = name;
                addSessionCommandSelect.appendChild(option);
            });

            addSessionRepetitionsInput.value = "";
            addSessionDurationInput.value = "";
            addSessionDurationUnitSelect.value = "sec";
            addSessionNotesInput.value = "";
            addSessionDateInput.value = getViewedDateIso();

            const now = new Date();
            addSessionTimeInput.value = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

            addSessionOverlay.hidden = false;
            addSessionCommandSelect.focus();
        };

        const closeAddSessionModal = () => {
            addSessionOverlay.hidden = true;
        };

        addSessionButton.addEventListener("click", openAddSessionModal);

        if (addSessionCancelButton) {
            addSessionCancelButton.addEventListener("click", closeAddSessionModal);
        }

        addSessionOverlay.addEventListener("click", (event) => {
            if (event.target === addSessionOverlay) {
                closeAddSessionModal();
            }
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && !addSessionOverlay.hidden) {
                closeAddSessionModal();
            }
        });

        addSessionForm.addEventListener("submit", (event) => {
            event.preventDefault();

            const repetitions = addSessionRepetitionsInput.value.trim();
            const duration = addSessionDurationInput.value.trim();

            if (repetitions !== "" && !/^\d+$/.test(repetitions)) {
                alert("Repetitions must be a whole number.");
                return;
            }

            if (duration !== "" && !/^\d+$/.test(duration)) {
                alert("Duration must be a whole number.");
                return;
            }

            // store minutes as "M:00" so parseStoredDurationSeconds/formatDurationDisplay read them correctly
            const storedDuration = duration !== "" && addSessionDurationUnitSelect.value === "min"
                ? `${duration}:00`
                : duration;

            const session = {
                command: addSessionCommandSelect.value,
                repetitions,
                duration: storedDuration,
                distractions: "none",
                location: "",
                date: addSessionDateInput.value,
                time: addSessionTimeInput.value,
                sessionStartTime: "",
                sessionEndTime: "",
                sessionTotalMinutes: null,
                notes: addSessionNotesInput.value.trim(),
            };

            const sessionHistory = getSessionHistory();
            sessionHistory.push(session);
            setSessionHistory(sessionHistory);

            closeAddSessionModal();
            renderToday();
        });
    }

    /*"+ Add Exercise" popup (today.html)*/

    const addExerciseButton = document.getElementById("today-add-exercise-btn");
    const addExerciseOverlay = document.getElementById("add-exercise-overlay");
    const addExerciseForm = document.getElementById("add-exercise-form");
    const addExerciseCancelButton = document.getElementById("add-exercise-cancel");

    if (addExerciseButton && addExerciseOverlay && addExerciseForm) {
        const addExerciseNameInput = document.getElementById("add-exercise-name");
        const addExerciseDurationInput = document.getElementById("add-exercise-duration");
        const addExerciseDurationUnitSelect = document.getElementById("add-exercise-duration-unit");
        const addExerciseNotesInput = document.getElementById("add-exercise-notes");
        const addExerciseDateInput = document.getElementById("add-exercise-date");
        const addExerciseTimeInput = document.getElementById("add-exercise-time");

        const openAddExerciseModal = () => {
            addExerciseNameInput.value = "";
            addExerciseDurationInput.value = "";
            addExerciseDurationUnitSelect.value = "min";
            addExerciseNotesInput.value = "";
            addExerciseDateInput.value = getViewedDateIso();

            const now = new Date();
            addExerciseTimeInput.value = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

            addExerciseOverlay.hidden = false;
            addExerciseNameInput.focus();
        };

        const closeAddExerciseModal = () => {
            addExerciseOverlay.hidden = true;
        };

        addExerciseButton.addEventListener("click", openAddExerciseModal);

        if (addExerciseCancelButton) {
            addExerciseCancelButton.addEventListener("click", closeAddExerciseModal);
        }

        addExerciseOverlay.addEventListener("click", (event) => {
            if (event.target === addExerciseOverlay) {
                closeAddExerciseModal();
            }
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && !addExerciseOverlay.hidden) {
                closeAddExerciseModal();
            }
        });

        addExerciseForm.addEventListener("submit", (event) => {
            event.preventDefault();

            const name = addExerciseNameInput.value.trim();
            if (!name) {
                alert("Please enter an exercise name.");
                return;
            }

            const duration = addExerciseDurationInput.value.trim();
            if (duration !== "" && !/^\d+$/.test(duration)) {
                alert("Duration must be a whole number.");
                return;
            }

            // store minutes as "M:00" so parseStoredDurationSeconds/formatDurationDisplay read them correctly
            const storedDuration = duration !== "" && addExerciseDurationUnitSelect.value === "min"
                ? `${duration}:00`
                : duration;

            const exercise = {
                name,
                duration: storedDuration,
                notes: addExerciseNotesInput.value.trim(),
                date: addExerciseDateInput.value,
                time: addExerciseTimeInput.value,
            };

            const exerciseHistory = JSON.parse(localStorage.getItem("exerciseHistory")) || [];
            exerciseHistory.push(exercise);
            localStorage.setItem("exerciseHistory", JSON.stringify(exerciseHistory));

            closeAddExerciseModal();
            if (renderTodayExercises) {
                renderTodayExercises();
            }
        });
    }

    setupGoalEditor("sessions", TODAY_GOAL_STORAGE_KEY, TODAY_DEFAULT_SESSION_GOAL, todayGoalInput, todayGoalSaveButton, "session", renderToday);
    setupGoalEditor("minutes", TODAY_MINUTES_GOAL_STORAGE_KEY, TODAY_DEFAULT_MINUTES_GOAL, todayGoalMinutesInput, todayGoalMinutesSaveButton, "minute", renderToday);
    setupGoalEditor("commands", TODAY_COMMANDS_GOAL_STORAGE_KEY, TODAY_DEFAULT_COMMANDS_GOAL, todayGoalCommandsInput, todayGoalCommandsSaveButton, "command", renderToday);

    // show only the goal row matching the dropdown's selected goal type
    const todayGoalTypeSelect = document.getElementById("today-goal-type");
    const todayGoalRowsByType = {
        sessions: document.getElementById("today-goal-row-sessions"),
        minutes: document.getElementById("today-goal-row-minutes"),
        commands: document.getElementById("today-goal-row-commands"),
    };

    const showGoalRow = (type) => {
        Object.entries(todayGoalRowsByType).forEach(([rowType, row]) => {
            if (row) {
                row.hidden = rowType !== type;
            }
        });
    };

    if (todayGoalTypeSelect) {
        const savedGoalType = localStorage.getItem(TODAY_GOAL_TYPE_STORAGE_KEY) || TODAY_DEFAULT_GOAL_TYPE;
        todayGoalTypeSelect.value = savedGoalType;
        showGoalRow(savedGoalType);

        todayGoalTypeSelect.addEventListener("change", () => {
            saveActiveGoalType(todayGoalTypeSelect.value);
            showGoalRow(todayGoalTypeSelect.value);
            renderToday();
        });
    }

    // goals from the account arrived; refresh the goal fields, then redraw unless a session is mid-edit
    window.addEventListener("goalssynced", (event) => {
        if (!event.detail.changed) return;
        const goalFields = [
            [todayGoalInput, TODAY_GOAL_STORAGE_KEY, TODAY_DEFAULT_SESSION_GOAL],
            [todayGoalMinutesInput, TODAY_MINUTES_GOAL_STORAGE_KEY, TODAY_DEFAULT_MINUTES_GOAL],
            [todayGoalCommandsInput, TODAY_COMMANDS_GOAL_STORAGE_KEY, TODAY_DEFAULT_COMMANDS_GOAL],
        ];
        goalFields.forEach(([input, storageKey, defaultGoal]) => {
            if (input) {
                input.value = getSavedGoal(storageKey, defaultGoal);
            }
        });
        if (todayGoalTypeSelect) {
            const goalType = localStorage.getItem(TODAY_GOAL_TYPE_STORAGE_KEY) || TODAY_DEFAULT_GOAL_TYPE;
            todayGoalTypeSelect.value = goalType;
            showGoalRow(goalType);
        }
        if (editingSessionIndex === null) renderToday();
    });

    // switch which date's sessions/exercises/stats are shown
    if (todayViewDateInput) {
        todayViewDateInput.value = getTodayIso();

        // hide the "Jump to today" button when today is already the date being viewed
        const updateTodayButtonVisibility = () => {
            if (todayViewTodayButton) {
                todayViewTodayButton.hidden = getViewedDateIso() === getTodayIso();
            }
        };

        const goToViewedDate = () => {
            editingSessionIndex = null;
            renderToday();
            if (renderTodayExercises) {
                renderTodayExercises();
            }
            updateTodayButtonVisibility();
        };

        // move the viewed date by a number of days (negative to go back)
        const shiftViewedDate = (deltaDays) => {
            const shifted = new Date(`${getViewedDateIso()}T00:00:00`);
            shifted.setDate(shifted.getDate() + deltaDays);
            const year = shifted.getFullYear();
            const month = String(shifted.getMonth() + 1).padStart(2, "0");
            const day = String(shifted.getDate()).padStart(2, "0");
            todayViewDateInput.value = `${year}-${month}-${day}`;
            goToViewedDate();
        };

        // show/hide the date picker + "Jump to today" panel
        const setDateNavControlsOpen = (open) => {
            if (!todayDateNavControls) {
                return;
            }
            todayDateNavControls.hidden = !open;
            if (todayDateLabel) {
                todayDateLabel.setAttribute("aria-expanded", String(open));
            }

            // also pop open the native calendar so one click reveals a ready-to-use picker
            if (open && todayViewDateInput && typeof todayViewDateInput.showPicker === "function") {
                try {
                    todayViewDateInput.showPicker();
                } catch (error) {
                    // showPicker can throw if the browser blocks it outside a direct user gesture; ignore
                }
            }
        };

        if (todayDateLabel && todayDateNavControls) {
            todayDateLabel.addEventListener("click", () => {
                setDateNavControlsOpen(todayDateNavControls.hidden);
            });
        }

        todayViewDateInput.addEventListener("change", () => {
            goToViewedDate();
            setDateNavControlsOpen(false);
        });

        if (todayViewTodayButton) {
            todayViewTodayButton.addEventListener("click", () => {
                todayViewDateInput.value = getTodayIso();
                goToViewedDate();
                setDateNavControlsOpen(false);
            });
        }

        if (todayViewPrevButton) {
            todayViewPrevButton.addEventListener("click", () => shiftViewedDate(-1));
        }

        if (todayViewNextButton) {
            todayViewNextButton.addEventListener("click", () => shiftViewedDate(1));
        }

        updateTodayButtonVisibility();
    }

    renderToday();

    // sessions from the account arrived; redraw unless a session is mid-edit
    window.addEventListener("sessionhistorysynced", (event) => {
        if (event.detail.changed && editingSessionIndex === null) renderToday();
    });
}
