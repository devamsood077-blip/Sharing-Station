@echo off
cd /d "%~dp0"
set NODE_ENV=
"%~dp0node_modules\.bin\electron.cmd" .
