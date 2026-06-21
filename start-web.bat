@echo off
setlocal

set "TOOL_WEB_ROOT=%~dp0"
set "TOOL_WEB_PORT=8000"
set "TOOL_API_PORT=8787"
set "TOOL_API_RATE_LIMIT_MAX=1000"
set "TOOL_API_RATE_LIMIT_WINDOW_MS=60000"

where python >nul 2>nul
if errorlevel 1 (
  echo Python was not found in PATH.
  echo Add Python to PATH, then run this file again.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found in PATH.
  echo Add Node.js to PATH, then run this file again.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "function Test-LocalPort([int]$port) { $client=$null; try { $client=[Net.Sockets.TcpClient]::new(); $async=$client.BeginConnect('127.0.0.1',$port,$null,$null); $open=$async.AsyncWaitHandle.WaitOne(250,$false); if ($open) { $client.EndConnect($async) }; return $open } catch { return $false } finally { if ($client) { $client.Close() } } }; $root=$env:TOOL_WEB_ROOT; $webPort=[int]$env:TOOL_WEB_PORT; $apiPort=[int]$env:TOOL_API_PORT; $apiScript=Join-Path $root 'server\mock-server.js'; if (-not (Test-LocalPort $apiPort)) { $env:MOCK_RATE_LIMIT_MAX_REQUESTS=$env:TOOL_API_RATE_LIMIT_MAX; $env:MOCK_RATE_LIMIT_WINDOW_MS=$env:TOOL_API_RATE_LIMIT_WINDOW_MS; Start-Process -FilePath 'node' -ArgumentList @($apiScript) -WorkingDirectory $root -WindowStyle Hidden; Start-Sleep -Milliseconds 1200 }; if (-not (Test-LocalPort $webPort)) { Start-Process -FilePath 'python' -ArgumentList @('-m','http.server',[string]$webPort,'--bind','127.0.0.1') -WorkingDirectory $root -WindowStyle Hidden; Start-Sleep -Milliseconds 800 }; Start-Process ('http://127.0.0.1:' + $webPort)"

if errorlevel 1 pause
