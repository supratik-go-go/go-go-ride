@echo off
setlocal EnableExtensions
title GO-GO Ride launcher
cd /d "%~dp0"

rem Runs GO-GO Ride on this PC: the test database (MariaDB in C:\GoGoTools, port 3307), the API
rem (port 8000, on the local database gogoride_local, never the live one) and the app in a
rem phone-sized window (port 5174). The first run fills gogoride_local with the demo data.
rem "start-gogo-ride.bat phone" also shows the address for testing the APK on a phone
rem on the same Wi-Fi. Phone-only features (alarm sounds, back button) need the real APK.

set "API=%~dp0backend-node"
set "APP=%~dp0go-go-ride apk"
set "URL=http://localhost:5174"
set "MARIADB=C:\GoGoTools\mariadb\bin\mariadbd.exe"
set "MARIADB_INI=C:\GoGoTools\mariadb-data\my.ini"

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

rem ------------------------------------------------------------ test database (port 3307)
if not exist "%API%\data\mysql-test.env" (
  echo  [ERROR] backend-node\data\mysql-test.env is missing: it holds the test database login.
  goto :fail
)
call :port_in_use 3307
if errorlevel 1 (
  if not exist "%MARIADB%" (
    echo  [ERROR] The test database is not installed: %MARIADB%
    goto :fail
  )
  echo  [start] Test database ^(MariaDB^) on port 3307
  start "GO-GO Ride database - port 3307" /min "%MARIADB%" --defaults-file="%MARIADB_INI%" --console
  call :wait_port 3307 "Test database"
  if errorlevel 1 goto :fail
) else (
  echo  [skip]  The test database is already running on port 3307.
)
echo  [check] Local database gogoride_local ^(the first run copies the demo data, a minute or two^)
pushd "%API%"
node scripts\sqlite-to-mysql.mjs seed\gogoride.db gogoride_local --env data\mysql-test.env --if-empty
if errorlevel 1 (popd & goto :fail)
popd

rem ------------------------------------------------------------ API (port 8000)
call :port_in_use 8000
if errorlevel 1 (
  echo  [start] API on http://localhost:8000/api
  start "GO-GO Ride API - port 8000" /d "%API%" cmd /k "set MYSQL_ENV_FILE=data\mysql-test.env&& set MYSQL_DATABASE=gogoride_local&& node server.js"
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
echo   Demo logins - role, phone, password (this PC only)
if exist "%API%\seed\demo-logins.txt" (findstr /v /b "#" "%API%\seed\demo-logins.txt") else (echo   See backend-node\seed\demo-logins.txt)
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

:wait_port
rem Waits up to about 1 minute for something to listen on port %1.
set /a "TRIES=0"
:wait_port_loop
call :port_in_use %1
if not errorlevel 1 (
  echo  [ready] %~2
  exit /b 0
)
set /a "TRIES+=1"
if %TRIES% GEQ 30 (
  echo  [ERROR] %~2 did not start - check its window for errors.
  exit /b 1
)
ping -n 3 127.0.0.1 >nul
goto :wait_port_loop

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
