@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title Nautilus - Encerrar

echo [Nautilus] Encerrando API, interface e Electron...

call :KillPort 3333
call :KillPort 5173

taskkill /FI "WINDOWTITLE eq Nautilus - UI*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Nautilus Launcher*" /F >nul 2>&1

for /f "tokens=2" %%p in ('wmic process where "name='electron.exe'" get ProcessId^,CommandLine 2^>nul ^| findstr /i "Nautilus"') do (
  taskkill /PID %%p /F /T >nul 2>&1
)

for /f "tokens=2" %%p in ('wmic process where "name='node.exe'" get ProcessId^,CommandLine 2^>nul ^| findstr /i "Nautilus"') do (
  taskkill /PID %%p /F /T >nul 2>&1
)

echo [Nautilus] Processos finalizados.
timeout /t 2 /nobreak >nul
endlocal
exit /b 0

:KillPort
set "PORT=%~1"
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
  echo [Nautilus] Encerrando PID %%a na porta %PORT%
  taskkill /PID %%a /F /T >nul 2>&1
)
exit /b 0
