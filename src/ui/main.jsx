import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Bot,
  Cpu,
  Database,
  FileSearch,
  HardDrive,
  Mail,
  MemoryStick,
  Mic,
  Power,
  Radar,
  Send,
  ShieldCheck,
  Volume2,
  Zap
} from 'lucide-react';
import './styles.css';

const API_URL = import.meta.env.VITE_NAUTILUS_API_URL || 'http://127.0.0.1:3333';

function App() {
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
  const logEndRef = useRef(null);

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
    const id = window.setInterval(loadSystem, 3000);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

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
  const primaryDisk = system?.storage?.[0];
  const radarSignal = Math.round(cpuLoad || memoryLoad || 0);

  async function sendMessage(event) {
    event.preventDefault();
    const message = input.trim();
    if (!message || isSending) return;

    setInput('');
    setIsSending(true);
    setMessages(current => [
      ...current,
      { role: 'user', content: message },
      { role: 'assistant', content: '' }
    ]);

    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message })
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
        buffer = lines.pop(); // Mantém o fragmento incompleto no buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const rawData = trimmed.slice(6);
          if (rawData === '[DONE]') break;

          try {
            const parsed = JSON.parse(rawData);
            if (parsed.error) throw new Error(parsed.error);

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
    }
  }

  return (
    <main className="shell">
      <div className="terminal-frame">
        <header className="topbar">
          <div>
            <div className="brand-row">
              <span className="brand-mark">N</span>
              <h1>NAUTILUS</h1>
            </div>
            <p className="system-line">SYSTEM.ONLINE / {status.model}</p>
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

        <section className="console-grid">
          <aside className="left-panel">
            <RadarScope signal={radarSignal} />
            <SystemMetrics system={system} />
          </aside>

          <section className="center-stage">
            <CoreOrb active={isSending} />
            <form className="command-line" onSubmit={sendMessage}>
              <span>&gt;</span>
              <input
                value={input}
                onChange={event => setInput(event.target.value)}
                placeholder="Comando de voz ou texto..."
                autoComplete="off"
              />
              <button type="submit" disabled={isSending} title="Enviar comando">
                <Send size={16} />
              </button>
            </form>
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

            <div className="conversation">
              {messages.map((message, index) => (
                <article className={`message ${message.role}`} key={`${message.role}-${index}`}>
                  <span>{message.role === 'assistant' ? 'NAUTILUS' : 'VOCE'}</span>
                  <p>{message.content}</p>
                </article>
              ))}
              <div ref={logEndRef} />
            </div>

            <div className="mini-core">
              <Bot size={18} />
              <span>AGENT CORE</span>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

function SystemMetrics({ system }) {
  const cpuLoad = system?.cpu?.loadPercent ?? 0;
  const memoryLoad = system?.memory?.usedPercent ?? 0;
  const primaryDisk = system?.storage?.[0];
  const gpu = system?.graphics?.[0];

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
      <MetricLine
        icon={Database}
        label="GPU"
        value={gpu?.model ? `${gpu.model}${gpu.temperatureC ? ` / ${gpu.temperatureC}C` : ''}` : 'nao detectada'}
      />
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

function RadarScope({ signal }) {
  return (
    <div className="radar-scope" aria-label="Radar de atividade">
      <div className="radar-ring ring-a" />
      <div className="radar-ring ring-b" />
      <div className="radar-sweep" />
      <div className="radar-cross horizontal" />
      <div className="radar-cross vertical" />
      <span>{signal}</span>
    </div>
  );
}

function CoreOrb({ active }) {
  return (
    <div className={`core-orb ${active ? 'active' : ''}`} aria-label="Nucleo Nautilus">
      <div className="outer-ticks" />
      <div className="pulse-ring ring-one" />
      <div className="pulse-ring ring-two" />
      <div className="inner-glow" />
    </div>
  );
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
