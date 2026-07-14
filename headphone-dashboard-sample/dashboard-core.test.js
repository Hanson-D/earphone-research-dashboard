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
  assert.equal(core.isPressureField("tragus_pressure_relief_score"), true);
  assert.equal(core.isPressureField("耳屏挤压"), true);
  assert.equal(core.isPressureField("comfort_score"), false);
  assert.equal(core.pressureSiteLabel("耳屏挤压程度"), "耳屏");
  assert.equal(core.pressureSiteLabel("对耳屏挤压分数"), "对耳屏");
  assert.equal(core.pressureSiteLabel("helix_pressure_score"), "耳轮");
  assert.equal(core.pressureSiteLabel("custom_part_pressure_score"), "custom part");
});

test("pressure risk score follows configured score direction", () => {
  assert.equal(core.pressureRiskScore("10", "low"), 0);
  assert.equal(core.pressureRiskScore("0", "low"), 10);
  assert.equal(core.pressureRiskScore("0", "high"), 0);
  assert.equal(core.pressureRiskScore("10", "high"), 10);
  assert.equal(core.pressureRiskScore("", "low"), null);
});

test("aggregatePressureSites summarizes fixed standard ear regions", () => {
  const rows = [
    { device_name: "A", tragus_pressure_score: "8", ear_hook_pressure_score: "4", rear_clip_pressure_score: "5" },
    { device_name: "A", tragus_pressure_score: "6", ear_hook_pressure_score: "2", rear_clip_pressure_score: "" },
    { device_name: "B", tragus_pressure_score: "10", ear_hook_pressure_score: "9", rear_clip_pressure_score: "8" }
  ];
  const summaries = core.aggregatePressureSites(rows.slice(0, 2), [
    "tragus_pressure_score",
    "ear_hook_pressure_score",
    "rear_clip_pressure_score"
  ], {
    pressureWorst: "low",
    labels: {
      tragus_pressure_score: "耳屏",
      ear_hook_pressure_score: "耳挂挤压",
      rear_clip_pressure_score: "耳后夹持挤压"
    },
    aggregation: "mean"
  });

  const tragus = summaries.find(item => item.siteKey === "tragus");
  const upper = summaries.find(item => item.siteKey === "upper-ear");
  const rear = summaries.find(item => item.siteKey === "postauricular");
  assert.equal(tragus.label, "耳屏");
  assert.equal(tragus.n, 2);
  assert.equal(tragus.value, 3);
  assert.equal(upper.view, "top");
  assert.equal(upper.value, 7);
  assert.equal(rear.view, "rear");
  assert.equal(rear.n, 1);
});

test("aggregatePressureSites can show high pressure rate", () => {
  const summaries = core.aggregatePressureSites([
    { helix_pressure_score: "10" },
    { helix_pressure_score: "4" },
    { helix_pressure_score: "2" }
  ], ["helix_pressure_score"], {
    pressureWorst: "high",
    aggregation: "highRate",
    highThreshold: 6
  });
  assert.equal(summaries[0].value, 1 / 3);
  assert.equal(summaries[0].valueLabel, "33%");
});

test("swapMappedPhotoAssignments swaps photo slots without mutating source rows", () => {
  const rows = [
    { user_id: "U001", photo_front: "/photos/front.jpg", photo_side: "/photos/side.jpg" },
    { user_id: "U001", photo_front: "/photos/front-b.jpg", photo_side: "" }
  ];
  const swapped = core.swapMappedPhotoAssignments(rows, {
    rowIndex: 0,
    field: "photo_front"
  }, {
    rowIndex: 1,
    field: "photo_side"
  });

  assert.equal(swapped[0].photo_front, "");
  assert.equal(swapped[1].photo_side, "/photos/front.jpg");
  assert.equal(rows[0].photo_front, "/photos/front.jpg");
});

test("swapMappedPhotoDeviceGroups swaps all photo fields between two device rows", () => {
  const rows = [
    { device: "A", photo_front: "/a-front.jpg", photo_side: "/a-side.jpg" },
    { device: "B", photo_front: "/b-front.jpg", photo_side: "/b-side.jpg" }
  ];
  const swapped = core.swapMappedPhotoDeviceGroups(rows, 0, 1, ["photo_front", "photo_side"]);

  assert.equal(swapped[0].photo_front, "/b-front.jpg");
  assert.equal(swapped[0].photo_side, "/b-side.jpg");
  assert.equal(swapped[1].photo_front, "/a-front.jpg");
  assert.equal(swapped[1].photo_side, "/a-side.jpg");
  assert.equal(rows[0].photo_front, "/a-front.jpg");
});

test("photoFilesFromBrowserSelection builds relative photo records from folder input", () => {
  const files = [
    { name: "001.jpg", webkitRelativePath: "photos/U001/左耳/正面/001.jpg" },
    { name: "notes.txt", webkitRelativePath: "photos/U001/notes.txt" },
    { name: "002.PNG", webkitRelativePath: "photos/U002/右耳/侧面/002.PNG" }
  ];
  const photos = core.photoFilesFromBrowserSelection(files, {
    urlForFile: file => `blob:${file.name}`
  });
  assert.equal(photos.length, 2);
  assert.equal(photos[0].relative_path, "U001/左耳/正面/001.jpg");
  assert.equal(photos[0].user_folder, "U001");
  assert.equal(photos[0].absolute_path, "blob:001.jpg");
  assert.equal(photos[1].relative_path, "U002/右耳/侧面/002.PNG");
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

test("sequence single-ear mode strips ear side from capture views", () => {
  const rows = [
    { user_id: "U001", device_name: "A" }
  ];
  const files = [
    { user_folder: "U001", name: "1.jpg", absolute_path: "/photos/front.jpg" },
    { user_folder: "U001", name: "2.jpg", absolute_path: "/photos/side.jpg" }
  ];
  const result = core.mapPhotosToRows(rows, files, {
    userField: "user_id",
    views: ["左耳正面", "左耳侧面"],
    singleEarMode: true
  });
  assert.deepEqual(result.photoFields, ["photo_正面", "photo_侧面"]);
  assert.equal(result.photoViews[0].label, "正面");
  assert.equal(result.mapped[0].photo_正面, "/photos/front.jpg");
  assert.equal(result.mapped[0].photo_侧面, "/photos/side.jpg");
});

test("sequence photo mapping can reserve a generic bare ear photo", () => {
  const rows = [
    { user_id: "U001", device_name: "A" },
    { user_id: "U001", device_name: "B" }
  ];
  const files = [
    { user_folder: "U001", name: "0.jpg", absolute_path: "/photos/bare.jpg" },
    { user_folder: "U001", name: "1.jpg", absolute_path: "/photos/a-front.jpg" },
    { user_folder: "U001", name: "2.jpg", absolute_path: "/photos/b-front.jpg" }
  ];
  const result = core.mapPhotosToRows(rows, files, {
    userField: "user_id",
    views: ["正面"],
    includeBareEar: true
  });
  assert.equal(result.photoFields.includes("bare_ear_photo"), true);
  assert.equal(result.mapped[0].bare_ear_photo, "/photos/bare.jpg");
  assert.equal(result.mapped[1].bare_ear_photo, "/photos/bare.jpg");
  assert.equal(result.mapped[0].photo_正面, "/photos/a-front.jpg");
  assert.equal(result.mapped[1].photo_正面, "/photos/b-front.jpg");
});

test("sequence photo mapping reserves bare ear photos by actual ear side", () => {
  const rows = [
    { user_id: "U001", ear_side: "左耳", device_name: "A" },
    { user_id: "U001", ear_side: "右耳", device_name: "A" }
  ];
  const files = [
    { user_folder: "U001", name: "0.jpg", absolute_path: "/photos/left-bare.jpg" },
    { user_folder: "U001", name: "1.jpg", absolute_path: "/photos/right-bare.jpg" },
    { user_folder: "U001", name: "2.jpg", absolute_path: "/photos/left-front.jpg" },
    { user_folder: "U001", name: "3.jpg", absolute_path: "/photos/right-front.jpg" }
  ];
  const result = core.mapPhotosToRows(rows, files, {
    userField: "user_id",
    earField: "ear_side",
    views: ["正面"],
    includeBareEar: true
  });
  assert.equal(result.mapped[0].bare_ear_photo_左耳, "/photos/left-bare.jpg");
  assert.equal(result.mapped[1].bare_ear_photo_右耳, "/photos/right-bare.jpg");
  assert.equal(result.mapped[0].photo_正面, "/photos/left-front.jpg");
  assert.equal(result.mapped[1].photo_正面, "/photos/right-front.jpg");
  assert.equal(result.reviews[0].bareSlots.length, 2);
});

test("single-ear mode uses one generic bare ear slot", () => {
  const rows = [
    { user_id: "U001", ear_side: "左耳", device_name: "A" }
  ];
  const files = [
    { user_folder: "U001", name: "0.jpg", absolute_path: "/photos/bare.jpg" },
    { user_folder: "U001", name: "1.jpg", absolute_path: "/photos/front.jpg" }
  ];
  const result = core.mapPhotosToRows(rows, files, {
    userField: "user_id",
    earField: "ear_side",
    views: ["正面"],
    includeBareEar: true,
    singleEarMode: true
  });
  assert.deepEqual(result.photoFields, ["bare_ear_photo", "photo_正面"]);
  assert.equal(result.mapped[0].bare_ear_photo, "/photos/bare.jpg");
  assert.equal(result.mapped[0].photo_正面, "/photos/front.jpg");
});

test("sequence bare ear config can reserve multiple generic photos", () => {
  const rows = [
    { user_id: "U001", device_name: "A" }
  ];
  const files = [
    { user_folder: "U001", name: "0.jpg", absolute_path: "/photos/bare-1.jpg" },
    { user_folder: "U001", name: "1.jpg", absolute_path: "/photos/bare-2.jpg" },
    { user_folder: "U001", name: "2.jpg", absolute_path: "/photos/front.jpg" }
  ];
  const result = core.mapPhotosToRows(rows, files, {
    userField: "user_id",
    views: ["正面"],
    bareEarConfig: { enabled: true, splitByEar: false, genericCount: 2 }
  });
  assert.deepEqual(result.photoFields, ["bare_ear_photo_1", "bare_ear_photo_2", "photo_正面"]);
  assert.equal(result.mapped[0].bare_ear_photo_1, "/photos/bare-1.jpg");
  assert.equal(result.mapped[0].bare_ear_photo_2, "/photos/bare-2.jpg");
  assert.equal(result.mapped[0].photo_正面, "/photos/front.jpg");
});

test("sequence bare ear config reserves one side before the other", () => {
  const rows = [
    { user_id: "U001", ear_side: "左耳", device_name: "A" },
    { user_id: "U001", ear_side: "右耳", device_name: "A" }
  ];
  const files = [
    { user_folder: "U001", name: "0.jpg", absolute_path: "/photos/left-bare-1.jpg" },
    { user_folder: "U001", name: "1.jpg", absolute_path: "/photos/left-bare-2.jpg" },
    { user_folder: "U001", name: "2.jpg", absolute_path: "/photos/right-bare.jpg" },
    { user_folder: "U001", name: "3.jpg", absolute_path: "/photos/left-front.jpg" },
    { user_folder: "U001", name: "4.jpg", absolute_path: "/photos/right-front.jpg" }
  ];
  const result = core.mapPhotosToRows(rows, files, {
    userField: "user_id",
    earField: "ear_side",
    views: ["正面"],
    bareEarConfig: { enabled: true, splitByEar: true, leftCount: 2, rightCount: 1 }
  });
  assert.deepEqual(result.photoFields.slice(0, 3), ["bare_ear_photo_左耳_1", "bare_ear_photo_左耳_2", "bare_ear_photo_右耳"]);
  assert.equal(result.mapped[0].bare_ear_photo_左耳_1, "/photos/left-bare-1.jpg");
  assert.equal(result.mapped[0].bare_ear_photo_左耳_2, "/photos/left-bare-2.jpg");
  assert.equal(result.mapped[1].bare_ear_photo_右耳, "/photos/right-bare.jpg");
  assert.equal(result.mapped[0].photo_正面, "/photos/left-front.jpg");
  assert.equal(result.mapped[1].photo_正面, "/photos/right-front.jpg");
});

test("bare ear override removes that file from device sequence", () => {
  const rows = [
    { user_id: "U001", device_name: "A" },
    { user_id: "U001", device_name: "B" }
  ];
  const files = [
    { user_folder: "U001", name: "0.jpg", absolute_path: "/photos/a-front.jpg" },
    { user_folder: "U001", name: "1.jpg", absolute_path: "/photos/b-front.jpg" },
    { user_folder: "U001", name: "2.jpg", absolute_path: "/photos/bare.jpg" }
  ];
  const result = core.mapPhotosToRows(rows, files, {
    userField: "user_id",
    views: ["正面"],
    includeBareEar: true,
    overrides: { "0::bare_ear_photo": "/photos/bare.jpg" }
  });
  assert.equal(result.mapped[0].bare_ear_photo, "/photos/bare.jpg");
  assert.equal(result.mapped[0].photo_正面, "/photos/a-front.jpg");
  assert.equal(result.mapped[1].photo_正面, "/photos/b-front.jpg");
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
  assert.equal(result.mapped[0].photo_左耳_正面, "左耳/正面/张三/样机A/001.jpg");
  assert.equal(result.mapped[0].photo_左耳_侧面, "样机A/张三/侧面/左耳/002.jpg");
  assert.equal(result.mapped[0].photo_右耳_正面, "张三/右耳/样机A/正面/003.jpg");
  assert.equal(result.mapped[0].photo_右耳_侧面, "");
  assert.equal(result.mapped.length, 2);
  assert.equal(result.mapped[1].ear_side, "右耳");
  assert.equal(result.reviews[0].status, "missing");
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

test("folder mode maps bare ear folders parallel to device folders", () => {
  const rows = [
    { name: "张三", ear_side: "左耳", prototype: "样机A" },
    { name: "张三", ear_side: "右耳", prototype: "样机A" }
  ];
  const files = [
    { relative_path: "张三/空耳/左耳/正面/000.jpg", absolute_path: "/photos/left-bare.jpg", name: "000.jpg" },
    { relative_path: "张三/空耳/右耳/正面/001.jpg", absolute_path: "/photos/right-bare.jpg", name: "001.jpg" },
    { relative_path: "张三/样机A/左耳/正面/010.jpg", absolute_path: "/photos/left-device.jpg", name: "010.jpg" },
    { relative_path: "张三/样机A/右耳/正面/011.jpg", absolute_path: "/photos/right-device.jpg", name: "011.jpg" }
  ];
  const views = core.inferFolderViews(rows, files, {
    userField: "name",
    earField: "ear_side",
    deviceField: "prototype"
  });
  const result = core.mapPhotosToRows(rows, files, {
    mode: "folders",
    userField: "name",
    earField: "ear_side",
    deviceField: "prototype",
    views
  });

  assert.deepEqual(views, ["正面"]);
  assert.equal(result.photoFields.includes("bare_ear_photo_左耳"), true);
  assert.equal(result.photoFields.includes("bare_ear_photo_右耳"), true);
  assert.equal(result.mapped[0].bare_ear_photo_左耳, "张三/空耳/左耳/正面/000.jpg");
  assert.equal(result.mapped[1].bare_ear_photo_右耳, "张三/空耳/右耳/正面/001.jpg");
  assert.equal(result.mapped[0].photo_左耳_正面, "张三/样机A/左耳/正面/010.jpg");
  assert.equal(result.mapped[0].photo_右耳_正面, "张三/样机A/右耳/正面/011.jpg");
  assert.equal(result.reviews[0].bareSlots.length, 2);
});

test("folder mode auto-enables single-ear columns when each condition has only one side", () => {
  const rows = [
    { name: "用户1", prototype: "样机A" },
    { name: "用户2", prototype: "样机A" }
  ];
  const files = [
    { relative_path: "用户1/样机A/左耳/正面/001.jpg", absolute_path: "/photos/u1-left-front.jpg", name: "001.jpg" },
    { relative_path: "用户1/样机A/左耳/侧面/002.jpg", absolute_path: "/photos/u1-left-side.jpg", name: "002.jpg" },
    { relative_path: "用户2/样机A/右耳/正面/003.jpg", absolute_path: "/photos/u2-right-front.jpg", name: "003.jpg" },
    { relative_path: "用户2/样机A/右耳/侧面/004.jpg", absolute_path: "/photos/u2-right-side.jpg", name: "004.jpg" }
  ];
  const views = core.inferFolderViews(rows, files, {
    userField: "name",
    earField: "",
    deviceField: "prototype"
  });
  const result = core.mapPhotosToRows(rows, files, {
    mode: "folders",
    userField: "name",
    earField: "",
    deviceField: "prototype",
    views
  });

  assert.equal(core.resolveSingleEarMode(rows, files, {
    mode: "folders",
    userField: "name",
    earField: "",
    deviceField: "prototype"
  }).enabled, true);
  assert.deepEqual(result.photoFields, ["photo_正面", "photo_侧面"]);
  assert.equal(result.mapped[0].photo_正面, "用户1/样机A/左耳/正面/001.jpg");
  assert.equal(result.mapped[0].photo_侧面, "用户1/样机A/左耳/侧面/002.jpg");
  assert.equal(result.mapped[1].photo_正面, "用户2/样机A/右耳/正面/003.jpg");
  assert.equal(result.mapped[1].photo_侧面, "用户2/样机A/右耳/侧面/004.jpg");
});

test("folder mode keeps ear columns when any condition has both sides", () => {
  const rows = [
    { name: "张三", prototype: "样机A" }
  ];
  const files = [
    { relative_path: "张三/样机A/左耳/正面/001.jpg", absolute_path: "/photos/left.jpg", name: "001.jpg" },
    { relative_path: "张三/样机A/右耳/正面/002.jpg", absolute_path: "/photos/right.jpg", name: "002.jpg" }
  ];
  const views = core.inferFolderViews(rows, files, {
    userField: "name",
    earField: "",
    deviceField: "prototype"
  });
  const result = core.mapPhotosToRows(rows, files, {
    mode: "folders",
    userField: "name",
    earField: "",
    deviceField: "prototype",
    views
  });

  assert.equal(core.resolveSingleEarMode(rows, files, {
    mode: "folders",
    userField: "name",
    earField: "",
    deviceField: "prototype"
  }).enabled, false);
  assert.equal(result.photoFields.includes("photo_左耳_正面"), true);
  assert.equal(result.photoFields.includes("photo_右耳_正面"), true);
});

test("folder mode can force single-ear columns even when both sides exist", () => {
  const rows = [
    { name: "张三", prototype: "样机A" }
  ];
  const files = [
    { relative_path: "张三/样机A/左耳/正面/001.jpg", absolute_path: "/photos/left.jpg", name: "001.jpg" },
    { relative_path: "张三/样机A/右耳/正面/002.jpg", absolute_path: "/photos/right.jpg", name: "002.jpg" }
  ];
  const result = core.mapPhotosToRows(rows, files, {
    mode: "folders",
    userField: "name",
    earField: "",
    deviceField: "prototype",
    views: ["正面"],
    singleEarMode: true
  });

  assert.deepEqual(result.photoFields, ["photo_正面"]);
  assert.equal(result.mapped[0].photo_正面, "张三/样机A/左耳/正面/001.jpg");
  assert.equal(result.reviews[0].status, "ok");
});

test("folder mode does not treat bare ear folder as a device when device field is missing", () => {
  const rows = [
    { name: "张三", comfort_score: "8" }
  ];
  const files = [
    { relative_path: "张三/空耳/左耳/正面/000.jpg", absolute_path: "/photos/bare.jpg", name: "000.jpg" },
    { relative_path: "张三/样机A/左耳/正面/001.jpg", absolute_path: "/photos/device.jpg", name: "001.jpg" }
  ];
  const views = core.inferFolderViews(rows, files, {
    userField: "name",
    earField: "",
    deviceField: ""
  });
  const result = core.mapPhotosToRows(rows, files, {
    mode: "folders",
    userField: "name",
    earField: "",
    deviceField: "",
    views
  });

  assert.deepEqual(views, ["正面"]);
  assert.equal(result.mapped.length, 1);
  assert.equal(result.mapped[0].bare_ear_photo, "张三/空耳/左耳/正面/000.jpg");
  assert.equal(result.mapped[0].photo_正面, "张三/样机A/左耳/正面/001.jpg");
});

test("folder mode derives ear sides from photo folders even when csv has one ear side", () => {
  const rows = [
    { name: "张三", ear_side: "右耳", prototype: "样机A" }
  ];
  const files = [
    { relative_path: "张三/左耳/样机A/正面/001.jpg", absolute_path: "/photos/left.jpg", name: "001.jpg" },
    { relative_path: "张三/右耳/样机A/正面/002.jpg", absolute_path: "/photos/right.jpg", name: "002.jpg" }
  ];
  const views = core.inferFolderViews(rows, files, {
    userField: "name",
    earField: "ear_side",
    deviceField: "prototype"
  });
  const result = core.mapPhotosToRows(rows, files, {
    mode: "folders",
    userField: "name",
    earField: "ear_side",
    deviceField: "prototype",
    views
  });
  assert.deepEqual(views, ["正面"]);
  assert.deepEqual(core.folderEarValues(rows, "ear_side", files), ["左耳", "右耳"]);
  assert.equal(result.photoFields.includes("photo_左耳_正面"), true);
  assert.equal(result.photoFields.includes("photo_右耳_正面"), true);
  assert.equal(result.mapped.length, 1);
  assert.equal(result.mapped[0].photo_左耳_正面, "张三/左耳/样机A/正面/001.jpg");
  assert.equal(result.mapped[0].photo_右耳_正面, "张三/右耳/样机A/正面/002.jpg");
});

test("folder mode keeps left and right photo columns when csv has no ear side field", () => {
  const rows = [
    { name: "张三", prototype: "样机A" }
  ];
  const files = [
    { relative_path: "张三/左耳/样机A/正面/001.jpg", absolute_path: "/photos/left-front.jpg", name: "001.jpg" },
    { relative_path: "张三/右耳/样机A/正面/002.jpg", absolute_path: "/photos/right-front.jpg", name: "002.jpg" }
  ];
  const views = core.inferFolderViews(rows, files, {
    userField: "name",
    earField: "",
    deviceField: "prototype"
  });
  const result = core.mapPhotosToRows(rows, files, {
    mode: "folders",
    userField: "name",
    earField: "",
    deviceField: "prototype",
    views
  });
  assert.deepEqual(views, ["正面"]);
  assert.equal(result.mapped.length, 1);
  assert.equal(result.mapped[0].photo_左耳_正面, "张三/左耳/样机A/正面/001.jpg");
  assert.equal(result.mapped[0].photo_右耳_正面, "张三/右耳/样机A/正面/002.jpg");
});

test("folder mode treats missing device field as single device and uses first device folder", () => {
  const rows = [
    { name: "张三", comfort_score: "8" }
  ];
  const files = [
    { relative_path: "张三/样机B/左耳/正面/002.jpg", absolute_path: "/photos/device-b.jpg", name: "002.jpg" },
    { relative_path: "张三/样机A/左耳/正面/001.jpg", absolute_path: "/photos/device-a.jpg", name: "001.jpg" },
    { relative_path: "张三/样机A/右耳/正面/003.jpg", absolute_path: "/photos/device-a-right.jpg", name: "003.jpg" }
  ];
  const views = core.inferFolderViews(rows, files, {
    userField: "name",
    earField: "",
    deviceField: ""
  });
  const result = core.mapPhotosToRows(rows, files, {
    mode: "folders",
    userField: "name",
    earField: "",
    deviceField: "",
    views
  });
  assert.deepEqual(views, ["正面"]);
  assert.equal(result.mapped.length, 1);
  assert.equal(result.mapped[0].photo_左耳_正面, "张三/样机A/左耳/正面/001.jpg");
  assert.equal(result.mapped[0].photo_右耳_正面, "张三/样机A/右耳/正面/003.jpg");
  assert.equal(result.reviews[0].notes[0].includes("样机A"), true);
});

test("folder mode does not treat device folders as users and keeps csv rows without photos", () => {
  const rows = [
    { name: "用户1", prototype: "样机A", comfort_score: "8" },
    { name: "用户1", prototype: "样机B", comfort_score: "7" },
    { name: "用户2", prototype: "样机A", comfort_score: "6" },
    { name: "用户2", prototype: "样机B", comfort_score: "5" },
    { name: "用户3", prototype: "样机A", comfort_score: "9" },
    { name: "用户3", prototype: "样机B", comfort_score: "8" },
    { name: "用户4", prototype: "样机A", comfort_score: "7" },
    { name: "用户4", prototype: "样机B", comfort_score: "6" }
  ];
  const files = [
    { user_folder: "样机A", relative_path: "样机A/用户1/左耳/正面/001.jpg", absolute_path: "/photos/a-u1-left-front.jpg", name: "001.jpg" },
    { user_folder: "样机A", relative_path: "样机A/用户1/右耳/正面/002.jpg", absolute_path: "/photos/a-u1-right-front.jpg", name: "002.jpg" },
    { user_folder: "样机B", relative_path: "样机B/用户1/左耳/正面/003.jpg", absolute_path: "/photos/b-u1-left-front.jpg", name: "003.jpg" },
    { user_folder: "样机B", relative_path: "样机B/用户1/右耳/正面/004.jpg", absolute_path: "/photos/b-u1-right-front.jpg", name: "004.jpg" },
    { user_folder: "样机A", relative_path: "样机A/用户2/左耳/正面/005.jpg", absolute_path: "/photos/a-u2-left-front.jpg", name: "005.jpg" },
    { user_folder: "样机A", relative_path: "样机A/用户2/右耳/正面/006.jpg", absolute_path: "/photos/a-u2-right-front.jpg", name: "006.jpg" },
    { user_folder: "样机B", relative_path: "样机B/用户2/左耳/正面/007.jpg", absolute_path: "/photos/b-u2-left-front.jpg", name: "007.jpg" },
    { user_folder: "样机B", relative_path: "样机B/用户2/右耳/正面/008.jpg", absolute_path: "/photos/b-u2-right-front.jpg", name: "008.jpg" }
  ];
  const views = core.inferFolderViews(rows, files, {
    userField: "name",
    earField: "",
    deviceField: "prototype"
  });
  const result = core.mapPhotosToRows(rows, files, {
    mode: "folders",
    userField: "name",
    earField: "",
    deviceField: "prototype",
    views
  });

  assert.deepEqual(views, ["正面"]);
  assert.equal(result.mapped.length, 8);
  assert.equal(result.reviews.length, 4);
  assert.equal(result.reviews.find(review => review.user === "用户1").entries.length, 2);
  assert.deepEqual([...new Set(result.mapped.map(row => row.name))], ["用户1", "用户2", "用户3", "用户4"]);
  assert.equal(result.mapped.filter(row => row.name === "用户1").length, 2);
  assert.equal(result.mapped.find(row => row.name === "用户1" && row.prototype === "样机A").photo_左耳_正面, "样机A/用户1/左耳/正面/001.jpg");
  assert.equal(result.mapped.find(row => row.name === "用户2" && row.prototype === "样机B").photo_右耳_正面, "样机B/用户2/右耳/正面/008.jpg");
  assert.equal(result.mapped.find(row => row.name === "用户3" && row.prototype === "样机A").photo_左耳_正面, "");
  assert.equal(result.mapped.find(row => row.name === "用户4" && row.prototype === "样机B").photo_右耳_正面, "");
});

test("sequence mode keeps csv users even when no photos are present", () => {
  const rows = [
    { user_id: "U001", device_name: "A" },
    { user_id: "U002", device_name: "A" }
  ];
  const result = core.mapPhotosToRows(rows, [], {
    userField: "user_id",
    deviceField: "device_name",
    views: ["正面", "侧面"]
  });

  assert.equal(result.mapped.length, 2);
  assert.equal(result.mapped[0].user_id, "U001");
  assert.equal(result.mapped[1].user_id, "U002");
  assert.equal(result.mapped[0].photo_正面, "");
  assert.equal(result.reviews.length, 2);
  assert.equal(result.reviews[1].status, "missing");
});

test("photo audit rows list missing photos and mapping notes", () => {
  const rows = [
    { user_id: "U001", device_name: "A" },
    { user_id: "U002", device_name: "B" }
  ];
  const result = core.mapPhotosToRows(rows, [], {
    userField: "user_id",
    deviceField: "device_name",
    views: ["正面"]
  });
  result.reviews[0].notes = ["测试备注"];
  const auditRows = core.buildPhotoAuditRows(result.reviews, result.photoFields, result.mapped, {
    deviceField: "device_name",
    viewLabels: { photo_正面: "正面" }
  });

  assert.equal(auditRows.filter(row => row.status === "missing").length, 2);
  assert.deepEqual(auditRows[0], {
    status: "missing",
    user: "U001",
    device: "A",
    rowIndex: 1,
    field: "photo_正面",
    view: "正面",
    message: "缺失照片"
  });
  assert.equal(auditRows.some(row => row.status === "note" && row.message === "测试备注"), true);
});

test("folder photo audit reports duplicate or reshoot photos for the same slot", () => {
  const rows = [
    { user_id: "U001", device_name: "A" }
  ];
  const files = [
    { relative_path: "U001/A/左耳/正面/001.jpg", absolute_path: "/photos/001.jpg", name: "001.jpg" },
    { relative_path: "U001/A/左耳/正面/002-reshoot.jpg", absolute_path: "/photos/002-reshoot.jpg", name: "002-reshoot.jpg" }
  ];
  const result = core.mapPhotosToRows(rows, files, {
    mode: "folders",
    userField: "user_id",
    deviceField: "device_name",
    views: ["正面"],
    expectedEars: ["左耳"]
  });
  const auditRows = core.buildPhotoAuditRows(result.reviews, result.photoFields, result.mapped, {
    deviceField: "device_name",
    viewLabels: Object.fromEntries(result.photoViews.map(view => [view.field, view.label]))
  });

  assert.equal(result.mapped[0].photo_左耳_正面, "U001/A/左耳/正面/001.jpg");
  assert.equal(result.reviews[0].files.length, 2);
  assert.equal(result.reviews[0].status, "extra");
  assert.equal(auditRows.some(row =>
    row.status === "extra" &&
    row.user === "U001" &&
    row.device === "A" &&
    row.view === "左耳 · 正面" &&
    row.message.includes("002-reshoot.jpg")
  ), true);
});

test("folder photo audit uses protocol expected ears and views", () => {
  const rows = [
    { user_id: "U001", device_name: "A" }
  ];
  const files = [
    { relative_path: "U001/A/左耳/正面/001.jpg", absolute_path: "/photos/u1-left-front.jpg", name: "001.jpg" }
  ];
  const result = core.mapPhotosToRows(rows, files, {
    mode: "folders",
    userField: "user_id",
    deviceField: "device_name",
    views: ["正面"],
    expectedEars: ["左耳", "右耳"]
  });
  const auditRows = core.buildPhotoAuditRows(result.reviews, result.photoFields, result.mapped, {
    deviceField: "device_name",
    viewLabels: Object.fromEntries(result.photoViews.map(view => [view.field, view.label]))
  });

  assert.equal(result.photoFields.includes("photo_右耳_正面"), true);
  assert.equal(result.mapped[0].photo_左耳_正面, "U001/A/左耳/正面/001.jpg");
  assert.equal(result.mapped[0].photo_右耳_正面, "");
  assert.equal(auditRows.some(row => row.view === "右耳 · 正面" && row.message === "缺失照片"), true);
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
  assert.equal(result.mapped[0].photo_左耳_正面, "姓名-张三/L-左耳/view_正面/样机A_试产/001.jpg");
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
    layout: { detailPhotoMode: "capture", columns: [{ id: "gender", visible: true }, { id: "old_field", visible: false }] },
    fieldRoleOverrides: { gender: "user", old_field: "metric" },
    primaryDimension: "gender",
    metric: "old_field",
    showErrorBars: false,
    pressureWorst: "high",
    userFilter: ["U001"],
    deviceOrderMode: "asc"
  }, ["gender", "comfort_score"]);
  assert.deepEqual(config.fieldRoleOverrides, { gender: "user" });
  assert.deepEqual(config.layout.columns, [{ id: "gender", visible: true }]);
  assert.equal(config.layout.detailPhotoMode, "capture");
  assert.equal(config.primaryDimension, "gender");
  assert.equal(config.metric, "");
  assert.equal(config.showErrorBars, false);
  assert.equal(config.pressureWorst, "high");
  assert.deepEqual(config.userFilter, ["U001"]);
  assert.equal(config.deviceOrderMode, "asc");
});

test("dashboard config import defaults invalid detail photo mode to performance", () => {
  const config = core.sanitizeDashboardConfig({
    layout: { detailPhotoMode: "raw", columns: [] }
  }, ["gender"]);
  assert.equal(config.layout.detailPhotoMode, "performance");
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
    protocolTemplate: { name: "耳机模板", requiredFields: ["user_id"], photoSchema: { views: ["正面"] } },
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
  assert.equal(project.protocolTemplate.name, "耳机模板");
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
