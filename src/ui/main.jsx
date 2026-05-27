import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  Clock3,
  Cpu,
  Database,
  FileSearch,
  GitBranch,
  HardDrive,
  Mail,
  MemoryStick,
  Mic,
  Power,
  Radar,
  RefreshCw,
  Route,
  Send,
  ShieldCheck,
  Users,
  Volume2,
  Zap,
  Terminal,
  Brain,
  Kanban,
  Trash2,
  Pin,
  Edit,
  Plus,
  Search,
  Clock,
  CheckCircle,
  Circle,
  Calendar,
  AlertCircle,
  History,
  FileText,
  X,
  ChevronRight,
  Filter,
  CheckCircle2,
  FolderOpen,
  Gavel,
  CalendarClock,
  Play,
  ListChecks
} from 'lucide-react';
import { KanbanBoard } from './KanbanBoard.jsx';
import './styles.css';

const API_URL = import.meta.env.VITE_NAUTILUS_API_URL || 'http://127.0.0.1:3333';

function App() {
  const [currentView, setCurrentView] = useState('console'); // 'console' | 'memory' | 'planner'

  // Console state
  const [status, setStatus] = useState({ ok: false, model: '...' });
  const [system, setSystem] = useState(null);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        'Sistema online. Posso operar arquivos, Gmail, memoria, SQLite, conversao, compactacao e pesquisa local com modo seguro ativo.'
    }
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [chatMode, setChatMode] = useState('direct');
  const [observatory, setObservatory] = useState(null);
  const [radar, setRadar] = useState(null);
  const [automations, setAutomations] = useState([]);
  const [automationReport, setAutomationReport] = useState(null);
  const [isRunningAutomation, setIsRunningAutomation] = useState(false);
  const [liveEvents, setLiveEvents] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [selectedRun, setSelectedRun] = useState(null);
  const [isLoadingRun, setIsLoadingRun] = useState(false);
  const logEndRef = useRef(null);

  // Memories State
  const [memories, setMemories] = useState([]);
  const [searchMemory, setSearchMemory] = useState('');
  const [editingMemory, setEditingMemory] = useState(null);
  const [newMemoryText, setNewMemoryText] = useState('');
  const [newMemoryTags, setNewMemoryTags] = useState('');
  const [selectedMemoryHistory, setSelectedMemoryHistory] = useState(null);
  const [loadingHistoryId, setLoadingHistoryId] = useState(null);

  // Planner State
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('all');
  const [tasks, setTasks] = useState([]);
  const [searchTask, setSearchTask] = useState('');
  const [taskStatusFilter, setTaskStatusFilter] = useState('all');
  const [taskPriorityFilter, setTaskPriorityFilter] = useState('all');

  // Modals / Forms
  const [editingTask, setEditingTask] = useState(null);
  const [editingProject, setEditingProject] = useState(null);
  const [showNewTaskForm, setShowNewTaskForm] = useState(false);
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [selectedProjectDetails, setSelectedProjectDetails] = useState(null);
  const [showProjectModal, setShowProjectModal] = useState(false);

  // New Project Form
  const [newProjName, setNewProjName] = useState('');
  const [newProjDesc, setNewProjDesc] = useState('');
  const [newProjStatus, setNewProjStatus] = useState('Planos');

  // New Task Form
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskProjId, setNewTaskProjId] = useState('');
  const [newTaskScheduled, setNewTaskScheduled] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState('media');
  const [newTaskStatus, setNewTaskStatus] = useState('Planos');

  // Project Notes Form
  const [newNoteContent, setNewNoteContent] = useState('');

  // Task Subtask Form
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [selectedTaskDetails, setSelectedTaskDetails] = useState(null);
  const [showTaskDetailModal, setShowTaskDetailModal] = useState(false);

  // Polls/API Calls
  useEffect(() => {
    fetch(`${API_URL}/api/status`)
      .then(response => response.json())
      .then(setStatus)
      .catch(error => setStatus({ ok: false, error: error.message, model: 'offline' }));
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadSystem() {
      try {
        const response = await fetch(`${API_URL}/api/system`);
        const data = await response.json();
        if (mounted && response.ok) setSystem(data);
      } catch {
        if (mounted) setSystem(null);
      }
    }
    loadSystem();
    const id = window.setInterval(loadSystem, 15_000);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function bootstrapAutomations() {
      try {
        const listResponse = await fetch(`${API_URL}/api/automations`);
        const listData = await listResponse.json();
        if (mounted && listResponse.ok) {
          setAutomations(listData.automations || []);
          if (listData.recentReports?.length) {
            setAutomationReport(listData.recentReports[0]);
          }
        }

      } catch {
        // API offline ou automacoes indisponiveis
      }
    }

    bootstrapAutomations();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadRadar() {
      try {
        const response = await fetch(`${API_URL}/api/radar`);
        const data = await response.json();
        if (mounted && response.ok) setRadar(data);
      } catch {
        if (mounted) setRadar(null);
      }
    }

    loadRadar();
    const id = window.setInterval(loadRadar, 60_000);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadObservatory() {
      try {
        const response = await fetch(`${API_URL}/api/observatory`);
        const data = await response.json();
        if (mounted && response.ok) setObservatory(data);
      } catch {
        if (mounted) setObservatory(null);
      }
    }
    loadObservatory();
    const id = window.setInterval(loadObservatory, 15_000);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  // Load Memories
  const loadMemories = async () => {
    try {
      const response = await fetch(`${API_URL}/api/memories`);
      if (response.ok) {
        const data = await response.json();
        setMemories(data);
      }
    } catch (error) {
      console.error('Erro ao carregar memórias:', error);
    }
  };

  useEffect(() => {
    if (currentView === 'memory') {
      loadMemories();
    }
  }, [currentView]);

  // Load Planner Data
  const loadPlannerData = async () => {
    try {
      const projRes = await fetch(`${API_URL}/api/projects`);
      if (projRes.ok) {
        const data = await projRes.json();
        setProjects(data);
      }

      const queryParams = new URLSearchParams();
      if (selectedProjectId !== 'all') queryParams.append('projectId', selectedProjectId);
      if (taskStatusFilter !== 'all') queryParams.append('status', taskStatusFilter);
      if (taskPriorityFilter !== 'all') queryParams.append('priority', taskPriorityFilter);
      if (searchTask) queryParams.append('search', searchTask);

      const taskRes = await fetch(`${API_URL}/api/tasks?${queryParams.toString()}`);
      if (taskRes.ok) {
        const data = await taskRes.json();
        setTasks(data);
      }
    } catch (error) {
      console.error('Erro ao carregar dados do planejador:', error);
    }
  };

  useEffect(() => {
    if (currentView === 'planner') {
      loadPlannerData();
    }
  }, [currentView, selectedProjectId, taskStatusFilter, taskPriorityFilter, searchTask]);

  // Load Project Detail & Notes & History
  const loadProjectDetails = async (projId) => {
    try {
      const res = await fetch(`${API_URL}/api/projects/${projId}`);
      if (res.ok) {
        const project = await res.json();

        const historyRes = await fetch(`${API_URL}/api/projects/${projId}/history`);
        const history = historyRes.ok ? await historyRes.json() : [];

        setSelectedProjectDetails({ ...project, history });
      }
    } catch (error) {
      console.error('Erro ao carregar detalhes do projeto:', error);
    }
  };

  // Load Task Detail & Subtasks & History
  const loadTaskDetails = async (taskId) => {
    try {
      const res = await fetch(`${API_URL}/api/tasks/${taskId}`);
      if (res.ok) {
        const task = await res.json();

        const historyRes = await fetch(`${API_URL}/api/tasks/${taskId}/history`);
        const history = historyRes.ok ? await historyRes.json() : [];

        setSelectedTaskDetails({ ...task, history });
      }
    } catch (error) {
      console.error('Erro ao carregar detalhes da tarefa:', error);
    }
  };

  const tools = useMemo(
    () => [
      { label: 'Gmail', icon: Mail, state: 'READY' },
      { label: 'Arquivos', icon: FileSearch, state: 'READY' },
      { label: 'Memoria', icon: MemoryStick, state: 'READY' },
      { label: 'SQLite', icon: Database, state: 'READY' },
      { label: 'Seguro', icon: ShieldCheck, state: 'ARMED' },
      { label: 'Voz', icon: Volume2, state: 'LOCAL' }
    ],
    []
  );

  const cpuLoad = system?.cpu?.loadPercent ?? 0;
  const memoryLoad = system?.memory?.usedPercent ?? 0;
  const radarSignal = radar?.score ?? Math.round(cpuLoad || memoryLoad || 0);

  async function runAutomation(id) {
    setIsRunningAutomation(true);
    try {
      const response = await fetch(`${API_URL}/api/automations/${id}/run`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao executar automacao.');
      setAutomationReport(data.report);
      setMessages(current => [
        ...current,
        { role: 'assistant', content: `Automacao **${data.report.name}** concluida.\n\n${data.report.text}` }
      ]);
    } catch (error) {
      setMessages(current => [
        ...current,
        { role: 'assistant', content: `Nao consegui executar a automacao: ${error.message}` }
      ]);
    } finally {
      setIsRunningAutomation(false);
    }
  }

  async function refreshObservatory() {
    try {
      const response = await fetch(`${API_URL}/api/observatory`);
      const data = await response.json();
      if (response.ok) setObservatory(data);
    } catch {
      setObservatory(null);
    }
  }

  async function loadRun(runId) {
    if (!runId) return;
    setSelectedRunId(runId);
    setIsLoadingRun(true);
    try {
      const response = await fetch(`${API_URL}/api/runs/${runId}`);
      const data = await response.json();
      if (response.ok) setSelectedRun(data.run);
    } catch {
      setSelectedRun(null);
    } finally {
      setIsLoadingRun(false);
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    const message = input.trim();
    if (!message || isSending) return;

    setInput('');
    setIsSending(true);
    setLiveEvents([]);
    setSelectedRun(null);
    setSelectedRunId(null);
    setMessages(current => [
      ...current,
      { role: 'user', content: message },
      { role: 'assistant', content: '' }
    ]);

    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, mode: chatMode })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Falha ao conversar com Nautilus.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const rawData = trimmed.slice(6);
          if (rawData === '[DONE]') break;

          try {
            const parsed = JSON.parse(rawData);
            if (parsed.error) throw new Error(parsed.error);

            if (parsed.event) {
              setLiveEvents(current => [parsed.event, ...current].slice(0, 18));
              if (parsed.event.runId) setSelectedRunId(parsed.event.runId);
            }

            if (parsed.token) {
              setMessages(current => {
                const updated = [...current];
                const lastIdx = updated.length - 1;
                if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
                  updated[lastIdx].content += parsed.token;
                }
                return updated;
              });
            }
          } catch (err) {
            console.error('Erro ao processar linha SSE:', err);
          }
        }
      }
    } catch (error) {
      setMessages(current => {
        const updated = [...current];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
          updated[lastIdx].content = `Nao consegui concluir: ${error.message}`;
        }
        return updated;
      });
    } finally {
      setIsSending(false);
      refreshObservatory();
    }
  }

  // Memory Actions
  const handleSaveMemory = async (e) => {
    e.preventDefault();
    if (!newMemoryText.trim()) return;
    try {
      const response = await fetch(`${API_URL}/api/memories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: newMemoryText,
          tags: newMemoryTags.split(',').map(t => t.trim()).filter(Boolean),
          pinned: false
        })
      });
      if (response.ok) {
        setNewMemoryText('');
        setNewMemoryTags('');
        loadMemories();
      }
    } catch (err) {
      console.error('Erro ao salvar memória:', err);
    }
  };

  const handleTogglePinMemory = async (memory) => {
    try {
      const response = await fetch(`${API_URL}/api/memories/${memory.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pinned: !memory.pinned
        })
      });
      if (response.ok) {
        loadMemories();
      }
    } catch (err) {
      console.error('Erro ao pin/unpin memória:', err);
    }
  };

  const handleDeleteMemory = async (memoryId) => {
    if (!confirm('Deseja realmente apagar esta memória?')) return;
    try {
      const response = await fetch(`${API_URL}/api/memories/${memoryId}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        loadMemories();
        if (selectedMemoryHistory?.id === memoryId) {
          setSelectedMemoryHistory(null);
        }
      }
    } catch (err) {
      console.error('Erro ao deletar memória:', err);
    }
  };

  const handleUpdateMemory = async (e) => {
    e.preventDefault();
    if (!editingMemory || !editingMemory.text.trim()) return;
    try {
      const response = await fetch(`${API_URL}/api/memories/${editingMemory.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: editingMemory.text,
          tags: editingMemory.tags
        })
      });
      if (response.ok) {
        setEditingMemory(null);
        loadMemories();
      }
    } catch (err) {
      console.error('Erro ao atualizar memória:', err);
    }
  };

  const handleViewMemoryHistory = async (memory) => {
    setLoadingHistoryId(memory.id);
    try {
      const response = await fetch(`${API_URL}/api/memories/${memory.id}/history`);
      if (response.ok) {
        const history = await response.json();
        setSelectedMemoryHistory({ ...memory, history });
      }
    } catch (err) {
      console.error('Erro ao carregar histórico:', err);
    } finally {
      setLoadingHistoryId(null);
    }
  };

  // Planner Project Actions
  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!newProjName.trim()) return;
    try {
      const res = await fetch(`${API_URL}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProjName,
          description: newProjDesc,
          status: newProjStatus
        })
      });
      if (res.ok) {
        setNewProjName('');
        setNewProjDesc('');
        setNewProjStatus('Planos');
        setShowNewProjectForm(false);
        loadPlannerData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateProject = async (e) => {
    e.preventDefault();
    if (!editingProject || !editingProject.name.trim()) return;
    try {
      const res = await fetch(`${API_URL}/api/projects/${editingProject.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingProject)
      });
      if (res.ok) {
        setEditingProject(null);
        loadPlannerData();
        if (selectedProjectDetails?.id === editingProject.id) {
          loadProjectDetails(editingProject.id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteProject = async (projId) => {
    if (!confirm('Excluir o projeto desvinculará suas tarefas. Deseja continuar?')) return;
    try {
      const res = await fetch(`${API_URL}/api/projects/${projId}`, { method: 'DELETE' });
      if (res.ok) {
        setShowProjectModal(false);
        setSelectedProjectDetails(null);
        loadPlannerData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddProjectNote = async (e) => {
    e.preventDefault();
    if (!newNoteContent.trim() || !selectedProjectDetails) return;
    try {
      const res = await fetch(`${API_URL}/api/projects/${selectedProjectDetails.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newNoteContent })
      });
      if (res.ok) {
        setNewNoteContent('');
        loadProjectDetails(selectedProjectDetails.id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteProjectNote = async (noteId) => {
    try {
      const res = await fetch(`${API_URL}/api/projects/notes/${noteId}`, { method: 'DELETE' });
      if (res.ok && selectedProjectDetails) {
        loadProjectDetails(selectedProjectDetails.id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Planner Task Actions
  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    try {
      const res = await fetch(`${API_URL}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTaskTitle,
          description: newTaskDesc,
          projectId: newTaskProjId || null,
          scheduledDate: newTaskScheduled || null,
          dueDate: newTaskDue || null,
          priority: newTaskPriority,
          status: newTaskStatus
        })
      });
      if (res.ok) {
        setNewTaskTitle('');
        setNewTaskDesc('');
        setNewTaskProjId('');
        setNewTaskScheduled('');
        setNewTaskDue('');
        setNewTaskPriority('media');
        setNewTaskStatus('Planos');
        setShowNewTaskForm(false);
        loadPlannerData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateTaskStatus = async (task, newStatus) => {
    try {
      const res = await fetch(`${API_URL}/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        loadPlannerData();
        if (selectedTaskDetails?.id === task.id) {
          loadTaskDetails(task.id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const moveTaskToColumn = async (taskId, newStatus) => {
    const snapshot = tasks;
    setTasks(current =>
      current.map(task => (task.id === taskId ? { ...task, status: newStatus } : task))
    );
    try {
      const res = await fetch(`${API_URL}/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) {
        setTasks(snapshot);
        await loadPlannerData();
      } else if (selectedTaskDetails?.id === taskId) {
        loadTaskDetails(taskId);
      }
    } catch (err) {
      console.error(err);
      setTasks(snapshot);
      await loadPlannerData();
    }
  };

  const handleUpdateTask = async (e) => {
    e.preventDefault();
    if (!editingTask || !editingTask.title.trim()) return;
    try {
      const res = await fetch(`${API_URL}/api/tasks/${editingTask.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingTask)
      });
      if (res.ok) {
        setEditingTask(null);
        loadPlannerData();
        if (selectedTaskDetails?.id === editingTask.id) {
          loadTaskDetails(editingTask.id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!confirm('Deseja apagar esta tarefa?')) return;
    try {
      const res = await fetch(`${API_URL}/api/tasks/${taskId}`, { method: 'DELETE' });
      if (res.ok) {
        setShowTaskDetailModal(false);
        setSelectedTaskDetails(null);
        loadPlannerData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Subtasks Actions
  const handleAddSubtask = async (e) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim() || !selectedTaskDetails) return;
    try {
      const res = await fetch(`${API_URL}/api/tasks/${selectedTaskDetails.id}/subtasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newSubtaskTitle, status: 'pendente' })
      });
      if (res.ok) {
        setNewSubtaskTitle('');
        loadTaskDetails(selectedTaskDetails.id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleSubtask = async (subtask) => {
    const newStatus = subtask.status === 'concluido' ? 'pendente' : 'concluido';
    try {
      const res = await fetch(`${API_URL}/api/tasks/subtasks/${subtask.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok && selectedTaskDetails) {
        loadTaskDetails(selectedTaskDetails.id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteSubtask = async (subtaskId) => {
    try {
      const res = await fetch(`${API_URL}/api/tasks/subtasks/${subtaskId}`, { method: 'DELETE' });
      if (res.ok && selectedTaskDetails) {
        loadTaskDetails(selectedTaskDetails.id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Filtering Memory logic
  const filteredMemories = useMemo(() => {
    if (!searchMemory.trim()) return memories;
    const term = searchMemory.toLowerCase();
    return memories.filter(m =>
      m.text.toLowerCase().includes(term) ||
      m.tags.some(t => t.toLowerCase().includes(term))
    );
  }, [memories, searchMemory]);

  // Kanban Tasks logic
  const kanbanColumns = useMemo(() => {
    return {
      'Planos': tasks.filter(t => t.status === 'Planos'),
      'Em andamento': tasks.filter(t => t.status === 'Em andamento'),
      'Concluído': tasks.filter(t => t.status === 'Concluído')
    };
  }, [tasks]);

  return (
    <main className="shell">
      <div className="terminal-frame dashboard-layout">

        {/* Navigation Sidebar */}
        <aside className="nav-sidebar">
          <div className="brand-zone">
            <span className="brand-mark">N</span>
            <span className="brand-text">NAUTILUS</span>
          </div>

          <nav className="nav-menu">
            <button
              type="button"
              className={`nav-item ${currentView === 'console' ? 'active' : ''}`}
              onClick={() => setCurrentView('console')}
              title="Console do Nautilus"
            >
              <Terminal size={18} />
              <span>Console</span>
            </button>
            <button
              type="button"
              className={`nav-item ${currentView === 'memory' ? 'active' : ''}`}
              onClick={() => setCurrentView('memory')}
              title="Memory Studio"
            >
              <Brain size={18} />
              <span>Memórias</span>
            </button>
            <button
              type="button"
              className={`nav-item ${currentView === 'planner' ? 'active' : ''}`}
              onClick={() => setCurrentView('planner')}
              title="Kanban e Planejamento"
            >
              <Kanban size={18} />
              <span>Planner</span>
            </button>
          </nav>

          <div className="sidebar-footer">
            <div className="radar-mini">
              <span className={`status-dot ${status.ok ? 'online' : 'offline'}`} />
              <span className="model-name">{status.model}</span>
            </div>
          </div>
        </aside>

        {/* Top Header Bar */}
        <header className="topbar">
          <div>
            <div className="brand-row">
              <h1>
                {currentView === 'console' && 'NAUTILUS CENTRAL'}
                {currentView === 'memory' && 'MEMORY STUDIO'}
                {currentView === 'planner' && 'STUDIO DE PLANEJAMENTO'}
              </h1>
            </div>
            <p className="system-line">
              {currentView === 'console' && `SYSTEM.ONLINE / ${status.model}`}
              {currentView === 'memory' && `BANCO DE MEMORIA INTEGRADO / ${memories.length} REGISTROS`}
              {currentView === 'planner' && `KANBAN NOTION-STYLE / ${tasks.length} TAREFAS`}
            </p>
          </div>
          <div className="window-actions" aria-label="Controles">
            <button title="Minimizar" type="button" onClick={() => window.nautilusWindow?.minimize?.()}>
              <Power size={14} />
            </button>
            <button title="Maximizar" type="button" onClick={() => window.nautilusWindow?.toggleMaximize?.()}>
              <Mic size={14} />
            </button>
            <button title="Fechar" type="button" onClick={() => window.nautilusWindow?.close?.()}>
              <Zap size={14} />
            </button>
          </div>
        </header>

        {/* Inner View Stage */}
        <div className="workspace-stage">

          {/* VIEW: CONSOLE (ORIGINAL PANEL) */}
          {currentView === 'console' && (
            <section className="console-grid">
              <aside className="left-panel">
                <RadarScope signal={radarSignal} level={radar?.level} />
                <ProblemRadarPanel radar={radar} />
                <AutomationsPanel
                  automations={automations}
                  report={automationReport}
                  isRunning={isRunningAutomation}
                  onRun={runAutomation}
                />
                <SystemMetrics system={system} />
                <ObservatorySummary observatory={observatory} onRefresh={refreshObservatory} />
                <AgentTeamRoster observatory={observatory} />
              </aside>

              <section className="center-stage console-chat-view">
                <div className="center-header">
                  <div className="header-orb-container">
                    <CoreOrb active={isSending} mini={true} />
                  </div>
                  <div className="header-text-container">
                    <h2>CONVERSA COM NAUTILUS</h2>
                    <p className="subtitle">{getModeLabel(chatMode, observatory)}</p>
                  </div>
                </div>

                <div className="conversation-center">
                  {messages.map((message, index) => (
                    <article 
                      className={`chat-bubble ${message.role === 'assistant' ? 'assistant-bubble' : 'user-bubble'}`} 
                      key={`${message.role}-${index}`}
                    >
                      <div className="bubble-sender-name">
                        {message.role === 'assistant' ? 'NAUTILUS' : 'VOCÊ'}
                      </div>
                      <div className="bubble-text">
                        <p>{message.content}</p>
                      </div>
                    </article>
                  ))}
                  <div ref={logEndRef} />
                </div>

                <div className="command-stack">
                  <div className="mode-strip">
                    <div className="mode-tabs" role="tablist" aria-label="Modo do agente">
                      {[
                        { id: 'direct', label: 'DIRECT', icon: Zap },
                        { id: 'council', label: 'COUNCIL', icon: Users },
                        { id: 'team', label: 'TEAM', icon: BrainCircuit },
                        { id: 'decision_room', label: 'DECISION', icon: Gavel }
                      ].map(mode => (
                        <button
                          type="button"
                          className={chatMode === mode.id ? 'active' : ''}
                          key={mode.id}
                          onClick={() => setChatMode(mode.id)}
                          title={`Usar modo ${mode.label}`}
                        >
                          <mode.icon size={14} />
                          <span>{mode.label}</span>
                        </button>
                      ))}
                    </div>
                    <em>{getModeLabel(chatMode, observatory)}</em>
                  </div>
                  <form className="command-line" onSubmit={sendMessage}>
                    <span>&gt;</span>
                    <input
                      value={input}
                      onChange={event => setInput(event.target.value)}
                      placeholder={getPlaceholder(chatMode)}
                      autoComplete="off"
                    />
                    <button type="submit" disabled={isSending} title="Enviar comando">
                      <Send size={16} />
                    </button>
                  </form>
                </div>
              </section>

              <aside className="right-panel">
                <div className="tool-list">
                  {tools.map(tool => (
                    <div className="tool-row" key={tool.label}>
                      <tool.icon size={15} />
                      <span>{tool.label}</span>
                      <strong>{tool.state}</strong>
                    </div>
                  ))}
                </div>

                <LiveTimeline events={liveEvents} selectedRun={selectedRun} isLoadingRun={isLoadingRun} />

                <RecentRuns
                  runs={observatory?.recentRuns || []}
                  selectedRunId={selectedRunId}
                  onSelect={loadRun}
                />
              </aside>
            </section>
          )}

          {/* VIEW: MEMORY STUDIO */}
          {currentView === 'memory' && (
            <section className="memory-studio-grid">
              <div className="studio-sidebar glass-panel">
                <div className="sidebar-section">
                  <h3>Criar Nova Memória</h3>
                  <form onSubmit={handleSaveMemory} className="studio-form">
                    <textarea
                      placeholder="Ex: Nautilus deve usar Laravel nas tarefas de backend..."
                      value={newMemoryText}
                      onChange={e => setNewMemoryText(e.target.value)}
                      required
                    />
                    <input
                      type="text"
                      placeholder="tags, separadas, por vírgula"
                      value={newMemoryTags}
                      onChange={e => setNewMemoryTags(e.target.value)}
                    />
                    <button type="submit" className="action-btn glow-btn">
                      <Plus size={16} /> Salvar Memória
                    </button>
                  </form>
                </div>

                <div className="sidebar-section">
                  <h3>Filtro e Busca</h3>
                  <div className="search-box">
                    <Search size={16} />
                    <input
                      type="text"
                      placeholder="Pesquisar memórias ou tags..."
                      value={searchMemory}
                      onChange={e => setSearchMemory(e.target.value)}
                    />
                  </div>
                </div>

                {selectedMemoryHistory && (
                  <div className="sidebar-section history-panel">
                    <div className="section-header">
                      <h3>Histórico de Uso</h3>
                      <button onClick={() => setSelectedMemoryHistory(null)}>
                        <X size={14} />
                      </button>
                    </div>
                    <div className="memory-info-mini">
                      <p>"{selectedMemoryHistory.text}"</p>
                    </div>
                    <div className="history-list">
                      {selectedMemoryHistory.history.length === 0 ? (
                        <p className="no-history">Esta memória ainda não foi acionada em respostas.</p>
                      ) : (
                        selectedMemoryHistory.history.map((h, i) => (
                          <div key={i} className="history-item">
                            <div className="history-header">
                              <span className="similarity-badge">
                                Sim: {h.similarity ? `${Math.round(h.similarity * 100)}%` : 'KW'}
                              </span>
                              <span className="history-date">
                                {new Date(h.started_at).toLocaleString('pt-BR')}
                              </span>
                            </div>
                            <p className="history-prompt"><b>Pergunta:</b> "{h.user_input}"</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="studio-main glass-panel">
                <div className="studio-header">
                  <h2>Memórias Cadastradas ({filteredMemories.length})</h2>
                  <button onClick={loadMemories} className="refresh-btn" title="Atualizar Lista">
                    <RefreshCw size={15} />
                  </button>
                </div>

                <div className="memory-cards-grid">
                  {filteredMemories.map(memory => (
                    <article key={memory.id} className={`memory-card ${memory.pinned ? 'pinned' : ''}`}>
                      <div className="card-top">
                        <span className="card-date">
                          Criado: {new Date(memory.created_at).toLocaleDateString('pt-BR')}
                        </span>
                        <div className="card-actions">
                          <button
                            onClick={() => handleTogglePinMemory(memory)}
                            className={`action-icon-btn pin-btn ${memory.pinned ? 'active' : ''}`}
                            title={memory.pinned ? 'Desafixar Memória' : 'Fixar Memória Importante'}
                          >
                            <Pin size={14} />
                          </button>
                          <button
                            onClick={() => setEditingMemory(memory)}
                            className="action-icon-btn edit-btn"
                            title="Editar Memória"
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteMemory(memory.id)}
                            className="action-icon-btn delete-btn"
                            title="Apagar Memória"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      <div className="card-body">
                        {editingMemory?.id === memory.id ? (
                          <form onSubmit={handleUpdateMemory} className="edit-memory-form">
                            <textarea
                              value={editingMemory.text}
                              onChange={e => setEditingMemory({ ...editingMemory, text: e.target.value })}
                            />
                            <div className="edit-actions">
                              <button type="submit" className="save-mini">Salvar</button>
                              <button type="button" className="cancel-mini" onClick={() => setEditingMemory(null)}>Cancelar</button>
                            </div>
                          </form>
                        ) : (
                          <p className="memory-text">{memory.text}</p>
                        )}
                      </div>

                      <div className="card-bottom">
                        <div className="tags-row">
                          {memory.tags.map(t => (
                            <span key={t} className="tag-badge">#{t}</span>
                          ))}
                        </div>

                        <button
                          onClick={() => handleViewMemoryHistory(memory)}
                          className="history-trigger"
                          disabled={loadingHistoryId === memory.id}
                        >
                          <History size={12} />
                          {loadingHistoryId === memory.id ? 'Carregando...' : 'Histórico de uso'}
                        </button>
                      </div>
                    </article>
                  ))}

                  {filteredMemories.length === 0 && (
                    <div className="empty-state">
                      <Brain size={48} className="muted-icon" />
                      <p>Nenhuma memória encontrada.</p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* VIEW: PLANNER */}
          {currentView === 'planner' && (
            <section className="planner-grid">

              {/* Planner Sidebar: Filter by projects, project detail, notes */}
              <div className="planner-sidebar glass-panel">
                <div className="sidebar-section">
                  <div className="header-row">
                    <h3>Projetos</h3>
                    <button className="icon-btn" onClick={() => setShowNewProjectForm(true)} title="Novo Projeto">
                      <Plus size={16} />
                    </button>
                  </div>

                  <div className="project-list">
                    <button
                      type="button"
                      className={`project-tab-btn ${selectedProjectId === 'all' ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedProjectId('all');
                        setSelectedProjectDetails(null);
                      }}
                    >
                      <FolderOpen size={16} />
                      <span>Todos os Projetos</span>
                      <strong>{tasks.length}</strong>
                    </button>

                    {projects.map(proj => (
                      <button
                        key={proj.id}
                        type="button"
                        className={`project-tab-btn ${selectedProjectId === proj.id ? 'active' : ''}`}
                        onClick={() => {
                          setSelectedProjectId(proj.id);
                          loadProjectDetails(proj.id);
                        }}
                      >
                        <span className={`status-dot ${proj.status.replace(/\s+/g, '-').toLowerCase()}`} />
                        <span>{proj.name}</span>
                        <strong>{proj.taskCount}</strong>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Show Selected Project Details & Notes */}
                {selectedProjectDetails && (
                  <div className="selected-project-panel">
                    <div className="proj-header">
                      <div>
                        <h2>{selectedProjectDetails.name}</h2>
                        <span className={`status-pill ${selectedProjectDetails.status.toLowerCase()}`}>
                          {selectedProjectDetails.status}
                        </span>
                      </div>
                      <div className="proj-actions">
                        <button onClick={() => setEditingProject(selectedProjectDetails)} title="Editar Projeto">
                          <Edit size={14} />
                        </button>
                        <button className="danger" onClick={() => handleDeleteProject(selectedProjectDetails.id)} title="Excluir Projeto">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    <p className="proj-desc">{selectedProjectDetails.description || 'Sem descrição cadastrada.'}</p>

                    <div className="notes-section">
                      <h3>Requisitos e Anotações</h3>
                      <form onSubmit={handleAddProjectNote} className="note-form">
                        <input
                          type="text"
                          placeholder="Adicionar requisito do projeto..."
                          value={newNoteContent}
                          onChange={e => setNewNoteContent(e.target.value)}
                        />
                        <button type="submit"><Plus size={14} /></button>
                      </form>

                      <div className="notes-list">
                        {(selectedProjectDetails.notes || []).map(note => (
                          <div key={note.id} className="note-item">
                            <p>{note.content}</p>
                            <button onClick={() => handleDeleteProjectNote(note.id)}>
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                        {(!selectedProjectDetails.notes || selectedProjectDetails.notes.length === 0) && (
                          <p className="empty-text">Sem anotações registradas.</p>
                        )}
                      </div>
                    </div>

                    <div className="history-section">
                      <h3>Alterações Recentes</h3>
                      <div className="history-timeline">
                        {(selectedProjectDetails.history || []).slice(0, 5).map(h => (
                          <div key={h.id} className="history-log">
                            <span className="log-time">{new Date(h.created_at).toLocaleDateString('pt-BR')}</span>
                            <p>{h.change_description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Kanban & Tasks Stage */}
              <div className="planner-main glass-panel">
                <div className="planner-controls-row">
                  <div className="search-task-box">
                    <Search size={16} />
                    <input
                      type="text"
                      placeholder="Pesquisar tarefas..."
                      value={searchTask}
                      onChange={e => setSearchTask(e.target.value)}
                    />
                  </div>

                  <div className="filters-group">
                    <div className="filter-pill">
                      <Filter size={12} />
                      <select value={taskPriorityFilter} onChange={e => setTaskPriorityFilter(e.target.value)}>
                        <option value="all">Prioridade: Todas</option>
                        <option value="alta">Alta</option>
                        <option value="media">Média</option>
                        <option value="baixa">Baixa</option>
                      </select>
                    </div>

                    <button className="action-btn glow-btn" onClick={() => setShowNewTaskForm(true)}>
                      <Plus size={16} /> Nova Tarefa
                    </button>
                  </div>
                </div>

                <KanbanBoard
                  columns={kanbanColumns}
                  onMoveTask={moveTaskToColumn}
                  onOpenTask={task => {
                    loadTaskDetails(task.id);
                    setShowTaskDetailModal(true);
                  }}
                  onEditTask={task => setEditingTask(task)}
                  onDeleteTask={handleDeleteTask}
                />

              </div>

            </section>
          )}

        </div>

        {/* MODAL: EDIT MEMORY/PROJECT/TASK FORMS */}
        {editingProject && (
          <div className="modal-overlay">
            <div className="modal-content glass-panel">
              <div className="modal-header">
                <h2>Editar Projeto</h2>
                <button onClick={() => setEditingProject(null)}><X size={18} /></button>
              </div>
              <form onSubmit={handleUpdateProject} className="modal-form">
                <label>Nome do Projeto
                  <input
                    type="text"
                    value={editingProject.name}
                    onChange={e => setEditingProject({ ...editingProject, name: e.target.value })}
                    required
                  />
                </label>
                <label>Descrição
                  <textarea
                    value={editingProject.description || ''}
                    onChange={e => setEditingProject({ ...editingProject, description: e.target.value })}
                  />
                </label>
                <label>Status do Projeto
                  <select
                    value={editingProject.status}
                    onChange={e => setEditingProject({ ...editingProject, status: e.target.value })}
                  >
                    <option value="Planos">Planos</option>
                    <option value="Em andamento">Em andamento</option>
                    <option value="Concluído">Concluído</option>
                  </select>
                </label>
                <button type="submit" className="action-btn glow-btn">Salvar Alterações</button>
              </form>
            </div>
          </div>
        )}

        {editingTask && (
          <div className="modal-overlay">
            <div className="modal-content glass-panel">
              <div className="modal-header">
                <h2>Editar Tarefa</h2>
                <button onClick={() => setEditingTask(null)}><X size={18} /></button>
              </div>
              <form onSubmit={handleUpdateTask} className="modal-form">
                <label>Título da Tarefa
                  <input
                    type="text"
                    value={editingTask.title}
                    onChange={e => setEditingTask({ ...editingTask, title: e.target.value })}
                    required
                  />
                </label>
                <label>Descrição
                  <textarea
                    value={editingTask.description || ''}
                    onChange={e => setEditingTask({ ...editingTask, description: e.target.value })}
                  />
                </label>
                <label>Projeto Relacionado
                  <select
                    value={editingTask.project_id || ''}
                    onChange={e => setEditingTask({ ...editingTask, project_id: e.target.value || null })}
                  >
                    <option value="">Nenhum Projeto</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </label>
                <div className="form-row">
                  <label>Data Agendada
                    <input
                      type="date"
                      value={editingTask.scheduled_date || ''}
                      onChange={e => setEditingTask({ ...editingTask, scheduled_date: e.target.value || null })}
                    />
                  </label>
                  <label>Prazo Final
                    <input
                      type="date"
                      value={editingTask.due_date || ''}
                      onChange={e => setEditingTask({ ...editingTask, due_date: e.target.value || null })}
                    />
                  </label>
                </div>
                <div className="form-row">
                  <label>Prioridade
                    <select
                      value={editingTask.priority}
                      onChange={e => setEditingTask({ ...editingTask, priority: e.target.value })}
                    >
                      <option value="baixa">Baixa</option>
                      <option value="media">Média</option>
                      <option value="alta">Alta</option>
                    </select>
                  </label>
                  <label>Status
                    <select
                      value={editingTask.status}
                      onChange={e => setEditingTask({ ...editingTask, status: e.target.value })}
                    >
                      <option value="Planos">Planos</option>
                      <option value="Em andamento">Em andamento</option>
                      <option value="Concluído">Concluído</option>
                    </select>
                  </label>
                </div>
                <button type="submit" className="action-btn glow-btn">Salvar Alterações</button>
              </form>
            </div>
          </div>
        )}

        {/* Modal: New Project */}
        {showNewProjectForm && (
          <div className="modal-overlay">
            <div className="modal-content glass-panel">
              <div className="modal-header">
                <h2>Adicionar Novo Projeto</h2>
                <button onClick={() => setShowNewProjectForm(false)}><X size={18} /></button>
              </div>
              <form onSubmit={handleCreateProject} className="modal-form">
                <label>Nome do Projeto
                  <input
                    type="text"
                    value={newProjName}
                    onChange={e => setNewProjName(e.target.value)}
                    placeholder="Ex: Nautilus 2.0"
                    required
                  />
                </label>
                <label>Descrição
                  <textarea
                    value={newProjDesc}
                    onChange={e => setNewProjDesc(e.target.value)}
                    placeholder="Objetivo principal e detalhes do projeto..."
                  />
                </label>
                <label>Status Inicial
                  <select value={newProjStatus} onChange={e => setNewProjStatus(e.target.value)}>
                    <option value="Planos">Planos</option>
                    <option value="Em andamento">Em andamento</option>
                    <option value="Concluído">Concluído</option>
                  </select>
                </label>
                <button type="submit" className="action-btn glow-btn">Criar Projeto</button>
              </form>
            </div>
          </div>
        )}

        {/* Modal: New Task */}
        {showNewTaskForm && (
          <div className="modal-overlay">
            <div className="modal-content glass-panel">
              <div className="modal-header">
                <h2>Adicionar Nova Tarefa</h2>
                <button onClick={() => setShowNewTaskForm(false)}><X size={18} /></button>
              </div>
              <form onSubmit={handleCreateTask} className="modal-form">
                <label>Título da Tarefa
                  <input
                    type="text"
                    value={newTaskTitle}
                    onChange={e => setNewTaskTitle(e.target.value)}
                    placeholder="Ex: Implementar login do app..."
                    required
                  />
                </label>
                <label>Descrição
                  <textarea
                    value={newTaskDesc}
                    onChange={e => setNewTaskDesc(e.target.value)}
                    placeholder="O que deve ser feito nesta tarefa..."
                  />
                </label>
                <label>Projeto
                  <select value={newTaskProjId} onChange={e => setNewTaskProjId(e.target.value)}>
                    <option value="">Sem Projeto (Tarefa Solta)</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </label>
                <div className="form-row">
                  <label>Data Agendada
                    <input
                      type="date"
                      value={newTaskScheduled}
                      onChange={e => setNewTaskScheduled(e.target.value)}
                    />
                  </label>
                  <label>Prazo Final
                    <input
                      type="date"
                      value={newTaskDue}
                      onChange={e => setNewTaskDue(e.target.value)}
                    />
                  </label>
                </div>
                <div className="form-row">
                  <label>Prioridade
                    <select value={newTaskPriority} onChange={e => setNewTaskPriority(e.target.value)}>
                      <option value="baixa">Baixa</option>
                      <option value="media">Média</option>
                      <option value="alta">Alta</option>
                    </select>
                  </label>
                  <label>Status
                    <select value={newTaskStatus} onChange={e => setNewTaskStatus(e.target.value)}>
                      <option value="Planos">Planos</option>
                      <option value="Em andamento">Em andamento</option>
                      <option value="Concluído">Concluído</option>
                    </select>
                  </label>
                </div>
                <button type="submit" className="action-btn glow-btn">Criar Tarefa</button>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Task Detail, Subtasks & History */}
        {showTaskDetailModal && selectedTaskDetails && (
          <div className="modal-overlay">
            <div className="modal-content glass-panel task-detail-modal">
              <div className="modal-header">
                <div>
                  <span className={`priority-badge ${selectedTaskDetails.priority}`}>{selectedTaskDetails.priority}</span>
                  <h2>{selectedTaskDetails.title}</h2>
                  {selectedTaskDetails.project && (
                    <span className="project-tag-large">{selectedTaskDetails.project.name}</span>
                  )}
                </div>
                <button onClick={() => {
                  setShowTaskDetailModal(false);
                  setSelectedTaskDetails(null);
                }}><X size={18} /></button>
              </div>

              <div className="modal-body-split">
                <div className="modal-body-main">
                  <div className="detail-section">
                    <h3>Descrição</h3>
                    <p className="task-detail-desc">{selectedTaskDetails.description || 'Sem descrição informada.'}</p>
                  </div>

                  <div className="detail-section">
                    <h3>Subtarefas</h3>
                    <form onSubmit={handleAddSubtask} className="subtask-add-form">
                      <input
                        type="text"
                        placeholder="Adicionar subtarefa..."
                        value={newSubtaskTitle}
                        onChange={e => setNewSubtaskTitle(e.target.value)}
                      />
                      <button type="submit"><Plus size={14} /></button>
                    </form>
                    <div className="subtask-list-box">
                      {selectedTaskDetails.subtasks?.map(sub => (
                        <div key={sub.id} className="subtask-item-row">
                          <button onClick={() => handleToggleSubtask(sub)} className="check-btn">
                            {sub.status === 'concluido' ? <CheckCircle2 size={16} className="checked-icon" /> : <Circle size={16} />}
                          </button>
                          <span className={sub.status === 'concluido' ? 'completed-text' : ''}>{sub.title}</span>
                          <button onClick={() => handleDeleteSubtask(sub.id)} className="delete-btn">
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                      {(!selectedTaskDetails.subtasks || selectedTaskDetails.subtasks.length === 0) && (
                        <p className="empty-text">Nenhuma subtarefa registrada.</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="modal-body-sidebar">
                  <div className="detail-metadata">
                    <div className="meta-row">
                      <span>Status:</span>
                      <strong className={`status-text ${selectedTaskDetails.status.toLowerCase()}`}>{selectedTaskDetails.status}</strong>
                    </div>
                    <div className="meta-row">
                      <span>Agendado:</span>
                      <strong>{selectedTaskDetails.scheduled_date ? new Date(selectedTaskDetails.scheduled_date).toLocaleDateString('pt-BR') : 'Sem data'}</strong>
                    </div>
                    <div className="meta-row">
                      <span>Prazo:</span>
                      <strong>{selectedTaskDetails.due_date ? new Date(selectedTaskDetails.due_date).toLocaleDateString('pt-BR') : 'Nenhum'}</strong>
                    </div>
                  </div>

                  <div className="detail-section history-section-task">
                    <h3>Histórico de Atualizações</h3>
                    <div className="task-history-timeline">
                      {(selectedTaskDetails.history || []).map(h => (
                        <div key={h.id} className="task-history-log">
                          <span className="log-time">{new Date(h.created_at).toLocaleDateString('pt-BR')}</span>
                          <p>{h.change_description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}

// Subcomponents helper
function RadarScope({ signal, level }) {
  return (
    <div className={`radar-scope ${level || ''}`} aria-label="Radar de atividade">
      <div className="radar-ring ring-a" />
      <div className="radar-ring ring-b" />
      <div className="radar-sweep" />
      <div className="radar-cross horizontal" />
      <div className="radar-cross vertical" />
      <span>{signal}</span>
    </div>
  );
}

function CoreOrb({ active, mini }) {
  return (
    <div className={`core-orb ${active ? 'active' : ''} ${mini ? 'mini' : ''}`} aria-label="Nucleo Nautilus">
      <div className="outer-ticks" />
      <div className="pulse-ring ring-one" />
      <div className="pulse-ring ring-two" />
      <div className="inner-glow" />
    </div>
  );
}

function SystemMetrics({ system }) {
  const cpuLoad = system?.cpu?.loadPercent ?? 0;
  const memoryLoad = system?.memory?.usedPercent ?? 0;
  const primaryDisk = system?.storage?.[0];

  return (
    <div className="metric-block">
      <p>SYSTEM STATUS</p>
      <MetricLine icon={Cpu} label="CPU" value={`${cpuLoad || 0}%`} />
      <div className="bar">
        <i style={{ width: `${clampPercent(cpuLoad)}%` }} />
      </div>
      <MetricLine icon={MemoryStick} label="RAM" value={`${memoryLoad || 0}%`} />
      <div className="bar thin">
        <i style={{ width: `${clampPercent(memoryLoad)}%` }} />
      </div>
      <MetricLine
        icon={ShieldCheck}
        label="TEMP"
        value={system?.cpu?.temperatureC ? `${system.cpu.temperatureC}C` : 'indisponivel'}
      />
      <MetricLine
        icon={HardDrive}
        label={primaryDisk?.mount || 'DISCO'}
        value={primaryDisk ? `${primaryDisk.usedPercent}% de ${formatBytes(primaryDisk.sizeBytes)}` : '...'}
      />
      {system?.storage?.slice(1, 4).map(disk => (
        <MetricLine
          icon={HardDrive}
          key={`${disk.filesystem}-${disk.mount}`}
          label={disk.mount || disk.filesystem}
          value={`${disk.usedPercent}% de ${formatBytes(disk.sizeBytes)}`}
        />
      ))}
    </div>
  );
}

function MetricLine({ icon: Icon, label, value }) {
  return (
    <span className="metric-line">
      <Icon size={13} />
      <b>{label}</b>
      <em>{value}</em>
    </span>
  );
}

function ObservatorySummary({ observatory, onRefresh }) {
  const stats = observatory?.stats;

  return (
    <div className="observatory-summary">
      <div className="section-head">
        <span>BLACK BOX</span>
        <button type="button" onClick={onRefresh} title="Atualizar observability">
          <RefreshCw size={13} />
        </button>
      </div>
      <div className="ledger-grid">
        <MetricPill icon={Activity} label="Runs" value={stats?.totalRuns ?? 0} />
        <MetricPill icon={Route} label="Tools" value={stats?.topTools?.[0]?.count ?? 0} />
        <MetricPill icon={ShieldCheck} label="Blocks" value={stats?.safeModeBlocks ?? 0} />
        <MetricPill icon={Clock3} label="Avg" value={`${stats?.avgElapsedMs ?? 0}ms`} />
      </div>
      <div className="tool-ranking">
        {(stats?.topTools || []).slice(0, 3).map(tool => (
          <span key={tool.toolName}>
            <b>{tool.toolName}</b>
            <em>{tool.count}x</em>
          </span>
        ))}
        {!stats?.topTools?.length && <small>Nenhuma tool auditada ainda.</small>}
      </div>
    </div>
  );
}

function MetricPill({ icon: Icon, label, value }) {
  return (
    <span className="metric-pill">
      <Icon size={13} />
      <b>{label}</b>
      <em>{value}</em>
    </span>
  );
}

function AgentTeamRoster({ observatory }) {
  const agents = observatory?.agentTeam?.agents || [];

  return (
    <div className="agent-roster">
      <div className="section-head">
        <span>AGENT TEAM</span>
        <strong>{agents.length}</strong>
      </div>
      <div className="agent-list">
        {agents.slice(0, 5).map(agent => (
          <span key={agent.id}>
            <b>{agent.shortName}</b>
            <em>{agent.specialty}</em>
          </span>
        ))}
        {observatory?.agentTeam?.decisionAgent && (
          <span>
            <b>{observatory.agentTeam.decisionAgent.shortName}</b>
            <em>{observatory.agentTeam.decisionAgent.specialty}</em>
          </span>
        )}
        {agents.length === 0 && <small>Subagentes aguardando Observatory.</small>}
      </div>
    </div>
  );
}

function LiveTimeline({ events, selectedRun, isLoadingRun }) {
  const timeline = selectedRun?.events?.length ? [...selectedRun.events].reverse().slice(0, 18) : events;

  return (
    <section className="timeline-panel">
      <div className="section-head">
        <span>{selectedRun ? 'RUN REPLAY' : 'LIVE TRACE'}</span>
        <strong>{isLoadingRun ? 'LOADING' : `${timeline.length} eventos`}</strong>
      </div>
      <div className="timeline-list">
        {timeline.length === 0 && (
          <div className="empty-trace">
            <BrainCircuit size={16} />
            <span>Aguardando a proxima execucao auditavel.</span>
          </div>
        )}
        {timeline.map(event => (
          <article className="trace-event" key={`${event.id}-${event.eventType}`}>
            <i className={event.eventType?.includes('failed') ? 'danger' : ''} />
            <div>
              <span>{event.eventType}</span>
              <p>{event.title || event.summary}</p>
              {event.summary && event.title !== event.summary && <em>{event.summary}</em>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function RecentRuns({ runs, selectedRunId, onSelect }) {
  return (
    <section className="recent-runs">
      <div className="section-head">
        <span>RECENT RUNS</span>
        <strong>{runs.length}</strong>
      </div>
      <div className="run-list">
        {runs.slice(0, 5).map(run => (
          <button
            type="button"
            className={selectedRunId === run.id ? 'selected' : ''}
            key={run.id}
            onClick={() => onSelect(run.id)}
            title="Abrir replay da run"
          >
            <GitBranch size={13} />
            <span>{run.mode}</span>
            <b>{run.status}</b>
            {run.safeModeCount > 0 && <AlertTriangle size={12} />}
          </button>
        ))}
        {runs.length === 0 && <small>Nenhuma execucao registrada ainda.</small>}
      </div>
    </section>
  );
}

function ProblemRadarPanel({ radar }) {
  const issues = radar?.issues?.slice(0, 6) || [];

  return (
    <div className="radar-panel">
      <div className="section-head">
        <span>PROBLEM RADAR</span>
        <strong>{radar?.level?.toUpperCase() || '...'}</strong>
      </div>
      <div className="radar-issues">
        {issues.length === 0 && <small>Varredura limpa ou aguardando API.</small>}
        {issues.map(issue => (
          <article className={`radar-issue ${issue.severity}`} key={issue.id}>
            <AlertTriangle size={12} />
            <div>
              <b>{issue.message}</b>
              {issue.path && <em>{issue.path}</em>}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function AutomationsPanel({ automations, report, isRunning, onRun }) {
  return (
    <div className="automations-panel">
      <div className="section-head">
        <span>ROTINAS</span>
        <CalendarClock size={13} />
      </div>
      <div className="automation-list">
        {automations.slice(0, 4).map(item => (
          <button
            type="button"
            key={item.id}
            disabled={isRunning}
            onClick={() => onRun(item.id)}
            title={item.description}
          >
            <Play size={12} />
            <span>{item.name}</span>
            {item.shouldRunNow && <em>due</em>}
          </button>
        ))}
        {automations.length === 0 && <small>Nenhuma rotina carregada.</small>}
      </div>
      {report && (
        <div className="automation-preview">
          <ListChecks size={12} />
          <p>{report.preview || report.text?.slice(0, 180) || report.name}</p>
        </div>
      )}
    </div>
  );
}

function getPlaceholder(mode) {
  if (mode === 'decision_room') return 'Decisao tecnica para Architect, Security, Critic e Decision...';
  if (mode === 'team') return 'Problema para o Agent Team analisar, votar e decidir...';
  if (mode === 'council') return 'Decisao para dois agentes deliberarem...';
  return 'Comando de voz ou texto...';
}

function getModeLabel(mode, observatory) {
  if (mode === 'decision_room') {
    const names = observatory?.decisionRoom?.agents?.map(agent => agent.shortName).join(', ');
    return names ? `${names} + DECISION` : 'Decision Room';
  }
  if (mode === 'team') return `${observatory?.agentTeam?.agents?.length || 5} subagentes + Decision`;
  if (mode === 'council') return observatory?.council?.peerModel || 'peer model local';
  return 'Nautilus central';
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function formatBytes(value) {
  if (!Number.isFinite(value)) return '...';
  const units = ['B', 'GB', 'TB'];
  const gb = value / 1024 ** 3;
  if (gb >= 1024) return `${Math.round((gb / 1024) * 10) / 10} TB`;
  return `${Math.round(gb)} GB`;
}

createRoot(document.getElementById('root')).render(<App />);
