@echo off
title Lirune Reader — A calm home for your books
cd /d "%~dp0"

echo Stopping any lingering background instances...
taskkill /F /IM electron.exe >nul 2>&1

echo Starting Lirune Reader with latest changes...
call npx electron .
