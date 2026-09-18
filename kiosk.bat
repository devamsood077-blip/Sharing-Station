@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "EXE=%LOCALAPPDATA%\Programs\Sharing Station\Sharing Station.exe"
if exist "%EXE%" (
  start "" "%EXE%"
  exit /b 0
)

set "EXE=%ProgramFiles%\Sharing Station\Sharing Station.exe"
if exist "%EXE%" (
  start "" "%EXE%"
  exit /b 0
)

echo Sharing Station is not installed on this PC.
echo Run SharingStation-Setup-1.0.1.exe once. Git and Node are not required.
pause
exit /b 1
