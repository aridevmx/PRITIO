#!/usr/bin/env node

import { readdir, stat } from "fs/promises";
import { join } from "path";

const ROOT = join(import.meta.dirname, "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const FUNCTIONS_DIR = join(ROOT, "supabase", "functions");

async function checkMigrations() {
  try {
    const files = await readdir(MIGRATIONS_DIR);
    const sqlFiles = files.filter((f) => f.endsWith(".sql")).sort();

    if (sqlFiles.length === 0) {
      console.log("⚠️  No se encontraron migraciones en supabase/migrations/");
      return;
    }

    console.log(`📦 ${sqlFiles.length} migraciones encontradas:`);
    sqlFiles.forEach((f) => console.log(`   ${f}`));

    const lastMigration = sqlFiles[sqlFiles.length - 1];
    console.log(`   ✅ Última migración: ${lastMigration}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      console.log("⚠️  Directorio supabase/migrations/ no existe aún");
    } else {
      console.error("❌ Error leyendo migraciones:", err);
    }
  }
}

async function checkFunctions() {
  try {
    const entries = await readdir(FUNCTIONS_DIR);
    const dirs = [];

    for (const entry of entries) {
      if (entry.startsWith("_")) continue;
      const fullPath = join(FUNCTIONS_DIR, entry);
      const info = await stat(fullPath);
      if (info.isDirectory()) {
        dirs.push(entry);
      }
    }

    if (dirs.length === 0) {
      console.log("⚠️  No se encontraron Edge Functions en supabase/functions/");
      return;
    }

    console.log(`\n⚡ ${dirs.length} Edge Function(s) encontradas:`);
    dirs.forEach((f) => console.log(`   ${f}`));
    console.log("\n   Para desplegar: supabase functions deploy <name>");
    console.log("   Para secrets: supabase secrets set KEY=value");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      console.log("⚠️  Directorio supabase/functions/ no existe aún");
    } else {
      console.error("❌ Error leyendo funciones:", err);
    }
  }
}

async function checkEnv() {
  try {
    const envPath = join(ROOT, ".env");
    await stat(envPath);
    console.log("\n🔑 Archivo .env encontrado");
  } catch {
    console.log("\n⚠️  No hay archivo .env. Copia .env.example a .env");
  }
}

await checkMigrations();
await checkFunctions();
await checkEnv();
