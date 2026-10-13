/* Shared helpers for reading training data out of localStorage. Used by log, load, and today pages. */

// combine built-in and custom command names, de-duplicated
function getAllCommandNames() {
    const builtInCommands = ["sit", "stay", "come"];
    const savedCommands = JSON.parse(localStorage.getItem("customCommands")) || [];
    return [...new Set([...builtInCommands, ...savedCommands])];
}

/*format a stored duration value (e.g. "5", "1", "1:30") as "X sec"/"X min Y sec"*/
function formatDurationDisplay(value) {
    if (value === undefined || value === null || value === "" || value === "N/A") {
        return value ?? "";
    }

    const knownLabels = {
        "1": "1 min",
        "1:30": "1 min 30 sec",
    };
    if (knownLabels[value]) {
        return knownLabels[value];
    }

    if (value.includes(":")) {
        const [minutesPart, secondsPart] = value.split(":");
        const minutesNum = Number(minutesPart);
        const secondsNum = Number(secondsPart);
        if (!Number.isNaN(minutesNum) && !Number.isNaN(secondsNum)) {
            return secondsNum > 0 ? `${minutesNum} min ${secondsNum} sec` : `${minutesNum} min`;
        }
        return value;
    }

    const totalSeconds = Number(value);
    if (!Number.isNaN(totalSeconds)) {
        const minutesNum = Math.floor(totalSeconds / 60);
        const secondsNum = totalSeconds % 60;
        if (minutesNum === 0) {
            return `${secondsNum} sec`;
        }
        return secondsNum > 0 ? `${minutesNum} min ${secondsNum} sec` : `${minutesNum} min`;
    }

    return value;
}

/*parse a stored duration value (e.g. "5", "1", "1:30") into raw seconds, or null if not parseable*/
function parseStoredDurationSeconds(value) {
    if (typeof value !== "string" || value === "" || value === "N/A") {
        return null;
    }
    if (value.includes(":")) {
        const [minutesPart, secondsPart] = value.split(":").map(Number);
        if (Number.isNaN(minutesPart) || Number.isNaN(secondsPart)) {
            return null;
        }
        return minutesPart * 60 + secondsPart;
    }
    const seconds = Number(value);
    return Number.isNaN(seconds) ? null : seconds;
}
