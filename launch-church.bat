@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install Node.js 18 or newer from https://nodejs.org/
  pause
  exit /b 1
)

if not exist node_modules\express (
  echo Installing website dependencies...
  call npm install
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

start "Grace and Truth server" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Process -FilePath node -ArgumentList 'server.js' -WorkingDirectory '%~dp0' -WindowStyle Hidden"
timeout /t 2 /nobreak >nul
start "Grace and Truth website" http://localhost:3000/login.html
endlocal
