@echo off
setlocal
title Lirune Reader - A calm home for your books
cd /d "%~dp0"

echo ========================================================
echo Launching Lirune Reader (Desktop)...
echo ========================================================

REM 1. Check local packaged release build (v5.6.2+) in dist\win-unpacked
if exist "%~dp0dist\win-unpacked\Lirune Reader.exe" (
    echo [INFO] Found latest packaged release: dist\win-unpacked\Lirune Reader.exe
    echo Starting Lirune Reader...
    start "" "%~dp0dist\win-unpacked\Lirune Reader.exe" %*
    goto :done
)

REM 2. Check installed desktop application in user or system program directories
if exist "%LOCALAPPDATA%\Programs\Lirune Reader\Lirune Reader.exe" (
    echo [INFO] Found installed Lirune Reader in %LOCALAPPDATA%\Programs\Lirune Reader
    echo Starting Lirune Reader...
    start "" "%LOCALAPPDATA%\Programs\Lirune Reader\Lirune Reader.exe" %*
    goto :done
)

if exist "%LOCALAPPDATA%\Programs\lirune-reader\Lirune Reader.exe" (
    echo [INFO] Found installed Lirune Reader in %LOCALAPPDATA%\Programs\lirune-reader
    echo Starting Lirune Reader...
    start "" "%LOCALAPPDATA%\Programs\lirune-reader\Lirune Reader.exe" %*
    goto :done
)

if exist "%ProgramFiles%\Lirune Reader\Lirune Reader.exe" (
    echo [INFO] Found installed Lirune Reader in %ProgramFiles%\Lirune Reader
    echo Starting Lirune Reader...
    start "" "%ProgramFiles%\Lirune Reader\Lirune Reader.exe" %*
    goto :done
)

if exist "%ProgramFiles(x86)%\Lirune Reader\Lirune Reader.exe" (
    echo [INFO] Found installed Lirune Reader in %ProgramFiles(x86)%\Lirune Reader
    echo Starting Lirune Reader...
    start "" "%ProgramFiles(x86)%\Lirune Reader\Lirune Reader.exe" %*
    goto :done
)

REM 3. Fallback to developer source execution via Electron
echo [INFO] No standalone or installed binary found.
echo Checking Node.js development environment...

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

echo Starting Lirune Reader desktop client from source...
if exist "node_modules\.bin\electron.cmd" (
    call "node_modules\.bin\electron.cmd" . %*
) else (
    call npx electron . %*
)
if %ERRORLEVEL% neq 0 (
    echo [WARN] Electron process exited with code %ERRORLEVEL%.
)

:done
endlocal
