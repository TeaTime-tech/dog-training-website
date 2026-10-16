/* commands.html: command tiles (with log, notes and delete), the Canine Good Citizen checklist, mastery, and per-command display settings.
   Needs commandList.js, trainingData.js, mastery.js, commandDisplay.js and commandNotes.js loaded first. */

/*view, add, and hide commands as buttons (commands.html)*/
/*commands are never deleted from storage, only hidden from view*/

const commandButtonsContainer = document.getElementById("command-buttons");

if (commandButtonsContainer) {
    const hideCommandSelect = document.getElementById("delete-command");
    const hideCommandButton = document.getElementById("delete-command-button");
    const commandPager = document.getElementById("command-pager");
    const commandPrevButton = document.getElementById("command-prev");
    const commandNextButton = document.getElementById("command-next");
    const commandPageLabel = document.getElementById("command-page-label");
    const commandActions = document.getElementById("command-actions");
    const commandActionsName = document.getElementById("command-actions-name");
    const commandActionsNotes = document.getElementById("command-actions-notes");
    const commandActionsStatus = document.getElementById("command-actions-status");
    const notesOverlay = document.getElementById("command-notes-overlay");
    const notesTitle = document.getElementById("command-notes-title");
    const notesText = document.getElementById("command-notes-text");
    const editNotesButton = document.getElementById("command-edit-notes");
    const COMMAND_ROWS_PER_PAGE = 3;
    let commandPage = 0;
    let selectedCommandTile = null;

    // hide the Log / Delete choices and unhighlight the tile they were for
    const closeCommandActions = () => {
        if (selectedCommandTile) selectedCommandTile.removeAttribute("aria-pressed");
        selectedCommandTile = null;
        commandActions.hidden = true;
        commandActionsStatus.textContent = "";
    };

    // show the clicked command's saved notes in its panel
    const showNotesPreview = () => {
        if (!selectedCommandTile) return;
        const note = getCommandNote(selectedCommandTile.value);
        commandActionsNotes.textContent = note || "No notes yet. Click to add some.";
        commandActionsNotes.classList.toggle("command-actions-notes--empty", !note);
    };

    // split the tiles into pages of three wrapped lines and show only the current page
    // (lines depend on screen width, so this measures where each tile lands)
    const paginateCommandTiles = (showLastPage = false) => {
        const buttons = Array.from(commandButtonsContainer.children);
        buttons.forEach((button) => { button.hidden = false; });
        if (commandButtonsContainer.getClientRects().length === 0) {
            return;
        }

        const lineTops = [];
        const pageOf = buttons.map((button) => {
            if (!lineTops.includes(button.offsetTop)) lineTops.push(button.offsetTop);
            return Math.floor(lineTops.indexOf(button.offsetTop) / COMMAND_ROWS_PER_PAGE);
        });
        const pageCount = Math.max(1, Math.ceil(lineTops.length / COMMAND_ROWS_PER_PAGE));
        commandPage = showLastPage ? pageCount - 1 : Math.min(Math.max(commandPage, 0), pageCount - 1);

        buttons.forEach((button, index) => { button.hidden = pageOf[index] !== commandPage; });
        commandPager.hidden = pageCount <= 1;
        commandPageLabel.textContent = `${commandPage + 1} of ${pageCount}`;
        commandPrevButton.disabled = commandPage === 0;
        commandNextButton.disabled = commandPage >= pageCount - 1;
    };

    commandPrevButton.addEventListener("click", () => {
        closeCommandActions();
        commandPage -= 1;
        paginateCommandTiles();
    });

    commandNextButton.addEventListener("click", () => {
        closeCommandActions();
        commandPage += 1;
        paginateCommandTiles();
    });

    // lines change with the card's width, and a closed card can't be measured until it opens
    if (window.ResizeObserver) {
        let observedWidth = null;
        new ResizeObserver(([entry]) => {
            if (entry.contentRect.width === observedWidth) return;
            observedWidth = entry.contentRect.width;
            paginateCommandTiles();
        }).observe(commandButtonsContainer.parentElement);
    }
    commandButtonsContainer.closest("details").addEventListener("toggle", () => paginateCommandTiles());

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

    // a tile (and Remove option) for every built-in and added command this account hasn't removed
    const renderAllCommandTiles = () => {
        const hiddenCommands = getHiddenCommands();
        [...BUILT_IN_COMMANDS, ...getCustomCommands()]
            .filter((name) => !hiddenCommands.includes(name.toLowerCase()))
            .forEach(renderCommandButton);
        paginateCommandTiles();
    };

    renderAllCommandTiles();
    // Newsreader can load after this and change the tiles' widths
    if (document.fonts) document.fonts.ready.then(() => paginateCommandTiles());

    const addCommandPageButton = document.getElementById("add-command");
    const newCommandPageInput = document.getElementById("new-command");

    const openSuggestionsButton = document.getElementById("open-command-suggestions");
    const suggestionsOverlay = document.getElementById("command-suggestions-overlay");
    const suggestionsStatus = document.getElementById("command-suggestions-status");
    const commandSuggestionChips = document.getElementById("command-suggestion-chips");
    const commandSearch = document.getElementById("command-search");
    const commandSearchMenu = document.getElementById("command-search-menu");
    const commandSearchClear = document.getElementById("new-command-clear");
    const MAX_SEARCH_OPTIONS = 8;
    let searchOptionIndex = -1;
    const commandSuggestionsCount = document.getElementById("command-suggestions-count");

    // common commands (built-in ones that were hidden, then SUGGESTED_COMMANDS) that don't have a tile yet
    const getCommandSuggestions = () => {
        const names = [];
        [...BUILT_IN_COMMANDS, ...SUGGESTED_COMMANDS].forEach((name) => {
            if (!hasCommandButton(name) && !names.some((existing) => existing.toLowerCase() === name.toLowerCase())) {
                names.push(name);
            }
        });
        return names;
    };

    // refresh the suggestion chips and the input's autocomplete list
    const renderCommandSuggestions = () => {
        const suggestions = getCommandSuggestions();
        commandSuggestionChips.replaceChildren(...suggestions.map((name) => {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.value = name;
            chip.setAttribute("aria-label", `Add ${name}`);
            const plus = document.createElement("span");
            plus.className = "command-suggestion-plus";
            plus.setAttribute("aria-hidden", "true");
            plus.textContent = "+";
            chip.append(plus, name);
            return chip;
        }));
        commandSuggestionsCount.textContent = `(${suggestions.length})`;
        openSuggestionsButton.hidden = suggestions.length === 0;
        if (suggestions.length === 0 && !suggestionsOverlay.hidden) {
            suggestionsStatus.textContent = "Every suggestion is on your list.";
        }
    };

    // add a command tile and save it; a previously hidden command is shown again
    const addCommand = (name) => {
        if (!name || hasCommandButton(name)) return;

        renderCommandButton(name);
        // new tiles go at the end, so show the last page
        paginateCommandTiles(true);

        const hidden = getHiddenCommands().filter((hiddenName) => hiddenName !== name.toLowerCase());
        const customNames = getCustomCommands();
        if (!getAllCommandNames().some((existing) => existing.toLowerCase() === name.toLowerCase())) {
            customNames.push(name);
        }
        saveCommandLists(customNames, hidden);

        renderCommandSuggestions();
        window.dispatchEvent(new CustomEvent("commandlistchanged"));
    };

    // suggestions matching what's typed: ones starting with it first, then ones containing it
    const getSearchMatches = (typed) => {
        const query = typed.trim().toLowerCase();
        const suggestions = getCommandSuggestions();
        if (!query) return suggestions.slice(0, MAX_SEARCH_OPTIONS);
        const starts = suggestions.filter((name) => name.toLowerCase().startsWith(query));
        const contains = suggestions.filter((name) => !name.toLowerCase().startsWith(query) && name.toLowerCase().includes(query));
        return [...starts, ...contains].slice(0, MAX_SEARCH_OPTIONS);
    };

    const closeSearchMenu = () => {
        commandSearchMenu.hidden = true;
        commandSearch.classList.remove("is-open");
        newCommandPageInput.setAttribute("aria-expanded", "false");
        newCommandPageInput.removeAttribute("aria-activedescendant");
        searchOptionIndex = -1;
    };

    // fill the dropdown from the input, bolding the part of each suggestion not typed yet
    const openSearchMenu = () => {
        const typed = newCommandPageInput.value;
        commandSearchClear.hidden = typed === "";
        const matches = getSearchMatches(typed);
        if (matches.length === 0) {
            closeSearchMenu();
            return;
        }
        const query = typed.trim().toLowerCase();
        commandSearchMenu.replaceChildren(...matches.map((name, index) => {
            const option = document.createElement("li");
            option.className = "command-search-option";
            option.id = `command-search-option-${index}`;
            option.setAttribute("role", "option");
            option.setAttribute("aria-selected", "false");
            option.dataset.value = name;
            option.insertAdjacentHTML("afterbegin", commandSearch.querySelector(".command-search-icon").outerHTML);
            const label = document.createElement("span");
            if (query && name.toLowerCase().startsWith(query)) {
                const rest = document.createElement("b");
                rest.textContent = name.slice(query.length);
                label.append(name.slice(0, query.length), rest);
            } else {
                label.textContent = name;
            }
            option.appendChild(label);
            return option;
        }));
        searchOptionIndex = -1;
        commandSearchMenu.hidden = false;
        commandSearch.classList.add("is-open");
        newCommandPageInput.setAttribute("aria-expanded", "true");
    };

    // highlight a dropdown row (arrow keys), or none with -1
    const highlightSearchOption = (index) => {
        const options = Array.from(commandSearchMenu.children);
        searchOptionIndex = index;
        options.forEach((option, i) => option.setAttribute("aria-selected", String(i === index)));
        if (index >= 0) {
            newCommandPageInput.setAttribute("aria-activedescendant", options[index].id);
        } else {
            newCommandPageInput.removeAttribute("aria-activedescendant");
        }
    };

    const addFromSearch = (name) => {
        addCommand(name.trim());
        newCommandPageInput.value = "";
        commandSearchClear.hidden = true;
        closeSearchMenu();
    };

    addCommandPageButton.addEventListener("click", () => addFromSearch(newCommandPageInput.value));

    newCommandPageInput.addEventListener("focus", openSearchMenu);
    newCommandPageInput.addEventListener("input", openSearchMenu);
    newCommandPageInput.addEventListener("blur", closeSearchMenu);

    newCommandPageInput.addEventListener("keydown", (event) => {
        const count = commandSearchMenu.hidden ? 0 : commandSearchMenu.children.length;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            if (commandSearchMenu.hidden) openSearchMenu();
            const total = commandSearchMenu.children.length;
            if (total === 0) return;
            event.preventDefault();
            const step = event.key === "ArrowDown" ? 1 : -1;
            // wraps through "nothing highlighted" (-1), like a search box
            highlightSearchOption(((searchOptionIndex + 1 + step + total + 1) % (total + 1)) - 1);
        } else if (event.key === "Enter") {
            event.preventDefault();
            const picked = count && searchOptionIndex >= 0 ? commandSearchMenu.children[searchOptionIndex].dataset.value : newCommandPageInput.value;
            addFromSearch(picked);
        } else if (event.key === "Escape") {
            closeSearchMenu();
        }
    });

    // mousedown (not click) so the input doesn't blur and close the menu first
    commandSearchMenu.addEventListener("mousedown", (event) => {
        const option = event.target.closest(".command-search-option");
        if (!option) return;
        event.preventDefault();
        addFromSearch(option.dataset.value);
    });

    commandSearchClear.addEventListener("click", () => {
        newCommandPageInput.value = "";
        newCommandPageInput.focus();
        openSearchMenu();
    });

    /*suggestions pop-up, opened from the button next to Add Command*/

    const openSuggestions = () => {
        suggestionsStatus.textContent = "";
        suggestionsOverlay.hidden = false;
        commandSuggestionChips.scrollTop = 0;
        const first = commandSuggestionChips.querySelector("button");
        (first || document.getElementById("command-suggestions-close")).focus();
    };

    const closeSuggestions = () => {
        suggestionsOverlay.hidden = true;
        if (!openSuggestionsButton.hidden) openSuggestionsButton.focus();
    };

    openSuggestionsButton.addEventListener("click", openSuggestions);
    document.getElementById("command-suggestions-close").addEventListener("click", closeSuggestions);

    suggestionsOverlay.addEventListener("click", (event) => {
        if (event.target === suggestionsOverlay) closeSuggestions();
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !suggestionsOverlay.hidden) closeSuggestions();
    });

    // the pop-up stays open so several can be added; each one drops off the list
    commandSuggestionChips.addEventListener("click", (event) => {
        const chip = event.target.closest("button");
        if (!chip) return;
        const index = Array.from(commandSuggestionChips.children).indexOf(chip);
        addCommand(chip.value);
        suggestionsStatus.textContent = `Added "${chip.value}".`;
        const next = commandSuggestionChips.children[Math.min(index, commandSuggestionChips.children.length - 1)];
        if (next) next.focus();
    });

    renderCommandSuggestions();

    // after confirming, hide a command: remove its tile and dropdown option and remember it in hiddenCommands
    const hideCommand = (name) => {
        if (!confirm(`Are you sure you want to hide the command "${name}"? It won't be deleted and can be restored later.`)) {
            return;
        }

        if (selectedCommandTile && selectedCommandTile.value.toLowerCase() === name.toLowerCase()) {
            closeCommandActions();
        }

        const button = Array.from(commandButtonsContainer.children).find(
            (button) => button.value.toLowerCase() === name.toLowerCase()
        );
        if (button) {
            button.remove();
            paginateCommandTiles();
        }

        const option = Array.from(hideCommandSelect.options).find(
            (option) => option.value.toLowerCase() === name.toLowerCase()
        );
        if (option) {
            option.remove();
        }

        const hidden = getHiddenCommands();
        if (!hidden.includes(name.toLowerCase())) {
            hidden.push(name.toLowerCase());
            saveHiddenCommands(hidden);
        }

        hideCommandSelect.value = "";
        renderCommandSuggestions();
        window.dispatchEvent(new CustomEvent("commandlistchanged"));
    };

    hideCommandButton.addEventListener("click", () => {
        if (hideCommandSelect.value) hideCommand(hideCommandSelect.value);
    });

    // clicking a tile opens Log / Delete choices for that command; clicking it again closes them
    commandButtonsContainer.addEventListener("click", (event) => {
        const tile = event.target.closest("button");
        if (!tile) return;
        if (tile === selectedCommandTile) {
            closeCommandActions();
            return;
        }
        closeCommandActions();
        selectedCommandTile = tile;
        tile.setAttribute("aria-pressed", "true");
        commandActionsName.textContent = tile.value;
        showNotesPreview();
        commandActions.hidden = false;
    });

    /*notes pop-up for the clicked command*/

    let notesCommand = null;

    const openNotesEditor = () => {
        if (!selectedCommandTile) return;
        notesCommand = selectedCommandTile.value;
        notesTitle.textContent = `${notesCommand} notes`;
        notesText.value = getCommandNote(notesCommand);
        commandActionsStatus.textContent = "";
        notesOverlay.hidden = false;
        notesText.focus();
    };

    // close the pop-up, checking first when there are unsaved edits (unless they were just saved)
    const closeNotesEditor = (saved = false) => {
        if (!saved && notesText.value.trim() !== getCommandNote(notesCommand)
            && !confirm(`Discard your unsaved notes for "${notesCommand}"?`)) {
            return;
        }
        notesOverlay.hidden = true;
        notesCommand = null;
        editNotesButton.focus();
    };

    editNotesButton.addEventListener("click", openNotesEditor);
    commandActionsNotes.addEventListener("click", openNotesEditor);
    document.getElementById("command-notes-cancel").addEventListener("click", () => closeNotesEditor());

    notesOverlay.addEventListener("click", (event) => {
        if (event.target === notesOverlay) closeNotesEditor();
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !notesOverlay.hidden) closeNotesEditor();
    });

    document.getElementById("command-notes-save").addEventListener("click", () => {
        const savedCommand = notesCommand;
        commandActionsStatus.textContent = notesText.value.trim() ? "Notes saved." : "Notes cleared.";
        setCommandNote(savedCommand, notesText.value).then((synced) => {
            if (synced === false && selectedCommandTile && selectedCommandTile.value === savedCommand) {
                commandActionsStatus.textContent = "Notes saved on this device only. Couldn't sync to your account.";
            }
        });
        closeNotesEditor(true);
        showNotesPreview();
    });

    // the account's notes arrived; refresh the open panel
    window.addEventListener("commandnotessynced", (event) => {
        if (event.detail.changed) showNotesPreview();
    });

    // the Log page picks the command from the link
    document.getElementById("command-log").addEventListener("click", () => {
        if (!selectedCommandTile) return;
        window.location.href = `log.html?command=${encodeURIComponent(selectedCommandTile.value)}`;
    });

    document.getElementById("command-delete").addEventListener("click", () => {
        if (selectedCommandTile) hideCommand(selectedCommandTile.value);
    });

    /*rename pop-up for the clicked command*/

    const renameOverlay = document.getElementById("command-rename-overlay");
    const renameForm = document.getElementById("command-rename-form");
    const renameInput = document.getElementById("command-rename-input");
    const renameError = document.getElementById("command-rename-error");
    const renameButton = document.getElementById("command-rename");
    let renamingCommand = null;

    const openRenameEditor = () => {
        if (!selectedCommandTile) return;
        renamingCommand = selectedCommandTile.value;
        document.getElementById("command-rename-title").textContent = `Rename "${renamingCommand}"`;
        renameInput.value = renamingCommand;
        renameError.textContent = "";
        commandActionsStatus.textContent = "";
        renameOverlay.hidden = false;
        renameInput.focus();
        renameInput.select();
    };

    const closeRenameEditor = () => {
        renameOverlay.hidden = true;
        renamingCommand = null;
        if (!commandActions.hidden) renameButton.focus();
    };

    // give a command a new name everywhere it's stored: its tile, the command lists, logged sessions, notes and display settings.
    // a built-in command can't change its built-in name, so it's hidden and the new name is saved as a custom command
    const renameCommand = async (oldName, newName) => {
        const oldKey = oldName.toLowerCase();
        const newKey = newName.toLowerCase();
        const sameWord = oldKey === newKey;

        const customNames = getCustomCommands();
        const hidden = getHiddenCommands().filter((name) => name !== newKey);
        const customIndex = customNames.findIndex((name) => name.toLowerCase() === oldKey);
        const isBuiltIn = BUILT_IN_COMMANDS.some((name) => name.toLowerCase() === oldKey);
        const newIsKnown = getAllCommandNames().some((name) => name.toLowerCase() === newKey);

        if (customIndex !== -1 && (!newIsKnown || sameWord)) {
            customNames[customIndex] = newName;
        } else {
            if (customIndex !== -1) customNames.splice(customIndex, 1);
            if (!newIsKnown) customNames.push(newName);
        }
        if (isBuiltIn && !sameWord && !hidden.includes(oldKey)) hidden.push(oldKey);
        saveCommandLists(customNames, hidden);

        // tile and Remove dropdown keep their place, under the new name
        const tile = Array.from(commandButtonsContainer.children).find((button) => button.value.toLowerCase() === oldKey);
        if (tile) {
            tile.value = newName;
            tile.textContent = newName;
        }
        const option = Array.from(hideCommandSelect.options).find((item) => item.value.toLowerCase() === oldKey);
        if (option) {
            option.value = newName;
            option.textContent = newName;
        }
        paginateCommandTiles();
        renderCommandSuggestions();

        renameCommandNote(oldName, newName);
        renameCommandDisplay(oldName, newName);
        window.dispatchEvent(new CustomEvent("commandlistchanged"));

        // move logged sessions (every dog) to the new name; mastery is worked out from them
        const history = getSessionHistory();
        const moved = history.filter((session) => String(session.command || "").toLowerCase() === oldKey);
        if (moved.length === 0) return { moved: 0, synced: null };
        moved.forEach((session) => { session.command = newName; });
        const synced = await setSessionHistory(history);
        window.dispatchEvent(new CustomEvent("commandrenamed", { detail: { from: oldName, to: newName } }));
        return { moved: moved.length, synced };
    };

    renameButton.addEventListener("click", openRenameEditor);
    document.getElementById("command-rename-cancel").addEventListener("click", closeRenameEditor);

    renameOverlay.addEventListener("click", (event) => {
        if (event.target === renameOverlay) closeRenameEditor();
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !renameOverlay.hidden) closeRenameEditor();
    });

    renameForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const oldName = renamingCommand;
        const newName = renameInput.value.trim().replace(/\s+/g, " ");
        if (!oldName) return;
        if (!newName) {
            renameError.textContent = "Enter a name.";
            return;
        }
        if (newName === oldName) {
            closeRenameEditor();
            return;
        }
        if (newName.toLowerCase() !== oldName.toLowerCase() && hasCommandButton(newName)) {
            renameError.textContent = `"${newName}" is already on your list.`;
            return;
        }

        closeRenameEditor();
        commandActionsName.textContent = newName;
        commandActionsStatus.textContent = "Renaming...";
        const { moved, synced } = await renameCommand(oldName, newName);
        const plural = moved === 1 ? "session" : "sessions";
        let message = `Renamed "${oldName}" to "${newName}".`;
        if (moved > 0) {
            message += synced === false
                ? ` Moved ${moved} logged ${plural} on this device; couldn't reach your account yet, it will retry next time.`
                : ` Moved ${moved} logged ${plural}.`;
        }
        if (selectedCommandTile && selectedCommandTile.value === newName) {
            commandActionsStatus.textContent = message;
            showNotesPreview();
        }
    });

    document.getElementById("command-actions-close").addEventListener("click", closeCommandActions);

    // the account's command list arrived (or another account's was cleared): rebuild the tiles from it
    window.addEventListener("commandlistsynced", (event) => {
        if (!event.detail.changed) return;
        closeCommandActions();
        commandButtonsContainer.replaceChildren();
        Array.from(hideCommandSelect.options).filter((option) => option.value).forEach((option) => option.remove());
        renderAllCommandTiles();
        renderCommandSuggestions();
        window.dispatchEvent(new CustomEvent("commandlistchanged"));
    });
}

/*clear one command's logged sessions, for every dog (commands.html)*/

const clearHistorySelect = document.getElementById("clear-history-command");

if (clearHistorySelect) {
    const clearHistoryButton = document.getElementById("clear-history-button");
    const clearHistoryStatus = document.getElementById("clear-history-status");

    const sameCommand = (a, b) => String(a || "").toLowerCase() === String(b || "").toLowerCase();

    // list each command that has logged sessions, with its count, keeping the current choice when it's still there
    const fillClearHistoryCommands = () => {
        const counts = new Map();
        getSessionHistory().forEach((session) => {
            if (!session.command) return;
            const key = session.command.toLowerCase();
            const entry = counts.get(key) || { name: session.command, count: 0 };
            entry.count += 1;
            counts.set(key, entry);
        });

        const previous = clearHistorySelect.value;
        const entries = [...counts.values()].sort((a, b) => a.name.localeCompare(b.name));
        clearHistorySelect.replaceChildren(...entries.map(({ name, count }) => {
            const option = document.createElement("option");
            option.value = name;
            option.textContent = `${name} (${count} ${count === 1 ? "session" : "sessions"})`;
            return option;
        }));
        if (entries.length === 0) {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = "No logged sessions";
            clearHistorySelect.appendChild(option);
        }
        const keep = entries.find(({ name }) => sameCommand(name, previous));
        if (keep) clearHistorySelect.value = keep.name;
        clearHistorySelect.disabled = entries.length === 0;
        clearHistoryButton.disabled = entries.length === 0;
    };

    clearHistoryButton.addEventListener("click", async () => {
        const name = clearHistorySelect.value;
        if (!name) return;
        const history = getSessionHistory();
        const kept = history.filter((session) => !sameCommand(session.command, name));
        const removed = history.length - kept.length;
        const plural = removed === 1 ? "session" : "sessions";
        if (!confirm(`Delete all ${removed} logged ${plural} of "${name}" for every dog? This can't be undone. The command itself stays.`)) {
            return;
        }

        clearHistoryStatus.textContent = `Clearing ${removed} ${plural}...`;
        const synced = await setSessionHistory(kept);
        clearHistoryStatus.textContent = synced === false
            ? `Cleared ${removed} ${plural} of "${name}" on this device. Couldn't reach your account yet; it will retry next time.`
            : `Cleared ${removed} ${plural} of "${name}".`;
        fillClearHistoryCommands();
        window.dispatchEvent(new CustomEvent("commandhistorycleared", { detail: { command: name } }));
    });

    window.addEventListener("sessionhistorysynced", (event) => {
        if (event.detail.changed) fillClearHistoryCommands();
    });
    window.addEventListener("commandrenamed", fillClearHistoryCommands);
    fillClearHistoryCommands();
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
    const masteryPager = document.getElementById("mastery-pager");
    const masteryPrevButton = document.getElementById("mastery-prev");
    const masteryNextButton = document.getElementById("mastery-next");
    const masteryPageLabel = document.getElementById("mastery-page-label");
    const MASTERY_PAGE_SIZE = 5;

    let masteryTiers = [];
    let masteryRows = [];
    let masteryPage = 0;

    // "today" / "yesterday" / "N days ago"
    const formatDaysAgo = (days) => {
        if (days === 0) return "today";
        if (days === 1) return "yesterday";
        return `${days} days ago`;
    };

    // visible commands (built-in + custom, minus hidden) plus anything practiced, de-duplicated
    const getMasteryCommandNames = () => {
        const hidden = getHiddenCommands();
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

    // every command with its mastery row, least worked on first: lowest shown level, then fewest sessions, then name.
    // decay shows when the account toggle is on and the command's Display Settings haven't turned it off
    const getSortedMasteryEntries = (decayEnabled) => {
        const rowsByCommand = new Map(masteryRows.map((row) => [row.command.toLowerCase(), row]));
        const entries = getMasteryCommandNames().map((name) => {
            const row = rowsByCommand.get(name.toLowerCase());
            const showDecay = decayEnabled && getCommandDisplay(name).masteryDecay;
            const level = row ? (showDecay ? row.decayed_level : row.base_level) : 0;
            return { name, row, showDecay, level, sessions: row ? row.session_count : 0 };
        });
        return entries.sort((a, b) => a.level - b.level || a.sessions - b.sessions || a.name.localeCompare(b.name));
    };

    // redraw the current page of the list using the toggle's current setting
    const renderMasteryList = () => {
        const entries = getSortedMasteryEntries(masteryDecayToggle.checked);
        const pageCount = Math.max(1, Math.ceil(entries.length / MASTERY_PAGE_SIZE));
        masteryPage = Math.min(Math.max(masteryPage, 0), pageCount - 1);

        const start = masteryPage * MASTERY_PAGE_SIZE;
        masteryList.replaceChildren(
            ...entries.slice(start, start + MASTERY_PAGE_SIZE).map(({ name, row, showDecay }) => renderMasteryRow(name, row, showDecay))
        );

        masteryPager.hidden = pageCount <= 1;
        masteryPageLabel.textContent = `${masteryPage + 1} of ${pageCount}`;
        masteryPrevButton.disabled = masteryPage === 0;
        masteryNextButton.disabled = masteryPage >= pageCount - 1;
    };

    masteryPrevButton.addEventListener("click", () => {
        masteryPage -= 1;
        renderMasteryList();
    });

    masteryNextButton.addEventListener("click", () => {
        masteryPage += 1;
        renderMasteryList();
    });

    // show a message instead of the list
    const showMasteryStatus = (message) => {
        masteryStatus.replaceChildren(message);
        masteryList.replaceChildren();
        masteryPager.hidden = true;
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

    // the toggle only changes what's displayed, so redraw right away (from page 1, since the order can change)
    // and save in the background
    masteryDecayToggle.addEventListener("change", async () => {
        masteryPage = 0;
        renderMasteryList();
        try {
            await setMasteryDecayEnabled(masteryDecayToggle.checked);
        } catch (error) {
            console.error("Could not save mastery decay setting:", error);
            masteryStatus.textContent = "Couldn't save that setting. It will reset next time you open this page.";
        }
    });

    loadMastery();

    // a command's mastery decay can be turned off in Display Settings, so redraw when those change
    const redrawMasteryForDisplay = () => {
        if (masteryTiers.length > 0) renderMasteryList();
    };
    window.addEventListener("commanddisplaysaved", redrawMasteryForDisplay);
    window.addEventListener("commandlistchanged", redrawMasteryForDisplay);
    window.addEventListener("commanddisplaysynced", (event) => {
        if (event.detail.changed) redrawMasteryForDisplay();
    });

    // mastery is worked out from the account's sessions, so reload once new ones are uploaded
    window.addEventListener("sessionhistorysynced", (event) => {
        if (event.detail.uploaded > 0) loadMastery();
    });
    window.addEventListener("commandhistorycleared", loadMastery);
    window.addEventListener("commandrenamed", loadMastery);
}

/*per-command display settings: which fields show for a command on the Log and Today pages (commands.html)*/

const displayCommandSelect = document.getElementById("display-command");

if (displayCommandSelect) {
    const displayStatus = document.getElementById("display-status");
    const saveDisplayButton = document.getElementById("save-settings");
    const displayToggles = {
        score: document.getElementById("score"),
        masteryDecay: document.getElementById("toggle-mastery-decay"),
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
        const hidden = getHiddenCommands();
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
