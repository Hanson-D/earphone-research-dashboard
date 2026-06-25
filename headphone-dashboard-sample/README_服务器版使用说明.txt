耳机数据看板 - 服务器版使用说明

一、适用场景

服务器版用于把看板放在一台服务器或实验室内网电脑上，让多名用户通过统一入口访问多个项目。

入口页面：

http://服务器地址:端口/server.html

看板本身不做账号和权限管理。如果需要权限控制，请在服务器、反向代理或单位内网系统中完成。


二、Linux/macOS 服务器启动

1. 解压 earphone-dashboard-server.zip。
2. 进入 EarphoneDashboardServer 文件夹。
3. 执行：

chmod +x start-server.sh
./start-server.sh

默认监听：

0.0.0.0:8000

本机测试：

http://127.0.0.1:8000/server.html

其他设备访问：

http://服务器IP:8000/server.html


三、Windows 服务器或内网电脑启动

1. 解压 earphone-dashboard-server.zip。
2. 进入 EarphoneDashboardServer 文件夹。
3. 双击 start-server.bat。
4. 在其他设备浏览器访问：

http://服务器IP:8000/server.html


四、修改端口

Linux/macOS：

PORT=9000 ./start-server.sh

Windows PowerShell：

$env:PORT="9000"
.\start-server.bat


五、服务器版与本地版的区别

服务器版：

1. 默认入口是 server.html。
2. 项目按 projectId 保存在服务器的 projects 目录。
3. 支持统一项目列表和多看板切换。
4. 保存时带 revision，能阻止多人同时编辑时的静默覆盖。
5. 默认关闭任意本地路径读取、任意照片目录扫描和绝对路径照片接口。

本地版：

1. 适合单个用户在自己的电脑上双击使用。
2. 可以扫描本机照片目录。
3. 可以使用本机绝对路径保存项目 JSON。


六、多人使用是否会冲突

多人只查看、筛选、切换图表，不会互相冲突。

多人同时保存同一个项目时，如果其中一人已经先保存，另一个人的旧版本保存会被拒绝，并提示重新加载后再保存。
