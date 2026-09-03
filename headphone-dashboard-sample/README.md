# 耳机数据看板示例数据

该目录用于确认数据结构，不包含真实受试者数据。

## 独立项目制作器

如果需要在打开看板前自动完成 CSV、照片映射和项目文件夹生成，可使用跨平台命令行工具：

```bash
node project-builder/cli.js build --help
```

它与看板复用同一套映射核心，不依赖第三方 npm 包，适合在 Linux 批处理或定时任务中运行。完整说明见 [`project-builder/README.md`](project-builder/README.md)。

## 数据粒度

- `headphone_sample.csv` 每行代表一个用户对一个设备的测试结果。
- 示例中包含 6 名用户、3 个设备，共 18 行。
- 每个设备只有一个测试条件，因此没有单独设置轮次或条件字段。
- 同一用户的组间字段会在不同设备行中重复。

## 字段分组

- 标识：`record_id`、`user_id`
- 设备：`device_id`、`device_name`
- 人口学：`gender`、`age`、`age_group`
- 耳型：`ear_side`、`concha_size`、`concha_length_mm`、`concha_width_mm`、`ear_canal_size`、`ear_protrusion`、`helix_shape`
- 评分：`satisfaction_score`、`comfort_score`、`stability_score`，均为 1-10 分
- 挤压：固定位置作为独立表头，当前包括 `tragus_pressure_score`（耳屏）、`antitragus_pressure_score`（对耳屏）、`helix_pressure_score`（耳轮）、`auricle_front_pressure_score`（耳廓前侧）、`auricle_upper_pressure_score`（耳廓上侧）、`postauricular_middle_pressure_score`（耳后中侧）、`lobe_rear_pressure_score`（耳垂后侧）和 `auricle_outer_pressure_score`（耳廓外侧）
- 挤压分数：均为 1-10 分，`1` 表示基本无挤压，分数越高表示挤压越明显
- 其他：`fit_result`、`original_sound_score`、`comments`
- 照片：`photo_path`，位于每行最后，供看板直接显示在详情行后面

## 照片关联

照片是 AI 生成的虚构占位素材。当前假设照片属于用户，因此同一用户测试不同设备时复用同一张照片：

```text
U001 的所有设备行 -> photos/U001_ear.png
U002 的所有设备行 -> photos/U002_ear.png
```

若实际照片与设备有关，可改成每行一个独立路径，例如：

```text
photos/U001_D01_ear.png
```

## 启动本地服务器

Windows 普通用户可以直接双击：

```text
打开耳机数据看板.bat
```

双击后会自动启动本地服务器，并在默认浏览器中打开看板。使用期间请不要关闭弹出的命令行窗口；关闭窗口会停止本地看板服务。

macOS 用户可以直接双击：

```text
打开耳机数据看板.command
```

双击后会自动启动本地服务器，并在浏览器中打开看板。使用期间请不要关闭弹出的终端窗口；关闭窗口会停止本地看板服务。

如果系统提示没有权限打开该文件，可在终端中执行一次：

```bash
chmod +x 打开耳机数据看板.command
```

开发者也可以手动启动：

从 `headphone-dashboard-sample` 目录启动项目自带服务器：

```bash
python3 server/server.py
```

然后在 Chrome 中访问：

```text
http://localhost:7362
```

必须使用 `server/server.py`，而不是普通的 `python3 -m http.server`。项目服务器负责：

- 扫描用户填写的本地照片根目录
- 读取用户文件夹与照片文件名
- 为看板安全提供本地照片预览
- 支持 CSV 中保存的绝对照片路径

## Linux/内网部署

当前 Linux/内网部署默认使用本地版看板入口，也就是根路径 `/`。不要把普通用户引导到旧的 `server/server.html`。

如果管理员希望全部从 Windows 远程完成 Linux 配置、服务启停和 SSH 隧道客户端发放，请使用 `deployment/windows-admin` 下的 BAT 脚本。完整顺序见 `deployment/README-WINDOWS-ADMIN.md`。BAT 通过 SSH 调用拆分后的 Linux 模块，新增客户端不会重新配置或重启看板服务。

在服务器上进入 `headphone-dashboard-sample` 后启动：

```bash
cd headphone-dashboard-sample
HOST=0.0.0.0 PORT=7362 python3 server/server.py
```

访问：

```text
http://服务器地址:7362/
```

说明：

- 普通看板入口是 `http://服务器地址:7362/`，不是 `/server/server.html`。
- 不要设置 `DASHBOARD_LEGACY_PATHS=0`，否则页面里的本地 JSON 路径、照片根目录扫描和绝对照片路径预览会被禁用。
- 默认端口是 `7362`；如果被占用，启动器和 `server/server.py` 会自动尝试 `7362-7461`。如果显式设置 `PORT`，则使用指定端口，不自动改端口。
- 如果项目照片非常大，建议把照片目录放在服务器本机磁盘或稳定挂载的共享目录中，在项目里保存相对路径或照片根目录路径，不要把整套照片复制进项目文件夹。

旧的 `server/server.html` 统一项目入口仍保留为兼容能力，但不是当前默认部署入口。

## 自动更新本地启动器

如果不希望普通用户反复下载新版 zip，可以使用 `earphone-dashboard-launcher.zip`。

管理员维护一个共享发布目录，例如：

```text
\\server\earphone-dashboard-release
```

GitHub Actions 会生成 `earphone-dashboard-release.zip`，里面包含：

```text
EarphoneDashboardRelease/
  latest.json
  versions/
    v0.1.3/
      app/
```

将 `latest.json` 和 `versions` 复制到共享发布目录后，用户端启动器每次启动会读取 `latest.json`，把最新版复制到本机 `%LOCALAPPDATA%\EarphoneDashboard\versions`，再启动本机看板服务。共享目录不可用时，会回退到本机已缓存版本。

## 照片自动映射

页面默认打开“照片映射”。当前支持两种照片匹配方式。

## 项目模板（可选）

默认不加载项目模板，CSV 导入、照片映射和看板分析流程与普通模式完全一致。

如果需要固定项目规则，可以在“项目模板（可选）”中加载 JSON 模板。模板可包含：

```json
{
  "name": "Headphone Fit Study",
  "requiredFields": ["user_id", "device_name", "comfort_score"],
  "recommendedFields": ["age", "gender", "concha_size"],
  "numericRanges": {
    "comfort_score": [1, 10],
    "stability_score": [1, 10]
  },
  "fieldRoles": {
    "user_id": "user_id",
    "device_name": "device",
    "comfort_score": "metric"
  },
  "photoSchema": {
    "ears": ["左耳", "右耳"],
    "views": ["正面", "侧面", "后侧", "俯视"]
  }
}
```

加载模板后：

- CSV 导入时会提示缺少的必填字段、建议字段和数值范围问题。
- `fieldRoles` 会作为字段角色配置应用到看板，减少手动调整。
- 子文件夹照片映射会优先使用 `photoSchema.views` 和 `photoSchema.ears` 作为预期照片组合；没有拍到的组合会进入缺失/异常清单。
- 校验结果只做提示，不会阻止继续映射、下载 CSV 或应用到看板。
- 模板会随完整项目 JSON 一起保存；清除模板后，新导入数据回到普通自适应流程。

### 方式一：照片顺序逻辑

照片目录结构要求如下：

```text
photos/
├── U001/
│   ├── IMG_0001.jpg
│   ├── IMG_0002.jpg
│   └── ...
├── U002/
└── U003/
```

- 一级文件夹名称必须与 CSV 的用户字段一致。
- 每个用户文件夹中的照片按文件名自然排序。
- CSV 中同一用户的设备记录顺序就是设备拍摄顺序。
- 映射顺序为：`设备 1 × 全部视角`，然后 `设备 2 × 全部视角`。
- 视角名称由用户填写，例如 `正面,侧面,后侧`。

### 方式二：子文件夹逻辑

如果照片目录中一定包含“姓名/左右耳/样机/方向”这几类子文件夹，可以选择“子文件夹逻辑”。这些层级的顺序不要求固定，例如下面两种都可以匹配：

```text
photos/
├── 张三/
│   └── 左耳/
│       └── 样机A/
│           └── 正面/
│               └── IMG_0001.jpg
└── 左耳/
    └── 正面/
        └── 张三/
            └── 样机A/
                └── IMG_0002.jpg
```

使用该模式时，需要在页面中选择：

- 姓名/用户字段：CSV 中对应姓名或用户编号的列。
- 左右耳字段：可选。若 CSV 没有左右耳字段，照片映射仍会从子文件夹名识别左耳/右耳，并生成左右耳 × 方向照片列。
- 样机/设备字段：可选。若 CSV 没有设备字段，系统按单设备映射；如果照片文件夹里存在多个设备目录，会按自然排序使用第一套设备并在映射检查中提示。
- 方向：由照片目录名自动识别，不需要填写拍摄顺序。页面会隐藏顺序输入框，并在生成后把识别到的方向写回配置。

匹配逻辑是：照片路径的目录层级中包含当前行的姓名/用户、可选的样机/设备、可识别的左右耳和方向时，即映射到该用户/设备对应的左右耳 × 方向照片列。CSV 中有但照片缺失的用户/设备不会被丢弃，照片列会留空。

### 输出

- 生成的 CSV 使用 `photo_正面`、`photo_侧面`、`photo_后侧` 等列保存绝对路径。
- 映射页会检查每名用户的预期与实际照片数量，并标记照片不足或过多。
- 可以下载缺失/异常清单，用于回到照片文件夹补拍或修正目录；同一用户/设备/耳侧/视角下匹配到多张照片时，会标记为重复/补拍照片。
- 浏览器不能覆盖原始 CSV；可以下载更新后的 CSV，或直接应用到当前看板。

## 视角切换

- 数据看板一次只显示一个视角。
- 全局视角切换会同步修改全部用户照片。
- 每名用户可以单独选择视角，覆盖全局设置。
- 单用户选择“跟随全局”可取消覆盖。
- “重置视角”会恢复第一个视角，并清除全部用户覆盖。

## 第一版看板功能

- 界面采用北大红为主色的学术研究看板主题，支持完全离线使用。
- 默认读取 `headphone_sample.csv`，也可以通过页面右上角导入其他同结构 CSV。
- 详情表可直接通过各列标题中的下拉框筛选，筛选结果会同步影响透视表、柱状图和详情数据。
- 支持选择主透视维度、组合维度和主要分析指标。
- 透视表同时显示记录数、主要指标均值以及满意度、舒适性、稳定性均值。
- 点击任意透视分组后，下方详情区会只显示该组的原始记录。
- 分组详情包含组内统计、搜索、完整评分、固定挤压位置分数和行内照片。
- 同一用户的用户编号、人口学、耳型特征和照片会跨设备记录合并显示。
- “显示与布局”面板支持详情列显隐、列宽、列顺序、表格字号和照片大小调整。
- 详情表布局设置会保存在当前浏览器中，下次打开时继续使用。
- 详情表会根据每次导入 CSV 的实际表头自动生成；新增或减少字段不需要修改代码。
- 分类字段会自动进入透视维度，数值字段会自动进入主要分析指标。
- 同一用户内保持一致的字段会自动作为用户级字段跨行合并。
- 名称或内容被识别为照片的字段会渲染为图片；同一用户的不同设备照片会在合并单元格中并排展示。
- 详情表默认隐藏记录编号和设备编号，并按页面宽度紧凑分配可见列，不产生横向滚动。
- 用户级组间变量默认合并到一个紧凑的标签单元格中；仍可在“显示与布局”中展开单独字段。
- 固定挤压位置默认合并为一个“挤压”列，以“位置：分数”的彩色标签展示。
- 左上项目配置可切换挤压分数方向，支持“0 最差，10 无挤压”和“10 最差，0 无挤压”两种规则。
- `Visual Summary` 使用纵向柱状图，并跟随左侧“主要分析指标”同步切换。
- 柱状图包含 X/Y 轴、刻度、网格线和轴标题；Y 轴可选择按数据范围自适应，或固定展示完整的 0–10 分范围。
