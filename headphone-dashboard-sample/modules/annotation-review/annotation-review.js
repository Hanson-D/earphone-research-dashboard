(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AnnotationReviewModule = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function combineText(record = {}, fields = []) {
    return fields
      .map(field => record[field])
      .filter(value => value !== "" && value != null)
      .join(" ");
  }

  function matchRule(text, rule) {
    const normalized = normalizeText(text);
    return (rule.keywords || []).some(keyword => normalized.includes(normalizeText(keyword)));
  }

  function tagRecord(record = {}, {
    textFields = [],
    rules = [],
  } = {}) {
    const text = combineText(record, textFields);
    const tags = rules
      .filter(rule => matchRule(text, rule))
      .map(rule => rule.tag);
    return {
      record,
      text,
      tags,
      needsReview: text.length > 0 && tags.length === 0,
    };
  }

  function reviewAnnotations(records = [], options = {}) {
    const taggedRecords = records.map(record => tagRecord(record, options));
    const tagCounts = {};
    for (const item of taggedRecords) {
      for (const tag of item.tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
    return {
      rowCount: records.length,
      taggedRecords,
      tagCounts,
      untaggedReviewCount: taggedRecords.filter(item => item.needsReview).length,
    };
  }

  function topTags(review, limit = 5) {
    return Object.entries(review.tagCounts || {})
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
      .slice(0, limit);
  }

  function summarizeAnnotationReview(review) {
    const top = topTags(review, 3).map(item => `${item.tag}:${item.count}`).join(", ");
    return `rows=${review.rowCount}; top=${top || "none"}; untagged=${review.untaggedReviewCount}`;
  }

  return {
    normalizeText,
    combineText,
    matchRule,
    tagRecord,
    reviewAnnotations,
    topTags,
    summarizeAnnotationReview,
  };
});
