@echo off
setlocal EnableExtensions
title GO-GO Ride - release a new app version
cd /d "%~dp0"

rem One click for a new app version, no Claude needed:
rem   1. asks for the new version number and the one-line update note
rem   2. builds the signed APK (15 to 25 minutes)
rem   3. asks YES, then saves a restore point and pushes to both GitHub accounts
rem Hostinger then deploys it, and phones show "Update available".
rem For a server-only change, use push-to-github.bat instead.

where node >nul 2>nul || (echo  Node.js is not installed. & goto :fail)
where git >nul 2>nul || (echo  Git is not installed. & goto :fail)

echo.
echo  ===============================================
echo     GO-GO Ride - release a new app version
echo  ===============================================
echo.
node "go-go-ride apk\scripts\release-app.mjs" prepare
if errorlevel 1 goto :fail

echo.
echo  Building the app. This takes 15 to 25 minutes - keep this window open.
set "GOGO_NO_PAUSE=1"
call "go-go-ride apk\build-apk.bat" https://go-goride.com/api
if errorlevel 1 goto :fail
cd /d "%~dp0"

node "go-go-ride apk\scripts\release-app.mjs" publish
if errorlevel 2 goto :later
if errorlevel 1 goto :fail
echo.
pause
exit /b 0

:later
echo.
pause
exit /b 0

:fail
echo.
echo  Stopped - see the message above.
pause
exit /b 1
