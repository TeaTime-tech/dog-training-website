/* Supabase-backed task lists (CGC etc.). Needs supabaseClient.js loaded first. */

// Supabase-backed CGC task list definition (separate data model from the
// localStorage-based CGC checklist in app.js; used to seed the "task_lists" table)

const CGC_TASK_LIST = {
  name: 'Canine Good Citizen (CGC)',
  description: "AKC's 10-step test evaluating a well-behaved dog and responsible owner.",
  items: [
    { name: 'Accepting a friendly stranger', directions: 'Dog allows a stranger to approach and speak to the handler without breaking position or showing shyness/resentment.' },
    { name: 'Sitting politely for petting', directions: 'Dog sits at the handler\'s side and allows a stranger to pet it without jumping or shying away.' },
    { name: 'Appearance and grooming', directions: 'Dog allows an evaluator to check ears and front feet, and brush/comb briefly; demonstrates the dog is clean, healthy, and cared for.' },
    { name: 'Out for a walk (loose leash)', directions: 'Dog walks on a loose leash, making turns and stops with the handler without pulling.' },
    { name: 'Walking through a crowd', directions: 'Dog moves through a group of people, staying close to the handler without excessive excitement or pulling.' },
    { name: 'Sit and down on command / staying in place', directions: 'Dog sits and lies down on command, then stays in a sit or down while the handler walks 20 feet away and back.' },
    { name: 'Coming when called', directions: 'Handler walks 10 feet away, turns, and calls the dog, who comes reliably.' },
    { name: 'Reaction to another dog', directions: 'Two handlers with dogs approach, stop, shake hands, and move on — dogs show only casual interest.' },
    { name: 'Reaction to distraction', directions: 'Dog shows curiosity/startle but no panic or aggression at two sudden distractions (e.g. dropped object, jogger passing).' },
    { name: 'Supervised separation', directions: 'Handler leaves the dog with a trusted person for 3 minutes; dog does not have to hold a position but should not bark, whine, pace excessively, or show distress.' },
  ],
};

// create a task list and its items in Supabase for a new account
async function seedTaskList(accountId, taskListDef) {
  const { data: list, error: listError } = await supabaseClient
    .from('task_lists')
    .insert({
      account_id: accountId,
      name: taskListDef.name,
      description: taskListDef.description,
      is_default: true,
      is_active: true,
    })
    .select()
    .single();
  if (listError) throw listError;

  const itemRows = taskListDef.items.map((item, index) => ({
    task_list_id: list.id,
    name: item.name,
    directions: item.directions,
    sort_order: index,
  }));

  const { error: itemsError } = await supabaseClient.from('task_list_items').insert(itemRows);
  if (itemsError) throw itemsError;

  return list;
}


// toggle functions

// mark/unmark a single item complete for a dog
async function toggleTaskItem(dogId, taskListItemId, completed) {
  const { error } = await supabaseClient
    .from('dog_task_progress')
    .upsert({
      dog_id: dogId,
      task_list_item_id: taskListItemId,
      completed_at: completed ? new Date().toISOString() : null,
    });
  if (error) throw error;
}

// hide/restore a whole task list (soft-hide, same pattern as exercises)
async function toggleTaskListActive(taskListId, isActive) {
  const { error } = await supabaseClient
    .from('task_lists')
    .update({ is_active: isActive })
    .eq('id', taskListId);
  if (error) throw error;
}

// fetch progress for dog//

async function getTaskListProgress(dogId, taskListId) {
  const { data: items, error } = await supabaseClient
    .from('task_list_items')
    .select('*, dog_task_progress!left(completed_at, notes)')
    .eq('task_list_id', taskListId)
    .eq('dog_task_progress.dog_id', dogId)
    .order('sort_order');
  if (error) throw error;
  return items;
}


// give a new account the default task lists the first time they sign in
async function ensureDefaultTaskLists(accountId) {
  const { count, error } = await supabaseClient
    .from('task_lists')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId);
  if (error) throw error;
  if (count === 0) {
    await seedTaskList(accountId, CGC_TASK_LIST);
  }
}