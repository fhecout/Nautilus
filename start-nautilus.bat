@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title Nautilus Launcher

if not exist "node_modules\" (
    echo [Nautilus] Instalando dependencias...
    call npm install
    if errorlevel 1 (
        echo [Nautilus] Falha no npm install.
        pause
        exit /b 1
    )
)

set "VITE_DEV_SERVER_URL=http://127.0.0.1:5173"

echo [Nautilus] Iniciando interface (Vite)...
start "Nautilus - UI" cmd /k "cd /d ""%~dp0"" && npm run ui"

echo [Nautilus] Aguardando Vite (%VITE_DEV_SERVER_URL%)...
timeout /t 5 /nobreak >nul

echo [Nautilus] Abrindo Electron (API em http://127.0.0.1:3333)...
echo [Nautilus] Ollama deve estar rodando com o modelo do .env
start "Nautilus" cmd /k "cd /d ""%~dp0"" && set VITE_DEV_SERVER_URL=%VITE_DEV_SERVER_URL% && set NAUTILUS_SEMANTIC_MEMORY=%NAUTILUS_SEMANTIC_MEMORY% && npx electron ."

echo.
echo [Nautilus] Iniciado. Para encerrar, feche a janela do Electron e a janela "Nautilus - UI".
echo [Nautilus] Alternativa no navegador: %VITE_DEV_SERVER_URL%
pause

endlocal
