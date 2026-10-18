@echo off
setlocal EnableExtensions
title GO-GO Ride - upload to Hostinger VPS
cd /d "%~dp0"

rem Uploads gogoride-deploy.zip + the server scripts to the VPS and runs them.
rem You will be asked for the VPS root password (it is typed into ssh, not stored).

if not exist "gogoride-deploy.zip" (
  echo  Run 1-make-package.bat first.
  goto :fail
)
where ssh >nul 2>nul || (echo  OpenSSH client not found - enable it in Windows Settings - Optional features. & goto :fail)

echo.
echo  ===============================================
echo     GO-GO Ride - upload and install on the VPS
echo  ===============================================
echo.
set /p "VPS=VPS IP address (Hostinger hPanel - VPS - Overview): "
if "%VPS%"=="" goto :fail
echo.
echo  1 = First install (sets up the server, HTTPS and the database)
echo  2 = Update (new version of the website/API, keeps all data)
set /p "MODE=Choose 1 or 2: "

if "%MODE%"=="1" (
  set /p "DOMAIN=Your domain, without www (e.g. gogoride.in): "
  set /p "EMAIL=Your email (for the free HTTPS certificate): "
)

echo.
echo  Uploading - enter the VPS root password when asked...
scp gogoride-deploy.zip setup-server.sh update-server.sh root@%VPS%:/root/
if errorlevel 1 goto :fail

echo.
echo  Installing on the server - enter the password again when asked...
if "%MODE%"=="1" (
  ssh -t root@%VPS% "cd /root && bash setup-server.sh %DOMAIN% %EMAIL%"
) else (
  ssh -t root@%VPS% "cd /root && bash update-server.sh"
)
if errorlevel 1 goto :fail

echo.
echo  Finished. Open your domain in the browser to check.
pause
exit /b 0

:fail
echo.
echo  Stopped - see the messages above.
pause
exit /b 1
