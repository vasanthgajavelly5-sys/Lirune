@echo off
setlocal
set ELECTRON_RUN_AS_NODE=
set ELECTRON_NO_ASAR=
title Lirune Reader - A calm home for your books
cd /d "%~dp0"

set "APP_VERSION=5.6.4"
where node >nul 2>&1
if %ERRORLEVEL% equ 0 (
    for /f "delims=" %%v in ('node -p "require('./package.json').version" 2^>nul') do set "APP_VERSION=%%v"
)

echo ========================================================
echo Launching Lirune Reader v%APP_VERSION% (Desktop)...
echo Fix: Instant settings apply, no flicker, column spread phase-lock (Auto 2-up / Single 1-up)
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

REM 4. Launch packaged binary if --packaged is passed, otherwise live workspace
if /i "%~1"=="--packaged" (
    if not exist "%~dp0dist\win-unpacked\Lirune Reader.exe" (
        echo [ERROR] Packaged build not found at dist\win-unpacked\Lirune Reader.exe
        echo Run npm run pack first.
        pause
        exit /b 1
    )
    echo Starting packaged Lirune Reader v%APP_VERSION%...
    "%~dp0dist\win-unpacked\Lirune Reader.exe" %EXTRA_FLAGS%
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Packaged application exited with code %ERRORLEVEL%.
        pause
    )
    goto :done
)

echo Starting Lirune Reader v%APP_VERSION% desktop client from live workspace...
if exist "%~dp0node_modules\electron\dist\electron.exe" (
    "%~dp0node_modules\electron\dist\electron.exe" "%~dp0." %EXTRA_FLAGS% %*
) else if exist "%~dp0node_modules\.bin\electron.cmd" (
    call "%~dp0node_modules\.bin\electron.cmd" . %EXTRA_FLAGS% %*
) else (
    call npx electron . %EXTRA_FLAGS% %*
)
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Electron exited with code %ERRORLEVEL%.
    pause
)

:done
endlocal
