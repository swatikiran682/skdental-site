@echo off
setlocal EnableDelayedExpansion
title Firebase Deploy - skdental
cd /d "%~dp0"

set "NODE_DIR=C:\Program Files\nodejs"
set "NPM_DIR=C:\Users\SKDENTAL\AppData\Roaming\npm"
set "PATH=%NODE_DIR%;%NPM_DIR%;%PATH%"
set "FIREBASE=%NPM_DIR%\firebase.cmd"

echo.
echo ============================================================
echo   SK Dental Group - Firebase Deploy
echo ============================================================
echo.

if not exist "%FIREBASE%" (
  echo ERROR: firebase.cmd not found at %FIREBASE%
  pause
  exit /b 1
)
echo Firebase CLI found: %FIREBASE%
echo.
echo This will:
echo   1. Sign you into Firebase ^(browser opens^)
echo   2. Let you pick or create a Firebase project
echo   3. Deploy the static site to Firebase Hosting
echo.
pause

echo.
echo --- Step 1/3: Signing in to Firebase ---
echo.
call "%FIREBASE%" login
if errorlevel 1 (
  echo.
  echo Login failed. Press any key to exit.
  pause
  exit /b 1
)

echo.
echo --- Step 2/3: Choose your Firebase project ---
echo.
echo Existing projects on your account:
echo.
call "%FIREBASE%" projects:list
echo.
echo Either type the Project ID of an existing project (e.g. skdental-12345)
echo or type a brand-new lowercase ID (e.g. skdental-clinic-2026) and we'll create it.
echo.
set /p PROJECT_ID="Project ID: "

if "!PROJECT_ID!"=="" (
  echo No ID entered. Aborting.
  pause
  exit /b 1
)

REM Try to switch to the existing project; if not found, create it.
call "%FIREBASE%" use !PROJECT_ID! 2>nul
if errorlevel 1 (
  echo.
  echo Project !PROJECT_ID! not found. Creating it...
  call "%FIREBASE%" projects:create !PROJECT_ID! --display-name "SK Dental Group"
  if errorlevel 1 (
    echo.
    echo Could not create project. Common reasons:
    echo   - ID already taken globally ^(try a different one^)
    echo   - You haven't accepted Firebase Terms of Service yet
    echo     ^(go to https://console.firebase.google.com once, then re-run^)
    pause
    exit /b 1
  )
  call "%FIREBASE%" use !PROJECT_ID!
)

REM Write .firebaserc
^> ".firebaserc" echo {
^>^> ".firebaserc" echo   "projects": {
^>^> ".firebaserc" echo     "default": "!PROJECT_ID!"
^>^> ".firebaserc" echo   }
^>^> ".firebaserc" echo }

echo.
echo --- Step 3/3: Deploying to Firebase Hosting ---
echo.
call "%FIREBASE%" deploy --only hosting --project !PROJECT_ID!
if errorlevel 1 (
  echo.
  echo Deploy failed. Check the error above.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo   DONE - Your site is live at:
echo     https://!PROJECT_ID!.web.app
echo     https://!PROJECT_ID!.firebaseapp.com
echo ============================================================
echo.
pause
