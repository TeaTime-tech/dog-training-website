/* log.html: the training session form (dog, option pickers, timer, session length, save).
   Needs dogs.js, sessions.js and commandDisplay.js loaded first. */

/*pick which dog this session is for*/

const logDogSection = document.getElementById("log-dog-section");
const logDogSelect = document.getElementById("log-dog");

// fill "Switch dog" with the account's dogs and select the current one (or the first)
async function loadLogDogOptions() {
    let dogs = [];
    try {
        if (await getSignedInUser()) dogs = await getDogs();
    } catch (error) {
        console.error("Could not load dogs:", error);
    }
    if (dogs.length === 0) {
        logDogSection.hidden = true;
        return;
    }

    logDogSelect.replaceChildren(...dogs.map((dog) => {
        const option = document.createElement("option");
        option.value = dog.id;
        option.textContent = dog.name;
        return option;
    }));
    const current = dogs.find((dog) => dog.id === getCurrentDogId()) || dogs[0];
    setCurrentDogId(current.id);
    logDogSelect.value = current.id;
    logDogSection.hidden = false;
}

// the dog picked for this session, or null when the picker isn't shown
function getLogDog() {
    if (!logDogSection || logDogSection.hidden || !logDogSelect.value) return null;
    return { id: logDogSelect.value, name: logDogSelect.selectedOptions[0].textContent };
}

if (logDogSelect) {
    // switching here also makes it the current dog, like on the My Dogs page
    logDogSelect.addEventListener("change", () => setCurrentDogId(logDogSelect.value));
    loadLogDogOptions();
}

/*add command to the select element*/

const commandSelect = document.getElementById("command");
const newCommandInput = document.getElementById("new-command");
const addCommandButton = document.getElementById("add-command");

/*add duration to the select element*/

const durationSelect = document.getElementById("duration");
const newDurationInput = document.getElementById("new-duration");
const addDurationButton = document.getElementById("add-duration");
const removeDurationButton = document.getElementById("remove-duration");

/*countdown/up timer based on the selected duration*/

const timerInput = document.getElementById("timer");
const timerStartButton = document.getElementById("timer-start");
const timerStopButton = document.getElementById("timer-stop");
const timerResetButton = document.getElementById("timer-reset");
const timerDirectionButton = document.getElementById("timer-direction");

let timerInterval = null;
let currentSeconds = 0;
let countUp = false;

// convert a duration label like "1 min 30 sec" into total seconds
function parseDurationToSeconds(text) {
    const minuteMatch = text.match(/(\d+)\s*min/);
    const secondMatch = text.match(/(\d+)\s*sec/);
    let seconds = 0;
    if (minuteMatch) {
        seconds += parseInt(minuteMatch[1], 10) * 60;
    }
    if (secondMatch) {
        seconds += parseInt(secondMatch[1], 10);
    }
    return seconds;
}

// format seconds as M:SS for the timer display
function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// start the countdown/up interval, initializing from the selected duration if needed
function startTimer() {
    if (timerInterval) {
        return;
    }

    if (!countUp && currentSeconds <= 0) {
        const selectedOption = durationSelect.options[durationSelect.selectedIndex];
        currentSeconds = parseDurationToSeconds(selectedOption.textContent);
    }

    timerInput.value = formatTime(currentSeconds);
    timerInterval = setInterval(() => {
        currentSeconds += countUp ? 1 : -1;

        if (!countUp && currentSeconds <= 0) {
            timerInput.value = "Time's up!";
            stopTimer();
            return;
        }

        timerInput.value = formatTime(currentSeconds);
    }, 1000);
}

// stop the running timer interval
function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
}

// stop the timer and clear the display
function resetTimer() {
    stopTimer();
    currentSeconds = 0;
    timerInput.value = "";
}

// switch between countdown and count-up mode
function toggleTimerDirection() {
    stopTimer();
    countUp = !countUp;
    currentSeconds = 0;
    timerInput.value = "";
    timerDirectionButton.textContent = countUp ? "Mode: Count Up" : "Mode: Countdown";
}

if (timerStartButton) {
    timerStartButton.addEventListener("click", startTimer);
    timerStopButton.addEventListener("click", stopTimer);
    timerResetButton.addEventListener("click", resetTimer);
    timerDirectionButton.addEventListener("click", toggleTimerDirection);
}


/* add distractions to the select element*/

const distractionSelect = document.getElementById("distractions");
const newDistractionInput = document.getElementById("new-distraction");
const addDistractionButton = document.getElementById("add-distraction");
const removeDistractionButton = document.getElementById("remove-distraction");

// add locations to the select element//

const locationSelect = document.getElementById("location");
const newLocationInput = document.getElementById("new-location");
const addLocationButton = document.getElementById("add-location");
const removeLocationButton = document.getElementById("remove-location");

/*add repetitions to the select element*/

const repetitionsSelect = document.getElementById("repitions");
const newRepetitionInput = document.getElementById("new-repition");
const addRepetitionButton = document.getElementById("add-repition");
const removeRepetitionButton = document.getElementById("remove-repition");

/*prevent the notes form from submitting and reloading the page*/

const notesForm = document.getElementById("notes-form");

if (notesForm) {
    notesForm.addEventListener("submit", (event) => {
        event.preventDefault();
    });
}

/*default the date/time fields to right now, unless the user has already set them (log.html)*/

const saveForm = document.getElementById("saveForm");
const saveMessage = document.getElementById("save-message");

if (saveForm) {
    const sessionDateInput = document.getElementById("date");
    const sessionTimeInput = document.getElementById("time");
    const now = new Date();

    if (sessionDateInput && !sessionDateInput.value) {
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        sessionDateInput.value = `${year}-${month}-${day}`;
    }

    if (sessionTimeInput && !sessionTimeInput.value) {
        const hours = String(now.getHours()).padStart(2, "0");
        const minutes = String(now.getMinutes()).padStart(2, "0");
        sessionTimeInput.value = `${hours}:${minutes}`;
    }

    const sessionStartTimeDefaultInput = document.getElementById("session-start-time");
    if (sessionStartTimeDefaultInput && !sessionStartTimeDefaultInput.value) {
        const hours = String(now.getHours()).padStart(2, "0");
        const minutes = String(now.getMinutes()).padStart(2, "0");
        sessionStartTimeDefaultInput.value = `${hours}:${minutes}`;
    }
}

/*track total time spent on the training session (from/to time range, or manual entry)*/

const sessionStartTimeInput = document.getElementById("session-start-time");
const sessionEndTimeInput = document.getElementById("session-end-time");
const sessionTotalTimeLabel = document.getElementById("session-total-time-label");
const sessionDurationModeToggle = document.getElementById("session-duration-mode-toggle");
const sessionClockFields = document.getElementById("session-clock-fields");
const sessionManualFields = document.getElementById("session-manual-fields");
const sessionDurationHoursInput = document.getElementById("session-duration-hours");
const sessionDurationMinutesInput = document.getElementById("session-duration-minutes");

// compute minutes between two "HH:MM" times, wrapping past midnight
function calculateSessionTotalMinutes(startStr, endStr) {
    if (!startStr || !endStr) {
        return null;
    }
    const [startHours, startMinutes] = startStr.split(":").map(Number);
    const [endHours, endMinutes] = endStr.split(":").map(Number);
    if ([startHours, startMinutes, endHours, endMinutes].some(Number.isNaN)) {
        return null;
    }
    let totalMinutes = (endHours * 60 + endMinutes) - (startHours * 60 + startMinutes);
    if (totalMinutes < 0) {
        totalMinutes += 24 * 60;
    }
    return totalMinutes;
}

// format total minutes as "X hr Y min"
function formatSessionTotalMinutes(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) {
        return `${minutes} min`;
    }
    return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`;
}

// true when the user is entering duration directly instead of a start/end time range
function isManualDurationMode() {
    return sessionDurationModeToggle.checked;
}

// get the session duration in minutes, from manual entry or the start/end time range
function getSessionTotalMinutes() {
    if (isManualDurationMode()) {
        const hours = Number(sessionDurationHoursInput.value) || 0;
        const minutes = Number(sessionDurationMinutesInput.value) || 0;
        const totalMinutes = hours * 60 + minutes;
        return totalMinutes > 0 ? totalMinutes : null;
    }
    return calculateSessionTotalMinutes(sessionStartTimeInput.value, sessionEndTimeInput.value);
}

// refresh the "Total time" label based on the current inputs
function updateSessionTotalTimeDisplay() {
    const totalMinutes = getSessionTotalMinutes();
    sessionTotalTimeLabel.textContent = totalMinutes === null
        ? "Total time: —"
        : `Total time: ${formatSessionTotalMinutes(totalMinutes)}`;
}

if (sessionStartTimeInput && sessionEndTimeInput && sessionTotalTimeLabel) {
    sessionStartTimeInput.addEventListener("change", updateSessionTotalTimeDisplay);
    sessionEndTimeInput.addEventListener("change", updateSessionTotalTimeDisplay);
    sessionDurationHoursInput.addEventListener("input", updateSessionTotalTimeDisplay);
    sessionDurationMinutesInput.addEventListener("input", updateSessionTotalTimeDisplay);

    sessionDurationModeToggle.addEventListener("change", () => {
        sessionClockFields.hidden = isManualDurationMode();
        sessionManualFields.hidden = !isManualDurationMode();
        updateSessionTotalTimeDisplay();
    });
}

/*save session data to local storage*/

if (saveForm) {
    saveForm.addEventListener("submit", (event) => {
        event.preventDefault();

        const session = {
            command: document.getElementById("command").value,
            repetitions: document.getElementById("repitions").value,
            duration: document.getElementById("duration").value,
            distractions: document.getElementById("distractions").value,
            location: document.getElementById("location").value,
            date: document.getElementById("date").value,
            time: document.getElementById("time").value,
            sessionStartTime: isManualDurationMode() ? "" : sessionStartTimeInput.value,
            sessionEndTime: isManualDurationMode() ? "" : sessionEndTimeInput.value,
            sessionTotalMinutes: getSessionTotalMinutes(),
            notes: document.getElementById("notes").value,
        };
        const logDog = getLogDog();
        if (logDog) session.dogId = logDog.id;
        // fields hidden for this command aren't recorded, rather than saving whatever their box defaulted to
        const display = getCommandDisplay(session.command);
        ["repetitions", "duration", "distractions", "location"].forEach((field) => {
            if (!display[field]) session[field] = "";
        });

        const sessionHistory = getSessionHistory();
        sessionHistory.push(session);

        saveMessage.textContent = logDog ? `Session saved for ${logDog.name}!` : "Session saved!";
        setSessionHistory(sessionHistory).then((synced) => {
            if (synced === false) {
                saveMessage.textContent = "Session saved on this device only. Couldn't sync to your account.";
            }
        });

        saveMessage.hidden = false;
        setTimeout(() => {
            saveMessage.hidden = true;
        }, 3000);
    });
}

/*save added commands, distractions, and locations to local storage*/

// find an existing <option> matching a name, case-insensitively
function findOptionByValue(selectElement, value) {
    return Array.from(selectElement.options).find(
        (option) => option.value.toLowerCase() === value.toLowerCase()
    );
}

// add a new <option>, inserting it before "Other" if that option exists
function addOptionToSelect(selectElement, name) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;

    const otherOption = findOptionByValue(selectElement, "other");
    if (otherOption) {
        selectElement.insertBefore(option, otherOption);
    } else {
        selectElement.appendChild(option);
    }
}

// restore previously added options from local storage into a <select>
function loadSavedOptions(storageKey, selectElement) {
    const savedNames = JSON.parse(localStorage.getItem(storageKey)) || [];
    savedNames.forEach((name) => {
        if (!findOptionByValue(selectElement, name)) {
            addOptionToSelect(selectElement, name);
        }
    });
}

// wire up an "Add" button to save a new option to local storage and the <select>
function setupAddOption(storageKey, selectElement, inputElement, button) {
    if (!selectElement || !inputElement || !button) {
        return;
    }

    loadSavedOptions(storageKey, selectElement);

    button.addEventListener("click", () => {
        const name = inputElement.value.trim();
        if (!name) {
            return;
        }

        if (findOptionByValue(selectElement, name)) {
            inputElement.value = "";
            return;
        }

        addOptionToSelect(selectElement, name);
        selectElement.value = name;
        inputElement.value = "";

        const savedNames = JSON.parse(localStorage.getItem(storageKey)) || [];
        savedNames.push(name);
        localStorage.setItem(storageKey, JSON.stringify(savedNames));
    });
}

// wire up a "Remove" button to delete a custom option (built-in options can't be removed)
function setupRemoveOption(storageKey, selectElement, button) {
    if (!selectElement || !button) {
        return;
    }

    button.addEventListener("click", () => {
        const selectedOption = selectElement.options[selectElement.selectedIndex];
        if (!selectedOption) {
            return;
        }

        const savedNames = JSON.parse(localStorage.getItem(storageKey)) || [];
        const matchIndex = savedNames.findIndex(
            (name) => name.toLowerCase() === selectedOption.value.toLowerCase()
        );

        if (matchIndex === -1) {
            alert(`"${selectedOption.textContent}" is a built-in option and can't be removed.`);
            return;
        }

        if (!confirm(`Remove "${selectedOption.textContent}"? This cannot be undone.`)) {
            return;
        }

        savedNames.splice(matchIndex, 1);
        localStorage.setItem(storageKey, JSON.stringify(savedNames));
        selectedOption.remove();
    });
}

setupAddOption("customCommands", commandSelect, newCommandInput, addCommandButton);
setupAddOption("customDistractions", distractionSelect, newDistractionInput, addDistractionButton);
setupAddOption("customLocations", locationSelect, newLocationInput, addLocationButton);
setupAddOption("customDurations", durationSelect, newDurationInput, addDurationButton);
setupAddOption("customRepetitions", repetitionsSelect, newRepetitionInput, addRepetitionButton);

setupRemoveOption("customDistractions", distractionSelect, removeDistractionButton);
setupRemoveOption("customLocations", locationSelect, removeLocationButton);
setupRemoveOption("customDurations", durationSelect, removeDurationButton);
setupRemoveOption("customRepetitions", repetitionsSelect, removeRepetitionButton);

/*show only the fields turned on for the picked command (set in Commands > Display Settings)*/

const displayFieldSections = document.querySelectorAll("[data-display-field]");
const logDisplayNote = document.getElementById("log-display-note");

// hide the sections for fields this command doesn't show
function applyCommandDisplay() {
    const display = getCommandDisplay(commandSelect.value);
    let anyHidden = false;
    displayFieldSections.forEach((section) => {
        section.hidden = !display[section.dataset.displayField];
        anyHidden = anyHidden || section.hidden;
    });
    if (logDisplayNote) logDisplayNote.hidden = !anyHidden;
}

if (commandSelect) {
    commandSelect.addEventListener("change", applyCommandDisplay);
    window.addEventListener("commanddisplaysynced", (event) => {
        if (event.detail.changed) applyCommandDisplay();
    });
    applyCommandDisplay();
}
