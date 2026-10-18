@echo off
setlocal EnableExtensions
title GO-GO Ride - build Android APK
cd /d "%~dp0"

rem Usage:
rem   build-apk.bat                         uses the server in .env.production
rem   build-apk.bat http://192.168.1.9:8000/api
rem   build-apk.bat https://api.yourdomain.com/api

echo.
echo  ===============================================
echo     GO-GO Ride - building the Android app
echo  ===============================================
echo.

rem ------------------------------------------------------------ Java
rem Use the Java that ships inside Android Studio (the project's Gradle 9.1 runs on it).
set "STUDIO_JBR="
rem Android Studio unpacked next to the project, e.g. D:\Go-Go-Ride\android-studio-rabbit1
for /d %%D in ("%~dp0..\android-studio*") do (
  if exist "%%~fD\jbr\bin\java.exe" if not defined STUDIO_JBR set "STUDIO_JBR=%%~fD\jbr"
)
for %%D in ("D:\Android\Android Studio\jbr" "%ProgramFiles%\Android\Android Studio\jbr" "%LOCALAPPDATA%\Programs\Android Studio\jbr") do (
  if exist "%%~D\bin\java.exe" if not defined STUDIO_JBR set "STUDIO_JBR=%%~D"
)
if defined STUDIO_JBR (
  set "JAVA_HOME=%STUDIO_JBR%"
) else (
  echo  [ERROR] Android Studio was not found.
  echo          Install it from https://developer.android.com/studio
  echo          then open it once and finish the setup wizard - it downloads
  echo          the Android SDK. Run this script again afterwards.
  goto :fail
)
set "PATH=%JAVA_HOME%\bin;%PATH%"
echo  [ok]    Java: %JAVA_HOME%

rem ------------------------------------------------------------ Android SDK
set "SDK=%ANDROID_HOME%"
if not defined SDK if exist "D:\Android\Sdk\platforms" set "SDK=D:\Android\Sdk"
if not defined SDK set "SDK=%LOCALAPPDATA%\Android\Sdk"
rem Keep Gradle's download cache (about 1 GB) on D: when the Android tools live there.
if exist "D:\Android" if not defined GRADLE_USER_HOME set "GRADLE_USER_HOME=D:\Android\gradle"
if not exist "%SDK%\platforms" (
  echo  [ERROR] Android SDK not found at %SDK%
  echo          Open Android Studio, finish the setup wizard, and accept the SDK licences.
  goto :fail
)
echo  [ok]    Android SDK: %SDK%
rem Gradle reads the SDK location from android\local.properties (forward slashes).
set "SDK_FWD=%SDK:\=/%"
> "android\local.properties" echo sdk.dir=%SDK_FWD%

rem ------------------------------------------------------------ server address
if not "%~1"=="" (
  > ".env.production" echo VITE_API_URL=%~1
)
for /f "tokens=1,* delims==" %%A in ('findstr /b "VITE_API_URL=" ".env.production"') do set "API_URL=%%B"
echo  [ok]    App will talk to: %API_URL%
echo          (users can change it later in the app: Profile - Settings - Server)

rem A live (https) server has no SMS gateway yet, so OTP sign-in is switched off
rem and the app opens on password sign-in. Local Wi-Fi test builds keep OTP.
set "VITE_ENABLE_OTP=true"
if /i "%API_URL:~0,8%"=="https://" set "VITE_ENABLE_OTP=false"
echo  [ok]    OTP sign-in: %VITE_ENABLE_OTP%

rem ------------------------------------------------------------ packages
if not exist "node_modules\@capacitor\android" (
  echo  [setup] Installing packages...
  call npm install
  if errorlevel 1 goto :fail
)

rem ------------------------------------------------------------ build
echo.
echo  [1/3] Building the app screens...
call npx vite build
if errorlevel 1 goto :fail

echo  [2/3] Copying them into the Android project...
call npx cap sync android
if errorlevel 1 goto :fail

echo  [3/3] Building the APK - the first build downloads Gradle and takes several minutes...
pushd android
call "%~dp0android\gradlew.bat" assembleDebug
set "GRADLE_ERR=%errorlevel%"
popd
if not "%GRADLE_ERR%"=="0" goto :fail

copy /y "android\app\build\outputs\apk\debug\app-debug.apk" "GO-GO-Ride.apk" >nul
if errorlevel 1 goto :fail

echo.
echo  ===============================================
echo   Done!  %~dp0GO-GO-Ride.apk
echo  -----------------------------------------------
echo   Install on your phone:
echo    1. Copy GO-GO-Ride.apk to the phone (USB, Drive, WhatsApp to yourself)
echo    2. Open it and allow "Install unknown apps" when Android asks
echo   Testing against this PC? Start the server with:
echo      start-gogo-ride.bat phone
echo   and keep the phone on the same Wi-Fi.
echo  ===============================================
echo.
pause
exit /b 0

:fail
echo.
echo  Build failed - see the messages above.
pause
exit /b 1
