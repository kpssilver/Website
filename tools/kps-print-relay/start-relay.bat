@echo off
REM KPS Print Relay launcher (Windows)
REM Double-click this file to start the relay. Keep the window open while printing.
title KPS Print Relay
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js was not found on this computer.
  echo Install it once from https://nodejs.org  ^(LTS version^), then run this file again.
  echo.
  pause
  exit /b 1
)

node "%~dp0relay.cjs"
echo.
echo The relay has stopped. Close this window or press a key to exit.
pause >nul
