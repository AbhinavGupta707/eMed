#!/usr/bin/env node

import { spawn } from "node:child_process";

import {
  buildScopedResetSql,
  checkSeededScenarios,
  createDemoRuntime,
  loadScenarioBundle,
  parseArguments,
  seedScenarios
} from "./lib.mjs";

function postgresEnvironment(databaseUrl) {
  const url = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("DATABASE_URL must use the postgres or postgresql protocol.");
  }
  const sslmode = url.searchParams.get("sslmode");
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    ...(sslmode ? { PGSSLMODE: sslmode } : {})
  };
}

async function executeReset(databaseUrl, sql) {
  await new Promise((resolve, reject) => {
    const child = spawn("psql", ["--no-psqlrc", "--quiet"], {
      env: postgresEnvironment(databaseUrl),
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.stdout.resume();
    child.on("error", (error) => reject(new Error(`Unable to run psql: ${error.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `Scoped demo reset failed in PostgreSQL: ${stderr.trim() || `psql exit ${code}`}`
          )
        );
    });
    child.stdin.end(sql);
  });
}

try {
  const runtime = createDemoRuntime(parseArguments(process.argv.slice(2)));
  if (!runtime.databaseUrl) {
    throw new Error(
      "Reset requires DATABASE_URL so a progressed round can be removed transactionally. Seed/check still support the in-memory development fallback."
    );
  }
  const bundle = await loadScenarioBundle();
  await executeReset(runtime.databaseUrl, buildScopedResetSql(bundle));
  await seedScenarios(runtime, bundle);
  const checked = await checkSeededScenarios(runtime, bundle);
  console.log(
    `Reset complete: ${checked.length} exact synthetic scenarios are ready; unrelated data was outside the SQL scope.`
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Demo reset failed.");
  process.exitCode = 1;
}
