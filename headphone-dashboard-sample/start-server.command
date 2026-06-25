#!/bin/zsh

set -u

cd "$(dirname "$0")"

export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-8000}"
export DASHBOARD_LEGACY_PATHS=0

URL="http://127.0.0.1:${PORT}/server.html"

if ! command -v python3 >/dev/null 2>&1; then
  osascript -e 'display dialog "没有找到 python3，无法启动耳机数据看板服务器版。请先安装 Python 3。" buttons {"好"} default button "好" with icon caution'
  exit 1
fi

echo "正在启动耳机数据看板服务器版..."
echo "本机测试入口：${URL}"
echo "其他设备访问：http://服务器IP:${PORT}/server.html"
echo "使用期间请不要关闭这个窗口；关闭窗口会停止服务器。"
echo

(sleep 1; open "$URL") &
python3 server.py
