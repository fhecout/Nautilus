import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const DEFAULT_PLANNER_DB_PATH = path.resolve(process.cwd(), 'data', 'planner.sqlite');
let dbInstance = null;

export function getPlannerDbPath() {
  return process.env.PLANNER_DB_PATH || DEFAULT_PLANNER_DB_PATH;
}

export function getPlannerDb() {
  if (dbInstance) return dbInstance;
  const dbPath = getPlannerDbPath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  dbInstance = new DatabaseSync(dbPath);

  // Inicializa as tabelas do planejador
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'Planos',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      scheduled_date TEXT,
      due_date TEXT,
      priority TEXT NOT NULL DEFAULT 'media',
      status TEXT NOT NULL DEFAULT 'Planos',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS subtasks (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendente',
      created_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS project_notes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS planner_history (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      change_description TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  return dbInstance;
}

// === HISTORICO ===
export function addHistory(targetType, targetId, changeDescription) {
  const db = getPlannerDb();
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO planner_history (id, target_type, target_id, change_description, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, targetType, targetId, changeDescription, createdAt);
}

export function listHistory(targetType, targetId) {
  const db = getPlannerDb();
  return db.prepare(`
    SELECT * FROM planner_history
    WHERE target_type = ? AND target_id = ?
    ORDER BY created_at DESC
  `).all(targetType, targetId);
}

// === PROJETOS ===
export function createProject(name, description = '', status = 'Planos') {
  const db = getPlannerDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO projects (id, name, description, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, name, description, status, now, now);

  addHistory('project', id, `Projeto "${name}" criado.`);
  return getProject(id);
}

export function getProject(id) {
  const db = getPlannerDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!project) return null;

  const tasks = db.prepare('SELECT * FROM tasks WHERE project_id = ?').all(id);
  const notes = db.prepare('SELECT * FROM project_notes WHERE project_id = ? ORDER BY created_at DESC').all(id);

  return {
    ...project,
    tasks,
    notes
  };
}

export function findProjectByName(name) {
  const db = getPlannerDb();
  const normalized = name.trim().toLowerCase();
  
  // Tenta busca exata
  let project = db.prepare('SELECT * FROM projects WHERE lower(name) = ?').get(normalized);
  if (project) return getProject(project.id);

  // Tenta busca parcial (LIKE)
  project = db.prepare('SELECT * FROM projects WHERE lower(name) LIKE ?').get(`%${normalized}%`);
  if (project) return getProject(project.id);

  return null;
}

export function listProjects() {
  const db = getPlannerDb();
  const rows = db.prepare('SELECT * FROM projects ORDER BY name ASC').all();
  return rows.map(row => {
    const counts = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'Concluído' THEN 1 ELSE 0 END) as done
      FROM tasks 
      WHERE project_id = ?
    `).get(row.id);
    
    return {
      ...row,
      taskCount: counts.total || 0,
      taskDoneCount: counts.done || 0
    };
  });
}

export function updateProject(id, updates = {}) {
  const db = getPlannerDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!project) throw new Error('Projeto nao encontrado.');

  const fields = [];
  const values = [];
  const changes = [];

  if (updates.name !== undefined && updates.name !== project.name) {
    fields.push('name = ?');
    values.push(updates.name);
    changes.push(`Nome alterado de "${project.name}" para "${updates.name}".`);
  }
  if (updates.description !== undefined && updates.description !== project.description) {
    fields.push('description = ?');
    values.push(updates.description);
    changes.push('Descricao atualizada.');
  }
  if (updates.status !== undefined && updates.status !== project.status) {
    fields.push('status = ?');
    values.push(updates.status);
    changes.push(`Status alterado de "${project.status}" para "${updates.status}".`);
  }

  if (fields.length === 0) return getProject(id);

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  db.prepare(`
    UPDATE projects
    SET ${fields.join(', ')}
    WHERE id = ?
  `).run(...values);

  for (const change of changes) {
    addHistory('project', id, change);
  }

  return getProject(id);
}

export function deleteProject(id) {
  const db = getPlannerDb();
  const project = getProject(id);
  if (!project) return null;

  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  // Limpa também as tarefas vinculadas (setando project_id para null ou deletando, o SQLite cuidará de setar NULL pelas FKs configuradas acima se configurado, mas vamos forçar)
  db.prepare('UPDATE tasks SET project_id = NULL WHERE project_id = ?').run(id);
  db.prepare('DELETE FROM project_notes WHERE project_id = ?').run(id);

  return project;
}

// === ANOTAÇÕES DE PROJETO ===
export function addProjectNote(projectId, content) {
  const db = getPlannerDb();
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO project_notes (id, project_id, content, created_at)
    VALUES (?, ?, ?, ?)
  `).run(id, projectId, content, createdAt);

  addHistory('project', projectId, `Anotacao adicionada: "${content.slice(0, 60)}..."`);
  return { id, projectId, content, created_at: createdAt };
}

export function listProjectNotes(projectId) {
  const db = getPlannerDb();
  return db.prepare('SELECT * FROM project_notes WHERE project_id = ? ORDER BY created_at DESC').all(projectId);
}

export function deleteProjectNote(noteId) {
  const db = getPlannerDb();
  const note = db.prepare('SELECT * FROM project_notes WHERE id = ?').get(noteId);
  if (!note) return null;

  db.prepare('DELETE FROM project_notes WHERE id = ?').run(noteId);
  addHistory('project', note.project_id, `Anotacao removida.`);
  return note;
}

// === TAREFAS ===
export function createTask({ title, description = '', projectId = null, scheduledDate = null, dueDate = null, priority = 'media', status = 'Planos' }) {
  const db = getPlannerDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO tasks (id, project_id, title, description, scheduled_date, due_date, priority, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, projectId, title, description, scheduledDate, dueDate, priority, status, now, now);

  addHistory('task', id, `Tarefa "${title}" criada.`);
  if (projectId) {
    addHistory('project', projectId, `Tarefa "${title}" adicionada ao projeto.`);
  }

  return getTask(id);
}

export function getTask(id) {
  const db = getPlannerDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) return null;

  const subtasks = db.prepare('SELECT * FROM subtasks WHERE task_id = ? ORDER BY created_at ASC').all(id);
  let project = null;
  if (task.project_id) {
    project = db.prepare('SELECT id, name, status FROM projects WHERE id = ?').get(task.project_id);
  }

  return {
    ...task,
    subtasks,
    project
  };
}

export function listTasks(filters = {}) {
  const db = getPlannerDb();
  let query = `
    SELECT t.*, p.name as project_name 
    FROM tasks t
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE 1=1
  `;
  const params = [];

  if (filters.projectId) {
    query += ' AND t.project_id = ?';
    params.push(filters.projectId);
  }
  if (filters.status) {
    query += ' AND t.status = ?';
    params.push(filters.status);
  }
  if (filters.priority) {
    query += ' AND t.priority = ?';
    params.push(filters.priority);
  }
  if (filters.scheduledDate) {
    query += ' AND t.scheduled_date = ?';
    params.push(filters.scheduledDate);
  }
  if (filters.dueDate) {
    query += ' AND t.due_date = ?';
    params.push(filters.dueDate);
  }
  if (filters.search) {
    query += ' AND (t.title LIKE ? OR t.description LIKE ?)';
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }

  query += ' ORDER BY t.scheduled_date ASC, t.priority DESC, t.created_at DESC';

  const rows = db.prepare(query).all(...params);
  return rows.map(row => {
    const subtasks = db.prepare('SELECT * FROM subtasks WHERE task_id = ?').all(row.id);
    return {
      ...row,
      subtasks
    };
  });
}

export function updateTask(id, updates = {}) {
  const db = getPlannerDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) throw new Error('Tarefa nao encontrada.');

  const fields = [];
  const values = [];
  const changes = [];

  const checkAndAdd = (fieldName, newValue, oldValue, descChange) => {
    if (newValue !== undefined && newValue !== oldValue) {
      fields.push(`${fieldName} = ?`);
      values.push(newValue);
      changes.push(descChange);
    }
  };

  checkAndAdd('title', updates.title, task.title, `Titulo alterado de "${task.title}" para "${updates.title}".`);
  checkAndAdd('description', updates.description, task.description, 'Descricao atualizada.');
  checkAndAdd('project_id', updates.projectId, task.project_id, `Projeto alterado.`);
  checkAndAdd('scheduled_date', updates.scheduledDate, task.scheduled_date, `Data agendada alterada para ${updates.scheduledDate || 'nenhuma'}.`);
  checkAndAdd('due_date', updates.dueDate, task.due_date, `Prazo alterado para ${updates.dueDate || 'nenhum'}.`);
  checkAndAdd('priority', updates.priority, task.priority, `Prioridade alterada de "${task.priority}" para "${updates.priority}".`);
  checkAndAdd('status', updates.status, task.status, `Status alterado de "${task.status}" para "${updates.status}".`);

  if (fields.length === 0) return getTask(id);

  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  db.prepare(`
    UPDATE tasks
    SET ${fields.join(', ')}
    WHERE id = ?
  `).run(...values);

  for (const change of changes) {
    addHistory('task', id, change);
  }

  // Se mudou de projeto, registra no histórico dos projetos também
  if (updates.projectId !== undefined && updates.projectId !== task.project_id) {
    if (task.project_id) {
      addHistory('project', task.project_id, `Tarefa "${task.title}" removida do projeto.`);
    }
    if (updates.projectId) {
      addHistory('project', updates.projectId, `Tarefa "${task.title}" adicionada ao projeto.`);
    }
  }

  return getTask(id);
}

export function deleteTask(id) {
  const db = getPlannerDb();
  const task = getTask(id);
  if (!task) return null;

  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  db.prepare('DELETE FROM subtasks WHERE task_id = ?').run(id);

  addHistory('task', id, `Tarefa "${task.title}" excluida.`);
  if (task.project_id) {
    addHistory('project', task.project_id, `Tarefa "${task.title}" excluida do projeto.`);
  }

  return task;
}

// === SUBTAREFAS ===
export function createSubtask(taskId, title, status = 'pendente') {
  const db = getPlannerDb();
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO subtasks (id, task_id, title, status, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, taskId, title, status, createdAt);

  addHistory('task', taskId, `Subtarefa "${title}" criada.`);
  return { id, taskId, title, status, created_at: createdAt };
}

export function updateSubtask(subtaskId, status) {
  const db = getPlannerDb();
  const subtask = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(subtaskId);
  if (!subtask) throw new Error('Subtarefa nao encontrada.');

  db.prepare(`
    UPDATE subtasks
    SET status = ?
    WHERE id = ?
  `).run(status, subtaskId);

  addHistory('task', subtask.task_id, `Subtarefa "${subtask.title}" marcada como "${status}".`);
  return db.prepare('SELECT * FROM subtasks WHERE id = ?').get(subtaskId);
}

export function deleteSubtask(subtaskId) {
  const db = getPlannerDb();
  const subtask = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(subtaskId);
  if (!subtask) return null;

  db.prepare('DELETE FROM subtasks WHERE id = ?').run(subtaskId);
  addHistory('task', subtask.task_id, `Subtarefa "${subtask.title}" excluida.`);
  return subtask;
}

// === PARSER DE PORTUGUES NATURAL LANGUAGE DATE ===
export function parseNaturalLanguageDate(text, baseDate = new Date()) {
  if (!text) return null;
  const clean = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  
  const date = new Date(baseDate);
  
  if (clean === 'hoje') {
    return formatDate(date);
  }
  if (clean === 'amanha') {
    date.setDate(date.getDate() + 1);
    return formatDate(date);
  }
  if (clean === 'depois de amanha') {
    date.setDate(date.getDate() + 2);
    return formatDate(date);
  }
  if (clean === 'ontem') {
    date.setDate(date.getDate() - 1);
    return formatDate(date);
  }
  if (clean === 'fim de semana' || clean === 'fds') {
    const day = date.getDay();
    const diff = (6 - day + 7) % 7 || 7;
    date.setDate(date.getDate() + diff);
    return formatDate(date);
  }
  if (clean === 'semana que vem') {
    const day = date.getDay();
    const diff = (1 - day + 7) % 7 || 7;
    date.setDate(date.getDate() + diff);
    return formatDate(date);
  }

  const daysOfWeek = {
    'domingo': 0,
    'segunda': 1,
    'segunda-feira': 1,
    'terca': 2,
    'terca-feira': 2,
    'quarta': 3,
    'quarta-feira': 3,
    'quinta': 4,
    'quinta-feira': 4,
    'sexta': 5,
    'sexta-feira': 5,
    'sabado': 6
  };

  for (const [dayName, dayVal] of Object.entries(daysOfWeek)) {
    if (clean.includes(dayName)) {
      const currentDay = date.getDay();
      let diff = (dayVal - currentDay + 7) % 7;
      
      const isFutureThisWeek = dayVal > currentDay;
      const isToday = dayVal === currentDay;
      const hasProxima = clean.includes('proxima') || clean.includes('proximo');
      
      if (isToday && hasProxima) {
        diff = 7;
      } else if (isFutureThisWeek && hasProxima) {
        diff += 7;
      } else if (isFutureThisWeek && !hasProxima) {
        diff = dayVal - currentDay;
      }
      
      date.setDate(date.getDate() + diff);
      return formatDate(date);
    }
  }

  // Tenta extrair formato DD/MM/YYYY ou DD/MM
  const dmyMatch = clean.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    let year = dmyMatch[3] ? parseInt(dmyMatch[3], 10) : date.getFullYear();
    if (dmyMatch[3] && dmyMatch[3].length === 2) {
      year += 2000;
    }
    const targetDate = new Date(year, month, day);
    if (!isNaN(targetDate.getTime())) {
      return formatDate(targetDate);
    }
  }

  return null;
}

function formatDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function getTodayTasks() {
  const today = formatDate(new Date());
  const db = getPlannerDb();
  return db.prepare(`
    SELECT t.*, p.name as project_name
    FROM tasks t
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE t.status != 'Concluído'
      AND (
        t.scheduled_date = ?
        OR t.due_date = ?
        OR (t.scheduled_date IS NULL AND t.due_date IS NULL)
      )
    ORDER BY
      CASE t.priority WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END,
      t.due_date ASC,
      t.created_at ASC
    LIMIT 50
  `).all(today, today);
}

export function getOverdueTasks() {
  const today = formatDate(new Date());
  const db = getPlannerDb();
  return db.prepare(`
    SELECT t.*, p.name as project_name
    FROM tasks t
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE t.status != 'Concluído'
      AND t.due_date IS NOT NULL
      AND t.due_date < ?
    ORDER BY t.due_date ASC
    LIMIT 50
  `).all(today);
}

export function getCompletedTasksSince(sinceDate) {
  const since = sinceDate instanceof Date ? sinceDate.toISOString() : String(sinceDate);
  const db = getPlannerDb();
  return db.prepare(`
    SELECT t.*, p.name as project_name
    FROM tasks t
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE t.status = 'Concluído'
      AND t.updated_at >= ?
    ORDER BY t.updated_at DESC
    LIMIT 100
  `).all(since);
}

export function getPlannerTaskStats() {
  const db = getPlannerDb();
  const open = db.prepare("SELECT COUNT(*) AS c FROM tasks WHERE status != 'Concluído'").get().c;
  const done = db.prepare("SELECT COUNT(*) AS c FROM tasks WHERE status = 'Concluído'").get().c;
  return {
    open,
    done,
    overdue: getOverdueTasks().length,
    today: getTodayTasks().length
  };
}

export function formatTasksForBriefing(tasks, label = 'Tarefas') {
  if (!tasks.length) return `${label}: nenhuma registrada.`;
  const lines = tasks.map(task => {
    const due = task.due_date ? ` (ate ${task.due_date})` : '';
    const prio = task.priority === 'alta' ? ' [alta]' : '';
    const project = task.project_name ? ` @ ${task.project_name}` : '';
    return `- ${task.title}${prio}${project}${due}`;
  });
  return `${label} (${tasks.length}):\n${lines.join('\n')}`;
}

export function getPlannerContextPrompt() {
  const projects = listProjects();
  const tasks = listTasks().slice(0, 30);
  
  const projectsSummary = projects.map(p => `- ${p.name} (id: ${p.id}, status: ${p.status})`).join('\n');
  const tasksSummary = tasks.map(t => `- "${t.title}" no projeto "${t.project_name || 'Nenhum'}" (id: ${t.id}, status: ${t.status}, agendada: ${t.scheduled_date || 'sem data'}, prioridade: ${t.priority})`).join('\n');
  
  return [
    '=== PLANEJAMENTO ATUAL (PROJETOS E TAREFAS) ===',
    'Use essas informacoes para identificar se o usuario esta falando de um projeto ou tarefa existente ou quer criar um novo. Evite duplicados.',
    'Projetos:',
    projectsSummary || '(Nenhum projeto cadastrado)',
    'Tarefas:',
    tasksSummary || '(Nenhuma tarefa cadastrada)',
    '============================================'
  ].join('\n');
}
