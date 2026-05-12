@echo off
setlocal

set "MODEL=%GAP_OLLAMA_MODEL%"
if "%MODEL%"=="" set "MODEL=llama3.2"

echo.
echo === GAP Ollama Setup ===
echo Model: %MODEL%
echo.

where ollama >nul 2>nul
if errorlevel 1 (
  echo ERROR: Ollama is not installed or not on PATH.
  echo Download and install Ollama for Windows:
  echo https://ollama.com/download/windows
  echo.
  pause
  exit /b 1
)

echo [1/2] Starting Ollama in a background window...
start "Ollama Serve" /min cmd /c "ollama serve"

echo Waiting for Ollama to start...
powershell -NoProfile -ExecutionPolicy Bypass -Command "for ($i=0; $i -lt 20; $i++) { try { Invoke-RestMethod http://127.0.0.1:11434/api/tags | Out-Null; exit 0 } catch { Start-Sleep -Milliseconds 500 } }; exit 1"
if errorlevel 1 (
  echo ERROR: Ollama did not respond on http://127.0.0.1:11434.
  echo Try running: ollama serve
  pause
  exit /b 1
)

echo [2/2] Pulling model %MODEL%...
ollama pull %MODEL%
if errorlevel 1 (
  echo ERROR: ollama pull failed.
  pause
  exit /b 1
)

echo.
echo Ollama is ready.
echo GAP will use Ollama first, then Puter if Ollama is unavailable.
echo.
pause
