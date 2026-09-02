# Windows 远程部署说明

这一套脚本让管理员只在 Windows 上操作。Windows BAT 通过 SSH 调用 Linux 脚本；看板服务和数据仍然运行、保存在 Linux。

## 前提

- 应用目录已经位于 `/home/earphone/kanban/app`；也可以使用可选的 `02_upload_app.bat` 上传。
- Windows 已安装 OpenSSH Client，命令行中存在 `ssh.exe` 和 `scp.exe`。
- Windows 管理员能够通过 SSH 登录 Linux root。
- Linux 使用 systemd 和 OpenSSH Server。

所有 BAT 文件都只包含 ASCII 英文文本，避免 Windows 命令行编码问题。

## 首次部署顺序

在 Windows 中进入 `deployment/windows-admin`，依次双击：

1. `00_configure_connection.bat`
2. `01_test_connection.bat`
3. `10_preflight.bat`
4. `15_prepare_python_runtime.bat`
5. `20_configure_service.bat`
6. `21_initialize_dashboard.bat`
7. `22_dashboard_self_check.bat`
8. `30_configure_tunnel_access.bat`
9. `50_enable_service.bat`
10. `51_start_service.bat`
11. `55_service_health.bat`

配置服务不会启动服务；配置 SSH 通道不会创建客户端；启停服务不会重写配置。

`15_prepare_python_runtime.bat` 默认从 `/root/anaconda3/bin/python3` 离线克隆
Conda 环境到 `/opt/earphone-dashboard/python`。服务和自检始终使用克隆后的绝对路径，
不会调用 `dashboard` 账号 PATH 中的 `/usr/bin/python3`，也不会开放 `/root` 目录权限。
如果克隆环境中没有 Pillow，脚本会按服务器架构自动查找 `/tmp` 下对应的
Pillow 9.5.0 manylinux 2.17 wheel 并离线安装。

## 添加客户端

双击 `40_add_client.bat`，交互输入：

- 客户端编号，例如 `win1`。
- 该客户端可访问的服务器 IP 或 DNS 名称。
- Windows 本地端口；留空自动从 `17361` 开始分配。

成功后客户端包下载到：

```text
deployment/windows-admin/downloads/win1
```

将整个目录交付给指定 Windows 电脑。该电脑先运行 `install-client.bat`，以后运行 `start-kanban.bat` 打开看板。

确认 Windows 客户端安装和连接成功后，管理员运行 `43_delete_server_export.bat` 删除 Linux root 目录内的私钥导出副本。

## 日常管理

- `41_list_clients.bat`：列出已登记客户端。
- `42_revoke_client.bat`：撤销指定客户端，不删除项目数据。
- `52_stop_service.bat`：停止看板。
- `53_restart_service.bat`：重启看板。
- `54_service_status.bat`：查看状态和监听地址。
- `55_service_health.bat`：执行 HTTP 健康检查。
- `56_service_logs.bat`：持续查看日志，按 Ctrl+C 退出。

## 网络边界

Linux 看板只监听 `127.0.0.1:7362`。公司网络只需要允许客户端访问 Linux SSH 端口。Windows 客户端通过独立密钥和本地端口建立 SSH 隧道，不应直接开放 Linux 的 `7362/tcp`。

SSH 隧道配置使用 `/etc/ssh/sshd_config` 末尾带边界标记的受管块。脚本会先用
`sshd -t -f` 验证候选文件，再备份、安装和重载；对于不支持 `Include` 的旧版
OpenSSH，会自动移除本工具此前添加的 `sshd_config.d` Include 行。
