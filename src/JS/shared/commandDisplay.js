/* Per-command display settings: which fields show for each command on the Log form and Today session cards.
   Saved in this browser's localStorage ("commandDisplaySettings"), keyed by lowercase command name. */

const COMMAND_DISPLAY_STORAGE_KEY = "commandDisplaySettings";

// every field a command can show or hide; score and weather aren't logged yet, so their settings have no effect
const COMMAND_DISPLAY_FIELDS = ["score", "repetitions", "duration", "location", "distractions", "weather"];

// all saved settings, or {} if none are saved or storage is unreadable
function readAllCommandDisplay() {
    try {
        return JSON.parse(localStorage.getItem(COMMAND_DISPLAY_STORAGE_KEY)) || {};
    } catch {
        return {};
    }
}

// which fields show for a command, as { field: true/false }; fields never turned off show
function getCommandDisplay(command) {
    const saved = readAllCommandDisplay()[String(command || "").toLowerCase()] || {};
    return Object.fromEntries(COMMAND_DISPLAY_FIELDS.map((field) => [field, saved[field] !== false]));
}

// save which fields show for a command
function setCommandDisplay(command, display) {
    const all = readAllCommandDisplay();
    all[String(command || "").toLowerCase()] = Object.fromEntries(
        COMMAND_DISPLAY_FIELDS.map((field) => [field, display[field] !== false])
    );
    try {
        localStorage.setItem(COMMAND_DISPLAY_STORAGE_KEY, JSON.stringify(all));
    } catch (error) {
        console.error("Could not save display settings:", error);
    }
}
