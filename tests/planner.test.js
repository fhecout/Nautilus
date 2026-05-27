import test from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import {
  getPlannerDb,
  createProject,
  getProject,
  listProjects,
  updateProject,
  deleteProject,
  createTask,
  getTask,
  listTasks,
  updateTask,
  deleteTask,
  createSubtask,
  updateSubtask,
  deleteSubtask,
  listHistory,
  parseNaturalLanguageDate
} from '../src/core/planner.js';

test('Planner & Task Management System', async (t) => {
  // Use a temporary database for testing
  const testDbPath = path.resolve(process.cwd(), 'data', 'test-planner.sqlite');
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
  process.env.PLANNER_DB_PATH = testDbPath;

  await t.test('Database Initialization', () => {
    const db = getPlannerDb();
    assert.ok(db, 'Db instance should be initialized');
    assert.ok(fs.existsSync(testDbPath), 'Db file should exist on disk');
  });

  let projectId;
  await t.test('Project CRUD Operations', () => {
    const project = createProject('Test Project', 'Testing planner features', 'Planos');
    assert.ok(project.id, 'Project should have a unique ID');
    assert.strictEqual(project.name, 'Test Project');
    assert.strictEqual(project.status, 'Planos');
    projectId = project.id;

    const list = listProjects();
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].name, 'Test Project');

    const updated = updateProject(projectId, { status: 'Em andamento', description: 'Updated desc' });
    assert.strictEqual(updated.status, 'Em andamento');
    assert.strictEqual(updated.description, 'Updated desc');

    const fetched = getProject(projectId);
    assert.strictEqual(fetched.name, 'Test Project');
    assert.strictEqual(fetched.status, 'Em andamento');
  });

  let taskId;
  await t.test('Task CRUD and Project Linkage', () => {
    const task = createTask({
      title: 'Test Task',
      description: 'Task content',
      projectId,
      scheduledDate: '2026-06-01',
      priority: 'alta',
      status: 'Planos'
    });

    assert.ok(task.id);
    assert.strictEqual(task.title, 'Test Task');
    assert.strictEqual(task.project_id, projectId);
    assert.strictEqual(task.priority, 'alta');
    taskId = task.id;

    const tasks = listTasks({ projectId });
    assert.strictEqual(tasks.length, 1);
    assert.strictEqual(tasks[0].title, 'Test Task');

    const updatedTask = updateTask(taskId, { status: 'Em andamento' });
    assert.strictEqual(updatedTask.status, 'Em andamento');

    const history = listHistory('task', taskId);
    assert.ok(history.length > 0, 'History should log changes');
  });

  let subtaskId;
  await t.test('Subtasks CRUD', () => {
    const subtask = createSubtask(taskId, 'Subtask 1', 'pendente');
    assert.ok(subtask.id);
    assert.strictEqual(subtask.title, 'Subtask 1');
    subtaskId = subtask.id;

    const taskWithSubs = getTask(taskId);
    assert.strictEqual(taskWithSubs.subtasks.length, 1);

    const updatedSub = updateSubtask(subtaskId, 'concluido');
    assert.strictEqual(updatedSub.status, 'concluido');

    deleteSubtask(subtaskId);
    const taskAfterDel = getTask(taskId);
    assert.strictEqual(taskAfterDel.subtasks.length, 0);
  });

  await t.test('Natural Language Date Parsing in Portuguese', () => {
    // Base date Wednesday May 27, 2026
    const baseDate = new Date(2026, 4, 27); // Note: months are 0-indexed in JS, so 4 is May
    
    assert.strictEqual(parseNaturalLanguageDate('hoje', baseDate), '2026-05-27');
    assert.strictEqual(parseNaturalLanguageDate('amanhã', baseDate), '2026-05-28');
    assert.strictEqual(parseNaturalLanguageDate('amanha', baseDate), '2026-05-28');
    assert.strictEqual(parseNaturalLanguageDate('depois de amanhã', baseDate), '2026-05-29');
    assert.strictEqual(parseNaturalLanguageDate('ontem', baseDate), '2026-05-26');
    
    // May 27, 2026 is Wednesday.
    // Next Thursday is May 28, 2026 (or next week if using "próxima quinta")
    // Let's test "próxima terça" -> Tuesday, June 2, 2026
    assert.strictEqual(parseNaturalLanguageDate('próxima terça', baseDate), '2026-06-02');
    
    // Explicit date: "25/12/2026"
    assert.strictEqual(parseNaturalLanguageDate('reunião dia 25/12/2026', baseDate), '2026-12-25');
  });

  await t.test('Cleanup', () => {
    deleteTask(taskId);
    deleteProject(projectId);
    
    // Close DB connection if needed (node:sqlite handles closing automatically or we let it delete, but we should make sure we can delete test file)
    // Actually, node:sqlite locks it while open, but we can safely delete it on next run or after process exits.
  });
});
