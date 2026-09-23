/**
 * Start the aimed-jobseek local development database.
 *
 * Prefers Docker (`aimed-jobseek-postgres` on port 5434). If Docker is not
 * available, starts a dedicated PostgreSQL data directory under
 * `.local-postgres/` on the same port. Never uses the default Windows
 * PostgreSQL instance on 5432 or any other project's names/volumes.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  appendFileSync,
  readFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, ".local-postgres", "data");
const LOG_FILE = join(ROOT, ".local-postgres", "postgres.log");
const PW_FILE = join(ROOT, ".local-postgres", "pwfile");
const PORT = "5434";
const USER = "aimedjobseek";
const PASSWORD = "aimedjobseek";
const DATABASE = "aimedjobseek";

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    ...options,
  });
}

function commandExists(command) {
  const probe = process.platform === "win32" ? "where.exe" : "which";
  const result = run(probe, [command], { shell: false });
  return result.status === 0 && Boolean(result.stdout?.trim());
}

function dockerAvailable() {
  if (!commandExists("docker")) return false;
  const result = run("docker", ["info"], { stdio: "pipe" });
  return result.status === 0;
}

function findPgBin() {
  if (commandExists("pg_ctl")) {
    const where = run(
      process.platform === "win32" ? "where.exe" : "which",
      ["pg_ctl"],
    );
    const first = where.stdout?.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
    if (first) return dirname(first);
  }

  const versions = ["17", "16", "15", "14"];
  const prefixes = [
    process.env["ProgramFiles"],
    process.env["ProgramFiles(x86)"],
  ].filter(Boolean);
  for (const prefix of prefixes) {
    for (const version of versions) {
      const bin = join(prefix, "PostgreSQL", version, "bin");
      if (existsSync(join(bin, process.platform === "win32" ? "pg_ctl.exe" : "pg_ctl"))) {
        return bin;
      }
    }
  }
  return null;
}

function pgTool(bin, name) {
  return join(bin, process.platform === "win32" ? `${name}.exe` : name);
}

function isReady() {
  const bin = findPgBin();
  const pgIsReady = bin ? pgTool(bin, "pg_isready") : "pg_isready";
  const result = run(pgIsReady, [
    "-h",
    "127.0.0.1",
    "-p",
    PORT,
    "-d",
    DATABASE,
    "-t",
    "2",
  ]);
  return result.status === 0;
}

function waitUntilReady(timeoutMs = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (isReady()) return true;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  return isReady();
}

function startWithDocker() {
  console.log("Starting aimed-jobseek-postgres with Docker Compose...");
  const result = run(
    "docker",
    ["compose", "up", "-d", "--wait", "postgres"],
    { cwd: ROOT, stdio: "inherit" },
  );
  if (result.status !== 0) {
    throw new Error("docker compose up failed for service postgres.");
  }
}

function ensureLocalCluster(bin) {
  mkdirSync(join(ROOT, ".local-postgres"), { recursive: true });
  if (!existsSync(join(DATA_DIR, "PG_VERSION"))) {
    writeFileSync(PW_FILE, `${PASSWORD}\n`, { encoding: "utf8" });
    console.log(`Initializing aimed-jobseek PostgreSQL data directory at ${DATA_DIR}`);
    const init = run(pgTool(bin, "initdb"), [
      "-D",
      DATA_DIR,
      "-U",
      USER,
      "-A",
      "scram-sha-256",
      "--encoding=UTF8",
      "--locale=C",
      `--pwfile=${PW_FILE}`,
    ]);
    if (init.status !== 0) {
      process.stderr.write(init.stderr || init.stdout || "");
      throw new Error("initdb failed.");
    }
    appendFileSync(
      join(DATA_DIR, "postgresql.conf"),
      `\n# aimed-jobseek dedicated local instance\nlisten_addresses = '127.0.0.1'\nport = ${PORT}\n`,
    );
  }

  if (isReady()) {
    console.log(`aimed-jobseek local Postgres already running on 127.0.0.1:${PORT}`);
    return;
  }

  console.log(`Starting aimed-jobseek local Postgres on 127.0.0.1:${PORT}`);
  const start = run(pgTool(bin, "pg_ctl"), [
    "-D",
    DATA_DIR,
    "-l",
    LOG_FILE,
    "start",
    "-o",
    `-p ${PORT}`,
  ]);
  if (start.status !== 0 && !isReady()) {
    process.stderr.write(start.stderr || start.stdout || "");
    if (existsSync(LOG_FILE)) {
      process.stderr.write(readLastLines(LOG_FILE));
    }
    throw new Error("pg_ctl start failed.");
  }
  if (!waitUntilReady()) {
    throw new Error(
      `aimed-jobseek Postgres started but did not accept connections on 127.0.0.1:${PORT}.`,
    );
  }
}

function readLastLines(path) {
  try {
    const text = readFileSync(path, "utf8");
    return text.split(/\r?\n/).slice(-20).join("\n") + "\n";
  } catch {
    return "";
  }
}

function main() {
  if (dockerAvailable()) {
    startWithDocker();
  } else {
    const bin = findPgBin();
    if (!bin) {
      throw new Error(
        "Neither Docker nor a local PostgreSQL install was found. " +
          "Install Docker Desktop or PostgreSQL, then re-run npm run db:up.",
      );
    }
    console.log("Docker is not available; using a dedicated local PostgreSQL data directory.");
    ensureLocalCluster(bin);
  }

  if (!waitUntilReady()) {
    throw new Error(
      `aimed-jobseek Postgres did not become ready on 127.0.0.1:${PORT}.`,
    );
  }

  console.log("");
  console.log("Local development database is ready.");
  console.log(`  Host:     127.0.0.1`);
  console.log(`  Port:     ${PORT}`);
  console.log(`  Database: ${DATABASE}`);
  console.log(`  User:     ${USER}`);
  console.log(
    `  URL:      postgresql://${USER}:***@127.0.0.1:${PORT}/${DATABASE}?schema=public`,
  );
  console.log("");
  console.log("This instance is dedicated (own port, user, database, and data directory/volume).");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
