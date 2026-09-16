import type { Connection, Database, Table, Column } from "./types";

/**
 * Stand-in for a live MySQL server. Everything here is replaced by real
 * information_schema reads once the backend lands - see lib/api.ts.
 */

function col(
  name: string,
  dataType: string,
  opts: Partial<Omit<Column, "name" | "dataType">> = {}
): Column {
  return {
    name,
    dataType,
    nullable: opts.nullable ?? false,
    key: opts.key ?? null,
    defaultValue: opts.defaultValue ?? null,
    extra: opts.extra ?? "",
    comment: opts.comment,
  };
}

const id = () => col("id", "bigint unsigned", { key: "PRI", extra: "auto_increment" });
const createdAt = () => col("created_at", "timestamp", { defaultValue: "CURRENT_TIMESTAMP" });
const updatedAt = () =>
  col("updated_at", "timestamp", {
    defaultValue: "CURRENT_TIMESTAMP",
    extra: "on update CURRENT_TIMESTAMP",
  });

function table(
  name: string,
  columns: Column[],
  opts: Partial<Omit<Table, "name" | "columns">> = {}
): Table {
  return {
    name,
    kind: opts.kind ?? "table",
    engine: opts.engine ?? "InnoDB",
    rowCount: opts.rowCount ?? 0,
    sizeBytes: opts.sizeBytes ?? 16384,
    columns,
    indexes: opts.indexes ?? [{ name: "PRIMARY", columns: ["id"], unique: true }],
  };
}

const shopTables: Table[] = [
  table(
    "customers",
    [
      id(),
      col("email", "varchar(255)", { key: "UNI" }),
      col("first_name", "varchar(100)"),
      col("last_name", "varchar(100)"),
      col("phone", "varchar(32)", { nullable: true }),
      col("country_code", "char(2)", { key: "MUL" }),
      col("lifetime_value", "decimal(12,2)", { defaultValue: "0.00" }),
      col("is_active", "tinyint(1)", { defaultValue: "1" }),
      col("marketing_opt_in", "tinyint(1)", { defaultValue: "0" }),
      createdAt(),
      updatedAt(),
    ],
    {
      rowCount: 48213,
      sizeBytes: 12582912,
      indexes: [
        { name: "PRIMARY", columns: ["id"], unique: true },
        { name: "uniq_customers_email", columns: ["email"], unique: true },
        { name: "idx_customers_country", columns: ["country_code"], unique: false },
      ],
    }
  ),
  table(
    "orders",
    [
      id(),
      col("customer_id", "bigint unsigned", { key: "MUL" }),
      col("order_number", "varchar(32)", { key: "UNI" }),
      col("status", "enum('pending','paid','shipped','delivered','refunded')", {
        defaultValue: "pending",
        key: "MUL",
      }),
      col("subtotal", "decimal(12,2)"),
      col("shipping", "decimal(12,2)", { defaultValue: "0.00" }),
      col("tax", "decimal(12,2)", { defaultValue: "0.00" }),
      col("total", "decimal(12,2)"),
      col("currency", "char(3)", { defaultValue: "USD" }),
      col("placed_at", "datetime", { key: "MUL" }),
      col("shipped_at", "datetime", { nullable: true }),
      col("notes", "text", { nullable: true }),
      createdAt(),
    ],
    {
      rowCount: 192847,
      sizeBytes: 67108864,
      indexes: [
        { name: "PRIMARY", columns: ["id"], unique: true },
        { name: "uniq_orders_number", columns: ["order_number"], unique: true },
        { name: "idx_orders_customer", columns: ["customer_id"], unique: false },
        { name: "idx_orders_status_placed", columns: ["status", "placed_at"], unique: false },
      ],
    }
  ),
  table(
    "order_items",
    [
      id(),
      col("order_id", "bigint unsigned", { key: "MUL" }),
      col("product_id", "bigint unsigned", { key: "MUL" }),
      col("sku", "varchar(64)"),
      col("quantity", "int unsigned", { defaultValue: "1" }),
      col("unit_price", "decimal(12,2)"),
      col("discount", "decimal(12,2)", { defaultValue: "0.00" }),
      col("line_total", "decimal(12,2)", { extra: "STORED GENERATED" }),
    ],
    { rowCount: 741309, sizeBytes: 184549376 }
  ),
  table(
    "products",
    [
      id(),
      col("sku", "varchar(64)", { key: "UNI" }),
      col("name", "varchar(255)"),
      col("description", "text", { nullable: true }),
      col("category_id", "bigint unsigned", { key: "MUL", nullable: true }),
      col("price", "decimal(12,2)"),
      col("cost", "decimal(12,2)", { nullable: true }),
      col("stock_quantity", "int", { defaultValue: "0" }),
      col("weight_grams", "int unsigned", { nullable: true }),
      col("attributes", "json", { nullable: true }),
      col("is_published", "tinyint(1)", { defaultValue: "0" }),
      createdAt(),
      updatedAt(),
    ],
    { rowCount: 8942, sizeBytes: 4194304 }
  ),
  table(
    "categories",
    [
      id(),
      col("parent_id", "bigint unsigned", { nullable: true, key: "MUL" }),
      col("name", "varchar(120)"),
      col("slug", "varchar(120)", { key: "UNI" }),
      col("position", "int", { defaultValue: "0" }),
    ],
    { rowCount: 64, sizeBytes: 32768 }
  ),
  table(
    "payments",
    [
      id(),
      col("order_id", "bigint unsigned", { key: "MUL" }),
      col("provider", "varchar(48)"),
      col("provider_ref", "varchar(128)", { key: "UNI" }),
      col("amount", "decimal(12,2)"),
      col("status", "enum('authorized','captured','failed','refunded')"),
      col("captured_at", "datetime", { nullable: true }),
      createdAt(),
    ],
    { rowCount: 188402, sizeBytes: 41943040 }
  ),
  table(
    "shipping_addresses",
    [
      id(),
      col("customer_id", "bigint unsigned", { key: "MUL" }),
      col("line1", "varchar(255)"),
      col("line2", "varchar(255)", { nullable: true }),
      col("city", "varchar(120)"),
      col("region", "varchar(120)", { nullable: true }),
      col("postal_code", "varchar(24)"),
      col("country_code", "char(2)"),
      col("is_default", "tinyint(1)", { defaultValue: "0" }),
    ],
    { rowCount: 52118, sizeBytes: 15728640 }
  ),
  table(
    "v_monthly_revenue",
    [
      col("month", "date"),
      col("orders", "bigint"),
      col("gross_revenue", "decimal(32,2)"),
      col("avg_order_value", "decimal(16,4)"),
    ],
    { kind: "view", engine: "-", rowCount: 0, sizeBytes: 0, indexes: [] }
  ),
];

const analyticsTables: Table[] = [
  table(
    "page_views",
    [
      id(),
      col("session_id", "char(36)", { key: "MUL" }),
      col("customer_id", "bigint unsigned", { nullable: true, key: "MUL" }),
      col("path", "varchar(512)"),
      col("referrer", "varchar(512)", { nullable: true }),
      col("user_agent", "varchar(512)", { nullable: true }),
      col("viewed_at", "datetime(3)", { key: "MUL" }),
    ],
    { rowCount: 14209887, sizeBytes: 2147483648 }
  ),
  table(
    "sessions",
    [
      col("id", "char(36)", { key: "PRI" }),
      col("customer_id", "bigint unsigned", { nullable: true, key: "MUL" }),
      col("started_at", "datetime"),
      col("ended_at", "datetime", { nullable: true }),
      col("device_type", "enum('desktop','mobile','tablet','bot')"),
      col("utm_source", "varchar(120)", { nullable: true }),
    ],
    { rowCount: 3401226, sizeBytes: 612368384 }
  ),
  table(
    "daily_rollup",
    [
      col("day", "date", { key: "PRI" }),
      col("sessions", "int unsigned", { defaultValue: "0" }),
      col("page_views", "int unsigned", { defaultValue: "0" }),
      col("conversions", "int unsigned", { defaultValue: "0" }),
      col("revenue", "decimal(14,2)", { defaultValue: "0.00" }),
    ],
    {
      rowCount: 1461,
      sizeBytes: 98304,
      indexes: [{ name: "PRIMARY", columns: ["day"], unique: true }],
    }
  ),
];

const authTables: Table[] = [
  table(
    "users",
    [
      id(),
      col("email", "varchar(255)", { key: "UNI" }),
      col("password_hash", "varchar(255)"),
      col("role", "enum('admin','staff','readonly')", { defaultValue: "readonly" }),
      col("last_login_at", "datetime", { nullable: true }),
      col("mfa_enabled", "tinyint(1)", { defaultValue: "0" }),
      createdAt(),
    ],
    { rowCount: 37, sizeBytes: 32768 }
  ),
  table(
    "api_tokens",
    [
      id(),
      col("user_id", "bigint unsigned", { key: "MUL" }),
      col("name", "varchar(120)"),
      col("token_hash", "char(64)", { key: "UNI" }),
      col("scopes", "json", { nullable: true }),
      col("expires_at", "datetime", { nullable: true }),
      col("revoked_at", "datetime", { nullable: true }),
      createdAt(),
    ],
    { rowCount: 214, sizeBytes: 65536 }
  ),
  table(
    "audit_log",
    [
      id(),
      col("user_id", "bigint unsigned", { nullable: true, key: "MUL" }),
      col("action", "varchar(120)", { key: "MUL" }),
      col("entity_type", "varchar(120)", { nullable: true }),
      col("entity_id", "varchar(64)", { nullable: true }),
      col("payload", "json", { nullable: true }),
      col("ip_address", "varbinary(16)", { nullable: true }),
      createdAt(),
    ],
    { rowCount: 921744, sizeBytes: 293601280 }
  ),
];

const infoSchemaTables: Table[] = [
  table(
    "TABLES",
    [
      col("TABLE_SCHEMA", "varchar(64)"),
      col("TABLE_NAME", "varchar(64)"),
      col("ENGINE", "varchar(64)"),
      col("TABLE_ROWS", "bigint unsigned"),
    ],
    { kind: "view", engine: "-", indexes: [] }
  ),
  table(
    "COLUMNS",
    [
      col("TABLE_SCHEMA", "varchar(64)"),
      col("TABLE_NAME", "varchar(64)"),
      col("COLUMN_NAME", "varchar(64)"),
      col("DATA_TYPE", "varchar(64)"),
    ],
    { kind: "view", engine: "-", indexes: [] }
  ),
  table(
    "PROCESSLIST",
    [
      col("ID", "bigint unsigned"),
      col("USER", "varchar(32)"),
      col("HOST", "varchar(261)"),
      col("DB", "varchar(64)"),
      col("COMMAND", "varchar(16)"),
      col("TIME", "int"),
    ],
    { kind: "view", engine: "-", indexes: [] }
  ),
];

export const MOCK_DATABASES: Database[] = [
  { name: "shop", charset: "utf8mb4", collation: "utf8mb4_0900_ai_ci", tables: shopTables },
  {
    name: "analytics",
    charset: "utf8mb4",
    collation: "utf8mb4_0900_ai_ci",
    tables: analyticsTables,
  },
  { name: "auth", charset: "utf8mb4", collation: "utf8mb4_0900_ai_ci", tables: authTables },
  {
    name: "information_schema",
    charset: "utf8",
    collation: "utf8_general_ci",
    tables: infoSchemaTables,
  },
];

export const MOCK_CONNECTIONS: Connection[] = [
  {
    id: "conn_local",
    name: "Local dev",
    host: "127.0.0.1",
    port: 3306,
    username: "root",
    database: "shop",
    useSsl: false,
    status: "connected",
    serverVersion: "8.4.2",
  },
  {
    id: "conn_rds",
    name: "Kilgore (RDS)",
    // Real instance, us-east-2. Resolves to a private VPC address, so it is
    // only reachable from inside the VPC or through a tunnel.
    host: "kilgore.ch9jei5g8isa.us-east-2.rds.amazonaws.com",
    port: 3306,
    // Placeholder until the real master user is confirmed.
    username: "admin",
    database: "shop",
    useSsl: true,
    status: "disconnected",
  },
];
