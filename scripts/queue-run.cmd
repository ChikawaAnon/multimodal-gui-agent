@echo off
cd /d "%~dp0.."
node src\run-queue.js "%1"
exit /b %ERRORLEVEL%