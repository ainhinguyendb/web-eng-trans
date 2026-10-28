import OpenAI from "openai";

/**
 * Azure OpenAI client via the v1 API surface.
 * The Foundry resource exposes an OpenAI-compatible endpoint at
 *   https://<resource>.openai.azure.com/openai/v1/
 * which accepts the standard OpenAI SDK with the resource key.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}. See .env.example.`);
  }
  return value;
}

let cached: OpenAI | null = null;

export function getAzureOpenAI(): OpenAI {
  if (cached) return cached;
  const endpoint = required("AZURE_OPENAI_ENDPOINT").replace(/\/+$/, "");
  const apiKey = required("AZURE_OPENAI_API_KEY");
  cached = new OpenAI({
    baseURL: `${endpoint}/openai/v1/`,
    apiKey,
    defaultHeaders: { "api-key": apiKey },
  });
  return cached;
}

export function getDeploymentName(): string {
  return process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt-5.4-mini";
}
