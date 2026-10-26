@echo off
setlocal enabledelayedexpansion
title Lirune Reader - Android Emulator
echo ========================================================
echo Launching Lirune Reader Android Emulator (API 35)...
echo ========================================================

REM Locate Android SDK from environment or standard Windows installation path
set "SDK_DIR="
if defined ANDROID_HOME if exist "!ANDROID_HOME!\emulator\emulator.exe" set "SDK_DIR=!ANDROID_HOME!"
if not defined SDK_DIR if defined ANDROID_SDK_ROOT if exist "!ANDROID_SDK_ROOT!\emulator\emulator.exe" set "SDK_DIR=!ANDROID_SDK_ROOT!"
if not defined SDK_DIR if exist "%LOCALAPPDATA%\Android\Sdk\emulator\emulator.exe" set "SDK_DIR=%LOCALAPPDATA%\Android\Sdk"

if not defined SDK_DIR (
    echo [ERROR] Android SDK / Emulator was not found.
    echo Please set ANDROID_HOME or ANDROID_SDK_ROOT to your Android SDK installation directory.
    echo Example: set ANDROID_HOME=C:\Android\sdk
    pause
    exit /b 1
)

echo [INFO] Using Android SDK at: !SDK_DIR!
set "ANDROID_HOME=!SDK_DIR!"
set "ANDROID_SDK_ROOT=!SDK_DIR!"
set "PATH=!SDK_DIR!\platform-tools;!SDK_DIR!\emulator;%PATH%"

REM Add Java to PATH if JAVA_HOME is configured
if defined JAVA_HOME (
    if exist "!JAVA_HOME!\bin" set "PATH=!JAVA_HOME!\bin;%PATH%"
)

REM Verify AVD name
set "AVD_NAME=qa_android"
if not "%~1"=="" set "AVD_NAME=%~1"

echo Starting emulator with AVD: !AVD_NAME!
start "" "!SDK_DIR!\emulator\emulator.exe" -avd "!AVD_NAME!" -no-snapshot-load
echo Emulator launch command issued.
endlocal
exit /b 0
