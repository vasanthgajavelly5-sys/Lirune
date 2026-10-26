@echo off
setlocal
title Lirune Reader — A calm home for your books
cd /d "%~dp0"

echo ========================================================
echo Launching Lirune Reader (Desktop)...
echo ========================================================

REM Verify Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js was not found in PATH.
    echo Please install Node.js version 20 or later from https://nodejs.org/
    pause
    exit /b 1
)

REM Verify local dependencies exist
if not exist "node_modules\" (
    echo [INFO] node_modules not found. Running npm install...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to install project dependencies.
        pause
        exit /b 1
    )
)

echo Starting Lirune Reader desktop client...
if exist "node_modules\.bin\electron.cmd" (
    call "node_modules\.bin\electron.cmd" . %*
) else (
    call npx electron . %*
)
if %ERRORLEVEL% neq 0 (
    echo [WARN] Electron process exited with code %ERRORLEVEL%.
)
endlocal
