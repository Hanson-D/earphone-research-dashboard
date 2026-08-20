耳机数据看板 - Linux/内网部署使用说明

一、适用场景

当前推荐部署方式是把看板放在一台 Linux 服务器或实验室内网电脑上，让用户通过当前主看板入口访问项目。

入口页面：

http://服务器地址:端口/

看板本身不做账号和权限管理。如果需要权限控制，请在服务器、反向代理或单位内网系统中完成。


二、Linux/macOS 服务器启动

1. 解压 earphone-dashboard-server.zip。
2. 进入 EarphoneDashboardServer 文件夹。
3. macOS 用户可以双击：

start-server.command

如果系统提示没有权限打开该文件，可在终端中执行一次：

chmod +x start-server.command

也可以在 Linux/macOS 终端执行：

chmod +x start-server.sh
./start-server.sh

默认监听：

0.0.0.0:7362

本机测试：

http://127.0.0.1:7362/

其他设备访问：

http://服务器IP:7362/


三、Windows 服务器或内网电脑启动

1. 解压 earphone-dashboard-server.zip。
2. 进入 EarphoneDashboardServer 文件夹。
3. 双击 start-server.bat。
4. 在其他设备浏览器访问：

http://服务器IP:7362/


四、修改端口

Linux/macOS：

PORT=9000 ./start-server.sh

Windows PowerShell：

$env:PORT="9000"
.\start-server.bat


五、部署注意事项

1. 当前默认入口是根路径 /，旧的 server/server.html 只作为兼容能力保留。
2. 不要设置 DASHBOARD_LEGACY_PATHS=0，否则本地项目路径、照片扫描和绝对照片路径预览会被关闭。
3. 项目 JSON 默认保存在 projects 目录。
4. 大照片项目建议把照片目录放在服务器本机磁盘或稳定挂载的共享目录中，项目中保存照片根目录或相对路径，不要整包复制几十 GB 照片。
5. 多人只查看、筛选、切换图表，不会互相冲突；多人同时保存同一个 JSON 文件时，仍需要通过目录权限或使用流程避免覆盖。

旧服务器项目入口如需临时使用，可手动访问 http://服务器IP:7362/server/server.html，但该入口不是当前主流程。
