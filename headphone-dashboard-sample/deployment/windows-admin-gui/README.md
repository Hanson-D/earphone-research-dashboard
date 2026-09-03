# Windows 看板远程管理工具

`EarphoneDashboardAdmin.exe` 把原来分散的 Windows 管理 BAT 集成到一个窗口中。它通过一条 SSH 连接执行部署、服务、客户端、看板账号和项目编码操作，因此每次打开工具并连接服务器时，只需输入一次 Linux root 密码。

root 密码只存在当前进程内存中，不写入设置、文件或日志。关闭工具或断开连接后，下次连接需要重新输入。首次连接会显示服务器 SSH 主机密钥指纹；确认后记录在当前 Windows 用户的应用数据目录中，以便后续检测服务器身份变化。

## 构建 EXE

构建必须在 64 位 Windows 上完成：

1. 安装 64 位 Python 3.9 或更新版本，并勾选安装 Python Launcher。
2. 双击 `build-admin-tool.bat`。
3. 首次构建需要 Windows 能访问 Python 包源；Linux 服务器不需要联网。
4. 生成文件位于 `dist\EarphoneDashboardAdmin.exe`。

构建脚本使用独立的 `.build-venv`，不会修改系统 Python。需要从源码调试时，可在成功构建后运行 `run-from-source.bat`。

## 使用

1. 把 EXE 放在看板程序目录内，或启动后通过左侧“本地程序目录”选择包含 `server` 和 `deployment` 的目录。
2. 输入 Linux 服务器 IP、SSH 端口和 `root`，点击“连接”。
3. 输入一次 root 密码；首次连接核对并接受主机密钥指纹。
4. 在左侧选择功能分区并运行操作。需要回答 Linux 脚本问题时，用窗口底部输入框；密码等敏感回答用“发送密码”。
5. 客户端包默认保存到当前 Windows 用户的 `Downloads\EarphoneDashboardClients`。

“添加并下载客户端”会先在 Linux 创建受限隧道账号，再通过同一 SSH 连接下载客户端包。如果创建成功但下载中断，可运行“下载已有客户端包”重试，不需要也不能重复创建账号。

## 首次部署建议顺序

1. 上传程序
2. 部署前检查
3. 准备 Python 环境
4. 配置看板服务
5. 初始化数据目录
6. 同步项目编码
7. 添加首个看板管理员账号
8. 看板自检
9. 配置 SSH 隧道
10. 启用开机启动
11. 启动服务
12. 健康检查
13. 添加并下载客户端

SSH root 密码与看板账号密码是两类凭据。窗口复用 root 密码只解决远程管理登录；创建或重置看板账号时，仍需输入该看板账号的新密码。

原有 `deployment/windows-admin` BAT 不会被删除，仍可用于兼容旧环境和逐步排障。
