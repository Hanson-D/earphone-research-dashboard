const test = require("node:test");
const assert = require("node:assert/strict");
const moduleApi = require("./annotation-review");

const rules = [
  { tag: "pressure", keywords: ["压", "夹", "疼", "pressure"] },
  { tag: "loose_fit", keywords: ["松", "掉", "loose"] },
  { tag: "noise", keywords: ["异响", "noise"] }
];

test("tagRecord tags text with Chinese and English keywords", () => {
  const tagged = moduleApi.tagRecord(
    { note: "耳屏附近有压迫感", extra: "no noise" },
    { textFields: ["note", "extra"], rules }
  );
  assert.deepEqual(tagged.tags, ["pressure", "noise"]);
  assert.equal(tagged.needsReview, false);
});

test("tagRecord marks non-empty unmatched notes for review", () => {
  const tagged = moduleApi.tagRecord(
    { note: "感觉比较奇怪" },
    { textFields: ["note"], rules }
  );
  assert.deepEqual(tagged.tags, []);
  assert.equal(tagged.needsReview, true);
});

test("reviewAnnotations counts tags and untagged rows", () => {
  const review = moduleApi.reviewAnnotations([
    { note: "夹耳" },
    { note: "佩戴松，容易掉" },
    { note: "有异响" },
    { note: "描述不明确" }
  ], {
    textFields: ["note"],
    rules
  });
  assert.deepEqual(review.tagCounts, { pressure: 1, loose_fit: 1, noise: 1 });
  assert.equal(review.untaggedReviewCount, 1);
});

test("topTags and summarizeAnnotationReview produce compact outputs", () => {
  const review = {
    rowCount: 4,
    tagCounts: { pressure: 3, noise: 1, loose_fit: 1 },
    untaggedReviewCount: 1
  };
  assert.deepEqual(moduleApi.topTags(review, 2), [
    { tag: "pressure", count: 3 },
    { tag: "loose_fit", count: 1 }
  ]);
  assert.equal(
    moduleApi.summarizeAnnotationReview(review),
    "rows=4; top=pressure:3, loose_fit:1, noise:1; untagged=1"
  );
});
