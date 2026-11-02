@echo off
setlocal EnableExtensions
title GO-GO Ride - roll back
cd /d "%~dp0"

rem Lists the restore points saved by push-to-github.bat and goes back to the one you pick.
rem Users, bookings and other data are not touched.

node "go-go-ride apk\scripts\rollback.mjs" %*
pause
