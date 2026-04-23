import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import type { ProviderModel } from '../types.js';

const CACHE_PATH = path.resolve(process.cwd(), '.freeway', 'github-models.json');

interface GitHubModel {
  id: string;
  name: string;
  friendly_name?: string;
  task?: string;
  model_family?: string;
}

interface CacheEntry {
  updatedAt: number;
  models: ProviderModel[];
}

const MODALITY_MAP: Record<string, string> = {
  'chat-completion': 'Text',
  'embeddings': 'Embeddings',
  'image-generation': 'Text → Image',
};

export async function fetchGitHubModels(token: string): Promise<ProviderModel[]> {
  const response = await fetch('https://models.inference.ai.azure.com/models', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub Models fetch failed: ${response.status}`);
  }

  const data = (await response.json()) as GitHubModel[];

  const chatModels = data.filter((m) => m.task === 'chat-completion');

  const models: ProviderModel[] = chatModels.map((m) => ({
    id: m.name,
    providerModelId: m.name,
    modality: MODALITY_MAP[m.task || ''] || 'Text',
  }));

  return models;
}

export async function saveGitHubCache(models: ProviderModel[]): Promise<void> {
  await mkdir(path.dirname(CACHE_PATH), { recursive: true });
  const entry: CacheEntry = { updatedAt: Date.now(), models };
  await writeFile(CACHE_PATH, JSON.stringify(entry, null, 2));
}

export async function loadGitHubCache(): Promise<{ models: ProviderModel[]; updatedAt: number } | null> {
  try {
    const raw = await readFile(CACHE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as CacheEntry;
    return { models: parsed.models, updatedAt: parsed.updatedAt };
  } catch {
    return null;
  }
}

export function mergeGitHubWithAllowlist(
  fetched: ProviderModel[],
  allowlist: ProviderModel[]
): ProviderModel[] {
  const fetchedMap = new Map(fetched.map((m) => [m.providerModelId, m]));
  const result: ProviderModel[] = [];

  for (const allowed of allowlist) {
    const found = fetchedMap.get(allowed.providerModelId);
    if (found) {
      result.push({
        ...allowed,
        providerModelId: found.providerModelId,
      });
    }
  }

  return result;
}
