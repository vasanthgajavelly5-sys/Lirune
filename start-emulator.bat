@echo off
title Lirune Reader - Android Emulator
echo ========================================================
echo Launching Lirune Reader Android Emulator (API 35)...
echo ========================================================
set PATH=C:\Users\vasanth\android-sdk\platform-tools;C:\Users\vasanth\jdk17\bin;%PATH%
set ANDROID_SDK_ROOT=C:\Users\vasanth\android-sdk
set ANDROID_HOME=C:\Users\vasanth\android-sdk
start "" "C:\Users\vasanth\android-sdk\emulator\emulator.exe" -avd qa_android -no-snapshot-load
echo Emulator process started.
exit
