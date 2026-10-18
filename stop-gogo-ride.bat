@echo off
setlocal EnableExtensions
title GO-GO Ride - stop
echo.
echo  Stopping GO-GO Ride servers...
call :kill_port 8000 "API"
call :kill_port 5173 "Website"
call :kill_port 5174 "App preview"
rem Close the console windows the launchers opened (they keep the folders locked).
taskkill /FI "WINDOWTITLE eq GO-GO Ride API*" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq GO-GO Ride Web*" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq GO-GO Ride App preview*" /T /F >nul 2>nul
echo.
echo  Done.
ping -n 4 127.0.0.1 >nul
exit /b 0

:kill_port
set "FOUND="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr "LISTENING" ^| findstr /c:":%1 "') do (
  if not "%%P"=="0" (
    taskkill /PID %%P /T /F >nul 2>nul
    set "FOUND=1"
  )
)
if defined FOUND (echo  [stopped] %~2 - port %1) else (echo  [idle]    %~2 was not running)
exit /b 0
