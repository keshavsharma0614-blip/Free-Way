import path from 'path';
import { mkdir, readFile, rename, writeFile } from 'fs/promises';

export interface PersistedConfigV1 {
  version: 1;
  updatedAt: number;
  keys: Record<string, string>;
}

const CONFIG_DIR = path.resolve(process.cwd(), '.freeway');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

function normalizeKeys(keys: Record<string, string>, allowedEnvVars: Set<string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [envVar, value] of Object.entries(keys)) {
    if (!allowedEnvVars.has(envVar)) continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    normalized[envVar] = trimmed;
  }
  return normalized;
}

export async function loadPersistedConfig(allowedEnvVars: Set<string>): Promise<PersistedConfigV1 | null> {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    const data = JSON.parse(raw) as Partial<PersistedConfigV1>;
    if (data.version !== 1 || typeof data.updatedAt !== 'number' || typeof data.keys !== 'object' || !data.keys) {
      return null;
    }

    const keys = normalizeKeys(data.keys as Record<string, string>, allowedEnvVars);
    return {
      version: 1,
      updatedAt: data.updatedAt,
      keys,
    };
  } catch {
    return null;
  }
}

export async function savePersistedConfig(
  keys: Record<string, string>,
  allowedEnvVars: Set<string>
): Promise<{ path: string; updatedAt: number }> {
  const normalized = normalizeKeys(keys, allowedEnvVars);
  const payload: PersistedConfigV1 = {
    version: 1,
    updatedAt: Date.now(),
    keys: normalized,
  };

  await mkdir(CONFIG_DIR, { recursive: true });
  const tempPath = `${CONFIG_PATH}.tmp`;
  await writeFile(tempPath, JSON.stringify(payload, null, 2), 'utf-8');
  await rename(tempPath, CONFIG_PATH);

  return { path: CONFIG_PATH, updatedAt: payload.updatedAt };
}

export function getPersistedConfigPath(): string {
  return CONFIG_PATH;
}
