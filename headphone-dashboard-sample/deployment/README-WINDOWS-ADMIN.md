# Windows 远程部署说明

管理员可以只在 Windows 上操作；看板服务和数据仍运行、保存在 Linux。推荐使用 `windows-admin-gui` 构建出的统一管理 EXE，同一次管理连接只输入一次 root 密码。原有 `windows-admin` BAT 继续作为旧环境和单步排障入口。

## 权限模型

客户端 SSH 密钥同时决定能否建立隧道和能看到哪些项目，不再使用第二套看板密码：

```text
win1 密钥 -> 服务器专属端口 17361 -> 客户端身份 win1 -> P0001,P0003
win2 密钥 -> 服务器专属端口 17362 -> 客户端身份 win2 -> P0002
```

每个受限 SSH 账号的 `authorized_keys` 只允许转发到自己的服务端端口，不能直接转发到私有后端 `127.0.0.1:7362`。看板进程读取 `/etc/earphone-dashboard/access.json`，动态创建仅监听 loopback 的客户端入口；新增、撤销和修改权限会自动热加载。

客户端包还包含与该 SSH 密钥同时生成和撤销的随机访问令牌。它在首次本地访问时换成该客户端专用的 HttpOnly Cookie，并立即从地址栏移除，用于阻止服务器上的其他普通 Linux 账号直接访问或冒充某个客户端端口。不同客户端在同一浏览器中打开时不会覆盖彼此身份。管理员只需按完整客户端包分发，不需要单独维护这枚令牌。

项目编码仍单独保存在 `/home/earphone/kanban/projects/.dashboard-project-index.json`，不会修改项目 JSON。程序上传会排除整个 `projects`，不会覆盖项目数据、编码表或权限配置。

## 前提

- Windows 管理员能通过 SSH 登录 Linux root。
- Windows 存在 OpenSSH Client；使用 BAT 时需要 `ssh.exe` 和 `scp.exe`。
- Linux 使用 OpenSSH Server 和 systemd。
- 默认应用目录为 `/home/earphone/kanban/app`。

所有 BAT 只包含 ASCII 英文文本，避免 Windows 命令行编码问题。

## 全新部署顺序

使用统一管理 EXE 时依次运行：

1. 上传程序
2. 部署前检查
3. 准备 Python 环境
4. 配置看板服务
5. 初始化数据目录
6. 同步项目编码
7. 配置 SSH 隧道
8. 添加并下载客户端，同时选择管理员权限或项目编码
9. 看板自检
10. 启用开机启动
11. 启动服务
12. 健康检查

使用 BAT 时执行对应的 `00`、`01`、`10`、`15`、`20`、`21`、`65`、`30`、`40`、`22`、`50`、`51`、`55` 脚本。

配置服务不会启动服务；配置 SSH 通道不会创建客户端。新客户端的增删和权限修改不需要重启看板服务。

## 添加客户端

在统一管理工具中运行“添加并下载客户端”，或双击 `40_add_client.bat`，输入：

- 客户端编号，例如 `win1`。
- 使用者显示名称。
- 服务器 IP 或 DNS 名称。
- Windows 本地端口；留空从 `17361` 自动分配。
- 是否为管理员；普通客户端填写允许访问的项目编码。

客户端包交付到目标 Windows 电脑后，使用实际运行看板的 Windows 账号执行一次 `install-client.bat`，以后运行 `start-kanban.bat` 即可打开，无需看板密码。

确认安装成功后，可删除服务器 `/root/kanban-export/<客户端编号>` 中的私钥导出副本。服务器只保留公钥和权限映射。

## 从旧版迁移

旧客户端密钥可以保留，但旧配置仍会把隧道直接指向 `7362`。升级时：

1. 上传新版程序。
2. 运行“配置看板服务”。
3. 运行“配置 SSH 隧道”，安装按密钥限制专属端口的新规则。
4. 运行“迁移已有客户端”，逐个分配项目权限。
5. 重启一次看板服务，使运行中的旧代码切换到客户端端口模式。
6. 下载刷新的客户端包，在目标 Windows 账号下重新运行 `install-client.bat`。

迁移会更新服务器公钥限制和客户端 `RemotePort`，不会重新生成密钥。如果服务器导出副本已经删除，迁移会生成一个不含私钥的升级包；它只能在已经安装过该客户端密钥的原 Windows 账号下运行。无需手工修改账号目录。如果原 Windows 密钥也不存在，则撤销并重新创建客户端。

新版安装器支持覆盖同一 Windows 用户以前安装的只读私钥：覆盖前临时解锁旧目标文件，完成后立即重新设置为当前用户只读。

## 日常管理

- 查看客户端及权限：列出 SSH 用户、专属端口、状态和项目编码。
- 修改客户端权限：切换管理员或修改项目编码，自动生效。
- 撤销客户端：同时撤销 SSH 公钥和项目入口。
- 同步项目编码：新增、移动或重命名项目后运行。
- 修改项目编码：同步替换所有客户端权限中的旧编码。
- 服务日志：持续查看 journal，按停止按钮或 Ctrl+C 退出。

旧 BAT 中 `61_list_dashboard_users.bat` 和 `62_set_dashboard_access.bat` 为兼容文件名，实际管理客户端权限；`60_add_dashboard_user.bat`、`63_reset_dashboard_password.bat`、`64_delete_dashboard_user.bat` 只会提示看板密码账号已经停用。

## 网络边界

- Linux 私有后端只监听 `127.0.0.1:7362`，没有客户端身份时除 `/api/health` 外拒绝访问。
- 每个客户端入口只监听自己的 `127.0.0.1:<专属端口>`。
- 公司网络只需允许访问 Linux SSH 端口，不应开放 `7362` 或任何客户端专属端口。
- SSH 用户属于 `kanban-tunnel`，禁止密码、TTY、Shell、代理转发和 X11；每把公钥用 `permitopen` 限定到自己的端口。

SSH 配置脚本兼容不支持 `Include` 的旧 OpenSSH，并依次尝试 `systemctl`、`service ssh reload` 和 `/etc/init.d/ssh reload`。

运行环境仍从 `/root/anaconda3/bin/python3` 离线克隆到 `/opt/earphone-dashboard/python`，服务不会使用 `dashboard` 账号 PATH 中的旧 `/usr/bin/python3`。
