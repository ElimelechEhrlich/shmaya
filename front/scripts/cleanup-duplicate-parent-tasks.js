import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

function parseEnv(envText) {
  return envText
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.trim())
    .filter((line) => !line.startsWith('#'))
    .reduce((acc, line) => {
      const [key, ...rest] = line.split('=');
      acc[key] = rest.join('=').trim();
      return acc;
    }, {});
}

const envPath = path.resolve(process.cwd(), '.env');
if (!fs.existsSync(envPath)) {
  console.error('Missing .env file in front/ directory.');
  process.exit(1);
}

const env = parseEnv(fs.readFileSync(envPath, 'utf8'));
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing from .env.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const apply = process.argv.includes('--apply');

async function main() {
  const { data: tasks, error } = await supabase
    .from('parent_tasks')
    .select('id, customer_id, title, status, created_at, sub_tasks(id, is_completed)')
    .order('customer_id', { ascending: true })
    .order('title', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to fetch parent_tasks:', error.message || error);
    process.exit(1);
  }

  const groups = new Map();
  for (const row of tasks ?? []) {
    const key = `${row.customer_id || 'NULL'}|||${row.title.trim()}`;
    const entries = groups.get(key) || [];
    entries.push(row);
    groups.set(key, entries);
  }

  const duplicateGroups = [...groups.entries()].filter(([, rows]) => rows.length > 1);

  if (duplicateGroups.length === 0) {
    console.log('No duplicate parent tasks found.');
    return;
  }

  const plan = duplicateGroups.map(([key, rows]) => {
    const [customerId, title] = key.split('|||');
    const prepared = rows.map((row) => {
      const completedCount = (row.sub_tasks ?? []).filter((sub) => sub.is_completed).length;
      return {
        id: row.id,
        customerId: row.customer_id,
        title: row.title,
        status: row.status,
        createdAt: row.created_at,
        subtaskCount: (row.sub_tasks ?? []).length,
        completedSubtaskCount: completedCount,
      };
    });

    prepared.sort((a, b) => {
      if (b.completedSubtaskCount !== a.completedSubtaskCount) {
        return b.completedSubtaskCount - a.completedSubtaskCount;
      }
      return new Date(a.createdAt || '').getTime() - new Date(b.createdAt || '').getTime();
    });

    const keeper = prepared[0];
    const duplicates = prepared.slice(1);
    return { customerId, title, keeper, duplicates };
  });

  console.log(`Found ${plan.length} duplicate parent-task group(s):\n`);
  for (const item of plan) {
    console.log(`Customer ${item.customerId} - title: "${item.title}"`);
    console.log(`  keeper: ${item.keeper.id} (completed subtasks: ${item.keeper.completedSubtaskCount}, total subtasks: ${item.keeper.subtaskCount}, created_at: ${item.keeper.createdAt})`);
    for (const dup of item.duplicates) {
      console.log(`  duplicate: ${dup.id} (completed subtasks: ${dup.completedSubtaskCount}, total subtasks: ${dup.subtaskCount}, created_at: ${dup.createdAt})`);
    }
    console.log('');
  }

  const allDuplicateIds = plan.flatMap((item) => item.duplicates.map((dup) => dup.id));
  if (!apply) {
    console.log('Dry run only. To delete these duplicates, re-run with --apply.');
    return;
  }

  if (allDuplicateIds.length === 0) {
    console.log('Nothing to delete.');
    return;
  }

  console.log(`Deleting ${allDuplicateIds.length} duplicate parent_tasks and their subtasks...`);
  const { error: deleteSubError } = await supabase
    .from('sub_tasks')
    .delete()
    .in('parent_task_id', allDuplicateIds);

  if (deleteSubError) {
    console.error('Failed to delete duplicate subtasks:', deleteSubError.message || deleteSubError);
    process.exit(1);
  }

  const { error: deleteParentError } = await supabase
    .from('parent_tasks')
    .delete()
    .in('id', allDuplicateIds);

  if (deleteParentError) {
    console.error('Failed to delete duplicate parent_tasks:', deleteParentError.message || deleteParentError);
    process.exit(1);
  }

  console.log('Duplicate parent tasks deleted successfully.');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
