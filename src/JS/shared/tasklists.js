/* Supabase-backed task lists (CGC etc.) and CGC attempts per dog. Needs supabaseClient.js loaded first. */

// the CGC task list every account gets (seeds "task_lists"); the Commands page's checklist shows these 10 steps in this order

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

// CGC attempts (commands.js): each pass/fail try at a step, per dog, in dog_task_attempts (supabase/cgc_attempts.sql)

// the account's CGC task list and its 10 items in step order, creating the list first if the account has none
async function getCgcTaskItems(accountId) {
  await ensureDefaultTaskLists(accountId);
  const { data: lists, error: listError } = await supabaseClient
    .from('task_lists')
    .select('id')
    .eq('name', CGC_TASK_LIST.name)
    .order('created_at')
    .limit(1);
  if (listError) throw listError;
  if (!lists.length) throw new Error("Couldn't find your Canine Good Citizen list.");
  const { data: items, error: itemsError } = await supabaseClient
    .from('task_list_items')
    .select('id, sort_order')
    .eq('task_list_id', lists[0].id)
    .order('sort_order');
  if (itemsError) throw itemsError;
  return items;
}

// every attempt a dog has made at these items, oldest first
async function getTaskAttempts(dogId, itemIds) {
  const { data, error } = await supabaseClient
    .from('dog_task_attempts')
    .select('id, task_list_item_id, attempted_on, result, notes, created_at')
    .eq('dog_id', dogId)
    .in('task_list_item_id', itemIds)
    .order('attempted_on')
    .order('created_at');
  if (error) throw error;
  return data;
}

// save attempts for a dog ([{ itemId, date, result, notes }]); returns the saved rows
async function addTaskAttempts(dogId, attempts) {
  const rows = attempts.map(({ itemId, date, result, notes }) => ({
    dog_id: dogId,
    task_list_item_id: itemId,
    attempted_on: date,
    result,
    notes: notes || null,
  }));
  const { data, error } = await supabaseClient.from('dog_task_attempts').insert(rows).select();
  if (error) throw error;
  return data;
}

async function deleteTaskAttempt(attemptId) {
  const { error } = await supabaseClient.from('dog_task_attempts').delete().eq('id', attemptId);
  if (error) throw error;
}

// keep dog_task_progress in step: an item is complete when its latest attempt passed (on that attempt's date)
async function setTaskProgressFromLatest(dogId, itemId, latestAttempt) {
  const completed = latestAttempt && latestAttempt.result === 'pass';
  const { error } = await supabaseClient
    .from('dog_task_progress')
    .upsert(
      { dog_id: dogId, task_list_item_id: itemId, completed_at: completed ? `${latestAttempt.date}T12:00:00Z` : null },
      { onConflict: 'dog_id,task_list_item_id' }
    );
  if (error) throw error;
}
