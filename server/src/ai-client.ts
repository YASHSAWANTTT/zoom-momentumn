import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { config } from './config.js';

const bedrock = new BedrockRuntimeClient({ region: config.aws.region });
const BEDROCK_MODEL = 'meta.llama3-70b-instruct-v1:0';

function openaiChatCompletionsUrl(): string {
  const base = config.openai.baseUrl.replace(/\/$/, '');
  return `${base}/chat/completions`;
}

export interface AIOptions {
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

async function callCreateAI(prompt: string, model: string, opts?: AIOptions): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts?.timeout ?? 10000);

  try {
    const resp = await fetch(config.createAI.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.createAI.token}`,
      },
      body: JSON.stringify({ query: prompt, model }),
      signal: controller.signal,
    });

    const data = await resp.json() as { response?: string };
    if (!data.response) throw new Error(`Empty response from CREATE AI (${model})`);
    console.log(`[ai] Served by CREATE AI (${model})`);
    return data.response;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callOpenAI(prompt: string, opts?: AIOptions): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts?.timeout ?? 60000);

  try {
    const resp = await fetch(openaiChatCompletionsUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openai.apiKey}`,
      },
      body: JSON.stringify({
        model: config.openai.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: opts?.maxTokens ?? 1000,
        temperature: opts?.temperature ?? 0.7,
      }),
      signal: controller.signal,
    });

    const raw = await resp.text();
    if (!resp.ok) {
      throw new Error(`OpenAI HTTP ${resp.status}: ${raw.slice(0, 500)}`);
    }
    const data = JSON.parse(raw) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content;
    if (!text?.trim()) throw new Error('Empty response from OpenAI');
    console.log(`[ai] Served by OpenAI (${config.openai.model})`);
    return text;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callBedrock(prompt: string, opts?: AIOptions): Promise<string> {
  const resp = await bedrock.send(new ConverseCommand({
    modelId: BEDROCK_MODEL,
    messages: [{ role: 'user', content: [{ text: prompt }] }],
    inferenceConfig: {
      maxTokens: opts?.maxTokens ?? 1000,
      temperature: opts?.temperature ?? 0.7,
    },
  }));
  console.log('[ai] Served by Bedrock (Llama 3 70B)');
  return resp.output?.message?.content?.[0]?.text ?? '';
}

export async function callAI(prompt: string, opts?: AIOptions): Promise<string> {
  const hasCreateAI = config.createAI.apiUrl && config.createAI.token;
  const hasOpenAI = Boolean(config.openai.apiKey);

  if (hasOpenAI) {
    try {
      return await callOpenAI(prompt, opts);
    } catch (err: any) {
      console.warn('[ai] OpenAI failed:', err.message);
    }
  }

  if (hasCreateAI) {
    try {
      return await callCreateAI(prompt, config.createAI.primaryModel, opts);
    } catch (err: any) {
      console.warn(`[ai] ${config.createAI.primaryModel} failed:`, err.message);
    }

    try {
      return await callCreateAI(prompt, config.createAI.backupModel, opts);
    } catch (err: any) {
      console.warn(`[ai] ${config.createAI.backupModel} failed:`, err.message);
    }
  }

  return await callBedrock(prompt, opts);
}
