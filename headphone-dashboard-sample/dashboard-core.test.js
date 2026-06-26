const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("./dashboard-core");

test("photo fields are detected from all server-supported image extensions", () => {
  const rows = [{ side_view: "/tmp/U001/deviceA/001.HEIC" }, { side_view: "" }];
  assert.equal(core.isPhotoField("side_view", rows), true);
  assert.equal(core.isPhotoField("bmp_view", [{ bmp_view: "photo.bmp?cache=1" }]), true);
});

test("adaptive axis is not clipped to 10 for non-score metrics", () => {
  const range = core.computeAxisRange([37.2, 41.8, 44.1], "adaptive", "concha_length_mm");
  assert.ok(range.axisMax > 44.1);
});

test("full axis only forces 0-10 for score-like metrics", () => {
  assert.deepEqual(core.computeAxisRange([3, 8, 9], "full", "comfort_score"), { axisMin: 0, axisMax: 10 });
  const measurementRange = core.computeAxisRange([37.2, 41.8, 44.1], "full", "concha_length_mm");
  assert.ok(measurementRange.axisMax > 44.1);
});

test("pressure fields support English suffix and Chinese column names", () => {
  assert.equal(core.isPressureField("tragus_pressure_score"), true);
  assert.equal(core.isPressureField("耳屏挤压"), true);
  assert.equal(core.isPressureField("comfort_score"), false);
});

test("data quality report catches missing IDs, duplicate conditions, score ranges, and user-level conflicts", () => {
  const rows = [
    { user_id: "U001", device_name: "A", gender: "女", comfort_score: "8" },
    { user_id: "U001", device_name: "A", gender: "男", comfort_score: "11" },
    { user_id: "", device_name: "B", gender: "女", comfort_score: "7" }
  ];
  const report = core.validateRows(rows, {
    userIdField: "user_id",
    deviceField: "device_name",
    scoreFields: ["comfort_score"],
    userLevelFields: ["gender"]
  });
  assert.equal(report.totalIssues, 4);
  assert.equal(report.items.some(item => item.type === "missing_user"), true);
  assert.equal(report.items.some(item => item.type === "duplicate_condition"), true);
  assert.equal(report.items.some(item => item.type === "score_out_of_range"), true);
  assert.equal(report.items.some(item => item.type === "user_level_conflict"), true);
});

test("field roles are inferred and can be overridden", () => {
  const rows = [
    {
      user_id: "U001",
      device_name: "A",
      gender: "女",
      comfort_score: "8",
      tragus_pressure_score: "3",
      side_view: "/tmp/001.heic",
      comments: "ok"
    }
  ];
  const roles = core.resolveFieldRoles(Object.keys(rows[0]), rows, { comfort_score: "dimension" });
  assert.equal(roles.user_id, "user_id");
  assert.equal(roles.device_name, "device");
  assert.equal(roles.gender, "user");
  assert.equal(roles.comfort_score, "dimension");
  assert.equal(roles.tragus_pressure_score, "pressure");
  assert.equal(roles.side_view, "photo");
  assert.equal(roles.comments, "ignore");
});

test("photo mapping follows user folders and supports per-cell overrides", () => {
  const rows = [
    { user_id: "U001", device_name: "A" },
    { user_id: "U001", device_name: "B" }
  ];
  const files = [
    { user_folder: "U001", name: "2.jpg", absolute_path: "/photos/U001/2.jpg" },
    { user_folder: "U001", name: "1.jpg", absolute_path: "/photos/U001/1.jpg" },
    { user_folder: "U001", name: "3.jpg", absolute_path: "/photos/U001/3.jpg" }
  ];
  const result = core.mapPhotosToRows(rows, files, {
    userField: "user_id",
    views: ["正面", "侧面"],
    overrides: { "1::photo_侧面": "/manual/B-side.jpg" }
  });
  assert.equal(result.photoFields[0], "photo_正面");
  assert.equal(result.mapped[0].photo_正面, "/photos/U001/1.jpg");
  assert.equal(result.mapped[0].photo_侧面, "/photos/U001/2.jpg");
  assert.equal(result.mapped[1].photo_正面, "/photos/U001/3.jpg");
  assert.equal(result.mapped[1].photo_侧面, "/manual/B-side.jpg");
  assert.equal(result.reviews[0].status, "missing");
});

test("sequence photo mapping can use ear side in the capture order", () => {
  const rows = [
    { user_id: "U001", ear_side: "左耳", device_name: "A" },
    { user_id: "U001", ear_side: "右耳", device_name: "A" }
  ];
  const files = [
    { user_folder: "U001", name: "1.jpg", absolute_path: "/photos/U001/1.jpg" },
    { user_folder: "U001", name: "2.jpg", absolute_path: "/photos/U001/2.jpg" },
    { user_folder: "U001", name: "3.jpg", absolute_path: "/photos/U001/3.jpg" },
    { user_folder: "U001", name: "4.jpg", absolute_path: "/photos/U001/4.jpg" }
  ];
  const result = core.mapPhotosToRows(rows, files, {
    userField: "user_id",
    earField: "ear_side",
    views: ["左耳正面", "左耳侧面", "右耳正面", "右耳侧面"]
  });
  assert.equal(result.photoFields[0], "photo_左耳正面");
  assert.equal(result.photoViews[0].label, "左耳 · 正面");
  assert.equal(result.mapped[0].photo_左耳正面, "/photos/U001/1.jpg");
  assert.equal(result.mapped[0].photo_左耳侧面, "/photos/U001/2.jpg");
  assert.equal(result.mapped[0].photo_右耳正面, "");
  assert.equal(result.mapped[1].photo_右耳正面, "/photos/U001/3.jpg");
  assert.equal(result.mapped[1].photo_右耳侧面, "/photos/U001/4.jpg");
  assert.equal(result.mapped[1].photo_左耳正面, "");
  assert.equal(result.reviews[0].status, "ok");
});

test("photo mapping can match folder levels by name, ear side, prototype, and direction in any order", () => {
  const rows = [
    { name: "张三", ear_side: "左耳", prototype: "样机A" },
    { name: "张三", ear_side: "右耳", prototype: "样机A" }
  ];
  const files = [
    {
      relative_path: "左耳/正面/张三/样机A/001.jpg",
      absolute_path: "/photos/左耳/正面/张三/样机A/001.jpg",
      name: "001.jpg"
    },
    {
      relative_path: "样机A/张三/侧面/左耳/002.jpg",
      absolute_path: "/photos/样机A/张三/侧面/左耳/002.jpg",
      name: "002.jpg"
    },
    {
      relative_path: "张三/右耳/样机A/正面/003.jpg",
      absolute_path: "/photos/张三/右耳/样机A/正面/003.jpg",
      name: "003.jpg"
    }
  ];
  const result = core.mapPhotosToRows(rows, files, {
    mode: "folders",
    userField: "name",
    earField: "ear_side",
    deviceField: "prototype",
    views: core.inferFolderViews(rows, files, {
      userField: "name",
      earField: "ear_side",
      deviceField: "prototype"
    })
  });
  assert.equal(result.photoFields[0], "photo_左耳_正面");
  assert.equal(result.photoViews[0].label, "左耳 · 正面");
  assert.equal(result.photoViews[2].label, "右耳 · 正面");
  assert.equal(result.mapped[0].photo_左耳_正面, "/photos/左耳/正面/张三/样机A/001.jpg");
  assert.equal(result.mapped[0].photo_左耳_侧面, "/photos/样机A/张三/侧面/左耳/002.jpg");
  assert.equal(result.mapped[0].photo_右耳_正面, "");
  assert.equal(result.mapped[1].photo_右耳_正面, "/photos/张三/右耳/样机A/正面/003.jpg");
  assert.equal(result.mapped[1].photo_右耳_侧面, "");
  assert.equal(result.reviews[1].status, "missing");
});

test("folder mode infers view names from direction folders", () => {
  const rows = [
    { name: "张三", ear_side: "左耳", prototype: "样机A" },
    { name: "张三", ear_side: "右耳", prototype: "样机A" }
  ];
  const files = [
    { relative_path: "张三/左耳/样机A/view_正面/001.jpg", absolute_path: "/photos/1.jpg", name: "001.jpg" },
    { relative_path: "张三/右耳/样机A/方向-侧面/002.jpg", absolute_path: "/photos/2.jpg", name: "002.jpg" }
  ];
  const inferred = core.inferFolderViews(rows, files, {
    userField: "name",
    earField: "ear_side",
    deviceField: "prototype"
  });
  assert.equal(inferred.includes("正面"), true);
  assert.equal(inferred.includes("侧面"), true);
  assert.equal(inferred.length, 2);
});

test("folder matching adapts to decorated folder names instead of requiring exact folder names", () => {
  const rows = [
    { name: "张三", ear_side: "左耳", prototype: "样机A" }
  ];
  const files = [
    {
      relative_path: "姓名-张三/L-左耳/view_正面/样机A_试产/001.jpg",
      absolute_path: "/photos/姓名-张三/L-左耳/view_正面/样机A_试产/001.jpg",
      name: "001.jpg"
    }
  ];
  const result = core.mapPhotosToRows(rows, files, {
    mode: "folders",
    userField: "name",
    earField: "ear_side",
    deviceField: "prototype",
    views: ["正面"]
  });
  assert.equal(result.mapped[0].photo_左耳_正面, "/photos/姓名-张三/L-左耳/view_正面/样机A_试产/001.jpg");
  assert.equal(result.reviews[0].status, "ok");
});

test("numeric summaries include n, mean, and sample standard deviation", () => {
  const summary = core.numericSummary([{ score: "2" }, { score: "4" }, { score: "" }, { score: "6" }], "score");
  assert.equal(summary.n, 3);
  assert.equal(summary.mean, 4);
  assert.equal(Number(summary.sd.toFixed(2)), 2);
});

test("dashboard config import keeps only fields in the current schema", () => {
  const config = core.sanitizeDashboardConfig({
    layout: { columns: [{ id: "gender", visible: true }, { id: "old_field", visible: false }] },
    fieldRoleOverrides: { gender: "user", old_field: "metric" },
    primaryDimension: "gender",
    metric: "old_field",
    showErrorBars: false
  }, ["gender", "comfort_score"]);
  assert.deepEqual(config.fieldRoleOverrides, { gender: "user" });
  assert.deepEqual(config.layout.columns, [{ id: "gender", visible: true }]);
  assert.equal(config.primaryDimension, "gender");
  assert.equal(config.metric, "");
  assert.equal(config.showErrorBars, false);
});

test("project documents keep rows, mapping state, and dashboard config together", () => {
  const project = core.buildProjectDocument({
    rows: [{ user_id: "U001", comfort_score: "8" }],
    mappingRows: [{ user_id: "U001" }],
    photoRoot: "/photos",
    mappingMode: "folders",
    mappingFields: { userField: "user_id", earField: "ear_side", deviceField: "device_name" },
    mappingViews: ["正面"],
    photoMappingOverrides: { "0::photo_正面": "/photos/U001/1.jpg" },
    dashboardConfig: {
      fieldRoleOverrides: { comfort_score: "metric" },
      metric: "comfort_score",
      showErrorBars: false
    }
  });
  assert.equal(project.version, 1);
  assert.equal(project.photoRoot, "/photos");
  assert.equal(project.mappingMode, "folders");
  assert.equal(project.mappingFields.earField, "ear_side");
  assert.equal(project.rows.length, 1);
  assert.equal(project.dashboardConfig.showErrorBars, false);

  const clean = core.sanitizeProjectDocument({
    ...project,
    rows: "bad",
    dashboardConfig: { fieldRoleOverrides: { old: "metric", comfort_score: "metric" }, metric: "comfort_score" }
  });
  assert.deepEqual(clean.rows, []);
  assert.deepEqual(clean.dashboardConfig.fieldRoleOverrides, {});
});
