@echo off
cd /d "%~dp0"
echo ============================================
echo   Deploying Bifrost to Vercel
echo   (a browser opens - log in with Google)
echo ============================================
echo.
call npx vercel login
call npx vercel --prod
echo.
echo ============================================
echo   Done. Copy the Production URL above.
echo   Then add your domain in Vercel - Settings - Domains
echo ============================================
pause
