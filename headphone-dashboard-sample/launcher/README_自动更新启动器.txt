耳机数据看板 - 自动更新启动器说明

一、用途

这个启动器适合发给普通 Windows 用户长期使用。

用户只需要双击：

启动耳机数据看板.bat

启动器会自动：

1. 读取共享发布目录中的 latest.json。
2. 检查本机是否已有最新版本。
3. 如果没有，则复制新版本到本机缓存目录。
4. 启动本机看板服务。
5. 打开浏览器。
6. 如果共享目录不可用，则尝试打开本机已缓存版本。


二、管理员需要准备的共享发布目录

例如：

\\server\earphone-dashboard-release

目录结构：

\\server\earphone-dashboard-release\
  latest.json
  versions\
    0.1.2\
      app\
        index.html
        app.js
        dashboard-core.js
        server\
          server.py
        styles.css
        ...


三、latest.json 示例

{
  "version": "0.1.2",
  "path": "\\\\server\\earphone-dashboard-release\\versions\\0.1.2",
  "entry": "app",
  "notes": "修复服务器版照片上传映射"
}


四、用户端配置

把 launcher-config.example.json 复制为：

launcher-config.json

然后修改 releaseRoot：

{
  "releaseRoot": "\\\\server\\earphone-dashboard-release",
  "localRoot": "%LOCALAPPDATA%\\EarphoneDashboard",
  "preferredPort": 7362,
  "portSearchLimit": 100
}


五、本机缓存位置

默认缓存到：

%LOCALAPPDATA%\EarphoneDashboard\versions

日志位置：

%LOCALAPPDATA%\EarphoneDashboard\logs\launcher.log


六、权限说明

启动器用当前 Windows 登录用户访问共享目录。

如果用户没有共享目录或项目文件夹权限，Windows 会直接拒绝访问；启动器不会绕过这些权限。
