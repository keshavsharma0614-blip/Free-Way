export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  [key: string]: unknown;
}

export interface ModelInfo {
  id: string;
  object: 'model';
  owned_by: string;
}

export interface ProviderModel {
  id: string;
  providerModelId: string;
  context?: number;
  maxOutput?: number;
  modality?: string;
}
