(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PersistenceAdapterModule = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const CURRENT_SCHEMA_VERSION = 1;
  const DOCUMENT_TYPES = {
    "project-registry": {
      fileName: "project-registry.json",
      requiredPayloadKeys: [],
    },
    "study-manifest": {
      fileName: "manifest.json",
      requiredPayloadKeys: ["studyName", "modules"],
    },
    "audit-log": {
      fileName: "audit-log.json",
      requiredPayloadKeys: [],
    },
    "module-settings": {
      fileName: "module-settings.json",
      requiredPayloadKeys: [],
    },
  };

  function normalizePath(...parts) {
    return parts
      .filter(part => part !== "" && part != null)
      .map(part => String(part).replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""))
      .filter(Boolean)
      .join("/");
  }

  function defaultDocumentPath(projectPath = "", documentType) {
    const document = DOCUMENT_TYPES[documentType];
    if (!document) throw new Error(`Unknown document type: ${documentType}`);
    return normalizePath(projectPath, document.fileName);
  }

  function createEnvelope({
    documentType,
    payload,
    schemaVersion = CURRENT_SCHEMA_VERSION,
    savedAt = new Date().toISOString(),
  } = {}) {
    if (!DOCUMENT_TYPES[documentType]) throw new Error(`Unknown document type: ${documentType}`);
    return {
      documentType,
      schemaVersion,
      savedAt,
      payload,
    };
  }

  function validateEnvelope(envelope = {}) {
    const issues = [];
    const document = DOCUMENT_TYPES[envelope.documentType];
    if (!document) issues.push("unknown-document-type");
    if (envelope.schemaVersion !== CURRENT_SCHEMA_VERSION) issues.push("unsupported-schema-version");
    if (!("payload" in envelope)) issues.push("missing-payload");
    for (const key of document?.requiredPayloadKeys || []) {
      if (!envelope.payload || !(key in envelope.payload)) issues.push(`missing-payload-key:${key}`);
    }
    return {
      valid: issues.length === 0,
      issues,
    };
  }

  function buildWriteOperation({
    projectPath = "",
    documentType,
    payload,
    savedAt,
  } = {}) {
    const envelope = createEnvelope({ documentType, payload, savedAt });
    return {
      action: "write-json",
      path: defaultDocumentPath(projectPath, documentType),
      envelope,
      validation: validateEnvelope(envelope),
    };
  }

  function buildReadOperation(projectPath = "", documentType) {
    return {
      action: "read-json",
      path: defaultDocumentPath(projectPath, documentType),
      documentType,
    };
  }

  function buildProjectPersistencePlan({
    projectPath = "",
    registry = null,
    manifest = null,
    auditLog = null,
    settings = null,
    savedAt = new Date().toISOString(),
  } = {}) {
    const writes = [];
    if (registry != null) writes.push(buildWriteOperation({ projectPath, documentType: "project-registry", payload: registry, savedAt }));
    if (manifest != null) writes.push(buildWriteOperation({ projectPath, documentType: "study-manifest", payload: manifest, savedAt }));
    if (auditLog != null) writes.push(buildWriteOperation({ projectPath, documentType: "audit-log", payload: auditLog, savedAt }));
    if (settings != null) writes.push(buildWriteOperation({ projectPath, documentType: "module-settings", payload: settings, savedAt }));
    return {
      projectPath,
      writes,
      valid: writes.every(operation => operation.validation.valid),
    };
  }

  function serializeEnvelope(envelope) {
    return JSON.stringify(envelope, null, 2);
  }

  return {
    CURRENT_SCHEMA_VERSION,
    DOCUMENT_TYPES,
    normalizePath,
    defaultDocumentPath,
    createEnvelope,
    validateEnvelope,
    buildWriteOperation,
    buildReadOperation,
    buildProjectPersistencePlan,
    serializeEnvelope,
  };
});
