@echo off
setlocal EnableExtensions
title GO-GO Ride launcher
cd /d "%~dp0"

rem Runs GO-GO Ride on this PC: the API (port 8000, its own local test database in
rem backend-node\data, never the live one) and the app in a phone-sized window (port 5174).
rem "start-gogo-ride.bat phone" also shows the address for testing the APK on a phone
rem on the same Wi-Fi. Phone-only features (alarm sounds, back button) need the real APK.

set "API=%~dp0backend-node"
set "APP=%~dp0go-go-ride apk"
set "URL=http://localhost:5174"

echo.
echo  ===============================================
echo     GO-GO Ride - starting on this PC
echo  ===============================================
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo  [ERROR] Node.js was not found. Install Node.js 24 from https://nodejs.org/
  goto :fail
)

rem ------------------------------------------------------------ first run: packages
if not exist "%API%\node_modules\express" (
  echo  [setup] Installing server packages - first run only...
  pushd "%API%"
  call npm install
  if errorlevel 1 (popd & goto :fail)
  popd
)
if not exist "%APP%\node_modules\vite" (
  echo  [setup] Installing app packages - first run only, this can take a few minutes...
  pushd "%APP%"
  call npm install
  if errorlevel 1 (popd & goto :fail)
  popd
)

rem ------------------------------------------------------------ API (port 8000)
call :port_in_use 8000
if errorlevel 1 (
  echo  [start] API on http://localhost:8000/api
  rem The first start copies the demo database from backend-node\seed.
  start "GO-GO Ride API - port 8000" /d "%API%" cmd /k "node server.js"
) else (
  echo  [skip]  Something is already running on port 8000 - using it as the API.
)

rem ------------------------------------------------------------ app (port 5174)
call :port_in_use 5174
if errorlevel 1 (
  echo  [start] App preview on %URL%
  start "GO-GO Ride App preview - port 5174" /d "%APP%" cmd /k "npm run dev -- --port 5174 --strictPort"
) else (
  echo  [skip]  Something is already running on port 5174 - using it as the app.
)

echo.
echo  Waiting for the servers (the first start can take a few minutes on this PC)...
call :wait_for "http://localhost:8000/api/health" "API"
call :wait_for "%URL%/" "App"

rem ------------------------------------------------------------ phone-sized window
set "BROWSER="
for %%B in ("%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe") do (
  if exist "%%~B" if not defined BROWSER set "BROWSER=%%~B"
)
if defined BROWSER (
  rem A separate profile folder makes the browser honour the phone-sized window.
  start "" "%BROWSER%" --app=%URL% --window-size=412,880 --user-data-dir="%LOCALAPPDATA%\GoGoRide-PhonePreview" --no-first-run --no-default-browser-check
) else (
  start "" "%URL%"
)

echo.
echo  ===============================================
echo   GO-GO Ride is running on this PC
echo  -----------------------------------------------
echo   App        %URL%
echo   Admin      %URL%/admin/login
echo   API list   docs\API.md
echo  -----------------------------------------------
echo   Demo logins - phone / password (this PC only)
echo   Passenger    9123456789 / Rider@123
echo   Bus owner    9876543210 / Owner@123
echo   Driver       9000011223 / Driver@123
echo   Admin        9876500002 / Admin@123
echo   Super admin  9876500001 / Admin@123
echo  -----------------------------------------------
if /i "%~1"=="phone" call :phone_info
echo   Edits to the app code show up instantly.
echo   To stop: close the two server windows, or run stop-gogo-ride.bat
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
rem Polls URL %1 for up to about 4 minutes.
set /a "TRIES=0"
:wait_loop
curl -s -o nul "%~1" >nul 2>nul
if not errorlevel 1 (
  echo  [ready] %~2
  exit /b 0
)
set /a "TRIES+=1"
if %TRIES% GEQ 120 (
  echo  [warn]  %~2 did not answer yet - check its window for errors.
  exit /b 1
)
ping -n 3 127.0.0.1 >nul
goto :wait_loop

:phone_info
set "LANIP="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -like 'Wi-Fi*' -or $_.InterfaceAlias -like 'Ethernet*' } | Where-Object { $_.IPAddress -notlike '169.254*' } | Select-Object -First 1).IPAddress"`) do set "LANIP=%%i"
echo   PHONE MODE - for the APK on a phone on the same Wi-Fi
echo   In the app: Settings - Server:  http://%LANIP%:8000/api
echo   If Windows asks, allow Node.js on Private networks.
echo  -----------------------------------------------
exit /b 0

:fail
echo.
echo  Could not start - see the message above.
pause
exit /b 1
