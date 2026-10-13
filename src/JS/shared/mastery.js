/* Command mastery data from Supabase (see supabase/command_mastery.sql). Needs supabaseClient.js. */

// mastery rows for every practiced command: base level, decayed level, and the level to display.
// dogId limits it to one dog; leave it out for all sessions on the account
async function getCommandMastery(dogId = null) {
    const { data, error } = await supabaseClient.rpc("get_command_mastery", {
        p_dog_id: dogId,
        p_today: localDateString(),
    });
    if (error) throw error;
    return data;
}

// all mastery levels in order, e.g. [{ level: 0, name: "Not started" }, ...]
async function getMasteryTiers() {
    const { data, error } = await supabaseClient
        .from("mastery_tiers")
        .select("level, name")
        .order("level");
    if (error) throw error;
    return data;
}

// the account's "show mastery decay" setting (on unless the user turned it off)
async function getMasteryDecayEnabled() {
    const { data, error } = await supabaseClient
        .from("account_settings")
        .select("mastery_decay_enabled")
        .maybeSingle();
    if (error) throw error;
    return data ? data.mastery_decay_enabled : true;
}

// save the "show mastery decay" setting for the signed-in account
async function setMasteryDecayEnabled(enabled) {
    const user = await getSignedInUser();
    const { error } = await supabaseClient
        .from("account_settings")
        .upsert({
            account_id: user.id,
            mastery_decay_enabled: enabled,
            updated_at: new Date().toISOString(),
        });
    if (error) throw error;
}
