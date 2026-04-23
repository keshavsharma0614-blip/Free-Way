import type { BaseProvider } from './providers/base.js';
import type { ChatCompletionRequest } from './types.js';
import { findProvidersForModel } from './providers/index.js';

export interface RouterOptions {
  strategy?: 'round-robin' | 'random' | 'priority';
  maxRetries?: number;
}

let roundRobinIndex = 0;

function selectProvider(providers: BaseProvider[], strategy: string): BaseProvider {
  if (providers.length === 1) return providers[0];

  switch (strategy) {
    case 'random':
      return providers[Math.floor(Math.random() * providers.length)];
    case 'round-robin':
      roundRobinIndex = (roundRobinIndex + 1) % providers.length;
      return providers[roundRobinIndex];
    case 'priority':
    default:
      // Default: keep original registration order as priority
      return providers[0];
  }
}

export async function routeChatCompletion(
  request: ChatCompletionRequest,
  options: RouterOptions = {}
): Promise<{ response: Response; provider: BaseProvider }> {
  const { strategy = 'priority', maxRetries = 3 } = options;
  const modelId = request.model;

  const candidates = findProvidersForModel(modelId);
  if (candidates.length === 0) {
    throw new Error(`Model "${modelId}" not found or no available provider. Check that the corresponding API key is set.`);
  }

  const errors: string[] = [];
  const tried = new Set<string>();

  for (let attempt = 0; attempt < Math.min(maxRetries, candidates.length); attempt++) {
    const remaining = candidates.filter(p => !tried.has(p.name));
    if (remaining.length === 0) break;

    const provider = selectProvider(remaining, strategy);
    tried.add(provider.name);

    try {
      const response = await provider.chatCompletion(request);

      if (response.ok) {
        return { response, provider };
      }

      const body = await response.text().catch(() => '');
      errors.push(`${provider.name}: HTTP ${response.status} ${body.slice(0, 200)}`);
    } catch (err) {
      errors.push(`${provider.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw new Error(`All providers failed for model "${modelId}":\n${errors.join('\n')}`);
}
