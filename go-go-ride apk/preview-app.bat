@echo off
setlocal EnableExtensions
title GO-GO Ride - app preview
cd /d "%~dp0"

rem Opens the GO-GO Ride app in a phone-sized window on this PC - no Android tools needed.
rem Phone-only features (alarm notifications, back button, splash screen) only work in the real APK.

set "API=%~dp0..\backend-python"
set "URL=http://localhost:5174"

echo.
echo  ===============================================
echo     GO-GO Ride - phone preview on this PC
echo  ===============================================
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo  [ERROR] Node.js was not found. Install it from https://nodejs.org/
  goto :fail
)

rem ------------------------------------------------------------ API (port 8000)
call :port_in_use 8000
if not errorlevel 1 goto :api_ok
if not exist "%API%\.venv\Scripts\python.exe" (
  echo  [ERROR] The backend is not set up yet.
  echo          Double-click start-gogo-ride.bat in D:\Go-Go-Ride once, then try again.
  goto :fail
)
echo  [start] API server on http://localhost:8000
start "GO-GO Ride API - port 8000" /d "%API%" cmd /k ".venv\Scripts\python.exe -m uvicorn app.main:app --port 8000"
:api_ok

rem ------------------------------------------------------------ app screens (port 5174)
if not exist "node_modules\vite" (
  echo  [setup] Installing app packages - first run only...
  call npm install
  if errorlevel 1 goto :fail
)
call :port_in_use 5174
if errorlevel 1 (
  echo  [start] App preview server on %URL%
  start "GO-GO Ride App preview - port 5174" /d "%~dp0" cmd /k "npm run dev -- --port 5174 --strictPort"
)

echo  Waiting for the servers...
call :wait_for "http://localhost:8000/api/health" "API"
call :wait_for "%URL%/" "App"

rem ------------------------------------------------------------ phone-sized window
set "BROWSER="
for %%B in ("%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe") do (
  if exist "%%~B" if not defined BROWSER set "BROWSER=%%~B"
)
if not defined BROWSER (
  echo  No Chrome or Edge found - opening your default browser instead.
  start "" "%URL%"
  goto :done
)
rem A separate profile folder makes the browser honour the phone-sized window.
start "" "%BROWSER%" --app=%URL% --window-size=412,880 --user-data-dir="%LOCALAPPDATA%\GoGoRide-PhonePreview" --no-first-run --no-default-browser-check

:done
echo.
echo  ===============================================
echo   The app is open in a phone-sized window.
echo   Log in:  9123456789 / Rider@123  (passenger)
echo  -----------------------------------------------
echo   Edits to the app code show up instantly.
echo   To stop: run ..\stop-gogo-ride.bat
echo  ===============================================
echo.
pause
exit /b 0

:port_in_use
netstat -ano | findstr "LISTENING" | findstr /c:":%1 " >nul
exit /b %errorlevel%

:wait_for
set /a "TRIES=0"
:wait_loop
curl -s -o nul "%~1" >nul 2>nul
if not errorlevel 1 (
  echo  [ready] %~2
  exit /b 0
)
set /a "TRIES+=1"
if %TRIES% GEQ 45 (
  echo  [warn]  %~2 did not answer yet - check its window for errors.
  exit /b 1
)
ping -n 3 127.0.0.1 >nul
goto :wait_loop

:fail
echo.
echo  Could not start the preview - see the message above.
pause
exit /b 1
