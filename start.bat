@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org ^(LTS^), or see README.md for the no-admin option.
  pause
  exit /b 1
)
if not defined DEN_DAILY_PHOTOS set DEN_DAILY_PHOTOS=1
start "" cmd /c "timeout /t 2 >nul & start http://localhost:4180"
echo Beast Den is starting. Keep this window open while people are using it. Press Ctrl+C to stop.
node server.js
pause
