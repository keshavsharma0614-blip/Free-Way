import { providers } from '../providers/index.js';

export interface CanonicalModelInfo {
  id: string;
  modality?: string;
  context?: number;
  maxOutput?: number;
  providers: { name: string; providerModelId: string }[];
}

export function listCanonicalModels(): CanonicalModelInfo[] {
  const map = new Map<string, CanonicalModelInfo>();

  for (const provider of providers) {
    for (const model of provider.models) {
      const existing = map.get(model.id);
      if (existing) {
        existing.providers.push({
          name: provider.name,
          providerModelId: model.providerModelId,
        });
        if (model.context !== undefined) {
          existing.context = Math.max(existing.context ?? 0, model.context) || undefined;
        }
        if (model.maxOutput !== undefined) {
          existing.maxOutput = Math.max(existing.maxOutput ?? 0, model.maxOutput) || undefined;
        }
      } else {
        map.set(model.id, {
          id: model.id,
          modality: model.modality,
          context: model.context,
          maxOutput: model.maxOutput,
          providers: [{ name: provider.name, providerModelId: model.providerModelId }],
        });
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => a.id.localeCompare(b.id));
}

export function getCanonicalModelById(id: string): CanonicalModelInfo | undefined {
  return listCanonicalModels().find(m => m.id === id);
}
