@echo off
setlocal

set "ROOT=%~dp0.."
cd /d "%ROOT%"

echo.
echo === GAP Desktop Overlay Runner ===
echo Root: %CD%
echo.

where go >nul 2>nul
if errorlevel 1 (
  echo ERROR: Go is not installed or not on PATH.
  echo Install Go from https://go.dev/dl/
  pause
  exit /b 1
)

where flutter >nul 2>nul
if errorlevel 1 (
  echo ERROR: Flutter is not installed or not on PATH.
  echo Install Flutter from https://docs.flutter.dev/get-started/install/windows/desktop
  pause
  exit /b 1
)

if not exist "apps\desktop_overlay\pubspec.yaml" (
  echo ERROR: Could not find apps\desktop_overlay\pubspec.yaml.
  echo Run this script from inside the repository or keep it in scripts\.
  pause
  exit /b 1
)

echo [1/5] Fetching Flutter dependencies...
cd /d "%ROOT%\apps\desktop_overlay"
call flutter pub get
if errorlevel 1 (
  echo ERROR: flutter pub get failed.
  pause
  exit /b 1
)

echo.
echo [2/5] Building Flutter Windows overlay...
call flutter build windows
if errorlevel 1 (
  echo ERROR: flutter build windows failed.
  echo Run flutter doctor -v and fix any Windows desktop toolchain issues.
  pause
  exit /b 1
)

echo.
echo [3/5] Building bundled gapd.exe...
cd /d "%ROOT%"
call go build -o apps\desktop_overlay\build\windows\x64\runner\Release\gapd.exe ./cmd/gapd
if errorlevel 1 (
  echo ERROR: go build failed.
  pause
  exit /b 1
)

echo.
echo [4/5] Verifying release files...
set "RELEASE_DIR=%ROOT%\apps\desktop_overlay\build\windows\x64\runner\Release"
if not exist "%RELEASE_DIR%\gap_desktop_overlay.exe" (
  echo ERROR: gap_desktop_overlay.exe was not found.
  pause
  exit /b 1
)
if not exist "%RELEASE_DIR%\gapd.exe" (
  echo ERROR: gapd.exe was not found.
  pause
  exit /b 1
)

echo.
echo [5/5] Launching GAP Desktop Overlay...
cd /d "%RELEASE_DIR%"
start "GAP Desktop Overlay" "%RELEASE_DIR%\gap_desktop_overlay.exe"

echo.
echo GAP Desktop Overlay launched.
echo Release folder:
echo %RELEASE_DIR%
echo.
echo The overlay should auto-start gapd.exe and show gapd: connected.
echo.
pause
