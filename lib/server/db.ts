import { promises as fs } from "node:fs"
import path from "node:path"
import Sqlite from "better-sqlite3"
import type { Database as SqliteDatabase } from "better-sqlite3"
import { Pool } from "pg"
import type {
  Activity,
  ApiKey,
  AuditLog,
  DashboardVersion,
  Database,
  Dataset,
  DatasetVersion,
  Folder,
  Organization,
  Project,
  ProjectMember,
  ProjectSyncScript,
  ScriptSyncHistory,
  ScriptSyncJob,
  SyncHistory,
  SyncJob,
  UploadSession,
  User,
  WebhookEndpoint,
} from "@/lib/types"
import { absoluteUploadPath, dataDir, dataDriver, databasePath, postgresUrl, sqlitePath, uploadDir } from "@/lib/server/config"
import { growthDashboardHtml, growthDatasetJson, salesDashboardHtml, salesDatasetCsv } from "@/lib/server/demo-artifacts"

const now = () => new Date().toISOString()
const salesDemoDescription = "精美经营驾驶舱示例，展示收入、漏斗、区域表现和经营信号。"
const growthDemoDescription = "增长团队分享示例，展示从访问到付费的转化路径和行动建议。"

function seedDatabase(): Database {
  const createdAt = now()

  return {
    version: 1,
    organizations: [
      {
        id: "org_demo",
        name: "Artifacta Demo",
        slug: "demo",
        description: "Local demo organization for self-hosted development.",
        createdAt,
        updatedAt: createdAt,
      },
    ],
    users: [
      {
        id: "user_admin",
        organizationId: "org_demo",
        email: "admin@artifacta.local",
        name: "张三",
        role: "admin",
        status: "active",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "user_lisi",
        organizationId: "org_demo",
        email: "lisi@artifacta.local",
        name: "李四",
        role: "member",
        status: "active",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "user_wangwu",
        organizationId: "org_demo",
        email: "wangwu@artifacta.local",
        name: "王五",
        role: "member",
        status: "active",
        createdAt,
        updatedAt: createdAt,
      },
    ],
    folders: [
      {
        id: "folder_sales",
        organizationId: "org_demo",
        name: "销售分析",
        createdBy: "user_admin",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "folder_growth",
        organizationId: "org_demo",
        name: "用户增长",
        createdBy: "user_admin",
        createdAt,
        updatedAt: createdAt,
      },
    ],
    projects: [
      {
        id: "proj_sales_demo",
        organizationId: "org_demo",
        ownerId: "user_admin",
        folderId: "folder_sales",
        name: "Q2 销售业绩分析",
        description: salesDemoDescription,
        visibility: "team",
        viewsCount: 234,
        htmlArtifact: {
          kind: "html",
          originalName: "sales-dashboard.html",
          path: "projects/proj_sales_demo/index.html",
          size: 2048,
          contentType: "text/html",
        },
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "proj_growth_demo",
        organizationId: "org_demo",
        ownerId: "user_lisi",
        folderId: "folder_growth",
        name: "用户行为漏斗",
        description: growthDemoDescription,
        visibility: "public",
        viewsCount: 156,
        htmlArtifact: {
          kind: "html",
          originalName: "growth-funnel.html",
          path: "projects/proj_growth_demo/index.html",
          size: 2048,
          contentType: "text/html",
        },
        createdAt,
        updatedAt: createdAt,
      },
    ],
    datasets: [
      {
        id: "ds_sales_demo",
        projectId: "proj_sales_demo",
        organizationId: "org_demo",
        name: "sales_2026_q2.csv",
        description: "示例销售数据",
        fileName: "sales_2026_q2.csv",
        filePath: "projects/proj_sales_demo/datasets/ds_sales_demo/sales_2026_q2.csv",
        fileType: "csv",
        size: 124,
        rows: 4,
        columns: 4,
        schema: [
          { name: "region", type: "string" },
          { name: "revenue", type: "number" },
          { name: "orders", type: "number" },
          { name: "conversion", type: "number" },
        ],
        version: 1,
        origin: "upload",
        syncConfig: {
          enabled: false,
          sourceType: "manual",
          sourceConfig: {},
          updateMode: "full",
          schedule: null,
        },
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "ds_growth_demo",
        projectId: "proj_growth_demo",
        organizationId: "org_demo",
        name: "growth_funnel.json",
        description: "示例漏斗数据",
        fileName: "growth_funnel.json",
        filePath: "projects/proj_growth_demo/datasets/ds_growth_demo/growth_funnel.json",
        fileType: "json",
        size: 168,
        rows: 4,
        columns: 2,
        schema: [
          { name: "step", type: "string" },
          { name: "users", type: "number" },
        ],
        version: 1,
        origin: "upload",
        syncConfig: {
          enabled: true,
          sourceType: "presto",
          sourceConfig: { query: "SELECT step, users FROM growth_funnel_daily" },
          updateMode: "full",
          schedule: "0 8 * * *",
          lastSyncAt: createdAt,
          lastSyncStatus: "success",
        },
        createdAt,
        updatedAt: createdAt,
      },
    ],
    projectMembers: [
      {
        projectId: "proj_sales_demo",
        userId: "user_lisi",
        permission: "edit",
        addedAt: createdAt,
      },
      {
        projectId: "proj_sales_demo",
        userId: "user_wangwu",
        permission: "view",
        addedAt: createdAt,
      },
    ],
    apiKeys: [],
    syncHistory: [
      {
        id: "sync_growth_demo",
        projectId: "proj_growth_demo",
        datasetId: "ds_growth_demo",
        status: "success",
        startedAt: createdAt,
        completedAt: createdAt,
        rowsSynced: 4,
        updateMode: "full",
        error: null,
      },
    ],
    syncJobs: [],
    projectSyncScripts: [],
    scriptSyncJobs: [],
    scriptSyncHistory: [],
    uploadSessions: [],
    dashboardVersions: [],
    datasetVersions: [],
    webhookEndpoints: [],
    auditLogs: [],
    activities: [
      {
        id: "act_seed_upload",
        organizationId: "org_demo",
        type: "upload",
        userId: "user_admin",
        action: "上传了新看板",
        target: "Q2 销售业绩分析",
        createdAt,
      },
      {
        id: "act_seed_permission",
        organizationId: "org_demo",
        type: "permission",
        userId: "user_lisi",
        action: "开放了公开访问",
        target: "用户行为漏斗",
        createdAt,
      },
    ],
  }
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function writeSeedFile(relativePath: string, content: string) {
  const filePath = absoluteUploadPath(relativePath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, "utf8")
}

async function ensureSeedArtifacts() {
  await writeSeedFile("projects/proj_sales_demo/index.html", salesDashboardHtml)
  await writeSeedFile("projects/proj_growth_demo/index.html", growthDashboardHtml)
  await writeSeedFile("projects/proj_sales_demo/datasets/ds_sales_demo/sales_2026_q2.csv", salesDatasetCsv)
  await writeSeedFile("projects/proj_growth_demo/datasets/ds_growth_demo/growth_funnel.json", growthDatasetJson)
}

let sqliteDatabase: SqliteDatabase | null = null
let sqliteReady = false
let postgresPool: Pool | null = null
let postgresReady = false
let updateDatabaseQueue = Promise.resolve()

async function ensureDatabase() {
  await fs.mkdir(dataDir, { recursive: true })
  await fs.mkdir(uploadDir, { recursive: true })
  await ensureSeedArtifacts()

  if (dataDriver === "sqlite") {
    await ensureSqliteDatabase()
    return
  }

  if (dataDriver === "postgres") {
    await ensurePostgresDatabase()
    return
  }

  if (!(await exists(databasePath))) {
    await writeJsonDatabase(seedDatabase())
  } else {
    const content = await fs.readFile(databasePath, "utf8")
    const database = normalizeDatabase(JSON.parse(content) as Database)
    if (applySeedDataUpdates(database)) await writeJsonDatabase(database)
  }
}

export async function readDatabase(): Promise<Database> {
  await ensureDatabase()
  if (dataDriver === "sqlite") return normalizeDatabase(readSqliteDatabase())
  if (dataDriver === "postgres") return normalizeDatabase(await readPostgresDatabase())
  const content = await fs.readFile(databasePath, "utf8")
  return normalizeDatabase(JSON.parse(content) as Database)
}

export async function getProjectById(projectId: string): Promise<Project | null> {
  await ensureDatabase()
  if (dataDriver === "sqlite") {
    const database = getSqliteDatabase()
    const row = database.prepare("SELECT data FROM projects WHERE id = ? LIMIT 1").get(projectId) as { data: string } | undefined
    if (!row) return null
    return JSON.parse(row.data) as Project
  }

  if (dataDriver === "postgres") {
    // Postgres stores the whole DB as a single JSONB blob in `artifacta_state`,
    // so a per-row index does not exist — we fall back to the singleton fetch.
    const database = await readPostgresDatabase()
    return database.projects.find((project) => project.id === projectId) ?? null
  }

  const content = await fs.readFile(databasePath, "utf8")
  const parsed = JSON.parse(content) as Database
  return parsed.projects.find((project) => project.id === projectId) ?? null
}

export async function writeDatabase(database: Database) {
  await fs.mkdir(dataDir, { recursive: true })
  if (dataDriver === "sqlite") {
    await ensureSqliteDatabase()
    writeSqliteDatabase(database)
    return
  }

  if (dataDriver === "postgres") {
    await ensurePostgresDatabase()
    await writePostgresDatabase(database)
    return
  }

  await writeJsonDatabase(database)
}

async function writeJsonDatabase(database: Database) {
  await fs.mkdir(dataDir, { recursive: true })
  const tempPath = `${databasePath}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tempPath, JSON.stringify(database, null, 2), "utf8")
  await fs.rename(tempPath, databasePath)
}

async function ensureSqliteDatabase() {
  if (sqliteReady) return

  await fs.mkdir(path.dirname(sqlitePath), { recursive: true })
  const database = getSqliteDatabase()
  database.pragma("journal_mode = WAL")
  database.exec(`
    CREATE TABLE IF NOT EXISTS artifacta_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    );
  `)

  const legacyMigrations = database
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='datavision_migrations'")
    .get() as { name: string } | undefined
  if (legacyMigrations) {
    database.exec(`
      INSERT OR IGNORE INTO artifacta_migrations SELECT * FROM datavision_migrations;
      DROP TABLE datavision_migrations;
    `)
  }

  applySqliteMigration(
    database,
    1,
    "initial_domain_tables",
    `
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        email TEXT NOT NULL,
        data TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        data TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        folder_id TEXT,
        updated_at TEXT NOT NULL,
        data TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS datasets (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        data TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS project_members (
        project_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (project_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        prefix TEXT NOT NULL,
        data TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_history (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        dataset_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        data TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS activities (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        data TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_users_org ON users (organization_id);
      CREATE INDEX IF NOT EXISTS idx_projects_org ON projects (organization_id);
      CREATE INDEX IF NOT EXISTS idx_datasets_project ON datasets (project_id);
      CREATE INDEX IF NOT EXISTS idx_sync_history_dataset ON sync_history (dataset_id, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_activities_org ON activities (organization_id, created_at DESC);
    `
  )

  applySqliteMigration(
    database,
    2,
    "sync_jobs_table",
    `
      CREATE TABLE IF NOT EXISTS sync_jobs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        dataset_id TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        status TEXT NOT NULL,
        trigger TEXT NOT NULL,
        requested_by TEXT,
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        data TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sync_jobs_status_created ON sync_jobs (status, created_at);
      CREATE INDEX IF NOT EXISTS idx_sync_jobs_dataset_status ON sync_jobs (project_id, dataset_id, status);
    `
  )

  applySqliteMigration(
    database,
    3,
    "upload_sessions_and_dataset_origin",
    `
      CREATE TABLE IF NOT EXISTS upload_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        data TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_upload_sessions_user ON upload_sessions (user_id);
      CREATE INDEX IF NOT EXISTS idx_upload_sessions_expires ON upload_sessions (expires_at);
    `
  )

  applySqliteMigration(
    database,
    4,
    "production_track_tables",
    `
      CREATE TABLE IF NOT EXISTS dashboard_versions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        data TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS dataset_versions (
        id TEXT PRIMARY KEY,
        dataset_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        data TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS webhook_endpoints (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        enabled INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        data TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        data TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_dashboard_versions_project ON dashboard_versions (project_id, version DESC);
      CREATE INDEX IF NOT EXISTS idx_dataset_versions_dataset ON dataset_versions (dataset_id, version DESC);
      CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_org ON webhook_endpoints (organization_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON audit_logs (organization_id, created_at DESC);
    `
  )

  applySqliteMigration(
    database,
    5,
    "script_sync_tables",
    `
      CREATE TABLE IF NOT EXISTS project_sync_scripts (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        data TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS script_sync_jobs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        data TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS script_sync_history (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        script_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        data TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_project_sync_scripts_project ON project_sync_scripts (project_id);
      CREATE INDEX IF NOT EXISTS idx_script_sync_jobs_status_created ON script_sync_jobs (status, created_at);
      CREATE INDEX IF NOT EXISTS idx_script_sync_history_script ON script_sync_history (script_id, started_at DESC);
    `
  )

  const row = database.prepare("SELECT COUNT(1) AS count FROM organizations").get() as { count: number }
  if (row.count === 0) {
    writeSqliteDatabase(seedDatabase())
  } else {
    const current = readSqliteDatabase()
    if (applySeedDataUpdates(current)) writeSqliteDatabase(current)
  }

  sqliteReady = true
}

function applySeedDataUpdates(database: Database) {
  let changed = false
  const salesProject = database.projects.find((project) => project.id === "proj_sales_demo")
  const growthProject = database.projects.find((project) => project.id === "proj_growth_demo")

  if (salesProject && salesProject.description !== salesDemoDescription) {
    salesProject.description = salesDemoDescription
    changed = true
  }

  if (growthProject && growthProject.description !== growthDemoDescription) {
    growthProject.description = growthDemoDescription
    changed = true
  }

  return changed
}

function normalizeDatabase(database: Database) {
  database.syncJobs ??= []
  database.projectSyncScripts ??= []
  database.scriptSyncJobs ??= []
  database.scriptSyncHistory ??= []
  database.uploadSessions ??= []
  database.dashboardVersions ??= []
  database.datasetVersions ??= []
  database.webhookEndpoints ??= []
  database.auditLogs ??= []
  for (const dataset of database.datasets) {
    dataset.origin ??= "upload"
  }
  return database
}

function getSqliteDatabase() {
  sqliteDatabase ??= new Sqlite(sqlitePath)
  return sqliteDatabase
}

function applySqliteMigration(database: SqliteDatabase, id: number, name: string, sql: string) {
  const applied = database.prepare("SELECT id FROM artifacta_migrations WHERE id = ?").get(id)
  if (applied) return

  const migrate = database.transaction(() => {
    database.exec(sql)
    database.prepare("INSERT INTO artifacta_migrations (id, name, applied_at) VALUES (?, ?, ?)").run(id, name, now())
  })
  migrate()
}

function readSqliteDatabase(): Database {
  const database = getSqliteDatabase()
  const versionRow = database.prepare("SELECT value FROM metadata WHERE key = 'version'").get() as { value: string } | undefined

  return {
    version: versionRow ? Number(versionRow.value) : 1,
    organizations: readSqliteRows<Organization>(database, "organizations"),
    users: readSqliteRows<User>(database, "users"),
    folders: readSqliteRows<Folder>(database, "folders"),
    projects: readSqliteRows<Project>(database, "projects"),
    datasets: readSqliteRows<Dataset>(database, "datasets"),
    projectMembers: readSqliteRows<ProjectMember>(database, "project_members"),
    apiKeys: readSqliteRows<ApiKey>(database, "api_keys"),
    syncHistory: readSqliteRows<SyncHistory>(database, "sync_history").sort((left, right) => right.startedAt.localeCompare(left.startedAt)),
    syncJobs: readSqliteRows<SyncJob>(database, "sync_jobs").sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    projectSyncScripts: readSqliteRows<ProjectSyncScript>(database, "project_sync_scripts").sort((left, right) =>
      left.updatedAt.localeCompare(right.updatedAt)
    ),
    scriptSyncJobs: readSqliteRows<ScriptSyncJob>(database, "script_sync_jobs").sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt)
    ),
    scriptSyncHistory: readSqliteRows<ScriptSyncHistory>(database, "script_sync_history").sort((left, right) =>
      right.startedAt.localeCompare(left.startedAt)
    ),
    uploadSessions: readSqliteRows<UploadSession>(database, "upload_sessions").sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    dashboardVersions: readSqliteRows<DashboardVersion>(database, "dashboard_versions").sort((left, right) => right.version - left.version),
    datasetVersions: readSqliteRows<DatasetVersion>(database, "dataset_versions").sort((left, right) => right.version - left.version),
    webhookEndpoints: readSqliteRows<WebhookEndpoint>(database, "webhook_endpoints"),
    auditLogs: readSqliteRows<AuditLog>(database, "audit_logs").sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    activities: readSqliteRows<Activity>(database, "activities").sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
  }
}

function writeSqliteDatabase(appDatabase: Database) {
  const database = getSqliteDatabase()
  const writeAll = database.transaction(() => {
    database.prepare("DELETE FROM project_members").run()
    database.prepare("DELETE FROM upload_sessions").run()
    database.prepare("DELETE FROM audit_logs").run()
    database.prepare("DELETE FROM webhook_endpoints").run()
    database.prepare("DELETE FROM dataset_versions").run()
    database.prepare("DELETE FROM dashboard_versions").run()
    database.prepare("DELETE FROM script_sync_history").run()
    database.prepare("DELETE FROM script_sync_jobs").run()
    database.prepare("DELETE FROM project_sync_scripts").run()
    database.prepare("DELETE FROM sync_jobs").run()
    database.prepare("DELETE FROM sync_history").run()
    database.prepare("DELETE FROM activities").run()
    database.prepare("DELETE FROM api_keys").run()
    database.prepare("DELETE FROM datasets").run()
    database.prepare("DELETE FROM projects").run()
    database.prepare("DELETE FROM folders").run()
    database.prepare("DELETE FROM users").run()
    database.prepare("DELETE FROM organizations").run()
    database.prepare("DELETE FROM metadata").run()

    database.prepare("INSERT INTO metadata (key, value) VALUES ('version', ?)").run(String(appDatabase.version))

    const insertOrganization = database.prepare("INSERT INTO organizations (id, data) VALUES (?, ?)")
    const insertUser = database.prepare("INSERT INTO users (id, organization_id, email, data) VALUES (?, ?, ?, ?)")
    const insertFolder = database.prepare("INSERT INTO folders (id, organization_id, data) VALUES (?, ?, ?)")
    const insertProject = database.prepare("INSERT INTO projects (id, organization_id, owner_id, folder_id, updated_at, data) VALUES (?, ?, ?, ?, ?, ?)")
    const insertDataset = database.prepare("INSERT INTO datasets (id, project_id, organization_id, updated_at, data) VALUES (?, ?, ?, ?, ?)")
    const insertProjectMember = database.prepare("INSERT INTO project_members (project_id, user_id, data) VALUES (?, ?, ?)")
    const insertApiKey = database.prepare("INSERT INTO api_keys (id, organization_id, user_id, prefix, data) VALUES (?, ?, ?, ?, ?)")
    const insertSyncHistory = database.prepare("INSERT INTO sync_history (id, project_id, dataset_id, started_at, data) VALUES (?, ?, ?, ?, ?)")
    const insertSyncJob = database.prepare(
      "INSERT INTO sync_jobs (id, project_id, dataset_id, organization_id, status, trigger, requested_by, created_at, started_at, completed_at, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    const insertProjectSyncScript = database.prepare(
      "INSERT INTO project_sync_scripts (id, project_id, updated_at, data) VALUES (?, ?, ?, ?)"
    )
    const insertScriptSyncJob = database.prepare(
      "INSERT INTO script_sync_jobs (id, project_id, organization_id, status, created_at, data) VALUES (?, ?, ?, ?, ?, ?)"
    )
    const insertScriptSyncHistory = database.prepare(
      "INSERT INTO script_sync_history (id, project_id, script_id, started_at, data) VALUES (?, ?, ?, ?, ?)"
    )
    const insertUploadSession = database.prepare(
      "INSERT INTO upload_sessions (id, user_id, organization_id, expires_at, data) VALUES (?, ?, ?, ?, ?)"
    )
    const insertDashboardVersion = database.prepare(
      "INSERT INTO dashboard_versions (id, project_id, organization_id, version, created_at, data) VALUES (?, ?, ?, ?, ?, ?)"
    )
    const insertDatasetVersion = database.prepare(
      "INSERT INTO dataset_versions (id, dataset_id, project_id, organization_id, version, created_at, data) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    const insertWebhookEndpoint = database.prepare(
      "INSERT INTO webhook_endpoints (id, organization_id, enabled, updated_at, data) VALUES (?, ?, ?, ?, ?)"
    )
    const insertAuditLog = database.prepare("INSERT INTO audit_logs (id, organization_id, created_at, data) VALUES (?, ?, ?, ?)")
    const insertActivity = database.prepare("INSERT INTO activities (id, organization_id, created_at, data) VALUES (?, ?, ?, ?)")

    for (const organization of appDatabase.organizations) insertOrganization.run(organization.id, stringifySqliteRow(organization))
    for (const user of appDatabase.users) insertUser.run(user.id, user.organizationId, user.email, stringifySqliteRow(user))
    for (const folder of appDatabase.folders) insertFolder.run(folder.id, folder.organizationId, stringifySqliteRow(folder))
    for (const project of appDatabase.projects) insertProject.run(project.id, project.organizationId, project.ownerId, project.folderId, project.updatedAt, stringifySqliteRow(project))
    for (const dataset of appDatabase.datasets) insertDataset.run(dataset.id, dataset.projectId, dataset.organizationId, dataset.updatedAt, stringifySqliteRow(dataset))
    for (const member of appDatabase.projectMembers) insertProjectMember.run(member.projectId, member.userId, stringifySqliteRow(member))
    for (const apiKey of appDatabase.apiKeys) insertApiKey.run(apiKey.id, apiKey.organizationId, apiKey.userId, apiKey.prefix, stringifySqliteRow(apiKey))
    for (const history of appDatabase.syncHistory) insertSyncHistory.run(history.id, history.projectId, history.datasetId, history.startedAt, stringifySqliteRow(history))
    for (const job of appDatabase.syncJobs ?? [])
      insertSyncJob.run(
        job.id,
        job.projectId,
        job.datasetId,
        job.organizationId,
        job.status,
        job.trigger,
        job.requestedBy,
        job.createdAt,
        job.startedAt,
        job.completedAt,
        stringifySqliteRow(job)
      )
    for (const script of appDatabase.projectSyncScripts ?? [])
      insertProjectSyncScript.run(script.id, script.projectId, script.updatedAt, stringifySqliteRow(script))
    for (const job of appDatabase.scriptSyncJobs ?? [])
      insertScriptSyncJob.run(job.id, job.projectId, job.organizationId, job.status, job.createdAt, stringifySqliteRow(job))
    for (const history of appDatabase.scriptSyncHistory ?? [])
      insertScriptSyncHistory.run(history.id, history.projectId, history.scriptId, history.startedAt, stringifySqliteRow(history))
    for (const session of appDatabase.uploadSessions ?? [])
      insertUploadSession.run(session.id, session.userId, session.organizationId, session.expiresAt, stringifySqliteRow(session))
    for (const version of appDatabase.dashboardVersions ?? [])
      insertDashboardVersion.run(version.id, version.projectId, version.organizationId, version.version, version.createdAt, stringifySqliteRow(version))
    for (const version of appDatabase.datasetVersions ?? [])
      insertDatasetVersion.run(version.id, version.datasetId, version.projectId, version.organizationId, version.version, version.createdAt, stringifySqliteRow(version))
    for (const endpoint of appDatabase.webhookEndpoints ?? [])
      insertWebhookEndpoint.run(endpoint.id, endpoint.organizationId, endpoint.enabled ? 1 : 0, endpoint.updatedAt, stringifySqliteRow(endpoint))
    for (const log of appDatabase.auditLogs ?? [])
      insertAuditLog.run(log.id, log.organizationId, log.createdAt, stringifySqliteRow(log))
    for (const activity of appDatabase.activities) insertActivity.run(activity.id, activity.organizationId, activity.createdAt, stringifySqliteRow(activity))
  })

  writeAll()
}

type SqliteTable =
  | "organizations"
  | "users"
  | "folders"
  | "projects"
  | "datasets"
  | "project_members"
  | "api_keys"
  | "sync_history"
  | "sync_jobs"
  | "project_sync_scripts"
  | "script_sync_jobs"
  | "script_sync_history"
  | "upload_sessions"
  | "dashboard_versions"
  | "dataset_versions"
  | "webhook_endpoints"
  | "audit_logs"
  | "activities"

function readSqliteRows<T>(database: SqliteDatabase, table: SqliteTable) {
  const rows = database.prepare(`SELECT data FROM ${table}`).all() as Array<{ data: string }>
  return rows.map((row) => JSON.parse(row.data) as T)
}

function stringifySqliteRow(value: unknown) {
  return JSON.stringify(value)
}

async function ensurePostgresDatabase() {
  if (postgresReady) return
  const pool = getPostgresPool()
  await pool.query(`
    CREATE TABLE IF NOT EXISTS artifacta_state (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  const result = await pool.query("SELECT data FROM artifacta_state WHERE id = $1", ["singleton"])
  if (result.rowCount === 0) {
    await writePostgresDatabase(seedDatabase())
  } else {
    const current = normalizeDatabase(decodePostgresDatabase(result.rows[0].data))
    if (applySeedDataUpdates(current)) await writePostgresDatabase(current)
  }

  postgresReady = true
}

function getPostgresPool() {
  if (!postgresUrl) throw new Error("POSTGRES_URL or DATABASE_URL must be set when DATA_DRIVER=postgres.")
  postgresPool ??= new Pool({ connectionString: postgresUrl })
  return postgresPool
}

async function readPostgresDatabase(): Promise<Database> {
  const result = await getPostgresPool().query("SELECT data FROM artifacta_state WHERE id = $1", ["singleton"])
  if (result.rowCount === 0) {
    const seeded = seedDatabase()
    await writePostgresDatabase(seeded)
    return seeded
  }
  return decodePostgresDatabase(result.rows[0].data)
}

async function writePostgresDatabase(database: Database) {
  await getPostgresPool().query(
    `
      INSERT INTO artifacta_state (id, data, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
    `,
    ["singleton", JSON.stringify(database)]
  )
}

function decodePostgresDatabase(value: unknown): Database {
  return typeof value === "string" ? (JSON.parse(value) as Database) : (value as Database)
}

export async function updateDatabase<T>(updater: (database: Database) => T | Promise<T>): Promise<T> {
  const previousUpdate = updateDatabaseQueue
  let releaseQueue!: () => void
  updateDatabaseQueue = new Promise((resolve) => {
    releaseQueue = resolve
  })

  await previousUpdate.catch(() => undefined)
  try {
    const database = await readDatabase()
    const result = await updater(database)
    await writeDatabase(database)
    return result
  } finally {
    releaseQueue()
  }
}

export function addActivity(database: Database, activity: Omit<Database["activities"][number], "id" | "createdAt">) {
  database.activities.unshift({
    ...activity,
    id: `act_${crypto.randomUUID()}`,
    createdAt: now(),
  })
  database.activities = database.activities.slice(0, 100)
}

export { now }
