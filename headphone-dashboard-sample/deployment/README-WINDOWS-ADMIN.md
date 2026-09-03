# Windows 远程部署说明

管理员可以只在 Windows 上操作；看板服务和数据仍然运行、保存在 Linux。

推荐使用 `windows-admin-gui` 中构建出的统一管理 EXE：每次启动并连接服务器只输入一次 root 密码，即可连续运行部署、启停、账号和客户端管理操作。构建与使用方法见 `windows-admin-gui/README.md`。原有 `windows-admin` BAT 继续保留，适合旧环境和单步排障；BAT 每次调用 `ssh.exe`，因此可能重复询问 root 密码。

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
7. `65_sync_dashboard_projects.bat`（扫描项目并建立外挂编码表）
8. `60_add_dashboard_user.bat`（首次至少创建一个管理员）
9. `22_dashboard_self_check.bat`
10. `30_configure_tunnel_access.bat`
11. `50_enable_service.bat`
12. `51_start_service.bat`
13. `55_service_health.bat`

配置服务不会启动服务；配置 SSH 通道不会创建客户端；启停服务不会重写配置。

## 看板账号和项目权限

SSH 客户端密钥只决定一台 Windows 电脑能否建立隧道。浏览器打开看板后，还需要
使用看板账号登录。看板账号配置保存在 `/etc/earphone-dashboard/access.json`，密码只
保存 PBKDF2-SHA256 哈希。

项目编码单独保存在 `/home/earphone/kanban/projects/.dashboard-project-index.json`，不会
写入或修改项目 JSON。编码表中的 title 来自项目 JSON 已有的 `title`（服务器项目优先
使用 `_server.title`）。`02_upload_app.bat` 会排除整个 `projects`，因此程序更新不会覆盖
编码表和项目数据。

- `60_add_dashboard_user.bat`：添加账号。管理员可以看到全部项目并创建项目；普通账号输入允许访问的项目编码，多个编码用英文逗号分隔。
- `61_list_dashboard_users.bat`：列出账号、管理员状态和项目授权。
- `62_set_dashboard_access.bat`：修改管理员状态或项目编码列表，同时撤销该账号已有登录会话。
- `63_reset_dashboard_password.bat`：重置密码，同时撤销已有登录会话。
- `64_delete_dashboard_user.bat`：删除账号并使其会话立即失效。
- `65_sync_dashboard_projects.bat`：扫描项目，给新增项目自动分配 `P0001` 格式的稳定编码；路径变化且 title 唯一时自动保留原编码。
- `66_list_dashboard_projects.bat`：列出编码、状态、title 和相对路径。
- `67_change_dashboard_project_code.bat`：修改编码，并同步替换用户授权中的旧编码、撤销受影响账号的已有会话。
- `68_relink_dashboard_project.bat`：重名等情况无法自动识别移动时，把已有编码重新关联到指定相对 JSON 路径。

服务会在每次请求时读取授权配置，因此增删账号、修改权限和重置密码都不需要重启服务。
服务器部署只允许旧路径接口访问统一 `projects` 根目录内的文件；权限使用外挂索引中的
稳定编码，并暂时兼容升级前按文件夹名配置的旧授权。项目列表、项目 JSON、照片和缩略图
都由后端按登录账号校验，不能通过直接输入项目 URL 绕过列表过滤。

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
- `60` 到 `64`：管理看板登录账号和项目授权。
- `65` 到 `68`：维护外挂项目编码表；新增、移动或重命名项目后先运行 `65`。

## 网络边界

Linux 看板只监听 `127.0.0.1:7362`。公司网络只需要允许客户端访问 Linux SSH 端口。Windows 客户端通过独立密钥和本地端口建立 SSH 隧道，不应直接开放 Linux 的 `7362/tcp`。

SSH 隧道配置使用 `/etc/ssh/sshd_config` 末尾带边界标记的受管块。脚本会先用
`sshd -t -f` 验证候选文件，再备份、安装和重载；对于不支持 `Include` 的旧版
OpenSSH，会自动移除本工具此前添加的 `sshd_config.d` Include 行。
SSH 重载依次尝试 `systemctl`、Ubuntu 14.04 常用的 `service ssh reload`，以及
`/etc/init.d/ssh reload`，不要求 SSH 服务必须注册为 systemd unit。
