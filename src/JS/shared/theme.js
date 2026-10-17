/* Light / dark theme. Loaded in every page's <head> without defer, before the stylesheets apply, so the right theme
   shows from the first paint. The choice ("light", "dark", or none = follow the device) is kept in localStorage
   "theme"; base.css has the dark color tokens. Adds a sun/moon button to the top bar, and fires "themechange" on
   window so pages can redraw things drawn in JS (the View Logs charts). */

const THEME_STORAGE_KEY = "theme";

// the saved choice: "light", "dark", or "" to follow the device
function getThemeChoice() {
    try {
        const choice = localStorage.getItem(THEME_STORAGE_KEY);
        return choice === "light" || choice === "dark" ? choice : "";
    } catch (error) {
        return "";
    }
}

// the theme actually showing right now
function getActiveTheme() {
    const choice = getThemeChoice();
    if (choice) return choice;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// apply a choice ("light", "dark" or "" for the device's), remember it, and tell the page
function setThemeChoice(choice) {
    try {
        if (choice) localStorage.setItem(THEME_STORAGE_KEY, choice);
        else localStorage.removeItem(THEME_STORAGE_KEY);
    } catch (error) {
        // storage blocked; the theme still changes for this page
    }
    applyTheme();
}

// put the choice on <html> (base.css reads data-theme) and refresh the top bar button
function applyTheme() {
    const choice = getThemeChoice();
    if (choice) document.documentElement.dataset.theme = choice;
    else delete document.documentElement.dataset.theme;
    updateThemeButton();
    window.dispatchEvent(new window.CustomEvent("themechange", { detail: { theme: getActiveTheme() } }));
}

const SUN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>';

// the sun/moon button shows what a click switches to
function updateThemeButton() {
    const button = document.getElementById("theme-toggle");
    if (!button) return;
    const dark = getActiveTheme() === "dark";
    button.innerHTML = dark ? SUN_ICON : MOON_ICON;
    button.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    button.title = dark ? "Light mode" : "Dark mode";
}

// add the button to the top bar, just before the account links
function addThemeButton() {
    const nav = document.querySelector(".top-nav");
    if (!nav || document.getElementById("theme-toggle")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.id = "theme-toggle";
    button.className = "theme-toggle";
    button.addEventListener("click", () => setThemeChoice(getActiveTheme() === "dark" ? "light" : "dark"));
    const links = nav.querySelector(".top-nav-links");
    if (links) nav.insertBefore(button, links);
    else nav.appendChild(button);
    updateThemeButton();
}

applyTheme();
document.addEventListener("DOMContentLoaded", addThemeButton);
// following the device: switch when the device does
if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        if (!getThemeChoice()) applyTheme();
    });
}
