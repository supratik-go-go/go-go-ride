@echo off
setlocal EnableExtensions
title GO-GO Ride launcher
cd /d "%~dp0"

rem "start-gogo-ride.bat phone" lets phones on the same Wi-Fi reach the API
rem (needed to test the Android app). A plain double-click keeps it on this PC only.
set "API_HOST=127.0.0.1"
if /i "%~1"=="phone" set "API_HOST=0.0.0.0"

set "WEB=%~dp0go-go-ride website code"
set "API=%~dp0backend-python"

echo.
echo  ===============================================
echo     GO-GO Ride - starting the app
echo  ===============================================
echo.

rem ------------------------------------------------------------ prerequisites
where python >nul 2>nul
if errorlevel 1 (
  echo  [ERROR] Python was not found.
  echo          Install Python 3.11 or newer from https://www.python.org/downloads/
  echo          and tick "Add python.exe to PATH" during setup.
  goto :fail
)
where npm >nul 2>nul
if errorlevel 1 (
  echo  [ERROR] Node.js was not found.
  echo          Install Node.js 20 or newer from https://nodejs.org/
  goto :fail
)

rem ------------------------------------------------------------ backend setup
set "PY=%API%\.venv\Scripts\python.exe"

if not exist "%PY%" (
  echo  [setup] Creating the Python environment - first run only...
  python -m venv "%API%\.venv"
  if errorlevel 1 goto :fail
)

"%PY%" -c "import fastapi, uvicorn, sqlalchemy" >nul 2>nul
if errorlevel 1 (
  echo  [setup] Installing backend packages - first run only...
  "%PY%" -m pip install --disable-pip-version-check -r "%API%\requirements.txt"
  if errorlevel 1 goto :fail
)

if not exist "%API%\.env" (
  echo  [setup] Creating backend-python\.env from .env.example
  copy /y "%API%\.env.example" "%API%\.env" >nul
)

rem ------------------------------------------------------------ website setup
if exist "%WEB%\node_modules\vite" goto :web_ready
echo  [setup] Installing website packages - first run only, this can take a few minutes...
pushd "%WEB%"
call npm install
if errorlevel 1 (
  popd
  goto :fail
)
popd
:web_ready

rem ------------------------------------------------------------ start backend
call :port_in_use 8000
if errorlevel 1 (
  echo  [start] API server on http://localhost:8000
  rem Alarm reminders use this PC's clock, so keep Windows set to India Standard Time.
  start "GO-GO Ride API - port 8000" /d "%API%" cmd /k ".venv\Scripts\python.exe -m uvicorn app.main:app --host %API_HOST% --port 8000"
) else (
  echo  [skip]  Something is already running on port 8000 - using it as the API.
  if /i "%API_HOST%"=="0.0.0.0" echo          For phone mode, stop it first with stop-gogo-ride.bat, then run this again.
)

rem ------------------------------------------------------------ start website
call :port_in_use 5173
if errorlevel 1 (
  echo  [start] Website on http://localhost:5173
  start "GO-GO Ride Web - port 5173" /d "%WEB%" cmd /k "npm run dev"
) else (
  echo  [skip]  Something is already running on port 5173 - using it as the website.
)

rem ------------------------------------------------------------ wait + open
echo.
echo  Waiting for the servers to be ready...
call :wait_for "http://localhost:8000/api/health" "API"
call :wait_for "http://localhost:5173/" "Website"

echo.
echo  Opening http://localhost:5173 in your browser...
start "" "http://localhost:5173"

echo.
echo  ===============================================
echo   GO-GO Ride is running
echo  -----------------------------------------------
echo   Website    http://localhost:5173
echo   Admin      http://localhost:5173/admin/login
echo   API docs   http://localhost:8000/docs
echo  -----------------------------------------------
echo   Demo logins - phone / password
echo   Passenger    9123456789 / Rider@123
echo   Bus owner    9876543210 / Owner@123
echo   Driver       9000011223 / Driver@123
echo   Admin        9876500002 / Admin@123
echo   Super admin  9876500001 / Admin@123
echo  -----------------------------------------------
if /i "%API_HOST%"=="0.0.0.0" call :phone_info
echo   To stop: close the two server windows,
echo   or run stop-gogo-ride.bat
echo  ===============================================
echo.
pause
exit /b 0


rem ============================================================ helpers

:port_in_use
rem errorlevel 0 = something is listening on port %1, 1 = free
netstat -ano | findstr "LISTENING" | findstr /c:":%1 " >nul
exit /b %errorlevel%

:wait_for
rem Polls URL %1 for up to ~90 seconds.
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

:phone_info
set "LANIP="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -like 'Wi-Fi*' -or $_.InterfaceAlias -like 'Ethernet*' } | Where-Object { $_.IPAddress -notlike '169.254*' } | Select-Object -First 1).IPAddress"`) do set "LANIP=%%i"
echo   PHONE MODE - for the Android app on the same Wi-Fi
echo   Server address for the app:  http://%LANIP%:8000/api
echo   If Windows asks, allow Python on Private networks.
echo  -----------------------------------------------
exit /b 0

:fail
echo.
echo  Setup failed - see the message above.
pause
exit /b 1
