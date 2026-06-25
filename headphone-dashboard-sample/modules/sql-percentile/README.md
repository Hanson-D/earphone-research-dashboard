# 03 SQL 百分位分析模块

该目录是独立模块草案，不直接接入当前 `index.html`、`app.js`、`server.py`。

目标：

- 从 02 数据看板选中某个用户/记录后，跳转到 03 页面。
- 03 页面连接本地 SQLite 大数据库。
- 自动读取数据库表和字段。
- 将当前用户数据字段与数据库字段做候选匹配。
- 对匹配成功的数值字段计算该用户在数据库中的百分位。
- 可选地接收 04 队列模块生成的筛选条件，对特定参照人群计算百分位。
- 将结果整理成可直接渲染的卡片模型，便于后续主页面接入。

当前文件：

- `sql_percentile.py`: SQLite schema 读取、字段白名单筛选、百分位和统计摘要计算。
- `sql_percentile_api.py`: 独立 API 适配层，可被本地服务器挂载。
- `sql_percentile_cli.py`: 命令行验证入口，可创建 fixture、读取 schema、运行 percentile payload。
- `sql_percentile_fixture.py`: 小型 SQLite 示例库和示例请求构造器。
- `sql-percentile.js`: 前端字段匹配、请求构造、结果展示模型，以及分析包 JSON/CSV 导出。
- `sql-percentile-page.html`: 未来接入主看板时使用的页面片段。
- `sql-percentile-demo.html`: 独立静态演示页，不依赖 01/02。
- `integration-contract.md`: 从 02 跳到 03 以及 API 数据结构的契约。

后续合并方式：

1. 在主 `index.html` 增加 `03 · SQL 百分位分析` 页面入口。
2. 在主 `server.py` 中挂载 `sql_percentile.py` 提供的 schema 和 percentile API。
3. 在主 `app.js` 中从 02 详情行传入当前用户记录，并调用 `sql-percentile.js` 渲染 03 页面。

与后续模块的关系：

- 04 `cohort-builder` 负责产生 `cohortFilters`，03 负责应用这些筛选并计算百分位。
- 05 `report-export` 可接收 03 的 percentile results，生成报告模型、CSV 或可打印 HTML。

当前模块假设数据库为 SQLite。若后续改成 PostgreSQL/MySQL，可保留前端字段匹配和百分位展示逻辑，只替换后端数据访问层。

CLI 示例：

```bash
python3 sql_percentile_cli.py fixture /tmp/ear_fixture.sqlite --print-payload
python3 sql_percentile_cli.py schema /tmp/ear_fixture.sqlite
python3 sql_percentile_cli.py percentile payload.json
```
