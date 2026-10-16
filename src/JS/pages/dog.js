/* dog.html?id=<dog id>: one dog's full chart (basics, health & vet, care & routine, behavior), opened from its card on My Dogs.
   Name, breed, birthday and notes save to their own columns on dogs; everything else saves to dogs.profile (supabase/dog_chart.sql).
   Needs dogs.js loaded first. */

const chartStatus = document.getElementById("dog-chart-status");
const chartForm = document.getElementById("dog-chart-form");
const chartSectionsEl = document.getElementById("dog-chart-sections");
const chartSaveButton = document.getElementById("dog-chart-save");
const chartSaveStatus = document.getElementById("dog-chart-save-status");
const chartNameEl = document.getElementById("dog-chart-name");
const chartMetaEl = document.getElementById("dog-chart-meta");

// every field on the chart, by section. column: saved to its own dogs column instead of profile.
// lists are repeatable rows (vaccinations, medications)
const CHART_SECTIONS = [
    {
        id: "basics",
        title: "Basics",
        fields: [
            { key: "name", label: "Name", column: true, required: true, maxLength: 50 },
            { key: "breed", label: "Breed", column: true, maxLength: 60, placeholder: "e.g. Border Collie or Mixed" },
            { key: "birthday", label: "Birthday", type: "date", column: true, notFuture: true },
            { key: "adoptedOn", label: "Gotcha day", type: "date", notFuture: true, hint: "The day they came home" },
            { key: "sex", label: "Sex", type: "select", options: ["Female", "Male"] },
            { key: "fixed", label: "Spayed / neutered", type: "select", options: ["Yes", "No"] },
            { key: "weight", label: "Weight", type: "weight" },
            { key: "color", label: "Color / markings", maxLength: 100, placeholder: "e.g. black with white chest" },
            { key: "microchip", label: "Microchip number", maxLength: 40 },
            { key: "notes", label: "General notes", type: "textarea", column: true, maxLength: 1000, wide: true },
        ],
    },
    {
        id: "health",
        title: "Health & Vet",
        fields: [
            { key: "vetClinic", label: "Vet clinic", maxLength: 100 },
            { key: "vetPhone", label: "Vet phone", type: "tel", maxLength: 30 },
            { key: "emergencyVet", label: "Emergency vet", maxLength: 150, placeholder: "Name and phone", wide: true },
            { key: "allergies", label: "Allergies", type: "textarea", maxLength: 500 },
            { key: "conditions", label: "Medical conditions", type: "textarea", maxLength: 500 },
        ],
        lists: [
            {
                key: "vaccinations",
                label: "Vaccinations",
                addLabel: "+ Add vaccination",
                columns: [
                    { key: "name", label: "Vaccine", maxLength: 60, placeholder: "e.g. Rabies" },
                    { key: "given", label: "Given", type: "date", notFuture: true },
                    { key: "due", label: "Next due", type: "date" },
                ],
            },
            {
                key: "medications",
                label: "Medications & preventatives",
                addLabel: "+ Add medication",
                columns: [
                    { key: "name", label: "Medication", maxLength: 60, placeholder: "e.g. Heartworm" },
                    { key: "dose", label: "Dose", maxLength: 40 },
                    { key: "schedule", label: "When", maxLength: 60, placeholder: "e.g. monthly, 1st" },
                ],
            },
        ],
    },
    {
        id: "care",
        title: "Care & Routine",
        fields: [
            { key: "food", label: "Food", maxLength: 100, placeholder: "Brand and formula" },
            { key: "foodAmount", label: "Amount per meal", maxLength: 60, placeholder: "e.g. 1½ cups" },
            { key: "feedingTimes", label: "Feeding times", maxLength: 100, placeholder: "e.g. 7am and 6pm" },
            { key: "treats", label: "Favorite treats", maxLength: 150 },
            { key: "exercise", label: "Exercise needs", type: "textarea", maxLength: 500 },
            { key: "grooming", label: "Grooming", type: "textarea", maxLength: 500 },
        ],
    },
    {
        id: "behavior",
        title: "Behavior",
        fields: [
            {
                key: "temperament", label: "Temperament & personality", type: "chips", notesKey: "temperamentNotes",
                options: ["Calm", "Playful", "Energetic", "Affectionate", "Gentle", "Curious", "Confident", "Independent",
                    "Eager to please", "Stubborn", "Shy", "Anxious", "Protective", "Vocal", "Friendly with dogs", "Friendly with people"],
            },
            {
                key: "triggers", label: "Fears & triggers", type: "chips", notesKey: "triggersNotes",
                options: ["Thunder", "Fireworks", "Loud noises", "Vacuum", "Doorbell", "Strangers", "Men", "Children", "Other dogs",
                    "Dogs on leash", "Cars & traffic", "Bikes & skateboards", "Car rides", "Vet visits", "Nail trims", "Baths",
                    "Being left alone", "Hats & uniforms", "Stairs"],
            },
            { key: "reactivity", label: "Reactivity", type: "select", options: ["None", "Mild", "Moderate", "Severe"] },
            { key: "toys", label: "Favorite toys", maxLength: 150 },
            {
                key: "rewards", label: "Best rewards", type: "chips", notesKey: "rewardsNotes",
                options: ["Small treats", "Chicken", "Cheese", "Hot dog", "Peanut butter", "Kibble", "Ball & fetch", "Tug",
                    "Squeaky toy", "Praise", "Petting", "Sniffing time", "Playing with dogs", "Going outside", "Car rides"],
            },
            {
                key: "trainingGoals", label: "Training goals", type: "chips", notesKey: "trainingGoalsNotes",
                options: ["House training", "Crate training", "Loose-leash walking", "Reliable recall", "Sit & stay",
                    "Leave it & drop it", "No jumping on people", "Calm greetings", "Less barking", "Settle on a mat",
                    "Less reactivity", "Alone time without stress", "Handling for vet & grooming", "Tricks",
                    "Canine Good Citizen", "Agility", "Therapy dog"],
            },
        ],
    },
];

let chartDog = null;
let chartDirty = false;

// show a status line above the chart (in red when it's an error); empty hides it
function showChartStatus(content, isError) {
    chartStatus.replaceChildren(...[].concat(content));
    chartStatus.classList.toggle("dog-chart-error", Boolean(isError));
}

// "3 years old", "1 year 4 months old", "5 months old" from a "YYYY-MM-DD" date
function formatAge(birthday) {
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

// whole days from today to a "YYYY-MM-DD" date (negative when it's past)
function daysUntil(dateString) {
    const [year, month, day] = dateString.split("-").map(Number);
    const [ty, tm, td] = localDateString().split("-").map(Number);
    return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(ty, tm - 1, td)) / 86400000);
}

// the page heading and the line under it: name, then breed · age · sex
function renderChartHeader(dog) {
    chartNameEl.textContent = `${dog.name}'s Chart`;
    document.title = `${dog.name} · Dog Chart`;
    const profile = dog.profile || {};
    const bits = [dog.breed, dog.birthday && formatAge(dog.birthday), profile.sex].filter(Boolean);
    chartMetaEl.textContent = bits.length ? bits.join(" · ") : "Fill out what you know; everything is optional except the name.";
}

// one input, select or textarea for a field, filled with its saved value
function makeChartControl(field, value, id) {
    let control;
    if (field.type === "textarea") {
        control = document.createElement("textarea");
        control.rows = 3;
    } else if (field.type === "select") {
        control = document.createElement("select");
        control.append(new Option("Not set", ""), ...field.options.map((option) => new Option(option, option)));
    } else {
        control = document.createElement("input");
        control.type = field.type || "text";
        if (field.type === "date" && field.notFuture) control.max = localDateString();
    }
    control.id = id;
    control.dataset.key = field.key;
    if (field.maxLength) control.maxLength = field.maxLength;
    if (field.placeholder) control.placeholder = field.placeholder;
    if (field.required) control.required = true;
    control.value = value || "";
    return control;
}

// one bubble that toggles on and off; custom ones (added by hand) look the same
function makeChip(value, selected) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "dog-chart-chip";
    chip.dataset.value = value;
    chip.textContent = value;
    chip.setAttribute("aria-pressed", String(selected));
    return chip;
}

// a "pick any" group of bubbles, an "add your own" box, and a notes box for anything else.
// saves as an array of the picked bubbles; older charts that saved plain text show it in the notes box
function makeChipField(field, profile, wrapper) {
    const saved = profile[field.key];
    const picked = Array.isArray(saved) ? saved : [];
    const legacyText = typeof saved === "string" ? saved : "";

    const labelId = `chart-${field.key}-label`;
    const label = document.createElement("p");
    label.className = "dog-chart-chips-label";
    label.id = labelId;
    label.textContent = field.label;

    const chips = document.createElement("div");
    chips.className = "dog-chart-chips";
    chips.dataset.chips = field.key;
    const custom = picked.filter((value) => !field.options.some((option) => option.toLowerCase() === value.toLowerCase()));
    chips.append(
        ...field.options.map((option) => makeChip(option, picked.some((value) => value.toLowerCase() === option.toLowerCase()))),
        ...custom.map((value) => makeChip(value, true)),
    );
    chips.addEventListener("click", (event) => {
        const chip = event.target.closest(".dog-chart-chip");
        if (!chip) return;
        chip.setAttribute("aria-pressed", String(chip.getAttribute("aria-pressed") !== "true"));
        markChartDirty();
    });

    // type your own and press Enter to add it as a picked bubble
    const addInput = document.createElement("input");
    addInput.type = "text";
    addInput.className = "dog-chart-chip-add";
    addInput.dataset.chipAdd = field.key;
    addInput.maxLength = 40;
    addInput.placeholder = "+ Add your own, then press Enter";
    addInput.setAttribute("aria-label", `Add your own to ${field.label.toLowerCase()}`);
    addInput.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        addChipFromInput(field.key);
    });

    const notes = makeChartControl({ key: field.notesKey, type: "textarea", maxLength: 500, placeholder: "Anything else worth noting..." },
        profile[field.notesKey] || legacyText, `chart-${field.notesKey}`);
    notes.rows = 2;
    notes.setAttribute("aria-label", `${field.label} notes`);

    wrapper.setAttribute("role", "group");
    wrapper.setAttribute("aria-labelledby", labelId);
    wrapper.append(label, chips, addInput, notes);
}

// turn the "add your own" text into a picked bubble (or pick the matching one if it's already there)
function addChipFromInput(key) {
    const addInput = chartSectionsEl.querySelector(`[data-chip-add="${key}"]`);
    const chips = chartSectionsEl.querySelector(`[data-chips="${key}"]`);
    const value = addInput.value.trim().replace(/\s+/g, " ");
    if (!value) return;
    const existing = Array.from(chips.children).find((chip) => chip.dataset.value.toLowerCase() === value.toLowerCase());
    if (existing) existing.setAttribute("aria-pressed", "true");
    else chips.append(makeChip(value, true));
    addInput.value = "";
    markChartDirty();
}

// a labelled field: weight gets a number box plus lb/kg, chips get bubbles
function makeChartField(field, dog) {
    const profile = dog.profile || {};
    if (field.type === "chips") {
        const wrapper = document.createElement("div");
        wrapper.className = "field dog-chart-field dog-chart-field--wide dog-chart-chip-field";
        makeChipField(field, profile, wrapper);
        return wrapper;
    }
    const wrapper = document.createElement("div");
    wrapper.className = field.wide || field.type === "textarea" ? "field dog-chart-field dog-chart-field--wide" : "field dog-chart-field";
    const id = `chart-${field.key}`;
    const label = document.createElement("label");
    label.htmlFor = id;
    label.textContent = field.label;
    wrapper.append(label);

    if (field.type === "weight") {
        const row = document.createElement("div");
        row.className = "dog-chart-weight";
        const amount = makeChartControl({ key: "weight", type: "number" }, profile.weight, id);
        amount.min = "0";
        amount.step = "0.1";
        amount.inputMode = "decimal";
        const unit = makeChartControl({ key: "weightUnit", type: "select", options: ["lb", "kg"] }, profile.weightUnit || "lb", `${id}-unit`);
        unit.firstChild.remove(); // no "Not set" for the unit
        unit.setAttribute("aria-label", "Weight unit");
        row.append(amount, unit);
        wrapper.append(row);
    } else {
        wrapper.append(makeChartControl(field, field.column ? dog[field.key] : profile[field.key], id));
    }

    if (field.hint) {
        const hint = document.createElement("p");
        hint.className = "dog-chart-hint";
        hint.textContent = field.hint;
        wrapper.append(hint);
    }
    return wrapper;
}

// one repeatable row of a list (a vaccination or a medication) with a remove button
function makeListRow(list, entry, rowsEl) {
    const row = document.createElement("div");
    row.className = "dog-chart-list-row";
    const rowNumber = rowsEl.children.length + 1;
    list.columns.forEach((column) => {
        const cell = document.createElement("div");
        cell.className = "dog-chart-list-cell";
        const id = `chart-${list.key}-${column.key}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const label = document.createElement("label");
        label.htmlFor = id;
        label.textContent = column.label;
        const control = makeChartControl(column, entry[column.key], id);
        control.setAttribute("aria-label", `${column.label} (${list.label.toLowerCase()} ${rowNumber})`);
        cell.append(label, control);
        row.append(cell);
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "dog-chart-remove";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove this ${list.label.toLowerCase()} entry`);
    remove.addEventListener("click", () => {
        row.remove();
        markChartDirty();
        if (list.key === "vaccinations") renderVaccineAlerts();
    });
    row.append(remove);
    return row;
}

// a list with its saved rows and an "add" button
function makeChartList(list, dog) {
    const wrapper = document.createElement("div");
    wrapper.className = "dog-chart-list";
    wrapper.dataset.list = list.key;
    const heading = document.createElement("h3");
    heading.className = "dog-chart-list-title";
    heading.textContent = list.label;
    const rowsEl = document.createElement("div");
    rowsEl.className = "dog-chart-list-rows";
    const saved = (dog.profile && Array.isArray(dog.profile[list.key])) ? dog.profile[list.key] : [];
    saved.forEach((entry) => rowsEl.append(makeListRow(list, entry, rowsEl)));
    const add = document.createElement("button");
    add.type = "button";
    add.className = "dog-chart-add";
    add.textContent = list.addLabel;
    add.addEventListener("click", () => {
        const row = makeListRow(list, {}, rowsEl);
        rowsEl.append(row);
        row.querySelector("input, select, textarea").focus();
        markChartDirty();
    });
    wrapper.append(heading, rowsEl, add);
    return wrapper;
}

// overdue and due-soon vaccines, shown at the top of Health & Vet
function renderVaccineAlerts() {
    const alertsEl = document.getElementById("dog-chart-vaccine-alerts");
    if (!alertsEl) return;
    const alerts = readList(CHART_SECTIONS[1].lists[0])
        .filter((vaccine) => vaccine.due)
        .map((vaccine) => ({ name: vaccine.name || "A vaccine", days: daysUntil(vaccine.due) }))
        .filter(({ days }) => days <= 30)
        .sort((a, b) => a.days - b.days)
        .map(({ name, days }) => {
            const chip = document.createElement("span");
            chip.className = days < 0 ? "dog-chart-alert dog-chart-alert--overdue" : "dog-chart-alert";
            if (days < 0) chip.textContent = `${name} overdue by ${-days} day${days === -1 ? "" : "s"}`;
            else if (days === 0) chip.textContent = `${name} due today`;
            else chip.textContent = `${name} due in ${days} day${days === 1 ? "" : "s"}`;
            return chip;
        });
    alertsEl.replaceChildren(...alerts);
    alertsEl.hidden = alerts.length === 0;
}

// build every section of the chart for a dog
function renderChart(dog) {
    chartSectionsEl.replaceChildren(...CHART_SECTIONS.map((section) => {
        const card = document.createElement("section");
        card.className = "page-section dog-chart-section";
        const details = document.createElement("details");
        details.open = true;
        const summary = document.createElement("summary");
        summary.className = "collapsible-toggle";
        const title = document.createElement("h2");
        title.className = "section-title";
        title.textContent = section.title;
        summary.append(title);
        details.append(summary);

        if (section.id === "health") {
            const alerts = document.createElement("div");
            alerts.id = "dog-chart-vaccine-alerts";
            alerts.className = "dog-chart-alerts";
            alerts.hidden = true;
            details.append(alerts);
        }

        const grid = document.createElement("div");
        grid.className = "dog-chart-grid";
        grid.append(...section.fields.map((field) => makeChartField(field, dog)));
        details.append(grid);
        (section.lists || []).forEach((list) => details.append(makeChartList(list, dog)));

        card.append(details);
        return card;
    }));
    renderVaccineAlerts();
}

// the rows of a list as plain objects, skipping rows left completely blank
function readList(list) {
    const listEl = chartSectionsEl.querySelector(`[data-list="${list.key}"]`);
    if (!listEl) return [];
    return Array.from(listEl.querySelectorAll(".dog-chart-list-row"))
        .map((row) => Object.fromEntries(list.columns.map((column, index) => {
            const control = row.querySelectorAll("input, select, textarea")[index];
            return [column.key, control.value.trim()];
        })))
        .filter((entry) => Object.values(entry).some(Boolean));
}

// everything on the form: the dogs columns plus the profile object (empty values left out)
function readChart() {
    const valueOf = (key) => {
        const control = chartSectionsEl.querySelector(`.dog-chart-grid [data-key="${key}"]`);
        return control ? control.value.trim() : "";
    };
    const values = { name: valueOf("name"), breed: valueOf("breed"), birthday: valueOf("birthday"), notes: valueOf("notes") };
    const profile = {};
    CHART_SECTIONS.forEach((section) => {
        section.fields.filter((field) => !field.column).forEach((field) => {
            if (field.type === "chips") {
                addChipFromInput(field.key); // text typed but not added yet still counts
                const picked = Array.from(chartSectionsEl.querySelectorAll(`[data-chips="${field.key}"] .dog-chart-chip[aria-pressed="true"]`))
                    .map((chip) => chip.dataset.value);
                if (picked.length) profile[field.key] = picked;
                const notes = valueOf(field.notesKey);
                if (notes) profile[field.notesKey] = notes;
                return;
            }
            const value = valueOf(field.key);
            if (value) profile[field.key] = value;
        });
        (section.lists || []).forEach((list) => {
            const entries = readList(list);
            if (entries.length) profile[list.key] = entries;
        });
    });
    if (profile.weight) profile.weightUnit = valueOf("weightUnit") || "lb";
    values.profile = profile;
    return values;
}

// something on the form changed since the last save
function markChartDirty() {
    chartDirty = true;
    chartSaveStatus.textContent = "Unsaved changes";
    chartSaveStatus.classList.remove("dog-chart-error");
}

// check what the browser can't: a name, sensible weight, no future dates where they can't be
function validateChart(values) {
    if (!values.name) return "Please enter your dog's name.";
    if (values.profile.weight && !(Number(values.profile.weight) > 0)) return "Weight should be a number above 0.";
    const today = localDateString();
    if (values.birthday && values.birthday > today) return "Birthday can't be in the future.";
    if (values.profile.adoptedOn && values.profile.adoptedOn > today) return "Gotcha day can't be in the future.";
    if ((values.profile.vaccinations || []).some((vaccine) => vaccine.given && vaccine.given > today)) {
        return "A vaccination's \"Given\" date can't be in the future.";
    }
    return null;
}

chartForm.addEventListener("input", (event) => {
    markChartDirty();
    if (event.target.closest('[data-list="vaccinations"]')) renderVaccineAlerts();
});

chartForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!chartDog) return;
    const values = readChart();
    const problem = validateChart(values);
    if (problem) {
        chartSaveStatus.textContent = problem;
        chartSaveStatus.classList.add("dog-chart-error");
        return;
    }

    chartSaveButton.disabled = true;
    chartSaveStatus.classList.remove("dog-chart-error");
    chartSaveStatus.textContent = "Saving...";
    try {
        chartDog = await updateDog(chartDog.id, values);
        chartDirty = false;
        renderChartHeader(chartDog);
        chartSaveStatus.textContent = "Saved";
    } catch (error) {
        console.error("Could not save the dog chart:", error);
        chartSaveStatus.textContent = error.message || "Couldn't save. Please try again.";
        chartSaveStatus.classList.add("dog-chart-error");
    } finally {
        chartSaveButton.disabled = false;
    }
});

// leaving with unsaved changes asks first
window.addEventListener("beforeunload", (event) => {
    if (!chartDirty) return;
    event.preventDefault();
    event.returnValue = "";
});

// with two or more dogs, a dropdown to open another dog's chart (the page asks first if there are unsaved changes)
function renderDogPicker(dogs) {
    const row = document.getElementById("dog-chart-picker-row");
    const picker = document.getElementById("dog-chart-picker");
    if (dogs.length < 2) return;
    picker.replaceChildren(...dogs.map((dog) => new Option(dog.name, dog.id)));
    picker.value = chartDog.id;
    picker.addEventListener("change", () => {
        window.location.href = `dog.html?id=${encodeURIComponent(picker.value)}`;
        picker.value = chartDog.id; // stays put if leaving is cancelled
    });
    row.hidden = false;
}

// load the dog named in the link (?id=...), or the dog you're training when there isn't one
async function loadDogChart() {
    if (!supabaseClient || !(await getSignedInUser())) {
        const loginLink = document.createElement("a");
        loginLink.href = "login.html";
        loginLink.textContent = "Log in";
        showChartStatus([loginLink, " to see and fill out your dog's chart."]);
        return;
    }
    try {
        const dogs = await getDogs();
        const wanted = new URLSearchParams(window.location.search).get("id") || getCurrentDogId();
        chartDog = dogs.find((dog) => dog.id === wanted) || null;
        if (!chartDog) {
            const dogsLink = document.createElement("a");
            dogsLink.href = "dogs.html";
            dogsLink.textContent = "My Dogs";
            showChartStatus(["That dog isn't on your account. Pick one from ", dogsLink, "."], true);
            return;
        }
        renderDogPicker(dogs);
        renderChartHeader(chartDog);
        renderChart(chartDog);
        showChartStatus([]);
        chartForm.hidden = false;
    } catch (error) {
        console.error("Could not load the dog chart:", error);
        showChartStatus(`Couldn't load this dog: ${error.message}`, true);
    }
}

loadDogChart();
