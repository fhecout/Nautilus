# Nautilus AI Agent

Nautilus is a lightweight, local AI assistant designed to run fully offline using **Ollama** and Node.js. It features a modular tool execution system, a secure verification system ("Safe Mode") for destructive operations, persistent vector embeddings (RAG) using Node's native SQLite driver, and a futuristic sci-fi terminal interface built with Electron and React.

---

## 🚀 Key Features

- **Local-First Execution**: Fully offline assistant powered by Ollama models (e.g., `gemma4`, `qwen2.5`, `deepseek-r1`).
- **Real-Time Token Streaming**: Real-time token rendering on the React frontend using Server-Sent Events (SSE).
- **Native SQLite Integration**: Embedded database operations using Node.js's native `node:sqlite` driver (no external binary or Python dependency).
- **RAG Semantic Memory**: Persistent agent memory stored in SQLite, retrieving records via **Cosine Similarity** vector matching (using `nomic-embed-text` embeddings), falling back to keyword search if offline.
- **Secure Verification (Safe Mode)**: Real-time SQL syntax analysis and command evaluation blocking destructive commands (e.g., file deletions or unsafe database executions) until the user enters a specific verification phrase.
- **Futuristic Terminal UI**: Glassmorphic, retro-futuristic console dashboard built in React and wrapped inside Electron with real-time hardware telemetry (CPU, RAM, GPU, storage metrics).
- **Electron Web Scraper**: An intelligent web scraper that reuses Electron's built-in Chromium instance to render and scrape Single Page Applications (SPAs) like React or Vue websites dynamically.

---

## 📂 Project Structure

```
├── config/                  # Agent settings & environment configuration
├── data/                    # SQLite database storage directory
├── electron/                # Electron main and preload window wrappers
│   ├── main.js              # Electron lifecycle, API starter, and IPC handlers
│   └── preload.js           # Secure IPC bridge exposing window controls
├── logs/                    # System activity and web scraping logs
├── scripts/                 # System automation and utility scripts
├── src/                     # Core codebase
│   ├── core/                # Agent core logic and state handlers
│   │   ├── Agent.js         # Core Ollama client wrapper & tool orchestrator
│   │   ├── env.js           # Environment configuration loader
│   │   ├── memory.js        # SQLite memory CRUD & Semantic Vector Similarity (RAG)
│   │   ├── safe_mode.js     # Verification checker for destructive commands
│   │   ├── ScraperLogs.js   # Structured logger for scraping results
│   │   └── systemInfo.js    # Node system telemetry (cpu, memory, storage)
│   ├── ui/                  # React Frontend files
│   │   ├── main.jsx         # Retro terminal layout with real-time SSE stream reader
│   │   └── styles.css       # Core styling & futuristic glassmorphism CSS
│   ├── tools/               # Modular agent tool directory
│   │   ├── archiveManager.js # Archive utility wrapping compression actions
│   │   ├── convert_file.js  # File converter (sharp & pdfkit integration)
│   │   ├── fileManager.js   # File operations (read, write, delete)
│   │   ├── fileSearch.js    # High-performance local search with depth-limiting (maxDepth)
│   │   ├── gmailReader.js   # Google Mail API integrations
│   │   ├── googleSearch.js  # Web search aggregator (Google HTML Scraper & DuckDuckGo RSS)
│   │   └── webScraper.js    # Dynamic Chromium DOM scraper (Electron) + static CheerIO fallback
│   ├── index.js             # CLI Entrypoint for the agent
│   └── server.js            # Express API Server with Event Stream (SSE) routes
└── tests/                   # Automated Node.js unit tests
```

---

## 🛠️ Tool Ecosystem

Nautilus's architecture isolates capabilities in modular tool files within `src/tools/`. The agent dynamically queries and executes these tools:

1. **`manage_files`**: Read, write, list, move, or delete local files (restricted by Safe Mode).
2. **`find_local_files`**: Fast local search by name or file contents, featuring a `maxDepth` limit and exclusions for common build folders (`node_modules`, `.next`, `dist`).
3. **`convert_file`**: Node-native file conversion. Converts images (JPG/PNG/WEBP/GIF/TIFF) using `sharp`, text files to PDF using `pdfkit`, and PDFs to text using `pdf-parse`.
4. **`manage_archive`**: Compress and extract ZIP files.
5. **`manage_sqlite`**: Fully native SQLite query and schema execution tool powered by `node:sqlite`.
6. **`manage_memory`**: Stores information dynamically in SQLite, generating and comparing vectors via local cosine similarity embeddings.
7. **`scrape_web_site`**: Crawls pages dynamically. Spawns an offscreen Electron window to execute JS on SPAs (Vite, React, Vue), falling back to `cheerio` if running outside Electron.
8. **`search_google`**: Performs searches on Google Web, Google News RSS, and DuckDuckGo.
9. **`get_system_status`**: Queries local OS resources (CPU load, temperature, disk usage, active GPU details) using `systeminformation`.
10. **`get_system_time`**: Formatted system timezone query.
11. **`read_gmail`**: Interacts with the user's Gmail inbox using Google OAuth APIs.

---

## ⚙️ Requirements

- **Node.js**: `v22.5.0` or higher (mandatory for the native `node:sqlite` driver).
- **Ollama**: Installed and running locally.
- **Ollama Models**:
  - `nomic-embed-text` (for memory embeddings)
  - `gemma4:latest`, `qwen2.5:0.5b`, or any LLM of your choice (configured in `.env`)

---

## 🔧 Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/Nautilus.git
   cd Nautilus
   ```

2. **Install Node.js dependencies**:
   ```bash
   npm install
   ```

3. **Pull required models in Ollama**:
   ```bash
   ollama pull nomic-embed-text
   ollama pull qwen2.5:0.5b  # or another LLM of choice
   ```

4. **Setup Environment Variables**:
   Create a `.env` file in the root directory:
   ```env
   OLLAMA_HOST=http://127.0.0.1:11434
   OLLAMA_MODEL=qwen2.5:0.5b
   NAUTILUS_PORT=3333
   # Set D:\Ollama\models or appropriate path if customized
   OLLAMA_MODELS=D:\Ollama\models
   ```

---

## 🏁 How to Run

### Run the Desktop Electron App (Recommended)
This starts the Electron window, loads the Vite UI, and automatically spins up the background Express API server in a single command:
```bash
# Terminal 1: Run Vite UI Dev Server
npm run ui

# Terminal 2: Run Electron Desktop Shell
npm run desktop
```

### Run Standalone UI & Server
If you prefer running Nautilus in your standard web browser instead of the Electron desktop shell:
```bash
# Terminal 1: Start the backend API server
npm run server

# Terminal 2: Start the frontend Vite application
npm run ui
```
Open `http://127.0.0.1:5173` in your browser.

### Run in CLI Mode
Execute the agent directly inside your terminal using a Node readline interface:
```bash
npm start
```

---

## 🧪 Testing

Execute Node's built-in test runner to validate database consistency, memory vectors, and Safe Mode validations:
```bash
npm test
```
