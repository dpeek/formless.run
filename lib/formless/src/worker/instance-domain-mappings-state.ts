import {
  buildInstanceDomainMappingAppliedState,
  type BuildInstanceDomainMappingAppliedStateResult,
  type InstanceDomainMapping,
  type InstanceDomainMappingAppliedAction,
  type InstanceDomainMappingAppliedProvider,
  type InstanceDomainMappingAppliedState,
  type InstanceDomainMappingAuditEvent,
  type InstanceDomainMappingProfile,
  type InstanceDomainMappingSurface,
  type RecordInstanceDomainMappingApplyEvidenceRequest,
} from "../shared/instance-domain-mappings.ts";
import {
  createSqlStorageMigrationRegistry,
  runSqlStorageMigrations,
  storageSqlMigrationFamily,
} from "./sql-migrations.ts";

type InstanceDomainMappingAppliedStateRow = {
  host: string;
  profile: InstanceDomainMappingProfile;
  target_install_id: string | null;
  surface: InstanceDomainMappingSurface | null;
  provider: InstanceDomainMappingAppliedProvider;
  account_id: string;
  alchemy_resource_id: string | null;
  runner_id: string | null;
  zone_id: string;
  zone_name: string;
  worker_name: string;
  worker_domain_id: string;
  action: InstanceDomainMappingAppliedAction;
  applied_at: string;
  updated_at: string;
};

type InstanceDomainMappingAuditEventRow = InstanceDomainMappingAppliedStateRow & {
  event_id: number;
};

type DomainMappingTableName =
  | "instance_domain_mapping_applied_state"
  | "instance_domain_mapping_audit_events";

export type RecordInstanceDomainMappingApplyEvidenceResult =
  | {
      ok: true;
      appliedState: InstanceDomainMappingAppliedState;
      appliedStates: InstanceDomainMappingAppliedState[];
      auditEvent: InstanceDomainMappingAuditEvent;
      auditEvents: InstanceDomainMappingAuditEvent[];
    }
  | Extract<BuildInstanceDomainMappingAppliedStateResult, { ok: false }>;

export type DeleteInstanceDomainMappingAppliedStateResult = {
  appliedStates: InstanceDomainMappingAppliedState[];
  auditEvent: InstanceDomainMappingAuditEvent;
  auditEvents: InstanceDomainMappingAuditEvent[];
};

const appliedStateTableSql = `
  CREATE TABLE IF NOT EXISTS instance_domain_mapping_applied_state (
    host TEXT NOT NULL,
    profile TEXT NOT NULL CHECK (profile IN ('instance', 'app', 'publicSite')),
    target_install_id TEXT,
    surface TEXT CHECK (surface IS NULL OR surface = 'site'),
    provider TEXT NOT NULL CHECK (provider = 'cloudflare-worker-custom-domain'),
    account_id TEXT NOT NULL,
    alchemy_resource_id TEXT,
    runner_id TEXT,
    zone_id TEXT NOT NULL,
    zone_name TEXT NOT NULL,
    worker_name TEXT NOT NULL,
    worker_domain_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('adopted', 'created', 'deleted', 'manually-removed', 'overridden')),
    applied_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (host, profile)
  )
`;

const auditEventsTableSql = `
  CREATE TABLE IF NOT EXISTS instance_domain_mapping_audit_events (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    host TEXT NOT NULL,
    profile TEXT NOT NULL CHECK (profile IN ('instance', 'app', 'publicSite')),
    target_install_id TEXT,
    surface TEXT CHECK (surface IS NULL OR surface = 'site'),
    provider TEXT NOT NULL CHECK (provider = 'cloudflare-worker-custom-domain'),
    account_id TEXT NOT NULL,
    alchemy_resource_id TEXT,
    runner_id TEXT,
    zone_id TEXT NOT NULL,
    zone_name TEXT NOT NULL,
    worker_name TEXT NOT NULL,
    worker_domain_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('adopted', 'created', 'deleted', 'manually-removed', 'overridden')),
    applied_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;

const instanceDomainMappingsSqlMigrationFamily = storageSqlMigrationFamily(
  "instance-domain-mappings",
);
const instanceDomainMappingsSqlMigrations = createSqlStorageMigrationRegistry([
  {
    id: "2026-05-28-instance-domain-mappings-legacy-shape",
    owner: "formless",
    family: instanceDomainMappingsSqlMigrationFamily,
    checksum: "sha256:8a591d823d01a311ed46153c902666b559a107523162bee816cebb8aba4f113b",
    safety: "auto-safe",
    summary:
      "Rewrite legacy domain mapping surface tables and action checks into the current table shape.",
    apply: (storage) => {
      migrateLegacySurfaceTables(storage);
      migrateProviderEvidenceColumns(storage);
      migrateAppliedActionChecks(storage);
    },
  },
]);

export function ensureInstanceDomainMappingTables(storage: DurableObjectStorage) {
  storage.sql.exec(`
    ${appliedStateTableSql};
    ${auditEventsTableSql};
  `);
  runSqlStorageMigrations(storage, {
    family: instanceDomainMappingsSqlMigrationFamily,
    migrations: instanceDomainMappingsSqlMigrations,
  });
}

export function resetInstanceDomainMappingTables(storage: DurableObjectStorage) {
  ensureInstanceDomainMappingTables(storage);

  storage.transactionSync(() => {
    storage.sql.exec(`
      DELETE FROM instance_domain_mapping_applied_state;
      DELETE FROM instance_domain_mapping_audit_events;
      DELETE FROM sqlite_sequence
      WHERE name = 'instance_domain_mapping_audit_events';
    `);
  });
}

export function readInstanceDomainMappingAppliedStates(
  storage: DurableObjectStorage,
): InstanceDomainMappingAppliedState[] {
  ensureInstanceDomainMappingTables(storage);

  return readAppliedStates(storage);
}

export function readInstanceDomainMappingAuditEvents(
  storage: DurableObjectStorage,
): InstanceDomainMappingAuditEvent[] {
  ensureInstanceDomainMappingTables(storage);

  return readAuditEvents(storage);
}

export function recordInstanceDomainMappingApplyEvidence(
  storage: DurableObjectStorage,
  input: RecordInstanceDomainMappingApplyEvidenceRequest & {
    existingMappings?: readonly InstanceDomainMapping[];
    now: string;
  },
): RecordInstanceDomainMappingApplyEvidenceResult {
  ensureInstanceDomainMappingTables(storage);

  return storage.transactionSync(() => {
    const result = buildInstanceDomainMappingAppliedState({
      ...input,
      existingMappings: input.existingMappings ?? [],
    });

    if (!result.ok) {
      return result;
    }

    writeAppliedState(storage, result.appliedState);
    writeAuditEvent(storage, result.appliedState);

    const auditEvent = readLastAuditEvent(storage);

    return {
      ok: true,
      appliedState: result.appliedState,
      appliedStates: readAppliedStates(storage),
      auditEvent,
      auditEvents: readAuditEvents(storage),
    };
  });
}

export function deleteInstanceDomainMappingAppliedState(
  storage: DurableObjectStorage,
  input: {
    action?: Extract<InstanceDomainMappingAppliedAction, "deleted" | "manually-removed">;
    now: string;
    runnerId?: string;
    state: InstanceDomainMappingAppliedState;
  },
): DeleteInstanceDomainMappingAppliedStateResult {
  ensureInstanceDomainMappingTables(storage);

  return storage.transactionSync(() => {
    const stateWithoutRunner = { ...input.state };
    delete stateWithoutRunner.runnerId;
    const deletedState: InstanceDomainMappingAppliedState = {
      ...stateWithoutRunner,
      action: input.action ?? "deleted",
      appliedAt: input.now,
      ...(input.runnerId === undefined ? {} : { runnerId: input.runnerId }),
      updatedAt: input.now,
    };

    storage.sql.exec(
      `
        DELETE FROM instance_domain_mapping_applied_state
        WHERE host = ? AND profile = ?
      `,
      deletedState.host,
      deletedState.profile,
    );
    writeAuditEvent(storage, deletedState);

    return {
      appliedStates: readAppliedStates(storage),
      auditEvent: readLastAuditEvent(storage),
      auditEvents: readAuditEvents(storage),
    };
  });
}

function readAppliedStates(storage: DurableObjectStorage): InstanceDomainMappingAppliedState[] {
  const states: InstanceDomainMappingAppliedState[] = [];

  for (const row of storage.sql.exec<InstanceDomainMappingAppliedStateRow>(
    `
      SELECT
        host,
        profile,
        target_install_id,
        surface,
        provider,
        account_id,
        alchemy_resource_id,
        runner_id,
        zone_id,
        zone_name,
        worker_name,
        worker_domain_id,
        action,
        applied_at,
        updated_at
      FROM instance_domain_mapping_applied_state
      WHERE profile IN ('instance', 'publicSite')
      ORDER BY host ASC, profile ASC
    `,
  )) {
    states.push(appliedStateFromRow(row));
  }

  return states;
}

function readAuditEvents(storage: DurableObjectStorage): InstanceDomainMappingAuditEvent[] {
  const events: InstanceDomainMappingAuditEvent[] = [];

  for (const row of storage.sql.exec<InstanceDomainMappingAuditEventRow>(
    `
      SELECT
        event_id,
        host,
        profile,
        target_install_id,
        surface,
        provider,
        account_id,
        alchemy_resource_id,
        runner_id,
        zone_id,
        zone_name,
        worker_name,
        worker_domain_id,
        action,
        applied_at,
        updated_at
      FROM instance_domain_mapping_audit_events
      WHERE profile IN ('instance', 'publicSite')
      ORDER BY event_id ASC
    `,
  )) {
    events.push(auditEventFromRow(row));
  }

  return events;
}

function writeAppliedState(
  storage: DurableObjectStorage,
  state: InstanceDomainMappingAppliedState,
) {
  storage.sql.exec(
    `
      INSERT INTO instance_domain_mapping_applied_state (
        host,
        profile,
        target_install_id,
        surface,
        provider,
        account_id,
        alchemy_resource_id,
        runner_id,
        zone_id,
        zone_name,
        worker_name,
        worker_domain_id,
        action,
        applied_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(host, profile) DO UPDATE SET
        target_install_id = excluded.target_install_id,
        surface = excluded.surface,
        provider = excluded.provider,
        account_id = excluded.account_id,
        alchemy_resource_id = excluded.alchemy_resource_id,
        runner_id = excluded.runner_id,
        zone_id = excluded.zone_id,
        zone_name = excluded.zone_name,
        worker_name = excluded.worker_name,
        worker_domain_id = excluded.worker_domain_id,
        action = excluded.action,
        applied_at = excluded.applied_at,
        updated_at = excluded.updated_at
    `,
    state.host,
    state.profile,
    null,
    state.surface ?? null,
    state.provider,
    state.accountId,
    state.alchemyResourceId ?? null,
    state.runnerId ?? null,
    state.zoneId,
    state.zoneName,
    state.workerName,
    state.workerDomainId,
    state.action,
    state.appliedAt,
    state.updatedAt,
  );
}

function writeAuditEvent(storage: DurableObjectStorage, state: InstanceDomainMappingAppliedState) {
  storage.sql.exec(
    `
      INSERT INTO instance_domain_mapping_audit_events (
        host,
        profile,
        target_install_id,
        surface,
        provider,
        account_id,
        alchemy_resource_id,
        runner_id,
        zone_id,
        zone_name,
        worker_name,
        worker_domain_id,
        action,
        applied_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    state.host,
    state.profile,
    null,
    state.surface ?? null,
    state.provider,
    state.accountId,
    state.alchemyResourceId ?? null,
    state.runnerId ?? null,
    state.zoneId,
    state.zoneName,
    state.workerName,
    state.workerDomainId,
    state.action,
    state.appliedAt,
    state.updatedAt,
  );
}

function readLastAuditEvent(storage: DurableObjectStorage): InstanceDomainMappingAuditEvent {
  for (const row of storage.sql.exec<InstanceDomainMappingAuditEventRow>(
    `
      SELECT
        event_id,
        host,
        profile,
        target_install_id,
        surface,
        provider,
        account_id,
        alchemy_resource_id,
        runner_id,
        zone_id,
        zone_name,
        worker_name,
        worker_domain_id,
        action,
        applied_at,
        updated_at
      FROM instance_domain_mapping_audit_events
      WHERE event_id = last_insert_rowid()
      LIMIT 1
    `,
  )) {
    return auditEventFromRow(row);
  }

  throw new Error("Domain mapping audit event was not written.");
}

function appliedStateFromRow(
  row: InstanceDomainMappingAppliedStateRow,
): InstanceDomainMappingAppliedState {
  return {
    host: row.host,
    profile: row.profile,
    ...(row.surface === null ? {} : { surface: row.surface }),
    provider: row.provider,
    accountId: row.account_id,
    ...(row.alchemy_resource_id === null ? {} : { alchemyResourceId: row.alchemy_resource_id }),
    ...(row.runner_id === null ? {} : { runnerId: row.runner_id }),
    zoneId: row.zone_id,
    zoneName: row.zone_name,
    workerName: row.worker_name,
    workerDomainId: row.worker_domain_id,
    action: row.action,
    appliedAt: row.applied_at,
    updatedAt: row.updated_at,
  };
}

function auditEventFromRow(
  row: InstanceDomainMappingAuditEventRow,
): InstanceDomainMappingAuditEvent {
  return {
    eventId: row.event_id,
    ...appliedStateFromRow(row),
  };
}

function migrateLegacySurfaceTables(storage: DurableObjectStorage) {
  if (
    tableExists(storage, "instance_domain_mapping_applied_state") &&
    !tableHasColumn(storage, "instance_domain_mapping_applied_state", "profile")
  ) {
    migrateLegacyAppliedStateTable(storage);
  }

  if (
    tableExists(storage, "instance_domain_mapping_audit_events") &&
    !tableHasColumn(storage, "instance_domain_mapping_audit_events", "profile")
  ) {
    migrateLegacyAuditEventsTable(storage);
  }
}

function migrateProviderEvidenceColumns(storage: DurableObjectStorage) {
  for (const table of [
    "instance_domain_mapping_applied_state",
    "instance_domain_mapping_audit_events",
  ] as const) {
    if (!tableHasColumn(storage, table, "alchemy_resource_id")) {
      storage.sql.exec(`ALTER TABLE ${table} ADD COLUMN alchemy_resource_id TEXT`);
    }

    if (!tableHasColumn(storage, table, "runner_id")) {
      storage.sql.exec(`ALTER TABLE ${table} ADD COLUMN runner_id TEXT`);
    }
  }
}

function migrateAppliedActionChecks(storage: DurableObjectStorage) {
  for (const table of [
    "instance_domain_mapping_applied_state",
    "instance_domain_mapping_audit_events",
  ] as const) {
    const sql = tableDefinition(storage, table);

    if (sql !== undefined && !sql.includes("'manually-removed'")) {
      migrateAppliedActionCheckTable(storage, table);
    }
  }
}

function migrateAppliedActionCheckTable(
  storage: DurableObjectStorage,
  table: "instance_domain_mapping_applied_state" | "instance_domain_mapping_audit_events",
) {
  const legacyTable = `${table}_action_legacy`;
  const createSql =
    table === "instance_domain_mapping_applied_state" ? appliedStateTableSql : auditEventsTableSql;
  const eventIdColumns =
    table === "instance_domain_mapping_audit_events" ? "event_id,\n      " : "";
  const eventIdSelect = table === "instance_domain_mapping_audit_events" ? "event_id,\n      " : "";

  storage.sql.exec(`DROP TABLE IF EXISTS ${legacyTable}`);
  storage.sql.exec(`ALTER TABLE ${table} RENAME TO ${legacyTable}`);
  storage.sql.exec(createSql);
  storage.sql.exec(`
    INSERT INTO ${table} (
      ${eventIdColumns}host,
      profile,
      target_install_id,
      surface,
      provider,
      account_id,
      alchemy_resource_id,
      runner_id,
      zone_id,
      zone_name,
      worker_name,
      worker_domain_id,
      action,
      applied_at,
      updated_at
    )
    SELECT
      ${eventIdSelect}host,
      profile,
      target_install_id,
      surface,
      provider,
      account_id,
      alchemy_resource_id,
      runner_id,
      zone_id,
      zone_name,
      worker_name,
      worker_domain_id,
      action,
      applied_at,
      updated_at
    FROM ${legacyTable}
  `);
  storage.sql.exec(`DROP TABLE ${legacyTable}`);
}

function migrateLegacyAppliedStateTable(storage: DurableObjectStorage) {
  storage.sql.exec("DROP TABLE IF EXISTS instance_domain_mapping_applied_state_surface_legacy");
  storage.sql.exec(`
    ALTER TABLE instance_domain_mapping_applied_state
    RENAME TO instance_domain_mapping_applied_state_surface_legacy
  `);
  storage.sql.exec(appliedStateTableSql);
  storage.sql.exec(`
    INSERT INTO instance_domain_mapping_applied_state (
      host,
      profile,
      target_install_id,
      surface,
      provider,
      account_id,
      alchemy_resource_id,
      runner_id,
      zone_id,
      zone_name,
      worker_name,
      worker_domain_id,
      action,
      applied_at,
      updated_at
    )
    SELECT
      host,
      'publicSite',
      install_id,
      surface,
      provider,
      account_id,
      NULL,
      NULL,
      zone_id,
      zone_name,
      worker_name,
      worker_domain_id,
      action,
      applied_at,
      updated_at
    FROM instance_domain_mapping_applied_state_surface_legacy
  `);
  storage.sql.exec("DROP TABLE instance_domain_mapping_applied_state_surface_legacy");
}

function migrateLegacyAuditEventsTable(storage: DurableObjectStorage) {
  storage.sql.exec("DROP TABLE IF EXISTS instance_domain_mapping_audit_events_surface_legacy");
  storage.sql.exec(`
    ALTER TABLE instance_domain_mapping_audit_events
    RENAME TO instance_domain_mapping_audit_events_surface_legacy
  `);
  storage.sql.exec(auditEventsTableSql);
  storage.sql.exec(`
    INSERT INTO instance_domain_mapping_audit_events (
      event_id,
      host,
      profile,
      target_install_id,
      surface,
      provider,
      account_id,
      alchemy_resource_id,
      runner_id,
      zone_id,
      zone_name,
      worker_name,
      worker_domain_id,
      action,
      applied_at,
      updated_at
    )
    SELECT
      event_id,
      host,
      'publicSite',
      install_id,
      surface,
      provider,
      account_id,
      NULL,
      NULL,
      zone_id,
      zone_name,
      worker_name,
      worker_domain_id,
      action,
      applied_at,
      updated_at
    FROM instance_domain_mapping_audit_events_surface_legacy
  `);
  storage.sql.exec("DROP TABLE instance_domain_mapping_audit_events_surface_legacy");
}

function tableExists(storage: DurableObjectStorage, table: DomainMappingTableName): boolean {
  return (
    storage.sql
      .exec<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        table,
      )
      .toArray().length > 0
  );
}

function tableHasColumn(
  storage: DurableObjectStorage,
  table: DomainMappingTableName,
  columnName: string,
): boolean {
  return storage.sql
    .exec<{ name: string }>(`PRAGMA table_info(${table})`)
    .toArray()
    .some((row) => row.name === columnName);
}

function tableDefinition(
  storage: DurableObjectStorage,
  table: DomainMappingTableName,
): string | undefined {
  return (
    storage.sql
      .exec<{ sql: string | null }>(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
        table,
      )
      .toArray()[0]?.sql ?? undefined
  );
}
