import {
  createProject,
  getProject,
  findProjectByName,
  listProjects,
  updateProject,
  deleteProject,
  addProjectNote,
  listProjectNotes,
  deleteProjectNote,
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
} from '../core/planner.js';

export const definition = {
  type: 'function',
  function: {
    name: 'manage_planner',
    description:
      'Gerencia projetos, tarefas, prazos, anotacoes e status de planejamento. Use para criar, editar, listar ou deletar projetos e tarefas baseando-se no que o usuario pede na conversa.',
    parameters: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: [
            'create_project',
            'update_project',
            'delete_project',
            'list_projects',
            'get_project',
            'add_project_note',
            'delete_project_note',
            'create_task',
            'update_task',
            'delete_task',
            'list_tasks',
            'create_subtask',
            'update_subtask',
            'delete_subtask',
            'get_history',
            'parse_date'
          ],
          description: 'Operacao a ser executada no planner.'
        },
        projectId: {
          type: 'string',
          description: 'ID do projeto relacionado.'
        },
        projectName: {
          type: 'string',
          description: 'Nome do projeto (usado para criacao ou busca).'
        },
        projectDescription: {
          type: 'string',
          description: 'Descricao do projeto.'
        },
        projectStatus: {
          type: 'string',
          enum: ['Planos', 'Em andamento', 'Concluído'],
          description: 'Status do projeto.'
        },
        taskId: {
          type: 'string',
          description: 'ID da tarefa relacionada.'
        },
        taskTitle: {
          type: 'string',
          description: 'Titulo da tarefa.'
        },
        taskDescription: {
          type: 'string',
          description: 'Descricao da tarefa.'
        },
        scheduledDate: {
          type: 'string',
          description: 'Data agendada (formato YYYY-MM-DD ou linguagem natural para processamento).'
        },
        dueDate: {
          type: 'string',
          description: 'Prazo limite da tarefa (formato YYYY-MM-DD ou linguagem natural).'
        },
        priority: {
          type: 'string',
          enum: ['baixa', 'media', 'alta'],
          description: 'Prioridade da tarefa.'
        },
        taskStatus: {
          type: 'string',
          enum: ['Planos', 'Em andamento', 'Concluído'],
          description: 'Status da tarefa.'
        },
        noteContent: {
          type: 'string',
          description: 'Conteudo da anotacao/requisito do projeto.'
        },
        noteId: {
          type: 'string',
          description: 'ID da anotacao a apagar.'
        },
        subtaskId: {
          type: 'string',
          description: 'ID da subtarefa.'
        },
        subtaskTitle: {
          type: 'string',
          description: 'Titulo da subtarefa.'
        },
        subtaskStatus: {
          type: 'string',
          enum: ['pendente', 'concluido'],
          description: 'Status da subtarefa.'
        },
        targetType: {
          type: 'string',
          enum: ['project', 'task'],
          description: 'Tipo de historico.'
        },
        targetId: {
          type: 'string',
          description: 'ID do alvo para historico.'
        },
        dateText: {
          type: 'string',
          description: 'Texto de data em linguagem natural para analisar.'
        },
        search: {
          type: 'string',
          description: 'Filtro de busca por texto.'
        }
      },
      required: ['operation']
    }
  }
};

export async function execute(args) {
  const input = normalizeArgs(args);
  const operation = String(input.operation || '').trim();

  try {
    switch (operation) {
      case 'create_project': {
        if (!input.projectName) throw new Error('Nome do projeto nao informado.');
        const project = createProject(input.projectName, input.projectDescription || '', input.projectStatus || 'Planos');
        return direct(`Projeto criado com sucesso!\n- ID: ${project.id}\n- Nome: ${project.name}\n- Status: ${project.status}`, project);
      }

      case 'update_project': {
        if (!input.projectId) throw new Error('ID do projeto nao informado.');
        const project = updateProject(input.projectId, {
          name: input.projectName,
          description: input.projectDescription,
          status: input.projectStatus
        });
        return direct(`Projeto atualizado!\n- Nome: ${project.name}\n- Status: ${project.status}`, project);
      }

      case 'delete_project': {
        if (!input.projectId) throw new Error('ID do projeto nao informado.');
        const project = deleteProject(input.projectId);
        return direct(`Projeto "${project?.name || input.projectId}" deletado com sucesso.`, project);
      }

      case 'list_projects': {
        const list = listProjects();
        const formatted = list.map(p => `- [${p.id}] ${p.name} (Status: ${p.status}, Tarefas: ${p.taskDoneCount}/${p.taskCount})`).join('\n') || 'Nenhum projeto encontrado.';
        return direct(`Projetos:\n${formatted}`, list);
      }

      case 'get_project': {
        if (!input.projectId) throw new Error('ID do projeto nao informado.');
        const project = getProject(input.projectId);
        return direct(`Detalhes do Projeto:\n- Nome: ${project.name}\n- Status: ${project.status}\n- Descricao: ${project.description || 'Nenhuma'}\n- Tarefas: ${project.tasks?.length || 0} vinculadas.`, project);
      }

      case 'add_project_note': {
        if (!input.projectId) throw new Error('ID do projeto nao informado.');
        if (!input.noteContent) throw new Error('Conteudo da anotacao nao informado.');
        const note = addProjectNote(input.projectId, input.noteContent);
        return direct(`Anotacao adicionada ao projeto!\n- ${note.content}`, note);
      }

      case 'delete_project_note': {
        if (!input.noteId) throw new Error('ID da anotacao nao informado.');
        const note = deleteProjectNote(input.noteId);
        return direct(`Anotacao removida.`, note);
      }

      case 'create_task': {
        if (!input.taskTitle) throw new Error('Titulo da tarefa nao informado.');
        
        let targetProjId = input.projectId || null;
        if (!targetProjId && input.projectName) {
          const matchedProj = findProjectByName(input.projectName);
          if (matchedProj) {
            targetProjId = matchedProj.id;
          } else {
            // Cria um novo projeto automaticamente se mencionado e não existe
            const newProj = createProject(input.projectName, 'Criado automaticamente via tarefa.');
            targetProjId = newProj.id;
          }
        }

        // Tenta resolver datas em linguagem natural
        const schedDate = input.scheduledDate ? (parseNaturalLanguageDate(input.scheduledDate) || input.scheduledDate) : null;
        const dDate = input.dueDate ? (parseNaturalLanguageDate(input.dueDate) || input.dueDate) : null;

        // Verifica se já existe uma tarefa com o mesmo título e projeto para evitar duplicatas
        const existing = listTasks({ projectId: targetProjId, search: input.taskTitle });
        const isDuplicate = existing.some(t => t.title.toLowerCase() === input.taskTitle.toLowerCase() && t.status !== 'Concluído');
        if (isDuplicate) {
          return direct(`Tarefa com o mesmo titulo "${input.taskTitle}" ja existe neste projeto e nao foi duplicada.`, existing[0]);
        }

        const task = createTask({
          title: input.taskTitle,
          description: input.taskDescription || '',
          projectId: targetProjId,
          scheduledDate: schedDate,
          dueDate: dDate,
          priority: input.priority || 'media',
          status: input.taskStatus || 'Planos'
        });

        const projName = task.project ? task.project.name : 'Nenhum';
        return direct(`Tarefa criada: ${task.title}, agendada para ${task.scheduled_date || 'nenhuma data'}, no projeto ${projName}, com status ${task.status}.`, task);
      }

      case 'update_task': {
        if (!input.taskId) throw new Error('ID da tarefa nao informado.');

        const schedDate = input.scheduledDate ? (parseNaturalLanguageDate(input.scheduledDate) || input.scheduledDate) : undefined;
        const dDate = input.dueDate ? (parseNaturalLanguageDate(input.dueDate) || input.dueDate) : undefined;

        const task = updateTask(input.taskId, {
          title: input.taskTitle,
          description: input.taskDescription,
          projectId: input.projectId,
          scheduledDate: schedDate,
          dueDate: dDate,
          priority: input.priority,
          status: input.taskStatus
        });

        return direct(`Tarefa "${task.title}" atualizada com sucesso. Status: ${task.status}.`, task);
      }

      case 'delete_task': {
        if (!input.taskId) throw new Error('ID da tarefa nao informado.');
        const task = deleteTask(input.taskId);
        return direct(`Tarefa "${task?.title || input.taskId}" deletada com sucesso.`, task);
      }

      case 'list_tasks': {
        const list = listTasks({
          projectId: input.projectId,
          status: input.taskStatus,
          priority: input.priority,
          scheduledDate: input.scheduledDate ? (parseNaturalLanguageDate(input.scheduledDate) || input.scheduledDate) : undefined,
          dueDate: input.dueDate ? (parseNaturalLanguageDate(input.dueDate) || input.dueDate) : undefined,
          search: input.search
        });
        const formatted = list.map(t => `- [${t.id}] ${t.title} (Proj: ${t.project_name || 'Nenhum'}, Status: ${t.status}, Data: ${t.scheduled_date || '...' })`).join('\n') || 'Nenhuma tarefa encontrada.';
        return direct(`Tarefas encontradas:\n${formatted}`, list);
      }

      case 'create_subtask': {
        if (!input.taskId) throw new Error('ID da tarefa nao informado.');
        if (!input.subtaskTitle) throw new Error('Titulo da subtarefa nao informado.');
        const sub = createSubtask(input.taskId, input.subtaskTitle, input.subtaskStatus || 'pendente');
        return direct(`Subtarefa "${sub.title}" adicionada com sucesso.`, sub);
      }

      case 'update_subtask': {
        if (!input.subtaskId) throw new Error('ID da subtarefa nao informado.');
        if (!input.subtaskStatus) throw new Error('Status da subtarefa nao informado.');
        const sub = updateSubtask(input.subtaskId, input.subtaskStatus);
        return direct(`Subtarefa "${sub.title}" atualizada para "${sub.status}".`, sub);
      }

      case 'delete_subtask': {
        if (!input.subtaskId) throw new Error('ID da subtarefa nao informado.');
        const sub = deleteSubtask(input.subtaskId);
        return direct(`Subtarefa removida.`, sub);
      }

      case 'get_history': {
        if (!input.targetType || !input.targetId) throw new Error('Tipo e ID do alvo sao obrigatorios.');
        const hist = listHistory(input.targetType, input.targetId);
        const formatted = hist.map(h => `[${h.created_at}] ${h.change_description}`).join('\n') || 'Nenhum historico de alteracoes encontrado.';
        return direct(`Historico:\n${formatted}`, hist);
      }

      case 'parse_date': {
        if (!input.dateText) throw new Error('Texto de data nao informado.');
        const parsed = parseNaturalLanguageDate(input.dateText);
        return direct(`Texto "${input.dateText}" resolvido para data: ${parsed || 'nao identificada'}`, { date: parsed });
      }

      default:
        throw new Error(`Operacao nao suportada: ${operation}`);
    }
  } catch (error) {
    return {
      directReturn: true,
      finalAnswer: `Erro ao executar operacao de planner "${operation}": ${error.message}`
    };
  }
}

function direct(finalAnswer, data = null) {
  return {
    directReturn: true,
    finalAnswer,
    modelInput: data ? JSON.stringify(data) : undefined
  };
}

function normalizeArgs(args) {
  if (typeof args === 'string') {
    try {
      return JSON.parse(args);
    } catch {
      return { operation: 'list_tasks', search: args };
    }
  }

  return args && typeof args === 'object' ? args : {};
}
