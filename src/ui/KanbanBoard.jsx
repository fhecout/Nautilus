import React, { useCallback, useState } from 'react';
import {
  Calendar,
  Circle,
  Edit,
  GripVertical,
  Trash2
} from 'lucide-react';

export const KANBAN_COLUMNS = ['Planos', 'Em andamento', 'Concluído'];

const COLUMN_META = {
  Planos: { slug: 'planos', label: 'Planos', hint: 'Ideias e backlog' },
  'Em andamento': { slug: 'progress', label: 'Em andamento', hint: 'Foco atual' },
  'Concluído': { slug: 'done', label: 'Concluído', hint: 'Entregue' }
};

export function KanbanBoard({
  columns,
  onMoveTask,
  onOpenTask,
  onEditTask,
  onDeleteTask
}) {
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);
  const [justMovedIds, setJustMovedIds] = useState(() => new Set());

  const markMoved = useCallback(taskId => {
    setJustMovedIds(prev => {
      const next = new Set(prev);
      next.add(taskId);
      return next;
    });
    window.setTimeout(() => {
      setJustMovedIds(prev => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }, 520);
  }, []);

  const handleDragStart = (event, task) => {
    setDraggedTaskId(task.id);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', task.id);
    event.dataTransfer.setData('application/x-nautilus-status', task.status);
    requestAnimationFrame(() => {
      event.target.closest('.kanban-card')?.classList.add('is-dragging');
    });
  };

  const handleDragEnd = event => {
    setDraggedTaskId(null);
    setDragOverColumn(null);
    event.target.closest('.kanban-card')?.classList.remove('is-dragging');
  };

  const handleDragOver = (event, columnName) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (dragOverColumn !== columnName) setDragOverColumn(columnName);
  };

  const handleDrop = async (event, columnName) => {
    event.preventDefault();
    setDragOverColumn(null);
    const taskId = event.dataTransfer.getData('text/plain') || draggedTaskId;
    if (!taskId) return;

    const sourceStatus = event.dataTransfer.getData('application/x-nautilus-status');
    if (sourceStatus === columnName) return;

    markMoved(taskId);
    await onMoveTask(taskId, columnName);
    setDraggedTaskId(null);
  };

  return (
    <div className="kanban-board">
      {KANBAN_COLUMNS.map(colName => {
        const meta = COLUMN_META[colName];
        const colTasks = columns[colName] || [];
        const isDropTarget = dragOverColumn === colName && draggedTaskId;

        return (
          <div
            key={colName}
            className={`kanban-column column-${meta.slug} ${isDropTarget ? 'drop-target' : ''}`}
            onDragOver={event => handleDragOver(event, colName)}
            onDragLeave={() => setDragOverColumn(current => (current === colName ? null : current))}
            onDrop={event => handleDrop(event, colName)}
          >
            <div className="column-header">
              <div className="column-title-block">
                <h3>{meta.label}</h3>
                <span className="column-hint">{meta.hint}</span>
              </div>
              <span className="task-count">{colTasks.length}</span>
            </div>

            <div className="kanban-cards-container">
              {colTasks.map(task => {
                const doneSub = task.subtasks?.filter(s => s.status === 'concluido').length || 0;
                const totalSub = task.subtasks?.length || 0;
                const isDragging = draggedTaskId === task.id;
                const justMoved = justMovedIds.has(task.id);

                return (
                  <article
                    key={task.id}
                    className={[
                      'kanban-card',
                      `priority-${task.priority}`,
                      isDragging ? 'is-dragging' : '',
                      justMoved ? 'just-moved' : ''
                    ].filter(Boolean).join(' ')}
                    draggable
                    onDragStart={event => handleDragStart(event, task)}
                    onDragEnd={handleDragEnd}
                  >
                    <div className="card-drag-row">
                      <span className="drag-handle" title="Arrastar para outra coluna">
                        <GripVertical size={14} />
                      </span>
                      <span className={`priority-badge ${task.priority}`}>{task.priority}</span>
                    </div>

                    <h4
                      className="task-title"
                      onClick={() => onOpenTask(task)}
                      onKeyDown={event => {
                        if (event.key === 'Enter') onOpenTask(task);
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      {task.title}
                    </h4>

                    {task.description && <p className="task-desc">{task.description}</p>}

                    {task.project_name && <span className="project-tag">{task.project_name}</span>}

                    {totalSub > 0 && (
                      <div className="subtask-progress">
                        <div className="progress-text">
                          Subtarefas: {doneSub}/{totalSub}
                        </div>
                        <div className="progress-bar">
                          <div
                            className="progress-bar-fill"
                            style={{ width: `${(doneSub / totalSub) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="card-footer">
                      <span className="task-date">
                        <Calendar size={11} />
                        {task.scheduled_date
                          ? new Date(task.scheduled_date).toLocaleDateString('pt-BR')
                          : 'Sem data'}
                      </span>
                      <div className="quick-actions">
                        <button
                          type="button"
                          draggable={false}
                          onMouseDown={event => event.stopPropagation()}
                          onClick={() => onEditTask(task)}
                          title="Editar"
                        >
                          <Edit size={12} />
                        </button>
                        <button
                          type="button"
                          draggable={false}
                          onMouseDown={event => event.stopPropagation()}
                          onClick={() => onDeleteTask(task.id)}
                          title="Excluir"
                          className="danger"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}

              {colTasks.length === 0 && (
                <div className={`empty-column-state ${isDropTarget ? 'drop-hint' : ''}`}>
                  <Circle size={22} className="muted-icon" />
                  <p>{isDropTarget ? 'Solte a tarefa aqui' : 'Arraste ou crie uma tarefa aqui'}</p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
