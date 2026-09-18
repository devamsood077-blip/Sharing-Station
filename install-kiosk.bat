@echo off
setlocal EnableExtensions
title Sharing Station shortcut

set "EXE=%LOCALAPPDATA%\Programs\Sharing Station\Sharing Station.exe"
if not exist "%EXE%" set "EXE=%ProgramFiles%\Sharing Station\Sharing Station.exe"
if not exist "%EXE%" (
  echo Install SharingStation-Setup first. This PC does not need Git or Node.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell;" ^
  "$sc = $ws.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\Sharing Station.lnk');" ^
  "$sc.TargetPath = '%EXE%';" ^
  "$sc.WorkingDirectory = [IO.Path]::GetDirectoryName('%EXE%');" ^
  "$sc.Description = 'PhotoboothTO Sharing Station';" ^
  "$sc.Save()"

echo Desktop shortcut created.
pause
