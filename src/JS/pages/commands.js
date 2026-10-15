/* commands.html: command tiles, the Canine Good Citizen checklist, mastery, and per-command display settings.
   Needs trainingData.js, mastery.js and commandDisplay.js loaded first. */

/*view, add, and hide commands as buttons (commands.html)*/
/*commands are never deleted from storage, only hidden from view*/

const commandButtonsContainer = document.getElementById("command-buttons");

if (commandButtonsContainer) {
    const builtInCommandButtonNames = ["sit", "stay", "come"];
    const hideCommandSelect = document.getElementById("delete-command");
    const hideCommandButton = document.getElementById("delete-command-button");

    const hasCommandButton = (name) =>
        Array.from(commandButtonsContainer.children).some(
            (button) => button.value.toLowerCase() === name.toLowerCase()
        );

    const hasHideOption = (name) =>
        Array.from(hideCommandSelect.options).some(
            (option) => option.value.toLowerCase() === name.toLowerCase()
        );

    const addHideOption = (name) => {
        if (hasHideOption(name)) {
            return;
        }
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        hideCommandSelect.appendChild(option);
    };

    const renderCommandButton = (name) => {
        if (!hasCommandButton(name)) {
            const button = document.createElement("button");
            button.type = "button";
            button.value = name;
            button.textContent = name;
            commandButtonsContainer.appendChild(button);
        }
        addHideOption(name);
    };

    const hiddenCommands = JSON.parse(localStorage.getItem("hiddenCommands")) || [];
    const savedCommandButtonNames = JSON.parse(localStorage.getItem("customCommands")) || [];

    builtInCommandButtonNames
        .filter((name) => !hiddenCommands.includes(name.toLowerCase()))
        .forEach(renderCommandButton);
    savedCommandButtonNames
        .filter((name) => !hiddenCommands.includes(name.toLowerCase()))
        .forEach(renderCommandButton);

    const addCommandPageButton = document.getElementById("add-command");
    const newCommandPageInput = document.getElementById("new-command");

    addCommandPageButton.addEventListener("click", () => {
        const name = newCommandPageInput.value.trim();
        if (!name || hasCommandButton(name)) {
            newCommandPageInput.value = "";
            return;
        }

        renderCommandButton(name);

        const savedNames = JSON.parse(localStorage.getItem("customCommands")) || [];
        savedNames.push(name);
        localStorage.setItem("customCommands", JSON.stringify(savedNames));

        newCommandPageInput.value = "";
        window.dispatchEvent(new CustomEvent("commandlistchanged"));
    });

    hideCommandButton.addEventListener("click", () => {
        const name = hideCommandSelect.value;
        if (!name) {
            return;
        }

        if (!confirm(`Are you sure you want to hide the command "${name}"? It won't be deleted and can be restored later.`)) {
            return;
        }

        const button = Array.from(commandButtonsContainer.children).find(
            (button) => button.value.toLowerCase() === name.toLowerCase()
        );
        if (button) {
            button.remove();
        }

        const option = Array.from(hideCommandSelect.options).find(
            (option) => option.value.toLowerCase() === name.toLowerCase()
        );
        if (option) {
            option.remove();
        }

        const hidden = JSON.parse(localStorage.getItem("hiddenCommands")) || [];
        if (!hidden.includes(name.toLowerCase())) {
            hidden.push(name.toLowerCase());
            localStorage.setItem("hiddenCommands", JSON.stringify(hidden));
        }

        hideCommandSelect.value = "";
        window.dispatchEvent(new CustomEvent("commandlistchanged"));
    });
}

/*Canine Good Citizen checklist panel (commands.html)*/
/*each item tracks a log of pass/fail attempts in localStorage, rather than a single checked state*/

const CGC_CHECKLIST_ITEMS = [
    { id: "cgc-friendly-stranger", name: "Accepting a Friendly Stranger" },
    { id: "cgc-sitting-petting", name: "Sitting Politely for Petting" },
    { id: "cgc-appearance-grooming", name: "Appearance and Grooming" },
    { id: "cgc-loose-lead-walk", name: "Out for a Walk (Walking on a Loose Lead)" },
    { id: "cgc-walking-crowd", name: "Walking Through a Crowd" },
    { id: "cgc-sit-down-stay", name: "Sit and Down on Command / Staying in Place" },
    { id: "cgc-coming-when-called", name: "Coming When Called" },
    { id: "cgc-reaction-to-dog", name: "Reaction to Another Dog" },
    { id: "cgc-reaction-to-distraction", name: "Reaction to Distraction" },
    { id: "cgc-supervised-separation", name: "Supervised Separation" },
];

const cgcToggleButton = document.getElementById("cgc-toggle");
const cgcPanel = document.getElementById("cgc-panel");

if (cgcToggleButton && cgcPanel) {
    const cgcChecklist = document.getElementById("cgc-checklist");
    const cgcProgressBar = document.getElementById("cgc-progress-bar");
    const cgcProgressLabel = document.getElementById("cgc-progress-label");

    // read the pass/fail attempt log for all checklist items, keyed by item id
    function getCgcAttempts() {
        return JSON.parse(localStorage.getItem("cgcAttempts")) || {};
    }

    function saveCgcAttempts(allAttempts) {
        localStorage.setItem("cgcAttempts", JSON.stringify(allAttempts));
    }

    // format an ISO date as e.g. "Jan 5"
    function formatCgcDate(isoDate) {
        const date = new Date(`${isoDate}T00:00:00`);
        if (Number.isNaN(date.getTime())) {
            return isoDate;
        }
        return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }

    // show the attempt count and most recent result for one checklist item
    function updateCgcSummaryText(summarySpan, attempts) {
        if (attempts.length === 0) {
            summarySpan.textContent = "No attempts yet";
            return;
        }
        const last = attempts[attempts.length - 1];
        const plural = attempts.length === 1 ? "attempt" : "attempts";
        summarySpan.textContent = `${attempts.length} ${plural}, last: ${last.result}, ${formatCgcDate(last.date)}`;
    }

    // render the full attempt history (newest first) for one checklist item
    function renderCgcAttemptLog(container, attempts) {
        container.innerHTML = "";

        if (attempts.length === 0) {
            const empty = document.createElement("p");
            empty.className = "cgc-no-attempts";
            empty.textContent = "No attempts logged yet.";
            container.appendChild(empty);
            return;
        }

        const list = document.createElement("ul");
        list.className = "cgc-attempt-items";

        attempts.slice().reverse().forEach((attempt) => {
            const entry = document.createElement("li");
            entry.className = `cgc-attempt-entry cgc-attempt-${attempt.result}`;

            const dateSpan = document.createElement("span");
            dateSpan.className = "cgc-attempt-date";
            dateSpan.textContent = formatCgcDate(attempt.date);

            const resultSpan = document.createElement("span");
            resultSpan.className = "cgc-attempt-result";
            resultSpan.textContent = attempt.result === "pass" ? "Pass" : "Fail";

            entry.appendChild(dateSpan);
            entry.appendChild(resultSpan);

            if (attempt.notes) {
                const notesSpan = document.createElement("span");
                notesSpan.className = "cgc-attempt-notes";
                notesSpan.textContent = attempt.notes;
                entry.appendChild(notesSpan);
            }

            list.appendChild(entry);
        });

        container.appendChild(list);
    }

    // update the progress bar/label from items whose most recent attempt passed
    function updateCgcProgressDisplay() {
        const allAttempts = getCgcAttempts();
        const passedCount = CGC_CHECKLIST_ITEMS.filter((item) => {
            const attempts = allAttempts[item.id] || [];
            const last = attempts[attempts.length - 1];
            return last && last.result === "pass";
        }).length;
        cgcProgressBar.value = passedCount;
        cgcProgressLabel.textContent = `${passedCount}/${CGC_CHECKLIST_ITEMS.length}`;
    }

    // build one checklist row: name, log button, expandable attempt history, and log form
    function createCgcListItem(item, attempts) {
        const li = document.createElement("li");
        li.className = "cgc-row";

        const top = document.createElement("div");
        top.className = "cgc-row-top";

        const name = document.createElement("span");
        name.className = "cgc-name";
        name.textContent = item.name;

        const logBtn = document.createElement("button");
        logBtn.type = "button";
        logBtn.className = "cgc-log-btn";
        logBtn.textContent = "Log Attempt";

        top.appendChild(name);
        top.appendChild(logBtn);

        const summaryBtn = document.createElement("button");
        summaryBtn.type = "button";
        summaryBtn.className = "cgc-summary-toggle";

        const summarySpan = document.createElement("span");
        summarySpan.className = "cgc-summary-text";

        const expandIcon = document.createElement("span");
        expandIcon.className = "cgc-expand-icon";
        expandIcon.textContent = "▾";

        summaryBtn.appendChild(summarySpan);
        summaryBtn.appendChild(expandIcon);

        const attemptLog = document.createElement("div");
        attemptLog.className = "cgc-attempt-log";
        attemptLog.hidden = true;

        const logForm = document.createElement("div");
        logForm.className = "cgc-log-form";
        logForm.hidden = true;
        logForm.innerHTML = `
            <div class="field">
                <label>Result</label>
                <select class="cgc-result-select">
                    <option value="pass">Pass</option>
                    <option value="fail">Fail</option>
                </select>
            </div>
            <div class="field">
                <label>Notes</label>
                <textarea class="cgc-notes-input" placeholder="Optional notes..."></textarea>
            </div>
            <div class="cgc-log-form-actions">
                <button type="button" class="save-btn cgc-save-attempt-btn">Save Attempt</button>
                <button type="button" class="cgc-cancel-attempt-btn">Cancel</button>
            </div>
        `;

        li.appendChild(top);
        li.appendChild(summaryBtn);
        li.appendChild(attemptLog);
        li.appendChild(logForm);

        updateCgcSummaryText(summarySpan, attempts);
        renderCgcAttemptLog(attemptLog, attempts);

        summaryBtn.addEventListener("click", () => {
            attemptLog.hidden = !attemptLog.hidden;
        });

        logBtn.addEventListener("click", () => {
            logForm.hidden = !logForm.hidden;
            if (!logForm.hidden) {
                logForm.querySelector(".cgc-result-select").value = "pass";
                logForm.querySelector(".cgc-notes-input").value = "";
            }
        });

        logForm.querySelector(".cgc-cancel-attempt-btn").addEventListener("click", () => {
            logForm.hidden = true;
        });

        logForm.querySelector(".cgc-save-attempt-btn").addEventListener("click", () => {
            const resultSelect = logForm.querySelector(".cgc-result-select");
            const notesInput = logForm.querySelector(".cgc-notes-input");

            const attempt = {
                date: new Date().toISOString().slice(0, 10),
                result: resultSelect.value,
                notes: notesInput.value.trim(),
            };

            const allAttempts = getCgcAttempts();
            const itemAttempts = allAttempts[item.id] || [];
            itemAttempts.push(attempt);
            allAttempts[item.id] = itemAttempts;
            saveCgcAttempts(allAttempts);

            updateCgcSummaryText(summarySpan, itemAttempts);
            renderCgcAttemptLog(attemptLog, itemAttempts);
            attemptLog.hidden = false;
            logForm.hidden = true;
            updateCgcProgressDisplay();
        });

        return li;
    }

    const cgcAttemptsData = getCgcAttempts();
    CGC_CHECKLIST_ITEMS.forEach((item) => {
        const itemAttempts = cgcAttemptsData[item.id] || [];
        cgcChecklist.appendChild(createCgcListItem(item, itemAttempts));
    });

    cgcProgressBar.max = CGC_CHECKLIST_ITEMS.length;
    updateCgcProgressDisplay();

    cgcToggleButton.addEventListener("click", () => {
        cgcPanel.hidden = !cgcPanel.hidden;
    });
}

/*command mastery levels, from Supabase (commands.html)*/
/*base level = best level ever earned; decayed level = where it stands after time away from practice*/

const masteryList = document.getElementById("mastery-list");

if (masteryList) {
    const masteryStatus = document.getElementById("mastery-status");
    const masteryDecayToggle = document.getElementById("mastery-decay-toggle");

    let masteryTiers = [];
    let masteryRows = [];

    // "today" / "yesterday" / "N days ago"
    const formatDaysAgo = (days) => {
        if (days === 0) return "today";
        if (days === 1) return "yesterday";
        return `${days} days ago`;
    };

    // visible commands (built-in + custom, minus hidden) plus anything practiced, de-duplicated
    const getMasteryCommandNames = () => {
        const hidden = JSON.parse(localStorage.getItem("hiddenCommands")) || [];
        const names = getAllCommandNames().filter((name) => !hidden.includes(name.toLowerCase()));
        masteryRows.forEach((row) => {
            if (!names.some((name) => name.toLowerCase() === row.command.toLowerCase())) {
                names.push(row.command);
            }
        });
        return names;
    };

    // one command's name, level, meter, and practice details
    const renderMasteryRow = (name, row, showDecay) => {
        const maxLevel = masteryTiers[masteryTiers.length - 1].level;
        const tierName = (level) => masteryTiers.find((tier) => tier.level === level).name;
        const baseLevel = row ? row.base_level : 0;
        const decayedLevel = row ? row.decayed_level : 0;
        const shownLevel = showDecay ? decayedLevel : baseLevel;

        const item = document.createElement("li");
        item.className = "mastery-row";

        const top = document.createElement("div");
        top.className = "mastery-row-top";
        const commandName = document.createElement("span");
        commandName.className = "mastery-command";
        commandName.textContent = name;
        const levelName = document.createElement("span");
        levelName.className = shownLevel === 0 ? "mastery-level-name mastery-level-name--none" : "mastery-level-name";
        levelName.textContent = tierName(shownLevel);
        top.append(commandName, levelName);

        const meter = document.createElement("div");
        meter.className = "mastery-meter";
        meter.style.setProperty("--levels", maxLevel);
        meter.setAttribute("role", "img");
        meter.setAttribute("aria-label", `Level ${shownLevel} of ${maxLevel}: ${tierName(shownLevel)}`);
        for (let level = 1; level <= maxLevel; level++) {
            const segment = document.createElement("span");
            segment.className = "mastery-segment";
            if (level <= shownLevel) {
                segment.classList.add("mastery-segment--earned");
            } else if (showDecay && level <= baseLevel) {
                segment.classList.add("mastery-segment--decayed");
            }
            meter.appendChild(segment);
        }

        const detail = document.createElement("p");
        detail.className = "mastery-detail";
        if (!row) {
            detail.textContent = "Not practiced yet";
        } else {
            const parts = [
                `${row.session_count} ${row.session_count === 1 ? "session" : "sessions"}`,
                `last practiced ${formatDaysAgo(row.days_since_practice)}`,
            ];
            if (showDecay && decayedLevel < baseLevel) {
                parts.push(`slipped from ${tierName(baseLevel)}, practice to win it back`);
            } else if (showDecay && row.days_until_decay !== null && row.days_until_decay <= 7) {
                parts.push(`practice within ${row.days_until_decay} ${row.days_until_decay === 1 ? "day" : "days"} to keep ${tierName(decayedLevel)}`);
            }
            detail.textContent = parts.join(" · ");
        }

        item.append(top, meter, detail);
        return item;
    };

    // redraw the whole list using the toggle's current setting
    const renderMasteryList = () => {
        const rowsByCommand = new Map(masteryRows.map((row) => [row.command.toLowerCase(), row]));
        masteryList.replaceChildren(
            ...getMasteryCommandNames().map((name) =>
                renderMasteryRow(name, rowsByCommand.get(name.toLowerCase()), masteryDecayToggle.checked)
            )
        );
    };

    // show a message instead of the list
    const showMasteryStatus = (message) => {
        masteryStatus.replaceChildren(message);
        masteryList.replaceChildren();
    };

    const loadMastery = async () => {
        masteryDecayToggle.disabled = true;

        if (!supabaseClient) {
            showMasteryStatus("Mastery tracking turns on once Supabase is set up.");
            return;
        }
        const user = await getSignedInUser();
        if (!user) {
            const loginLink = document.createElement("a");
            loginLink.href = "login.html";
            loginLink.textContent = "Log in";
            showMasteryStatus(loginLink);
            masteryStatus.append(" to see mastery for each command.");
            return;
        }

        masteryStatus.textContent = "Loading mastery...";
        try {
            const [tiers, rows, decayEnabled] = await Promise.all([
                getMasteryTiers(),
                getCommandMastery(),
                getMasteryDecayEnabled(),
            ]);
            masteryTiers = tiers;
            masteryRows = rows;
            masteryDecayToggle.checked = decayEnabled;
            masteryDecayToggle.disabled = false;
            masteryStatus.textContent = "";
            renderMasteryList();
        } catch (error) {
            console.error("Could not load command mastery:", error);
            showMasteryStatus(`Couldn't load mastery: ${error.message}`);
        }
    };

    // the toggle only changes what's displayed, so redraw right away and save in the background
    masteryDecayToggle.addEventListener("change", async () => {
        renderMasteryList();
        try {
            await setMasteryDecayEnabled(masteryDecayToggle.checked);
        } catch (error) {
            console.error("Could not save mastery decay setting:", error);
            masteryStatus.textContent = "Couldn't save that setting. It will reset next time you open this page.";
        }
    });

    loadMastery();

    // mastery is worked out from the account's sessions, so reload once new ones are uploaded
    window.addEventListener("sessionhistorysynced", (event) => {
        if (event.detail.uploaded > 0) loadMastery();
    });
}

/*per-command display settings: which fields show for a command on the Log and Today pages (commands.html)*/

const displayCommandSelect = document.getElementById("display-command");

if (displayCommandSelect) {
    const displayStatus = document.getElementById("display-status");
    const saveDisplayButton = document.getElementById("save-settings");
    const displayToggles = {
        score: document.getElementById("score"),
        repetitions: document.getElementById("toggle-repetitions"),
        duration: document.getElementById("toggle-duration"),
        location: document.getElementById("toggle-location"),
        distractions: document.getElementById("toggle-distractions"),
        weather: document.getElementById("toggle-weather"),
    };
    let displayedCommand = null;
    let displayChanged = false;

    // commands that aren't hidden, in the same order as the command tiles
    const getVisibleCommands = () => {
        const hidden = JSON.parse(localStorage.getItem("hiddenCommands")) || [];
        return getAllCommandNames().filter((name) => !hidden.includes(name.toLowerCase()));
    };

    // set the toggles to a command's saved settings
    const showCommandDisplay = (command) => {
        displayedCommand = command;
        const display = getCommandDisplay(command);
        Object.entries(displayToggles).forEach(([field, toggle]) => {
            if (toggle) toggle.checked = display[field];
        });
        displayChanged = false;
        displayStatus.textContent = "";
    };

    // refill the command dropdown, keeping the current choice when it's still there
    const fillDisplayCommands = () => {
        const commands = getVisibleCommands();
        displayCommandSelect.replaceChildren(...commands.map((name) => {
            const option = document.createElement("option");
            option.value = name;
            option.textContent = name;
            return option;
        }));
        const keep = commands.find((name) => name === displayedCommand) || commands[0] || null;
        if (keep) displayCommandSelect.value = keep;
        saveDisplayButton.disabled = !keep;
        if (keep !== displayedCommand) showCommandDisplay(keep);
    };

    Object.values(displayToggles).forEach((toggle) => {
        if (!toggle) return;
        toggle.addEventListener("change", () => {
            displayChanged = true;
            displayStatus.textContent = "Unsaved changes.";
        });
    });

    // switching commands drops unsaved changes, so check first
    displayCommandSelect.addEventListener("change", () => {
        if (displayChanged && !confirm(`Discard your unsaved display changes for "${displayedCommand}"?`)) {
            displayCommandSelect.value = displayedCommand;
            return;
        }
        showCommandDisplay(displayCommandSelect.value);
    });

    saveDisplayButton.addEventListener("click", () => {
        if (!displayedCommand) return;
        const display = Object.fromEntries(
            Object.entries(displayToggles).map(([field, toggle]) => [field, toggle ? toggle.checked : true])
        );
        const savedCommand = displayedCommand;
        displayChanged = false;
        displayStatus.textContent = `Saved display settings for "${savedCommand}".`;
        setCommandDisplay(savedCommand, display).then((synced) => {
            if (synced === false && displayedCommand === savedCommand && !displayChanged) {
                displayStatus.textContent = `Saved display settings for "${savedCommand}" on this device only. Couldn't sync to your account.`;
            }
        });
    });

    // the account's settings arrived; show them unless the toggles have unsaved changes
    window.addEventListener("commanddisplaysynced", (event) => {
        if (event.detail.changed && !displayChanged && displayedCommand) showCommandDisplay(displayedCommand);
    });

    window.addEventListener("commandlistchanged", fillDisplayCommands);
    fillDisplayCommands();
}
