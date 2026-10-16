/* index.html: the home banner's dog medallion. A paw in a ring that fills toward today's goal (the goal picked on
   the Today page), the dog's name, ‹ › to switch dogs, and today's progress; or a log in / add a dog prompt.
   Needs dogs.js, sessions.js and trainingData.js loaded first. */

const homeHeroStatus = document.getElementById("home-hero-status");
const homeDogName = document.getElementById("home-dog-name");
const homeDogPrev = document.getElementById("home-dog-prev");
const homeDogNext = document.getElementById("home-dog-next");
const homeDogToday = document.getElementById("home-dog-today");
const homeRingProgress = document.getElementById("home-ring-progress");
const HOME_RING_CIRCUMFERENCE = 2 * Math.PI * 54;
let homeDogs = [];

// the same goal Today's ring tracks: type from the Daily Goal dropdown, target from its saved value (or the default)
const HOME_GOALS = {
    sessions: { key: "todaySessionGoal", fallback: 3, unit: (n) => (n === 1 ? "session" : "sessions") },
    minutes: { key: "todayMinutesGoal", fallback: 30, unit: () => "min" },
    commands: { key: "todayCommandsGoal", fallback: 3, unit: (n) => (n === 1 ? "command" : "commands") },
};

// fill the ring to a fraction (0 to 1) of today's goal
function setHomeRing(fraction) {
    homeRingProgress.style.strokeDashoffset = String(HOME_RING_CIRCUMFERENCE * (1 - Math.min(Math.max(fraction, 0), 1)));
}

// today's progress for one dog toward the active goal: { value, goal, text }
function getHomeDogProgress(dogId) {
    const goalType = HOME_GOALS[localStorage.getItem("todayGoalType")] ? localStorage.getItem("todayGoalType") : "sessions";
    const { key, fallback, unit } = HOME_GOALS[goalType];
    const saved = Number(localStorage.getItem(key));
    const goal = Number.isFinite(saved) && saved > 0 ? saved : fallback;

    const today = localDateString();
    const sessions = getSessionHistory().filter((session) => session.date === today && session.dogId === dogId);
    let value = sessions.length;
    if (goalType === "commands") value = new Set(sessions.map((session) => session.command)).size;
    if (goalType === "minutes") {
        const seconds = sessions.reduce((sum, session) => sum + (parseStoredDurationSeconds(session.duration) || 0), 0);
        value = Math.round(seconds / 60);
    }
    const done = value >= goal ? " · goal met!" : "";
    return { value, goal, text: `${value} of ${goal} ${unit(goal)} today${done}` };
}

// the dog you're training: name, ring and progress line
function showHomeDog() {
    const dog = homeDogs.find((item) => item.id === getCurrentDogId()) || homeDogs[0];
    homeDogName.textContent = dog.name;
    const { value, goal, text } = getHomeDogProgress(dog.id);
    homeDogToday.textContent = text;
    setHomeRing(value / goal);
}

// move to the previous (-1) or next (+1) dog, wrapping around; it becomes the dog new sessions are logged for.
// the medallion fades out and back in as it changes
function stepHomeDog(direction) {
    const index = homeDogs.findIndex((dog) => dog.id === getCurrentDogId());
    const next = homeDogs[(index + direction + homeDogs.length) % homeDogs.length];
    setCurrentDogId(next.id);
    homeHeroStatus.classList.add("is-switching");
    setTimeout(() => {
        showHomeDog();
        homeHeroStatus.classList.remove("is-switching");
    }, 150);
}

// the medallion without a dog: a placeholder name, an empty ring and a link to what to do next
function showHomeDogPrompt(name, linkText, href, rest) {
    homeDogs = [];
    homeDogPrev.hidden = true;
    homeDogNext.hidden = true;
    homeDogName.textContent = name;
    const link = document.createElement("a");
    link.href = href;
    link.textContent = linkText;
    homeDogToday.replaceChildren(link, rest);
    setHomeRing(0);
}

// fill the medallion: the dog you're training when signed in with dogs (arrows with two or more),
// otherwise a prompt to log in or add a dog, so it's always there
async function showHomeHeroStatus() {
    if (!homeHeroStatus) return;
    if (!supabaseClient || !(await getSignedInUser())) {
        showHomeDogPrompt("Your dog", "Log in", "login.html", " to see who you're training");
        return;
    }
    try {
        homeDogs = await getDogs();
    } catch (error) {
        console.error("Could not load dogs:", error);
        showHomeDogPrompt("Your dog", "Open My Dogs", "dogs.html", " (couldn't load your dogs here)");
        return;
    }
    if (homeDogs.length === 0) {
        showHomeDogPrompt("Add a dog", "Add your first dog", "dogs.html", " to start training");
        return;
    }
    if (!homeDogs.some((dog) => dog.id === getCurrentDogId())) setCurrentDogId(homeDogs[0].id);
    homeDogPrev.hidden = homeDogs.length < 2;
    homeDogNext.hidden = homeDogs.length < 2;
    showHomeDog();
}

homeDogPrev.addEventListener("click", () => stepHomeDog(-1));
homeDogNext.addEventListener("click", () => stepHomeDog(1));

showHomeHeroStatus();
// sessions (or dogs) changed on another device after the page loaded
window.addEventListener("sessionhistorysynced", (event) => {
    if (event.detail.changed) showHomeHeroStatus();
});
// the account's daily goal arrived
window.addEventListener("goalssynced", () => {
    if (homeDogs.length) showHomeDog();
});
