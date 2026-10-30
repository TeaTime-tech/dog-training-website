/* log.html: the Session | Exercise switch, the training session form (dog, pick-any command chips with reps and
   duration per command, pick-any distractions/location/weather, score, session length, save; each picked command is
   saved as its own session), the timer pop-up, and the exercise form. Needs commandList.js, dogs.js, sessions.js, exercises.js,
   trainingData.js and commandDisplay.js loaded first. */

/*Session | Exercise switch: shows one panel; log.html#exercise opens on Exercise*/

const logSwitchTabs = Array.from(document.querySelectorAll(".log-switch-tab"));

// show one tab's panel and hide the other, keeping the choice in the address so a reload stays on it
function selectLogTab(tab, focus = false) {
    logSwitchTabs.forEach((other) => {
        const selected = other === tab;
        other.setAttribute("aria-selected", String(selected));
        other.tabIndex = selected ? 0 : -1;
        document.getElementById(other.getAttribute("aria-controls")).hidden = !selected;
    });
    if (focus) tab.focus();
    const hash = tab.id === "log-tab-exercise" ? "#exercise" : "";
    if (window.location.hash !== hash) {
        history.replaceState(null, "", window.location.pathname + window.location.search + hash);
    }
}

logSwitchTabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectLogTab(tab));
    // arrow keys move between the two, like a native tab strip
    tab.addEventListener("keydown", (event) => {
        const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (!step) return;
        event.preventDefault();
        selectLogTab(logSwitchTabs[(index + step + logSwitchTabs.length) % logSwitchTabs.length], true);
    });
});
if (window.location.hash === "#exercise") selectLogTab(document.getElementById("log-tab-exercise"));

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

// the dog picked for this session or exercise, or null when the picker isn't shown
function getLogDog() {
    if (!logDogSection || logDogSection.hidden || !logDogSelect.value) return null;
    return { id: logDogSelect.value, name: logDogSelect.selectedOptions[0].textContent };
}

if (logDogSelect) {
    // switching here also makes it the current dog, like on the My Dogs page
    logDogSelect.addEventListener("change", () => setCurrentDogId(logDogSelect.value));
    loadLogDogOptions();
}

/*the pick lists: built-in options plus the ones added on this page (saved in this browser)*/

const REPETITION_OPTIONS = [["N/A", "N/A"], ["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"]];
// values are what sessions store ("1" is the built-in 1 minute, see formatDurationDisplay)
const DURATION_OPTIONS = [["N/A", "N/A"], ["5", "5 sec"], ["10", "10 sec"], ["15", "15 sec"], ["20", "20 sec"],
    ["30", "30 sec"], ["1", "1 min"], ["1:30", "1 min 30 sec"]];
const DISTRACTION_OPTIONS = [["none", "None"], ["other dogs", "Other dogs"], ["people", "People"],
    ["squirrels", "Squirrels"], ["birds", "Birds"], ["other", "Other"]];
const LOCATION_OPTIONS = [["home", "Home"], ["park", "Park"], ["street", "Street"], ["other", "Other"]];
const WEATHER_OPTIONS = [["sunny", "Sunny"], ["cloudy", "Cloudy"], ["rainy", "Rainy"], ["windy", "Windy"],
    ["snowy", "Snowy"], ["hot", "Hot"], ["cold", "Cold"], ["indoors", "Indoors"], ["other", "Other"]];

// the names added to one list on this page
function getSavedOptions(storageKey) {
    const saved = readStoredJson(storageKey, []);
    return Array.isArray(saved) ? saved : [];
}

// built-in [value, label] pairs plus the added names, any "other" kept last
function getOptionList(builtIns, storageKey) {
    const list = [...builtIns];
    const otherIndex = list.findIndex(([value]) => value === "other");
    const other = otherIndex === -1 ? [] : list.splice(otherIndex, 1);
    getSavedOptions(storageKey).forEach((name) => {
        if (!list.some(([value]) => value.toLowerCase() === name.toLowerCase())) list.push([name, name]);
    });
    return [...list, ...other];
}

// save a typed name to a list; false when it's blank or already there
function addSavedOption(builtIns, storageKey, name) {
    if (!name || getOptionList(builtIns, storageKey).some(([value]) => value.toLowerCase() === name.toLowerCase())) {
        return false;
    }
    localStorage.setItem(storageKey, JSON.stringify([...getSavedOptions(storageKey), name]));
    return true;
}

// take an added name back out of a list (built-in options can't be removed)
function removeSavedOption(storageKey, name) {
    const saved = getSavedOptions(storageKey).filter((saved) => saved.toLowerCase() !== name.toLowerCase());
    localStorage.setItem(storageKey, JSON.stringify(saved));
}

// a pick-any pill: a checkbox with its label; added options get a small × that removes them
function buildLogChip(value, label, checked, onRemove) {
    const wrap = document.createElement("span");
    wrap.className = "log-chip";

    const chip = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = value;
    checkbox.checked = checked;
    const text = document.createElement("span");
    text.textContent = label;
    chip.append(checkbox, text);
    wrap.appendChild(chip);

    if (onRemove) {
        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "log-chip-remove";
        removeButton.textContent = "×";
        removeButton.setAttribute("aria-label", `Remove ${label}`);
        removeButton.addEventListener("click", onRemove);
        wrap.appendChild(removeButton);
    }
    return wrap;
}

// the values of a chip group's ticked boxes, in the order shown
function getCheckedValues(container) {
    return Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map((box) => box.value);
}

// a pick-any field (distractions, location, weather): chips, an "+ Add option" box, and × on added options.
// exclusiveValue ("none") can't be picked alongside anything else. Returns a getter for the picked values
function setupChipField({ container, builtIns, storageKey, input, button, defaults = [], exclusiveValue = null }) {
    if (!container) return () => [];

    // the "+ Add" box rides at the end of the pills, so it sits on their last line
    const addBox = button.closest("details");

    const render = (picked) => {
        const savedNames = getSavedOptions(storageKey).map((name) => name.toLowerCase());
        container.replaceChildren(...getOptionList(builtIns, storageKey).map(([value, label]) => {
            const added = savedNames.includes(value.toLowerCase());
            return buildLogChip(value, label, picked.includes(value), added ? () => {
                if (!confirm(`Remove "${label}"? This cannot be undone.`)) return;
                removeSavedOption(storageKey, value);
                render(getCheckedValues(container).filter((other) => other !== value));
            } : null);
        }));
        if (addBox) container.appendChild(addBox);
    };

    container.addEventListener("change", (event) => {
        if (!exclusiveValue || !event.target.checked) return;
        // picking "None" clears the rest, and picking anything else clears "None"
        container.querySelectorAll('input[type="checkbox"]').forEach((box) => {
            if (box === event.target) return;
            if (event.target.value === exclusiveValue || box.value === exclusiveValue) box.checked = false;
        });
    });

    button.addEventListener("click", () => {
        const name = input.value.trim();
        const picked = getCheckedValues(container);
        if (addSavedOption(builtIns, storageKey, name)) {
            render(exclusiveValue ? [...picked.filter((value) => value !== exclusiveValue), name] : [...picked, name]);
        }
        input.value = "";
    });

    render(defaults);
    return () => getCheckedValues(container);
}

const getPickedDistractions = setupChipField({
    container: document.getElementById("distraction-chips"),
    builtIns: DISTRACTION_OPTIONS,
    storageKey: "customDistractions",
    input: document.getElementById("new-distraction"),
    button: document.getElementById("add-distraction"),
    defaults: ["none"],
    exclusiveValue: "none",
});
const getPickedLocations = setupChipField({
    container: document.getElementById("location-chips"),
    builtIns: LOCATION_OPTIONS,
    storageKey: "customLocations",
    input: document.getElementById("new-location"),
    button: document.getElementById("add-location"),
    defaults: ["home"],
});
const getPickedWeather = setupChipField({
    container: document.getElementById("weather-chips"),
    builtIns: WEATHER_OPTIONS,
    storageKey: "customWeather",
    input: document.getElementById("new-weather"),
    button: document.getElementById("add-weather"),
});

/*commands: pick any; each picked command gets a row for its reps and duration*/

const commandChips = document.getElementById("command-chips");
const commandRows = document.getElementById("command-rows");
const newCommandInput = document.getElementById("new-command");
const addCommandButton = document.getElementById("add-command");
const saveSessionButton = document.getElementById("triggerBtn");
// reps and duration picked per command (lowercase name), kept while rows are redrawn
const commandPicks = new Map();
// a command opened from a link that isn't in the account's list (log.html?command=...)
let linkedExtraCommand = null;
// the command whose duration was picked last, for the timer
let lastDurationCommand = null;

// "roll over" -> "Roll over" for the built-in lowercase names
function commandLabel(name) {
    return name.charAt(0).toUpperCase() + name.slice(1);
}

// the commands this account logs, plus a linked one that isn't among them
function getLogCommandNames() {
    const names = getVisibleCommandNames();
    if (linkedExtraCommand && !names.some((name) => name.toLowerCase() === linkedExtraCommand.toLowerCase())) {
        names.push(linkedExtraCommand);
    }
    return names;
}

// the picked commands, in the order their chips show
function getPickedCommands() {
    return commandChips ? getCheckedValues(commandChips) : [];
}

// draw the command chips, keeping these ones picked
function renderCommandChips(picked) {
    const pickedLower = picked.map((name) => name.toLowerCase());
    commandChips.replaceChildren(...getLogCommandNames().map((name) =>
        buildLogChip(name, commandLabel(name), pickedLower.includes(name.toLowerCase()), null)));
}

// a <select> of one pick list, set to this value (added to the list if it's no longer there)
function buildOptionSelect(options, value, label, labelFor = (text) => text) {
    const select = document.createElement("select");
    select.setAttribute("aria-label", label);
    options.forEach(([optionValue, optionLabel]) => select.add(new Option(optionLabel, optionValue)));
    if (!options.some(([optionValue]) => optionValue === value)) select.add(new Option(labelFor(value), value));
    select.value = value;
    return select;
}

// one row per picked command: its name, then reps and duration (or a note when it hides that field)
function renderCommandRows() {
    const picked = getPickedCommands();
    commandRows.replaceChildren();

    if (picked.length === 0) {
        const empty = document.createElement("p");
        empty.className = "log-command-empty";
        empty.textContent = "Pick a command above to set its reps and duration.";
        commandRows.appendChild(empty);
        return;
    }

    const repetitionOptions = getOptionList(REPETITION_OPTIONS, "customRepetitions");
    const durationOptions = getOptionList(DURATION_OPTIONS, "customDurations");

    picked.forEach((command) => {
        const key = command.toLowerCase();
        const picks = commandPicks.get(key) || { repetitions: "N/A", duration: "N/A" };
        commandPicks.set(key, picks);
        const display = getCommandDisplay(command);

        const row = document.createElement("div");
        row.className = "log-command-row";

        const name = document.createElement("span");
        name.className = "log-command-name";
        name.textContent = commandLabel(command);
        row.appendChild(name);

        // a reps or duration picker, or "Off" when the command's Display Settings hide that field
        const addPicker = (field, options, fieldLabel) => {
            const cell = document.createElement("span");
            cell.className = "log-command-cell";
            const caption = document.createElement("span");
            caption.className = "log-command-caption";
            caption.textContent = fieldLabel;
            cell.appendChild(caption);
            if (display[field]) {
                // a timed duration like "0:12" isn't in the list; show it as "12 sec"
                const select = buildOptionSelect(options, picks[field], `${fieldLabel} for ${commandLabel(command)}`,
                    field === "duration" ? durationOptionLabel : undefined);
                select.addEventListener("change", () => {
                    picks[field] = select.value;
                    if (field === "duration") lastDurationCommand = key;
                });
                cell.appendChild(select);
            } else {
                const off = document.createElement("span");
                off.className = "log-command-off";
                off.textContent = "Off";
                cell.appendChild(off);
            }
            row.appendChild(cell);
        };
        addPicker("repetitions", repetitionOptions, "Reps");
        addPicker("duration", durationOptions, "Duration");

        commandRows.appendChild(row);
    });
}

// the duration value the timer starts on: the one picked last, else the first picked command's (or "N/A")
function getPickedTimerDuration() {
    const picked = getPickedCommands().map((name) => name.toLowerCase());
    const key = picked.includes(lastDurationCommand) ? lastDurationCommand : picked[0];
    return key && commandPicks.get(key) ? commandPicks.get(key).duration : "N/A";
}

// every lap timed for each command (lowercase name) on this form, so its duration averages all of them
const commandLaps = new Map();

// a duration value for the reps/duration menus: "0:12" reads "12 sec"
function durationOptionLabel(value) {
    const seconds = parseStoredDurationSeconds(value);
    return seconds !== null && seconds < 60 && value.includes(":") ? `${seconds} sec` : formatDurationDisplay(value);
}

// add timed laps to a command (picking it if needed): one rep per lap, the average of all its laps as its
// duration, and the lap times in the notes. Returns the command's reps and that average in seconds
function addLapsToCommand(command, laps) {
    const key = command.toLowerCase();
    const picked = getPickedCommands();
    if (!picked.some((name) => name.toLowerCase() === key)) renderCommandChips([...picked, command]);

    const picks = commandPicks.get(key) || { repetitions: "N/A", duration: "N/A" };
    const reps = (Number(picks.repetitions) || 0) + laps.length;
    const allLaps = [...(commandLaps.get(key) || []), ...laps];
    commandLaps.set(key, allLaps);
    const average = Math.round(allLaps.reduce((sum, lap) => sum + lap, 0) / allLaps.length);
    picks.repetitions = String(reps);
    picks.duration = formatTime(average);
    commandPicks.set(key, picks);
    lastDurationCommand = key;

    const notesInput = document.getElementById("notes");
    const lapText = `${commandLabel(command)} laps: ${laps.map(formatTime).join(", ")}`;
    notesInput.value = notesInput.value.trim() ? `${notesInput.value.trim()}; ${lapText}` : lapText;

    renderCommandRows();
    applyCommandDisplay();
    updateSaveSessionLabel();
    return { reps, average };
}

// the "Edit reps & duration options" boxes, with the added options listed below for removing
function setupRowOptionAdder(builtIns, storageKey, input, button, customList) {
    const renderCustom = () => {
        customList.replaceChildren(...getSavedOptions(storageKey).map((name) => {
            const label = storageKey === "customDurations" ? formatDurationDisplay(name) : name;
            const chip = buildLogChip(name, label, false, () => {
                if (!confirm(`Remove "${label}"? This cannot be undone.`)) return;
                removeSavedOption(storageKey, name);
                renderCustom();
                renderCommandRows();
            });
            chip.querySelector("input").disabled = true;
            return chip;
        }));
        customList.hidden = customList.childElementCount === 0;
    };

    button.addEventListener("click", () => {
        if (addSavedOption(builtIns, storageKey, input.value.trim())) {
            renderCustom();
            renderCommandRows();
        }
        input.value = "";
    });
    renderCustom();
}

// the Save button names how many sessions it will save
function updateSaveSessionLabel() {
    const count = getPickedCommands().length;
    saveSessionButton.textContent = count > 1 ? `Save ${count} Sessions` : "Save Session";
}

if (commandChips) {
    // preselect the command from the link when coming from a tile on the Commands page (log.html?command=sit)
    const linkedCommand = new URLSearchParams(window.location.search).get("command");
    const match = linkedCommand && getVisibleCommandNames().find((name) => name.toLowerCase() === linkedCommand.toLowerCase());
    if (linkedCommand && !match) linkedExtraCommand = linkedCommand;
    renderCommandChips(linkedCommand ? [match || linkedCommand] : []);

    commandChips.addEventListener("change", () => {
        renderCommandRows();
        applyCommandDisplay();
        updateSaveSessionLabel();
    });

    addCommandButton.addEventListener("click", () => {
        const name = newCommandInput.value.trim();
        newCommandInput.value = "";
        if (!name) return;
        const picked = getPickedCommands();
        if (!getLogCommandNames().some((existing) => existing.toLowerCase() === name.toLowerCase())) {
            // commands are kept per account; adding one this account removed brings it back
            saveCommandLists([...getCustomCommands(), name], getHiddenCommands().filter((hidden) => hidden !== name.toLowerCase()));
        }
        const existing = getLogCommandNames().find((other) => other.toLowerCase() === name.toLowerCase()) || name;
        renderCommandChips([...picked, existing]);
        renderCommandRows();
        applyCommandDisplay();
        updateSaveSessionLabel();
    });

    // the account's list arrived: add its commands and drop the ones it removed
    window.addEventListener("commandlistsynced", (event) => {
        if (!event.detail.changed) return;
        renderCommandChips(getPickedCommands());
        renderCommandRows();
        applyCommandDisplay();
        updateSaveSessionLabel();
    });

    setupRowOptionAdder(REPETITION_OPTIONS, "customRepetitions", document.getElementById("new-repetition"),
        document.getElementById("add-repetition"), document.getElementById("custom-repetitions"));
    setupRowOptionAdder(DURATION_OPTIONS, "customDurations", document.getElementById("new-duration"),
        document.getElementById("add-duration"), document.getElementById("custom-durations"));
}

/*timer pop-up: count down from a duration or count up. It keeps running while closed, and the corner button
  shows the time. Lap marks off one rep; closing with laps offers to add them to a command (addLapsToCommand)*/

const timerOverlay = document.getElementById("timer-overlay");

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

if (timerOverlay) {
    const timerOpenButton = document.getElementById("timer-open");
    const timerFabText = document.getElementById("timer-fab-text");
    const timerModeGroup = document.getElementById("timer-mode");
    const timerFromRow = document.getElementById("timer-from-row");
    const timerFromSelect = document.getElementById("timer-from");
    const timerDisplay = document.getElementById("timer");
    const timerAnnounce = document.getElementById("timer-announce");
    const timerStartButton = document.getElementById("timer-start");
    const timerResetButton = document.getElementById("timer-reset");
    const timerCloseButton = document.getElementById("timer-close");
    const timerMain = document.getElementById("timer-main");
    const timerLapButton = document.getElementById("timer-lap");
    const timerLapsWrap = document.getElementById("timer-laps-wrap");
    const timerLapList = document.getElementById("timer-laps");
    const timerLapsClearButton = document.getElementById("timer-laps-clear");
    const timerLog = document.getElementById("timer-log");
    const timerLogTitle = document.getElementById("timer-log-title");
    const timerLogSummary = document.getElementById("timer-log-summary");
    const timerLogCommand = document.getElementById("timer-log-command");
    const timerLogAddButton = document.getElementById("timer-log-add");
    const timerLogDiscardButton = document.getElementById("timer-log-discard");
    const timerLogBackButton = document.getElementById("timer-log-back");
    const lapsStatus = document.getElementById("laps-status");

    let timerInterval = null;
    let currentSeconds = 0;
    // true once started, until Reset (a paused timer keeps its time)
    let timerStarted = false;
    let timerDone = false;
    // where a countdown started, so laps can measure time used
    let timerTotalSeconds = 0;
    // lap lengths in seconds, and the elapsed time at the last lap
    let laps = [];
    let lastLapAt = 0;

    const isCountUp = () => timerModeGroup.querySelector("input:checked").value === "up";

    // seconds in the picked "From" duration (custom ones may be typed as "45" or "45 sec")
    const getFromSeconds = () => {
        const option = timerFromSelect.selectedOptions[0];
        if (!option) return 0;
        return parseStoredDurationSeconds(option.value) || parseDurationToSeconds(option.textContent);
    };

    // list the durations to count down from, starting on the picked command's when the timer isn't in use
    const fillTimerFrom = () => {
        const previous = timerFromSelect.value;
        const options = getOptionList(DURATION_OPTIONS, "customDurations").filter(([value]) => value !== "N/A");
        timerFromSelect.replaceChildren(...options.map(([value, label]) => new Option(label, value)));
        const picked = getPickedTimerDuration();
        const wanted = timerStarted ? previous : (picked !== "N/A" ? picked : previous);
        if (options.some(([value]) => value === wanted)) timerFromSelect.value = wanted;
    };

    // draw the time in the pop-up, on the Start button, and on the corner button
    const showTimer = () => {
        const shown = timerDone ? "Time's up!" : formatTime(timerStarted || isCountUp() ? currentSeconds : getFromSeconds());
        timerDisplay.textContent = shown;
        timerDisplay.classList.toggle("log-timer-display--done", timerDone);
        timerFromRow.hidden = isCountUp();
        timerStartButton.textContent = timerInterval ? "Pause" : timerStarted && !timerDone ? "Resume" : "Start";
        timerFabText.textContent = timerDone ? "Time's up!" : timerStarted ? shown : "Timer";
        timerOpenButton.classList.toggle("log-timer-fab--running", Boolean(timerInterval) || timerDone);
        timerLapButton.disabled = !timerInterval;
    };

    // seconds timed so far, counting up or down
    const elapsedSeconds = () => (isCountUp() ? currentSeconds : timerTotalSeconds - currentSeconds);

    // list the laps, newest last
    const renderLaps = () => {
        timerLapList.replaceChildren(...laps.map((lap, index) => {
            const item = document.createElement("li");
            const name = document.createElement("span");
            name.textContent = `Lap ${index + 1}`;
            const time = document.createElement("span");
            time.className = "log-timer-lap-time";
            time.textContent = formatTime(lap);
            item.append(name, time);
            return item;
        }));
        timerLapsWrap.hidden = laps.length === 0;
        timerLapList.scrollTop = timerLapList.scrollHeight;
    };

    // mark a lap: the time since the last one becomes one rep
    const markLap = () => {
        const lap = elapsedSeconds() - lastLapAt;
        if (lap <= 0) return;
        laps.push(lap);
        lastLapAt = elapsedSeconds();
        timerAnnounce.textContent = `Lap ${laps.length}, ${formatTime(lap)}`;
        renderLaps();
    };

    const clearLaps = () => {
        laps = [];
        lastLapAt = elapsedSeconds();
        renderLaps();
    };

    const stopInterval = () => {
        clearInterval(timerInterval);
        timerInterval = null;
    };

    // back to the start: stopped, at 0:00 (count up) or the picked duration (count down)
    const resetTimer = () => {
        stopInterval();
        timerStarted = false;
        timerDone = false;
        currentSeconds = 0;
        timerTotalSeconds = 0;
        lastLapAt = 0;
        timerAnnounce.textContent = "";
        showTimer();
    };

    // count down to zero, then stop and say so (and buzz the phone where it can)
    const tick = () => {
        currentSeconds += isCountUp() ? 1 : -1;
        if (!isCountUp() && currentSeconds <= 0) {
            currentSeconds = 0;
            stopInterval();
            timerDone = true;
            timerAnnounce.textContent = "Time's up!";
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        }
        showTimer();
    };

    // Start, Pause and Resume share one button
    const toggleTimer = () => {
        if (timerInterval) {
            stopInterval();
            showTimer();
            return;
        }
        if (timerDone) resetTimer();
        if (!timerStarted) {
            currentSeconds = isCountUp() ? 0 : getFromSeconds();
            if (!isCountUp() && currentSeconds <= 0) return;
            timerTotalSeconds = currentSeconds;
            lastLapAt = 0;
            timerStarted = true;
        }
        timerAnnounce.textContent = "";
        timerInterval = setInterval(tick, 1000);
        showTimer();
    };

    // swap between the timer and the "log your laps" step
    const showLogStep = (show) => {
        timerMain.hidden = show;
        timerLog.hidden = !show;
    };

    const openTimer = () => {
        fillTimerFrom();
        showTimer();
        renderLaps();
        showLogStep(false);
        timerOverlay.hidden = false;
        timerStartButton.focus();
    };

    // close for real; laps not logged stay for next time
    const closeTimer = () => {
        showLogStep(false);
        timerOverlay.hidden = true;
        timerOpenButton.focus();
    };

    // closing with laps first offers to add them to a command: the picked ones, or any when none is picked
    const requestCloseTimer = () => {
        if (laps.length === 0 || !timerLog.hidden) {
            closeTimer();
            return;
        }
        const picked = getPickedCommands();
        const names = picked.length ? picked : getLogCommandNames();
        timerLogCommand.replaceChildren(...names.map((name) => new Option(commandLabel(name), name)));
        const preferred = names.find((name) => name.toLowerCase() === lastDurationCommand);
        if (preferred) timerLogCommand.value = preferred;

        const average = Math.round(laps.reduce((sum, lap) => sum + lap, 0) / laps.length);
        const lapWord = laps.length === 1 ? "lap" : "laps";
        timerLogTitle.textContent = `Log ${laps.length} ${lapWord}?`;
        timerLogSummary.textContent = `Each lap adds a rep, the average lap (${formatTime(average)}) becomes the `
            + "command's duration, and the lap times go in the notes.";
        showLogStep(true);
        timerLogAddButton.focus();
    };

    timerLapButton.addEventListener("click", markLap);
    timerLapsClearButton.addEventListener("click", () => {
        if (confirm(`Clear ${laps.length} ${laps.length === 1 ? "lap" : "laps"}?`)) clearLaps();
    });
    timerLogAddButton.addEventListener("click", () => {
        const command = timerLogCommand.value;
        if (!command) return;
        const count = laps.length;
        const { reps, average } = addLapsToCommand(command, laps);
        lapsStatus.textContent = `Added ${count} ${count === 1 ? "lap" : "laps"} to ${commandLabel(command)}: `
            + `${reps} ${reps === 1 ? "rep" : "reps"}, ${formatTime(average)} average.`;
        clearLaps();
        resetTimer();
        closeTimer();
    });
    timerLogDiscardButton.addEventListener("click", () => {
        clearLaps();
        closeTimer();
    });
    timerLogBackButton.addEventListener("click", () => {
        showLogStep(false);
        timerStartButton.focus();
    });

    // the corner button is a widget: drag it anywhere (it remembers where on this device), or click to open.
    // Alt + arrow keys move it from the keyboard
    const TIMER_POSITION_KEY = "logTimerPosition";
    let dragStart = null;
    let dragged = false;

    // keep the button fully on screen at this left/top, and remember it
    const placeTimerButton = (left, top, save = true) => {
        const maxLeft = window.innerWidth - timerOpenButton.offsetWidth - 8;
        const maxTop = window.innerHeight - timerOpenButton.offsetHeight - 8;
        const x = Math.round(Math.min(Math.max(left, 8), Math.max(maxLeft, 8)));
        const y = Math.round(Math.min(Math.max(top, 8), Math.max(maxTop, 8)));
        Object.assign(timerOpenButton.style, { left: `${x}px`, top: `${y}px`, right: "auto", bottom: "auto" });
        if (!save) return;
        try {
            localStorage.setItem(TIMER_POSITION_KEY, JSON.stringify({ left: x, top: y }));
        } catch (error) {
            // no storage (private window): it just won't remember
        }
    };

    timerOpenButton.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        const rect = timerOpenButton.getBoundingClientRect();
        dragStart = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
        dragged = false;
        if (timerOpenButton.setPointerCapture) timerOpenButton.setPointerCapture(event.pointerId);
    });
    timerOpenButton.addEventListener("pointermove", (event) => {
        if (!dragStart) return;
        const dx = event.clientX - dragStart.x;
        const dy = event.clientY - dragStart.y;
        // a few pixels of wobble still counts as a click
        if (!dragged && Math.hypot(dx, dy) < 6) return;
        dragged = true;
        timerOpenButton.classList.add("log-timer-fab--dragging");
        placeTimerButton(dragStart.left + dx, dragStart.top + dy, false);
    });
    const endDrag = () => {
        if (!dragStart) return;
        dragStart = null;
        timerOpenButton.classList.remove("log-timer-fab--dragging");
        if (dragged) {
            const rect = timerOpenButton.getBoundingClientRect();
            placeTimerButton(rect.left, rect.top);
        }
    };
    timerOpenButton.addEventListener("pointerup", endDrag);
    timerOpenButton.addEventListener("pointercancel", endDrag);
    timerOpenButton.addEventListener("keydown", (event) => {
        const steps = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        if (!event.altKey || !steps[event.key]) return;
        event.preventDefault();
        const rect = timerOpenButton.getBoundingClientRect();
        placeTimerButton(rect.left + steps[event.key][0] * 24, rect.top + steps[event.key][1] * 24);
    });
    // back on screen after the window shrinks or the phone turns
    window.addEventListener("resize", () => {
        if (!timerOpenButton.style.left) return;
        const rect = timerOpenButton.getBoundingClientRect();
        placeTimerButton(rect.left, rect.top, false);
    });
    try {
        const saved = JSON.parse(localStorage.getItem(TIMER_POSITION_KEY));
        if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) placeTimerButton(saved.left, saved.top, false);
    } catch (error) {
        // nothing saved, or no storage: it stays in the corner
    }

    timerOpenButton.addEventListener("click", (event) => {
        // the click that ends a drag doesn't open the timer
        if (dragged) {
            dragged = false;
            event.preventDefault();
            return;
        }
        openTimer();
    });
    timerCloseButton.addEventListener("click", requestCloseTimer);
    timerOverlay.addEventListener("click", (event) => {
        if (event.target === timerOverlay) requestCloseTimer();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !timerOverlay.hidden) requestCloseTimer();
    });
    timerStartButton.addEventListener("click", toggleTimer);
    timerResetButton.addEventListener("click", resetTimer);
    timerModeGroup.addEventListener("change", resetTimer);
    timerFromSelect.addEventListener("change", () => {
        if (!timerInterval) resetTimer();
    });
    showTimer();
}

/*prevent the notes form from submitting and reloading the page*/

const notesForm = document.getElementById("notes-form");

if (notesForm) {
    notesForm.addEventListener("submit", (event) => {
        event.preventDefault();
    });
}

/*default the date/time fields to right now, unless the user has already set them (log.html)*/

if (document.getElementById("saveForm")) {
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
}

/*track total time spent on the training session (in minutes)*/

const sessionTotalTimeLabel = document.getElementById("session-total-time-label");
const sessionDurationMinutesInput = document.getElementById("session-duration-minutes");

// format total minutes as "X hr Y min"
function formatSessionTotalMinutes(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) {
        return `${minutes} min`;
    }
    return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`;
}

// the session's length in minutes, or null when none was entered
function getSessionTotalMinutes() {
    const totalMinutes = Math.round(Number(sessionDurationMinutesInput.value) || 0);
    return totalMinutes > 0 ? totalMinutes : null;
}

// refresh the "Total time" label based on the current inputs
function updateSessionTotalTimeDisplay() {
    const totalMinutes = getSessionTotalMinutes();
    sessionTotalTimeLabel.textContent = totalMinutes === null
        ? "Total time: —"
        : `Total time: ${formatSessionTotalMinutes(totalMinutes)}`;
}

if (sessionTotalTimeLabel) {
    sessionDurationMinutesInput.addEventListener("input", updateSessionTotalTimeDisplay);
}

/*save one session per picked command*/

const saveForm = document.getElementById("saveForm");
const saveMessage = document.getElementById("save-message");

if (saveForm) {
    saveForm.addEventListener("submit", (event) => {
        event.preventDefault();

        const commands = getPickedCommands();
        if (commands.length === 0) {
            alert("Pick at least one command.");
            commandChips.scrollIntoView({ block: "center" });
            return;
        }

        const logDog = getLogDog();
        const distractions = getPickedDistractions();
        const shared = {
            // several picks are saved together, e.g. "park, street"
            distractions: distractions.length ? distractions.join(", ") : "none",
            location: getPickedLocations().join(", "),
            weather: getPickedWeather().join(", "),
            score: document.querySelector('input[name="score"]:checked').value,
            date: document.getElementById("date").value,
            time: document.getElementById("time").value,
            sessionTotalMinutes: getSessionTotalMinutes(),
            notes: document.getElementById("notes").value,
        };

        const sessionHistory = getSessionHistory();
        commands.forEach((command) => {
            const picks = commandPicks.get(command.toLowerCase()) || { repetitions: "N/A", duration: "N/A" };
            const session = { command, ...picks, ...shared };
            if (logDog) session.dogId = logDog.id;
            // fields hidden for this command aren't recorded, rather than saving whatever their box defaulted to
            const display = getCommandDisplay(command);
            ["repetitions", "duration", "distractions", "location", "weather", "score"].forEach((field) => {
                if (!display[field]) session[field] = "";
            });
            sessionHistory.push(session);
        });

        const what = commands.length === 1 ? "Session" : `${commands.length} sessions`;
        saveMessage.textContent = logDog ? `${what} saved for ${logDog.name}!` : `${what} saved!`;
        setSessionHistory(sessionHistory).then((synced) => {
            if (synced === false) {
                saveMessage.textContent = `${what} saved on this device only. Couldn't sync to your account.`;
            }
        });

        saveMessage.hidden = false;
        setTimeout(() => {
            saveMessage.hidden = true;
        }, 3000);
    });
}

/*show only the fields turned on for the picked commands (set in Commands > Display Settings)*/

const displayFieldSections = document.querySelectorAll("[data-display-field]");
const logDisplayNote = document.getElementById("log-display-note");

// show a shared field when any picked command uses it (all of them before one is picked), and note any that are off
function applyCommandDisplay() {
    const displays = getPickedCommands().map((command) => getCommandDisplay(command));
    displayFieldSections.forEach((section) => {
        const field = section.dataset.displayField;
        section.hidden = displays.length > 0 && !displays.some((display) => display[field]);
    });
    // reps and duration live in the command rows (they show "Off"), so check every field, not just the sections
    const anyHidden = ["repetitions", "duration", "distractions", "location", "weather", "score"]
        .some((field) => displays.some((display) => !display[field]));
    if (logDisplayNote) logDisplayNote.hidden = !anyHidden;
}

if (commandChips) {
    window.addEventListener("commanddisplaysynced", (event) => {
        if (!event.detail.changed) return;
        renderCommandRows();
        applyCommandDisplay();
    });
    renderCommandRows();
    applyCommandDisplay();
    updateSaveSessionLabel();
}

/*log an exercise (walk, fetch...) for the dog picked at the top*/

const exerciseForm = document.getElementById("exercise-form");

if (exerciseForm) {
    const exerciseNameInput = document.getElementById("exercise-name");
    const exerciseDateInput = document.getElementById("exercise-when-date");
    const exerciseTimeInput = document.getElementById("exercise-when-time");
    const exerciseMeasure = document.getElementById("exercise-measure");
    const exerciseDurationField = document.getElementById("exercise-duration-field");
    const exerciseDurationInput = document.getElementById("exercise-duration");
    const exerciseDurationUnitSelect = document.getElementById("exercise-duration-unit");
    const exerciseDistanceField = document.getElementById("exercise-distance-field");
    const exerciseDistanceInput = document.getElementById("exercise-distance");
    const exerciseDistanceUnitSelect = document.getElementById("exercise-distance-unit");
    const exerciseNotesInput = document.getElementById("exercise-notes");
    const exerciseSaveMessage = document.getElementById("exercise-save-message");

    const now = new Date();
    exerciseDateInput.value = localDateString(now);
    exerciseTimeInput.value = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    exerciseDistanceUnitSelect.value = getDistanceUnit();

    // true when "Track by" is on Distance
    const isByDistance = () => exerciseMeasure.querySelector("input:checked").value === "distance";

    // show the duration or the distance field, whichever "Track by" picks
    const showExerciseMeasure = () => {
        exerciseDurationField.hidden = isByDistance();
        exerciseDistanceField.hidden = !isByDistance();
    };
    exerciseMeasure.addEventListener("change", showExerciseMeasure);
    showExerciseMeasure();

    exerciseForm.addEventListener("submit", (event) => {
        event.preventDefault();

        const name = exerciseNameInput.value.trim();
        if (!name) {
            alert("Please enter an exercise name.");
            exerciseNameInput.focus();
            return;
        }

        const byDistance = isByDistance();
        const duration = byDistance ? "" : exerciseDurationInput.value.trim();
        if (duration !== "" && !/^\d+$/.test(duration)) {
            alert("Duration must be a whole number.");
            return;
        }

        const distanceText = byDistance ? exerciseDistanceInput.value.trim() : "";
        const distance = distanceText === "" ? "" : parseDistanceInput(distanceText);
        if (distance === null) {
            alert("Distance must be a number above 0, like 2 or 1.5.");
            return;
        }

        // minutes are stored as "M:00", like Today's Add Exercise, so durations read back the same everywhere
        const exercise = {
            name,
            duration: duration !== "" && exerciseDurationUnitSelect.value === "min" ? `${duration}:00` : duration,
            distance,
            distanceUnit: distance ? exerciseDistanceUnitSelect.value : "",
            notes: exerciseNotesInput.value.trim(),
            date: exerciseDateInput.value || localDateString(),
            time: exerciseTimeInput.value,
        };
        const logDog = getLogDog();
        if (logDog) exercise.dogId = logDog.id;

        const exerciseHistory = getExerciseHistory();
        exerciseHistory.push(exercise);

        exerciseSaveMessage.textContent = logDog ? `Exercise saved for ${logDog.name}!` : "Exercise saved!";
        setExerciseHistory(exerciseHistory).then((synced) => {
            if (synced === false) {
                exerciseSaveMessage.textContent = "Exercise saved on this device only. Couldn't sync to your account.";
            }
        });

        // ready for the next one: keep the date, time and how it's tracked
        exerciseNameInput.value = "";
        exerciseDurationInput.value = "";
        exerciseDistanceInput.value = "";
        exerciseNotesInput.value = "";

        exerciseSaveMessage.hidden = false;
        setTimeout(() => {
            exerciseSaveMessage.hidden = true;
        }, 3000);
    });
}
