@echo off
REM jonah-water3d playtest. English-only, CRLF.
cd /d "%~dp0"
echo Starting Jonah Overboard 3D ...
if not exist "node_modules" call npm install
call npm run dev -- --open
pause
