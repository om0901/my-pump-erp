@echo off
echo Initializing Git repository for MY PUMP ERP...
git init
git add .
git commit -m "feat: complete MY PUMP ERP system with automated daily shifts, lubricants matrix, stock patrak, and sell patrak sync"
git branch -M main
echo Git repository initialized and initial commit created on main branch!
pause
