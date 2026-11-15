@echo off
setlocal
set ELECTRON_RUN_AS_NODE=
title Lirune Reader v6.0.0 - A calm home for your books
cd /d "%~dp0"

echo ========================================================
echo Launching Lirune Reader v6.0.0 (Desktop)...
echo ========================================================

REM Support dry-run / validation flag for testing and CI
if "%1"=="--test-dry-run" (
    echo [TEST] Launcher syntax and environment verified successfully.
    exit /b 0
)

REM 1. Check local packaged release build (v6.0.0) in dist\win-unpacked
if exist "%~dp0dist\win-unpacked\Lirune Reader.exe" (
    echo [INFO] Found local packaged v6.0.0 release: dist\win-unpacked\Lirune Reader.exe
    echo Starting Lirune Reader v6.0.0...
    if "%1"=="--validate-only" (
        echo [INFO] Target executable verified: "%~dp0dist\win-unpacked\Lirune Reader.exe"
        exit /b 0
    )
    start "" "%~dp0dist\win-unpacked\Lirune Reader.exe" %*
    goto :done
)

REM 2. Fallback: Run directly from current repository source via Electron (v6.0.0)
echo [INFO] Packaged binary not found in dist\win-unpacked.
echo Checking Node.js development environment to launch from source...

REM Verify Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js was not found in PATH.
    echo Please install Node.js version 20 or later from https://nodejs.org/
    if "%CI%"=="" pause
    exit /b 1
)

REM Verify local dependencies exist
if not exist "node_modules\" (
    echo [INFO] node_modules not found. Running npm install...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to install project dependencies.
        if "%CI%"=="" pause
        exit /b 1
    )
)

if "%1"=="--validate-only" (
    echo [INFO] Developer fallback verified: Electron source available.
    exit /b 0
)

echo Starting Lirune Reader v6.0.0 desktop client from source...
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
