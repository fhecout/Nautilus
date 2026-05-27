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
set "NAUTILUS_PORT=3333"

netstat -ano | findstr /R /C:":5173 .*LISTENING" >nul
if errorlevel 1 (
    echo [Nautilus] Iniciando interface Vite...
    start "Nautilus - UI" /min cmd /c "npm run ui"
) else (
    echo [Nautilus] Interface Vite ja esta online em %VITE_DEV_SERVER_URL%.
)

netstat -ano | findstr /R /C:":3333 .*LISTENING" >nul
if errorlevel 1 (
    echo [Nautilus] Iniciando API...
    start "Nautilus - API" /min cmd /c "npm run server"
) else (
    echo [Nautilus] API ja esta online em http://127.0.0.1:%NAUTILUS_PORT%.
)

echo [Nautilus] Aguardando servicos...
timeout /t 5 /nobreak >nul

echo [Nautilus] Abrindo aplicacao Electron...
echo [Nautilus] Ollama deve estar rodando com o modelo do .env
set VITE_DEV_SERVER_URL=%VITE_DEV_SERVER_URL%
npx electron .

echo.
echo [Nautilus] Electron encerrado. Use stop-nautilus.bat para fechar API e Vite em segundo plano.
endlocal
