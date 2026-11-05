import { AIProvider, AIStructuredArgs, AIStructuredResponse } from "../types";
import { AI_CONFIG } from "@/lib/config/ai";

export interface RealAdapterOptions {
  id?: string;
  provider: "gemini" | "openai" | "mock";
  model: string;
  apiKey: string;
  baseUrl?: string;
}

export class RealAIProvider implements AIProvider {
  readonly id: string;
  private readonly providerType: "gemini" | "openai" | "mock";
  private readonly modelName: string;
  private readonly apiKey: string;
  private readonly baseUrl?: string;

  constructor(options: RealAdapterOptions) {
    this.id = options.id || `${options.provider}-adapter`;
    this.providerType = options.provider;
    this.modelName = options.model;
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl;
  }

  async generateStructured<T>(args: AIStructuredArgs): Promise<AIStructuredResponse<T>> {
    if (this.providerType === "gemini") {
      return this.callGemini<T>(args);
    } else if (this.providerType === "openai") {
      return this.callOpenAI<T>(args);
    }
    throw new Error(`Unsupported real provider type: ${this.providerType}`);
  }

  private async callGemini<T>(args: AIStructuredArgs): Promise<AIStructuredResponse<T>> {
    const modelsToTry = [this.modelName];
    if (AI_CONFIG.GEMINI_FALLBACK_MODEL && this.modelName !== AI_CONFIG.GEMINI_FALLBACK_MODEL) {
      modelsToTry.push(AI_CONFIG.GEMINI_FALLBACK_MODEL);
    }

    const promptText = `${args.system}\n\nTask: ${args.task}\n\nUser Context:\n${args.user}\n\nRespond ONLY with valid JSON conforming to the requested schema.`;

    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [{ text: promptText }],
        },
      ],
      generationConfig: {
        temperature: args.temperature,
        maxOutputTokens: args.maxOutputTokens,
        responseMimeType: "application/json",
      },
    };

    let lastError: Error | null = null;
    for (const model of modelsToTry) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        if (res.status === 429) {
          const err = new Error(`Gemini rate limit exceeded (HTTP 429) for model ${model}`);
          (err as unknown as { status: number; isRateLimit: boolean }).status = 429;
          (err as unknown as { status: number; isRateLimit: boolean }).isRateLimit = true;
          lastError = err;
          continue;
        }

        if (res.status === 503 || res.status === 502 || res.status === 500) {
          const errText = await res.text();
          const err = new Error(`Gemini provider temporary error (HTTP ${res.status}) on ${model}: ${errText}`);
          (err as unknown as { status: number; isRetryable: boolean }).status = res.status;
          (err as unknown as { status: number; isRetryable: boolean }).isRetryable = true;
          lastError = err;
          continue;
        }

        if (!res.ok) {
          const errText = await res.text();
          const err = new Error(`Gemini provider error (HTTP ${res.status}): ${errText}`);
          (err as unknown as { status: number }).status = res.status;
          lastError = err;
          continue;
        }

        const json = await res.json();
        const candidateText =
          json.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

        let parsedData: T;
        try {
          parsedData = JSON.parse(candidateText) as T;
        } catch {
          throw new Error(`Gemini returned unparseable JSON: ${candidateText.slice(0, 200)}`);
        }

        const inputTokens = json.usageMetadata?.promptTokenCount || Math.floor(promptText.length / 4);
        const outputTokens = json.usageMetadata?.candidatesTokenCount || Math.floor(candidateText.length / 4);

        return {
          data: parsedData,
          usage: {
            inputTokens,
            outputTokens,
          },
          modelVersion: model,
        };
      } catch (err: any) {
        lastError = err;
      }
    }

    throw lastError || new Error("Gemini generation failed across all attempted models");
  }

  private async callOpenAI<T>(args: AIStructuredArgs): Promise<AIStructuredResponse<T>> {
    const endpoint = this.baseUrl
      ? `${this.baseUrl}/chat/completions`
      : "https://api.openai.com/v1/chat/completions";

    const messages = [
      { role: "system", content: `${args.system}\nRespond ONLY with valid JSON conforming to the requested schema.` },
      { role: "user", content: args.user },
    ];

    const requestBody = {
      model: this.modelName,
      messages,
      temperature: args.temperature,
      max_tokens: args.maxOutputTokens,
      response_format: { type: "json_object" },
    };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (res.status === 429) {
      const err = new Error(`OpenAI rate limit exceeded (HTTP 429) for model ${this.modelName}`);
      (err as unknown as { status: number; isRateLimit: boolean }).status = 429;
      (err as unknown as { status: number; isRateLimit: boolean }).isRateLimit = true;
      throw err;
    }

    if (!res.ok) {
      const errText = await res.text();
      const err = new Error(`OpenAI provider error (HTTP ${res.status}): ${errText}`);
      (err as unknown as { status: number }).status = res.status;
      throw err;
    }

    const json = await res.json();
    const messageContent = json.choices?.[0]?.message?.content || "{}";

    let parsedData: T;
    try {
      parsedData = JSON.parse(messageContent) as T;
    } catch {
      throw new Error(`OpenAI returned unparseable JSON: ${messageContent.slice(0, 200)}`);
    }

    const inputTokens = json.usage?.prompt_tokens || 0;
    const outputTokens = json.usage?.completion_tokens || 0;

    return {
      data: parsedData,
      usage: {
        inputTokens,
        outputTokens,
      },
      modelVersion: this.modelName,
    };
  }
}
