import test from 'node:test';
import assert from 'node:assert/strict';

import { CustomerService } from '../src/services/CustomerService.ts';
import { PersistenceAdapter } from '../src/services/PersistenceAdapter.ts';
import { TaskGeneratorService } from '../src/services/TaskService.ts';

test('syncTasksWithExisting updates subtasks for an existing parent task', async () => {
  const originalGenerateForCustomer = TaskGeneratorService.generateForCustomer;
  const originalUpdateTaskSubtasks = PersistenceAdapter.updateTaskSubtasks;
  const originalInsertSingleTask = PersistenceAdapter.insertSingleTask;
  const originalDeleteTasksByIds = PersistenceAdapter.deleteTasksByIds;

  const updates: Array<{ taskId: string; subTasks: Array<{ title: string; id?: string }> }> = [];

  TaskGeneratorService.generateForCustomer = (() => [
    {
      id: 'generated-task-1',
      parentTaskId: 'DEDUCTIONS_FILE',
      title: 'דוח ניכויים',
      subTasks: [
        {
          id: 'ins_ded_rep_1',
          title: 'תת-משימה חדשה',
          completed: false,
          details: {},
          comment: '',
          priority: 'medium',
          restrictedTo: null,
          dependsOn: null,
          registryKey: 'ins_ded_rep_1',
        },
      ],
    },
  ]) as typeof TaskGeneratorService.generateForCustomer;

  PersistenceAdapter.updateTaskSubtasks = (async (taskId: string, subTasks: any[]) => {
    updates.push({ taskId, subTasks: subTasks.map((s) => ({ title: s.title, id: s.id })) });
    return { data: null, error: null };
  }) as typeof PersistenceAdapter.updateTaskSubtasks;

  PersistenceAdapter.insertSingleTask = (async () => ({ success: true, error: null })) as typeof PersistenceAdapter.insertSingleTask;
  PersistenceAdapter.deleteTasksByIds = (async () => ({ data: null, error: null })) as typeof PersistenceAdapter.deleteTasksByIds;

  try {
    await CustomerService.syncTasksWithExisting('customer-1', { businessDetails: {} } as any, [
      {
        id: 'existing-parent-1',
        title: 'דוח ניכויים',
        parentTaskId: 'DEDUCTIONS_FILE',
        status: 'pending',
        subTasks: [],
      },
    ] as any);

    assert.equal(updates.length, 1, 'expected one subtask update for the existing parent task');
    assert.equal(updates[0].taskId, 'existing-parent-1');
    assert.ok(updates[0].subTasks.some((sub) => sub.title === 'תת-משימה חדשה'));
  } finally {
    TaskGeneratorService.generateForCustomer = originalGenerateForCustomer;
    PersistenceAdapter.updateTaskSubtasks = originalUpdateTaskSubtasks;
    PersistenceAdapter.insertSingleTask = originalInsertSingleTask;
    PersistenceAdapter.deleteTasksByIds = originalDeleteTasksByIds;
  }
});
