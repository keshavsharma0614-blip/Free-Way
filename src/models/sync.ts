import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import type { ProviderModel } from '../types.js';

const CACHE_DIR = path.resolve(process.cwd(), '.freeway', 'models');

interface OpenAIModelEntry {
  id: string;
  object: string;
  created?: number;
  owned_by?: string;
}

interface OpenAIModelsResponse {
  data: OpenAIModelEntry[];
  object: string;
}

interface ProviderModelCache {
  updatedAt: number;
  models: ProviderModel[];
}

export async function fetchOpenAIModels(baseURL: string, apiKey: string): Promise<OpenAIModelEntry[]> {
  const response = await fetch(`${baseURL}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Models fetch failed: ${response.status}`);
  }

  const payload = (await response.json()) as OpenAIModelsResponse;
  return payload.data ?? [];
}

export function mergeWithAllowlist(
  fetched: OpenAIModelEntry[],
  allowlist: ProviderModel[]
): ProviderModel[] {
  const fetchedMap = new Map(fetched.map((m) => [m.id, m]));
  const result: ProviderModel[] = [];

  for (const allowed of allowlist) {
    const found = fetchedMap.get(allowed.providerModelId);
    if (found) {
      result.push({
        ...allowed,
        providerModelId: found.id,
      });
    }
  }

  return result;
}

export async function saveProviderModelCache(providerName: string, models: ProviderModel[]): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  const entry: ProviderModelCache = { updatedAt: Date.now(), models };
  await writeFile(path.join(CACHE_DIR, `${providerName}.json`), JSON.stringify(entry, null, 2));
}

export async function loadProviderModelCache(providerName: string): Promise<{ models: ProviderModel[]; updatedAt: number } | null> {
  try {
    const raw = await readFile(path.join(CACHE_DIR, `${providerName}.json`), 'utf-8');
    const parsed = JSON.parse(raw) as ProviderModelCache;
    return { models: parsed.models, updatedAt: parsed.updatedAt };
  } catch {
    return null;
  }
}
