@echo off
cd /d "%~dp0"
echo.
echo   句元战棋 - 开发服务器
echo   ----------------------------------------
echo   启动后打开:  http://127.0.0.1:5175/
echo   关闭这个窗口即停止服务
echo   ----------------------------------------
echo.
call npm run dev
pause
