@echo off
setlocal EnableExtensions
title GO-GO Ride - push to GitHub
cd /d "%~dp0"

rem Saves all changes as a commit and pushes it to BOTH GitHub accounts:
rem   https://github.com/supratik0000/go-go-ride
rem   https://github.com/supratik-go-go/go-go-ride
rem Usage: push-to-github.bat                 (asks for a short description)
rem        push-to-github.bat "Fixed bus search"

where git >nul 2>nul || (echo  Git is not installed. & goto :fail)

echo.
echo  ===============================================
echo     GO-GO Ride - push to both GitHub accounts
echo  ===============================================
echo.

git add -A
git diff --cached --quiet
if errorlevel 1 (
  set "MSG=%~1"
  if "%~1"=="" set /p "MSG=What did you change? (one line): "
  call :commit
  if errorlevel 1 goto :fail
) else (
  echo  No new changes to save - pushing any earlier commits.
)

echo.
echo  Pushing... (a GitHub sign-in window may appear the first time)
git push origin main
if errorlevel 1 goto :fail

echo.
echo  Done - both repositories are up to date.
pause
exit /b 0

:commit
if "%MSG%"=="" set "MSG=Update %DATE% %TIME:~0,5%"
git commit -m "%MSG%"
exit /b %errorlevel%

:fail
echo.
echo  Push failed - see the message above.
echo  (Never commit .env files, the database or uploads: they are excluded by .gitignore.)
pause
exit /b 1
