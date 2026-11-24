@echo off
setlocal EnableExtensions
title GO-GO Ride - stop
echo.
echo  Stopping GO-GO Ride servers...
call :kill_port 8000 "API"
call :kill_port 5174 "App preview"
rem Close the console windows the launchers opened (they keep the folders locked).
taskkill /FI "WINDOWTITLE eq GO-GO Ride API*" /T /F >nul 2>nul
taskkill /FI "WINDOWTITLE eq GO-GO Ride App preview*" /T /F >nul 2>nul
call :stop_database
echo.
echo  Done.
ping -n 4 127.0.0.1 >nul
exit /b 0

:stop_database
rem A clean shutdown of the test database, with the login from backend-node\data\mysql-test.env.
netstat -ano | findstr "LISTENING" | findstr /c:":3307 " >nul
if errorlevel 1 (
  echo  [idle]    Test database was not running
  exit /b 0
)
set "ENVFILE=%~dp0backend-node\data\mysql-test.env"
if not exist "%ENVFILE%" exit /b 0
for /f "usebackq tokens=1,* delims==" %%A in ("%ENVFILE%") do set "%%A=%%B"
set "MYSQL_PWD=%MYSQL_PASSWORD%"
"C:\GoGoTools\mariadb\bin\mariadb-admin.exe" --host=127.0.0.1 --port=3307 -u "%MYSQL_USER%" shutdown >nul 2>nul
if errorlevel 1 (echo  [warn]    Test database did not stop - close its window) else (echo  [stopped] Test database - port 3307)
set "MYSQL_PWD="
set "MYSQL_PASSWORD="
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
