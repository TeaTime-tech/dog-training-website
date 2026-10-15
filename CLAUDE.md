# Dog Training App & Website

A static, multi-page website for tracking dog training: logging sessions, managing commands, viewing history and charts, setting daily goals, and command mastery. Plain HTML/CSS/JS, with no build step or framework. Supabase provides accounts and cloud data.

## Layout

Code is split into **shared** (used by several pages) and **pages** (one file per page, named after the page).

- `index.html` (repo root): redirects to `src/HTML/index.html`, so the GitHub Pages site root works.
- `src/HTML/`: pages. `index.html` is the home page. Others: `today`, `commands`, `log`, `load` (view logs, training/exercise time totals, Plotly charts and a command timeline with practice breaks, filtered by a "Switch dog" picker), `dogs` (My Dogs: add, rename, delete and pick the current dog), `settings`, `upcoming` (planned features), `directory`, `create` (sign up), `login`. Signed-in users opening `create`/`login` are sent to `settings`.
- `src/CSS/shared/`: every page loads `base.css` (color tokens, layout, headings, section cards), `nav.css` (top nav, Directory dropdown), and `forms.css` (buttons, fields, toggle switches), in that order.
- `src/CSS/pages/<page>.css`: styles for one page, loaded after the shared files. `auth.css` is shared by `create` and `login`.
- `src/JS/shared/`:
  - `supabaseClient.js`: the global `supabaseClient` (project URL + anon key), `getSignedInUser()`, `localDateString()`. `supabaseClient` is `null` when keys aren't set or the CDN didn't load, so check it before using Supabase.
  - `accountNav.js`: when signed in, turns the top nav's Create Account / Login links into the user's display name + email (to `settings.html`) and Log Out. Display name is `user_metadata.display_name` (the settings page writes it there and to `account_settings.display_name`), falling back to the sign-up `username`. Load after `supabaseClient.js`.
  - `trainingData.js`: localStorage helpers (`getAllCommandNames`, duration formatting/parsing), plus daily goals synced with Supabase `training_goals` and `account_settings.active_goal_type`. Save with `saveGoal()` / `saveActiveGoalType()` (they update the `today*Goal` cache too). It syncs on page load and fires `goalssynced` (`detail.changed`). Cached goals are tagged with their account and cleared on log out.
  - `dogs.js`: the account's dogs (`getDogs`, `createDog`, `ensureFirstDog`) and the selected dog (`getCurrentDogId`). Loaded on `today`, `load`, `settings`, `log`, `dogs`, `create` and `login`, after `supabaseClient.js` and before `sessions.js`. The `dogs` page adds, renames and deletes dogs and picks the current one (deleting a dog also deletes its sessions); signing in selects one of the account's dogs.
  - `sessions.js`: training session history, synced with Supabase `training_sessions`. Pages read with `getSessionHistory()` and write the whole list with `setSessionHistory()`. It works out adds, edits and deletes and syncs them, so never write `localStorage.sessionHistory` directly. It syncs on every page load and fires a `sessionhistorysynced` event (`detail.changed`, `detail.uploaded`) for pages to redraw. Each session's `id` is its Supabase row id, `dogId` is stamped once when it's first saved (from `getCurrentDogId()` if `dogs.js` is loaded, else null), and `updatedAt` decides which copy wins when two devices edit it. On log out, pending sessions are uploaded and this browser's copy is cleared. Loaded on every page, after `supabaseClient.js`.
  - `commandDisplay.js`: per-command display settings (`getCommandDisplay`, `setCommandDisplay`) cached in localStorage `commandDisplaySettings` and synced with `account_settings.command_display` (fires `commanddisplaysynced`). Set in Commands > Display Settings; the Log form and Today's add/edit forms hide rows marked `data-display-field`, and Today session cards leave those fields out.
  - `mastery.js`: `getCommandMastery()`, tiers, and the `mastery_decay_enabled` setting.
  - `tasklists.js`: CGC task-list seeding and progress in Supabase.
- `src/JS/pages/<page>.js`: the script for one page. `auth.js` serves `create` and `login`.
- Each page's `<head>` lists shared styles/scripts first, then its own. Scripts are classic (not modules) with `defer`, so shared top-level functions are globals and load order matters.
- `supabase/schema.sql` then `supabase/command_mastery.sql`: tables, RLS policies, and the `get_command_mastery()` function. Run in the Supabase SQL editor; both are safe to re-run. `supabase/account_display_name.sql` (run after) backfills `account_settings.display_name` from existing accounts' metadata. `supabase/training_goals.sql` (run after `command_mastery.sql`) adds `training_goals` and `account_settings.active_goal_type`. `supabase/command_display.sql` (also after `command_mastery.sql`) adds `account_settings.command_display`, and `supabase/session_score_weather.sql` adds `training_sessions.score` (1-10) and `weather`.
- `tools/run-in-node.js`: runs a page's scripts under Node + jsdom (used by `.vscode/launch.json`).

Pages reference assets relatively (`../CSS/...`, `../JS/...`). Folder names HTML/CSS/JS are uppercase; keep references matching exactly since web hosts are case-sensitive.

## Data

- Collapsible sections use `<details open><summary class="collapsible-toggle">…</summary>…</details>` (styles in `base.css`).
- Most data is in `localStorage` as JSON (keys like `sessionHistory`, `exerciseHistory`, `customCommands`, `hiddenCommands`, `today*Goal`, `cgcAttempts`).
- Supabase tables: `dogs`, `task_lists`, `task_list_items`, `dog_task_progress`, `training_sessions`, `training_goals`, `account_settings`, `mastery_tiers`. Rows are scoped to `auth.uid()` through RLS.
- Mastery: `base_level` is the best tier ever earned from session history (never drops); `decayed_level` walks down one tier each time idle days exceed that tier's `decay_after_days`. The account's `mastery_decay_enabled` picks which one is displayed. Tune tiers by editing `mastery_tiers` rows, not code.
- Always call the client `supabaseClient` (the CDN library owns the global name `supabase`). Only the anon key belongs in frontend code, never the service_role key.

## Running

- Open `src/HTML/index.html` in a browser (or use a Live Server extension). No build needed. Supabase auth works best served over http (Live Server) rather than `file://`.
- `node tools/run-in-node.js <page>` loads that page's local scripts under jsdom (CDN scripts like Plotly/Supabase are skipped). Run `npm install` first.
- No tests or linter are configured.

## Conventions

- Short lowercase `//` comments above functions describing what they do.
- LF line endings, UTF-8 without BOM.
- Colors and shadows come from the tokens in `base.css` (`--moss`, `--danger`, `--shadow-card`, ...); add a token rather than a new hex value. Stat tiles (`.stat-row`/`.stat-tile`), `.visually-hidden` and `.amp` (wrap "&" in Fraunces headings) are shared in `base.css`.
- Font sizes are in `rem` (1rem = 16px on phones). `base.css` raises the root size to 18px on screens 900px+ wide, so new font sizes should use `rem` too or they won't scale.
- Fonts: Google Fonts (Fraunces + Work Sans). Charts: Plotly from CDN (`load.html`).
