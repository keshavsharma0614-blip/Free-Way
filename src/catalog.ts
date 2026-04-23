import { getAllSyncMetas, providers } from './providers/index.js';
import { getHealthSummary, getProviderHealth, type HealthSummary, type ProviderHealth } from './health.js';
import { listCanonicalModels } from './models/registry.js';

export interface ProviderSummary {
  name: string;
  baseURL: string;
  apiKeyEnvVar: string;
  available: boolean;
  modelCount: number;
  health: ProviderHealth;
  website?: string;
}

export interface ModelSummary {
  id: string;
  providers: { name: string; providerModelId: string }[];
  context?: number;
  maxOutput?: number;
  modality?: string;
}

export interface CatalogSummary {
  providers: ProviderSummary[];
  models: ModelSummary[];
  healthSummary: HealthSummary;
  syncMetas: Record<string, { updatedAt: number; source: string }>;
}

export function listProviderSummaries(): ProviderSummary[] {
  return providers.map(provider => ({
    name: provider.name,
    baseURL: provider.baseURL,
    apiKeyEnvVar: provider.apiKeyEnvVar,
    available: provider.isAvailable,
    modelCount: provider.models.length,
    health: getProviderHealth(provider.name, provider.isAvailable),
    website: provider.website,
  }));
}

export function listProviderEnvVars(): string[] {
  return [...new Set(providers.map(provider => provider.apiKeyEnvVar))];
}

export function listModelSummaries(): ModelSummary[] {
  return listCanonicalModels();
}

export function buildCatalogSummary(): CatalogSummary {
  const syncMetas = getAllSyncMetas();
  return {
    providers: listProviderSummaries(),
    models: listModelSummaries(),
    healthSummary: getHealthSummary(),
    syncMetas: Object.fromEntries(syncMetas),
  };
}
