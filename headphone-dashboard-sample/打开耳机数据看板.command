#!/bin/zsh

set -u

cd "$(dirname "$0")"

if [[ -z "${PORT:-}" ]]; then
  PORT=""
  for candidate in {7362..7461}; do
    if ! lsof -iTCP:"${candidate}" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
      PORT="${candidate}"
      break
    fi
  done
fi

if [[ -z "${PORT:-}" ]]; then
  osascript -e 'display dialog "没有找到可用端口（7362-7461），无法启动耳机数据看板。" buttons {"好"} default button "好" with icon caution'
  exit 1
fi

export PORT
URL="http://127.0.0.1:${PORT}"

if ! command -v python3 >/dev/null 2>&1; then
  osascript -e 'display dialog "没有找到 python3，无法启动耳机数据看板。请先安装 Python 3。" buttons {"好"} default button "好" with icon caution'
  exit 1
fi

if curl -fsS "$URL" >/dev/null 2>&1; then
  open "$URL"
  echo "耳机数据看板已经在运行，已为你打开：$URL"
  exit 0
fi

echo "正在启动耳机数据看板..."
echo "浏览器会自动打开：$URL"
echo "使用期间请不要关闭这个窗口；关闭窗口会停止本地看板服务。"
echo

(sleep 1; open "$URL") &
python3 server.py
