@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Publish Sharing Station updates

for /f "delims=" %%i in ('node -p "require('./package.json').version"') do set "VER=%%i"
if "%VER%"=="" (
  echo Could not read version from package.json.
  pause
  exit /b 1
)

set "SETUP=release\SharingStation-Setup-%VER%.exe"
set "PORTABLE=release\SharingStation-Portable-%VER%.exe"
if not exist "%SETUP%" (
  echo Build the installer first: npm run build:win
  echo Missing: %SETUP%
  pause
  exit /b 1
)
if not exist "%PORTABLE%" (
  echo Build the installer first: npm run build:win
  echo Missing: %PORTABLE%
  pause
  exit /b 1
)

set "REPO=devamsood077-blip/Sharing-Station"
set "TAG=v%VER%"

where gh >nul 2>&1
if errorlevel 1 (
  echo GitHub CLI ^(gh^) is required on this PC.
  echo After installing it, run:
  echo   gh release create %TAG% --repo %REPO% --title "%TAG%" --notes "Sharing Station %TAG%" "%SETUP%" "%PORTABLE%"
  pause
  exit /b 1
)

gh release view "%TAG%" --repo "%REPO%" >nul 2>&1
if errorlevel 1 (
  gh release create "%TAG%" --repo "%REPO%" --title "%TAG%" --notes "Sharing Station %TAG%" "%SETUP%" "%PORTABLE%"
) else (
  gh release upload "%TAG%" --repo "%REPO%" "%SETUP%" "%PORTABLE%" --clobber
)

if errorlevel 1 (
  echo.
  echo Publish failed. Create the GitHub repo if it does not exist:
  echo   gh repo create %REPO% --private --source . --remote origin --push
  pause
  exit /b 1
)

echo.
echo Published %TAG% to GitHub Releases:
echo   https://github.com/%REPO%/releases/tag/%TAG%
echo.
echo Kiosks Check for Updates from that release. No Git or Node on the station.
echo.
pause
