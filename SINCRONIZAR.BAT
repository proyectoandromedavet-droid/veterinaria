@echo off

echo ================================
echo   SYNC REPO VETERINARIA
echo ================================

cd /d C:\apps\veterinaria

echo.
echo [1] Estado actual:
git status

echo.
echo [2] Agregando cambios...
git add .

echo.
echo [3] Commit automatico...
set fecha=%date% %time%
git commit -m "Auto sync %fecha%"

echo.
echo [4] Subiendo a GitHub...
git push origin main

echo.
echo ================================
echo   FIN
echo ================================

pause