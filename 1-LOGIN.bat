@echo off
REM Open a NEW cmd window, set PATH, and run firebase login interactively.
REM The /K flag keeps the window open after the command finishes.

start "Firebase Login" cmd /K "set PATH=C:\Program Files\nodejs;C:\Users\SKDENTAL\AppData\Roaming\npm;%PATH% && echo. && echo Running firebase login... && echo. && firebase login --no-localhost"
