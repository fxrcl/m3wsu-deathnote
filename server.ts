import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs/promises";
import { randomUUID } from "crypto";
import { Redis } from "@upstash/redis";

const DATA_FILE = path.join(process.cwd(), "records.json");

const ADMIN_PASSKEY = process.env.ADMIN_PASSKEY || "m3wsu2026";

const useRedis = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
);
const redis = useRedis ? Redis.fromEnv() : null;

const RECORDS_KEY = "m3wsu:records";
const tokenKey = (token: string) => `m3wsu:token:${token}`;
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

const memoryTokens = new Set<string>();

async function getRecords(): Promise<unknown> {
  if (redis) {
    return (await redis.get(RECORDS_KEY)) ?? [];
  }
  try {
    const data = await fs.readFile(DATA_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function setRecords(data: unknown): Promise<void> {
  if (redis) {
    await redis.set(RECORDS_KEY, data);
    return;
  }
  const tmp = `${DATA_FILE}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, DATA_FILE);
}

async function addToken(token: string): Promise<void> {
  if (redis) {
    await redis.set(tokenKey(token), "1", { ex: TOKEN_TTL_SECONDS });
    return;
  }
  memoryTokens.add(token);
}

async function hasToken(token: string): Promise<boolean> {
  if (redis) {
    return (await redis.exists(tokenKey(token))) === 1;
  }
  return memoryTokens.has(token);
}

async function removeToken(token: string): Promise<void> {
  if (redis) {
    await redis.del(tokenKey(token));
    return;
  }
  memoryTokens.delete(token);
}

async function seedRecordsIfEmpty(): Promise<void> {
  if (!redis) return;
  const existing = await redis.get(RECORDS_KEY);
  if (existing !== null) return;
  try {
    const data = await fs.readFile(DATA_FILE, "utf-8");
    await redis.set(RECORDS_KEY, JSON.parse(data));
  } catch {
    await redis.set(RECORDS_KEY, []);
  }
}

function extractToken(req: express.Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length);
  }
  return null;
}

async function isAuthorized(req: express.Request): Promise<boolean> {
  const token = extractToken(req);
  return token !== null && (await hasToken(token));
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  await seedRecordsIfEmpty();

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/auth", async (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSKEY) {
      const token = randomUUID();
      await addToken(token);
      res.json({ authenticated: true, token });
    } else {
      res.status(401).json({ authenticated: false, error: "Неверный пароль" });
    }
  });

  app.get("/api/verify", async (req, res) => {
    res.json({ valid: await isAuthorized(req) });
  });

  app.post("/api/logout", async (req, res) => {
    const token = extractToken(req);
    if (token) await removeToken(token);
    res.json({ success: true });
  });

  app.get("/api/records", async (_req, res) => {
    try {
      res.json(await getRecords());
    } catch (error) {
      res.status(500).json({ error: "Failed to read records" });
    }
  });

  app.post("/api/records", async (req, res) => {
    if (!(await isAuthorized(req))) {
      return res.status(403).json({ error: "Unauthorized. Только администратор может изменять записи." });
    }
    try {
      await setRecords(req.body);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to save records" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT} (storage: ${useRedis ? "Upstash Redis" : "file"})`);
  });
}

startServer();
