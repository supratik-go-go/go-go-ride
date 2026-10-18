@echo off
setlocal EnableExtensions
title GO-GO Ride - make deploy package
cd /d "%~dp0"

rem Builds the website for the live server and packs it with the API into
rem gogoride-deploy.zip (next to this script).
rem   1-make-package.bat         live site uses password sign-in only (no SMS gateway yet)
rem   1-make-package.bat otp     keep OTP sign-in (only once an SMS gateway is connected)

set "ROOT=%~dp0.."
set "WEB=%ROOT%\go-go-ride website code"
set "API=%ROOT%\backend-python"
set "STAGE=%~dp0build"

echo.
echo  ===============================================
echo     GO-GO Ride - making the deploy package
echo  ===============================================
echo.

if exist "%STAGE%" rmdir /s /q "%STAGE%"
mkdir "%STAGE%\backend" || goto :fail

rem ------------------------------------------------------------ website
echo  [1/3] Building the website for the live server...
rem Empty VITE_API_URL = the site calls /api on its own domain (nginx forwards it).
set "VITE_API_URL="
set "VITE_ENABLE_OTP=false"
if /i "%~1"=="otp" set "VITE_ENABLE_OTP=true"
pushd "%WEB%"
call npx vite build --outDir "%STAGE%\website" --emptyOutDir
set "BUILD_ERR=%errorlevel%"
popd
if not "%BUILD_ERR%"=="0" goto :fail

rem ------------------------------------------------------------ API
echo  [2/3] Copying the API (without .env, .venv and caches)...
robocopy "%API%" "%STAGE%\backend" /E /XD .venv __pycache__ .pytest_cache /XF .env *.pyc /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto :fail

rem ------------------------------------------------------------ zip
echo  [3/3] Creating gogoride-deploy.zip...
if exist "gogoride-deploy.zip" del /q "gogoride-deploy.zip"
rem tar writes forward-slash paths, which Linux unzip expects.
tar -a -c -f "gogoride-deploy.zip" -C "%STAGE%" backend website
if errorlevel 1 goto :fail
rmdir /s /q "%STAGE%"

for %%F in ("gogoride-deploy.zip") do set "SIZE=%%~zF"
set /a "SIZE_MB=%SIZE% / 1048576"
echo.
echo  ===============================================
echo   Done: %~dp0gogoride-deploy.zip  (%SIZE_MB% MB)
echo   Next: 2-upload-and-install.bat
echo  ===============================================
echo.
pause
exit /b 0

:fail
echo.
echo  Packaging failed - see the messages above.
pause
exit /b 1
