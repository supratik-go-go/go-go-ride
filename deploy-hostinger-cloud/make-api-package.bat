@echo off
setlocal EnableExtensions
title GO-GO Ride - make Hostinger API package
cd /d "%~dp0"

rem Creates gogoride-api.zip: the Node.js API + a copy of the current database,
rem ready to upload to Hostinger (Websites - Create Website - Web App - Upload).

set "API=%~dp0..\backend-node"
set "STAGE=%~dp0build\gogoride-api"

echo.
echo  ===============================================
echo     GO-GO Ride - API package for Hostinger
echo  ===============================================
echo.

where node >nul 2>nul || (echo  Node.js is not installed. & goto :fail)

echo  [1/3] Copying today's database and uploads as the starter data...
pushd "%API%"
call node scripts\make-starter.mjs
if errorlevel 1 (
  popd
  goto :fail
)
popd

echo  [2/3] Collecting the app files (without node_modules, local data and .env)...
if exist "%~dp0build" rmdir /s /q "%~dp0build"
mkdir "%STAGE%" || goto :fail
robocopy "%API%" "%STAGE%" /E /XD node_modules data .git /XF .env *.log /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto :fail

rem ------------------------------------------------------------ the app for the download page
set "APK=%~dp0..\go-go-ride apk\GO-GO-Ride.apk"
set "APKENV=%~dp0..\go-go-ride apk\.env.production"
if exist "%APK%" (
  findstr /b /c:"VITE_API_URL=https://" "%APKENV%" >nul
  if errorlevel 1 (
    echo.
    echo  [warn]  GO-GO-Ride.apk was built for a local test server, not go-goride.com.
    echo          It is NOT added to the download page. Build the live app first:
    echo            "go-go-ride apk\build-apk.bat" https://go-goride.com/api
    echo.
  ) else (
    echo         Adding GO-GO-Ride.apk to the download page...
    copy /y "%APK%" "%STAGE%\public\downloads\GO-GO-Ride.apk" >nul
    call node "%API%\scripts\app-info.mjs" "%~dp0..\go-go-ride apk\android\app\build.gradle" "%APK%" "%STAGE%\public\downloads\app-info.json"
  )
) else (
  echo  [info]  No GO-GO-Ride.apk yet - the download page will say "coming soon".
)

echo  [3/3] Creating gogoride-api.zip...
if exist "gogoride-api.zip" del /q "gogoride-api.zip"
rem tar writes forward-slash paths, which the Linux server expects.
tar -a -c -f "gogoride-api.zip" -C "%STAGE%" .
if errorlevel 1 goto :fail
rmdir /s /q "%~dp0build"

for %%F in ("gogoride-api.zip") do set "SIZE=%%~zF"
set /a "SIZE_KB=%SIZE% / 1024"
echo.
echo  ===============================================
echo   Done: %~dp0gogoride-api.zip  (%SIZE_KB% KB)
echo   Next: follow README.md in this folder.
echo  ===============================================
echo.
pause
exit /b 0

:fail
echo.
echo  Packaging failed - see the messages above.
pause
exit /b 1
