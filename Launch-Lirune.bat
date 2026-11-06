@echo off
setlocal
title Lirune Reader - A calm home for your books
cd /d "%~dp0"

echo ========================================================
echo Launching Lirune Reader (Desktop)...
echo ========================================================

REM 1. Verify Node.js environment
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js was not found in PATH.
    echo Please install Node.js version 20 or later from https://nodejs.org/
    pause
    exit /b 1
)

REM 2. Verify local dependencies exist
if not exist "node_modules\" (
    echo [INFO] node_modules not found. Running npm install...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to install project dependencies.
        pause
        exit /b 1
    )
)

REM 3. Handle optional clean / fresh state arguments
set "EXTRA_FLAGS="
if /i "%~1"=="--fresh" (
    echo [INFO] Launching in an isolated clean temporary profile...
    set "EXTRA_FLAGS=--user-data-dir=%TEMP%\Lirune-Fresh-%RANDOM%"
)
if /i "%~1"=="--clean" (
    echo [INFO] Launching in an isolated clean temporary profile...
    set "EXTRA_FLAGS=--user-data-dir=%TEMP%\Lirune-Fresh-%RANDOM%"
)

REM 4. Launch live workspace directly from Electron source
echo Starting Lirune Reader desktop client from live workspace...
if exist "node_modules\.bin\electron.cmd" (
    call "node_modules\.bin\electron.cmd" . %EXTRA_FLAGS% %*
) else (
    call npx electron . %EXTRA_FLAGS% %*
)
if %ERRORLEVEL% neq 0 (
    echo [WARN] Electron process exited with code %ERRORLEVEL%.
)

:done
endlocal
