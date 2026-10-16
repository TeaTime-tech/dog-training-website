/* The account's dogs and which one is currently selected. Needs supabaseClient.js loaded first. */

const CURRENT_DOG_KEY = "currentDogId";

// the id of the dog the app is showing, or null if none is picked yet
function getCurrentDogId() {
    try {
        return localStorage.getItem(CURRENT_DOG_KEY) || null;
    } catch (error) {
        return null;
    }
}

// remember which dog is selected on this browser
function setCurrentDogId(dogId) {
    try {
        if (dogId) localStorage.setItem(CURRENT_DOG_KEY, dogId);
        else localStorage.removeItem(CURRENT_DOG_KEY);
    } catch (error) {
        // storage blocked; the selection just won't persist
    }
}

// every dog on the signed-in account, oldest first
async function getDogs() {
    if (!supabaseClient) return [];
    const { data, error } = await supabaseClient.from("dogs").select("*").order("created_at");
    if (error) throw error;
    return data;
}

// add a dog to the account and return it
async function createDog(name) {
    const trimmed = String(name || "").trim();
    if (!trimmed) throw new Error("Please enter your dog's name.");
    const user = await getSignedInUser();
    if (!user) throw new Error("Please log in to add a dog.");
    // send account_id explicitly; the row-level security check needs it to match the signed-in user
    const { data, error } = await supabaseClient.from("dogs").insert({ account_id: user.id, name: trimmed }).select().single();
    if (error) throw error;
    return data;
}

// save a dog's name and profile (breed, birthday "YYYY-MM-DD", notes, and optionally the dog chart object) and return the updated dog
async function updateDog(dogId, { name, breed, birthday, notes, profile }) {
    const trimmed = String(name || "").trim();
    if (!trimmed) throw new Error("Please enter your dog's name.");
    if (birthday && birthday > localDateString()) throw new Error("Birthday can't be in the future.");
    if (!supabaseClient) throw new Error("Can't reach your account right now. Please try again later.");
    const changes = {
        name: trimmed,
        breed: String(breed || "").trim() || null,
        birthday: birthday || null,
        notes: String(notes || "").trim() || null,
    };
    if (profile !== undefined) changes.profile = profile;
    const { data, error } = await supabaseClient.from("dogs").update(changes).eq("id", dogId).select().single();
    // PGRST204: a column is missing, so a setup file hasn't been run yet
    if (error && error.code === "PGRST204") {
        const file = /profile/.test(error.message || "") ? "dog_chart.sql" : "dog_profiles.sql";
        throw new Error(`Dog profiles aren't set up yet. Run supabase/${file} in Supabase.`);
    }
    if (error && error.code === "23514") {
        throw new Error("Some entries are too long to save. Try shortening the longer notes.");
    }
    if (error) throw error;
    return data;
}

// remove a dog from the account; the database also deletes its training sessions (on delete cascade)
async function deleteDog(dogId) {
    if (!supabaseClient) throw new Error("Can't reach your account right now. Please try again later.");
    const { error } = await supabaseClient.from("dogs").delete().eq("id", dogId);
    if (error) throw error;
    if (getCurrentDogId() === dogId) setCurrentDogId(null);
}

// make sure the account has a dog and one is selected; creates firstDogName's dog if there are none
async function ensureFirstDog(firstDogName) {
    const dogs = await getDogs();
    if (dogs.length === 0) {
        if (!firstDogName || !firstDogName.trim()) {
            setCurrentDogId(null);
            return null;
        }
        const dog = await createDog(firstDogName);
        setCurrentDogId(dog.id);
        return dog;
    }
    const current = dogs.find((dog) => dog.id === getCurrentDogId()) || dogs[0];
    setCurrentDogId(current.id);
    return current;
}
