import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { Router } from 'express';
import { config } from '../config.js';

const DEFAULT_BEDROCK_MODEL_ID = 'meta.llama3-70b-instruct-v1:0';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

let bedrockClient: BedrockRuntimeClient | null = null;

function getBedrockClient(): BedrockRuntimeClient {
  if (!bedrockClient) {
    const region = config.aws.region ?? 'us-east-1';
    bedrockClient = new BedrockRuntimeClient({ region });
  }
  return bedrockClient;
}

function getBedrockModelId(): string {
  return (process.env.BEDROCK_MODEL_ID || DEFAULT_BEDROCK_MODEL_ID).trim();
}

/** Meta Llama 3 on Bedrock expects instruction-tagged prompts for best results. */
function wrapLlama3Prompt(userPrompt: string): string {
  return `<|begin_of_text|><|start_header_id|>user<|end_header_id|>\n\n${userPrompt}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n`;
}

/** OpenAI or any OpenAI-compatible API (set OPENAI_BASE_URL for proxies). */
async function callOpenAI(prompt: string, opts?: { temperature?: number; maxTokens?: number }): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = (process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL).trim();

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: opts?.temperature ?? 0.7,
      max_tokens: opts?.maxTokens ?? 1000,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI HTTP ${res.status}: ${errText.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content;
  if (typeof text === 'string' && text.trim().length > 0) {
    return text;
  }

  throw new Error('OpenAI returned empty content');
}

async function callBedrock(prompt: string, opts?: { temperature?: number; maxTokens?: number }): Promise<string> {
  const modelId = getBedrockModelId();
  const maxGenLen = opts?.maxTokens ?? 1000;
  const temperature = opts?.temperature ?? 0.7;
  const topP = 0.9;

  const body = JSON.stringify({
    prompt: wrapLlama3Prompt(prompt),
    max_gen_len: maxGenLen,
    temperature,
    top_p: topP,
  });

  const client = getBedrockClient();
  const out = await client.send(
    new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: Buffer.from(body, 'utf-8'),
    }),
  );

  if (!out.body) {
    throw new Error('Bedrock returned empty body');
  }

  const raw = Buffer.from(out.body).toString('utf-8');
  const data = JSON.parse(raw) as { generation?: string; outputText?: string };

  const text = data.generation ?? data.outputText;
  if (typeof text === 'string' && text.trim().length > 0) {
    return text;
  }

  return raw;
}

/** Prefer OpenAI when OPENAI_API_KEY is set; otherwise AWS Bedrock. */
async function callAI(prompt: string, opts?: { temperature?: number; maxTokens?: number }): Promise<string> {
  if (process.env.OPENAI_API_KEY?.trim()) {
    return callOpenAI(prompt, opts);
  }
  return callBedrock(prompt, opts);
}

export const aiRouter = Router();

/** Extract JSON from a response that may contain markdown fences or conversational text */
function extractJSON(text: string): any {
  try { return JSON.parse(text); } catch {}
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) try { return JSON.parse(fenced[1].trim()); } catch {}
  const braceMatch = text.match(/(\{[\s\S]*\})/);
  if (braceMatch) try { return JSON.parse(braceMatch[1]); } catch {}
  const bracketMatch = text.match(/(\[[\s\S]*\])/);
  if (bracketMatch) try { return JSON.parse(bracketMatch[1]); } catch {}
  throw new Error('Could not extract JSON from response');
}

// ────────────────── Poll Generate ──────────────────

aiRouter.post('/poll-generate', async (req, res) => {
  const { context, currentTopic, transcript } = req.body;
  const lecture =
    typeof transcript === 'string' && transcript.trim().length > 0
      ? `Recent lecture transcript (professor):\n"${transcript.slice(0, 1800)}"`
      : '';

  try {
    const prompt = `You are an AI assistant for a live classroom engagement tool. Generate a single multiple-choice check-in poll question that a professor can ask students during a lecture.

${currentTopic ? `The lecture is currently covering: "${currentTopic}"` : 'The professor has not specified the current topic.'}
${context ? `The professor adds this context: "${context}"` : ''}
${lecture}

Your job is to create a question that helps the professor gauge how well students are following the material. The question should be directly relevant to whatever subject is being taught.
${lecture ? 'Base the question primarily on what was just said in the transcript when possible.' : ''}

Respond with ONLY a JSON object — no markdown, no explanation:
{"question": "...", "options": ["option1", "option2", "option3", "option4"]}

Requirements:
- Exactly 4 answer options
- Each option under 10 words
- If a topic is provided, make the question specific to that topic
- If no topic is given, ask a general engagement/comprehension question
- The question must work for any academic subject`;

    const content = await callAI(prompt, { temperature: 0.7, maxTokens: 300 });
    const parsed = extractJSON(content);
    if (!parsed.question || !Array.isArray(parsed.options) || parsed.options.length < 2) {
      throw new Error('Invalid poll format from AI');
    }

    res.json({ question: parsed.question, options: parsed.options });
  } catch (err) {
    console.error('[ai] poll-generate error:', err);
    res.status(500).json({ error: 'Failed to generate poll. Please try again.' });
  }
});

// ────────────────── Topic Segment ──────────────────

aiRouter.post('/topic-segment', async (req, res) => {
  const { transcript, previousTopic } = req.body;

  if (!transcript || typeof transcript !== 'string' || transcript.trim().length < 20) {
    return res.json({ topicChanged: false, topic: null, glossaryTerms: [] });
  }

  try {
    const prompt = `You are an AI assistant that analyzes live lecture transcripts in real time. Your job is to identify the current topic being discussed and extract key terms for a student-facing sidebar.

${previousTopic ? `The previous topic was: "${previousTopic}"` : 'This is the beginning of the lecture.'}

Here is the most recent transcript excerpt:
"${transcript.slice(0, 2000)}"

Analyze this and respond with ONLY a JSON object — no markdown, no explanation:
{
  "topicChanged": true or false,
  "topic": {
    "title": "Concise topic title (3-6 words)",
    "bullets": ["Key takeaway 1", "Key takeaway 2", "Key takeaway 3"]
  },
  "glossaryTerms": [
    {"term": "Term", "definition": "Brief definition", "formula": "formula if applicable, otherwise null"}
  ]
}

Guidelines:
- Set topicChanged to true only if the lecturer clearly shifted to a new subject or sub-topic
- Even when topicChanged is false, update the bullets to reflect the latest content
- Include 2-4 concise bullet points summarizing the current discussion
- Extract 0-3 technical terms, definitions, or formulas that were mentioned
- The formula field is optional — include only for STEM subjects where applicable
- Keep all text concise — this is rendered in a narrow sidebar panel
- This must work for ANY academic subject (science, history, literature, business, etc.)`;

    const content = await callAI(prompt, { temperature: 0.3, maxTokens: 600 });
    const parsed = extractJSON(content);
    if (typeof parsed.topicChanged !== 'boolean' || !parsed.topic?.title) {
      throw new Error('Invalid topic-segment format from AI');
    }

    res.json({
      topicChanged: parsed.topicChanged,
      topic: {
        title: parsed.topic.title,
        bullets: Array.isArray(parsed.topic.bullets) ? parsed.topic.bullets : [],
      },
      glossaryTerms: Array.isArray(parsed.glossaryTerms) ? parsed.glossaryTerms : [],
    });
  } catch (err) {
    console.error('[ai] topic-segment error:', err);
    const words = transcript.split(/\s+/);
    const title = previousTopic || 'Lecture in Progress';
    res.json({
      topicChanged: false,
      topic: { title, bullets: [`Discussing: ${words.slice(0, 8).join(' ')}…`] },
      glossaryTerms: [],
      fallback: true,
    });
  }
});

// ────────────────── Quiz Generate ──────────────────

aiRouter.post('/quiz-generate', async (req, res) => {
  const { transcript, topic, questionCount } = req.body;
  const count = Math.min(questionCount ?? 5, 10);

  try {
    const hasContext = topic || transcript;

    const prompt = `You are an AI quiz generator for a classroom trivia game. Generate ${count} multiple-choice questions that test student understanding of the lecture material.

${topic ? `Subject / Topic: "${topic}"` : ''}
${transcript ? `Based on this lecture transcript:\n"${transcript.slice(0, 1500)}"` : ''}
${!hasContext ? 'The professor did not specify a topic. Generate general academic trivia questions spanning different subjects (science, history, literature, geography, etc.).' : ''}

Respond with ONLY a JSON object — no markdown, no explanation:
{"questions": [{"question": "...", "options": ["A", "B", "C", "D"], "correctIndex": 0, "explanation": "..."}]}

Requirements:
- Exactly 4 options per question
- correctIndex is 0-based (0, 1, 2, or 3)
- Questions should test understanding, not just rote memorization
- Explanations should be 1-2 sentences
- Progress from easier to harder questions
- Questions must be relevant to the provided topic/transcript
- If no topic is given, create diverse general-knowledge questions`;

    const content = await callAI(prompt, { temperature: 0.7, maxTokens: 1500 });
    const parsed = extractJSON(content);
    if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      throw new Error('Invalid quiz format from AI');
    }

    res.json({ questions: parsed.questions });
  } catch (err) {
    console.error('[ai] quiz-generate error:', err);
    res.status(500).json({ error: 'Failed to generate quiz. Please try again.' });
  }
});

// ────────────────── Recovery Pack ──────────────────

aiRouter.post('/recovery-pack', async (req, res) => {
  const { bookmarks, topics, transcript } = req.body;

  if (!Array.isArray(bookmarks) || bookmarks.length === 0) {
    res.json({ items: [], message: 'No bookmarks to generate recovery pack from.' });
    return;
  }

  try {
    const bookmarkSummary = bookmarks
      .map((b: { topic: string; timestamp: number }, i: number) =>
        `${i + 1}. "${b.topic}" (bookmarked at ${new Date(b.timestamp).toLocaleTimeString()})`)
      .join('\n');

    const topicSummary = Array.isArray(topics)
      ? topics.map((t: { title: string; bullets: string[] }) => `- ${t.title}: ${t.bullets.join('; ')}`).join('\n')
      : '';

    const prompt = `You are a study-aid AI. A student marked certain moments during a lecture as confusing. Create a personalized recovery pack that re-explains each confusing moment clearly.

Moments the student bookmarked:
${bookmarkSummary}

${topicSummary ? `Topics covered in the lecture:\n${topicSummary}` : ''}
${transcript ? `Relevant transcript excerpt:\n"${transcript.slice(0, 1000)}"` : ''}

Respond with ONLY a JSON object — no markdown, no explanation:
{"items": [{"topic": "...", "explanation": "2-3 sentence plain-language explanation", "practice": "A practice question or exercise", "resource": "Suggested resource (textbook chapter, video, or website)"}]}

Requirements:
- One item per bookmarked moment
- Explanations must be clear and beginner-friendly — assume the student was lost
- Practice questions should be answerable without external tools
- Resources should be well-known and relevant (e.g., Khan Academy, Crash Course, relevant textbooks)
- This must work for ANY academic subject — do not assume math/science`;

    const content = await callAI(prompt, { temperature: 0.7, maxTokens: 1500 });
    const parsed = extractJSON(content);
    if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
      throw new Error('Invalid recovery pack format');
    }

    res.json({ items: parsed.items });
  } catch (err) {
    console.error('[ai] recovery-pack error:', err);
    res.status(500).json({ error: 'Failed to generate recovery pack. Please try again.' });
  }
});

// ────────────────── Detect Cues ──────────────────

aiRouter.post('/detect-cues', async (req, res) => {
  const { transcript } = req.body;

  if (!transcript || typeof transcript !== 'string' || transcript.trim().length < 20) {
    return res.json({ hasCue: false, cues: [] });
  }

  try {
    const prompt = `Analyze this lecture transcript excerpt and detect if the professor is signaling that something is important for students to remember.

Transcript:
"${transcript.slice(0, 500)}"

Respond with ONLY a JSON object:
{"hasCue": true/false, "cues": [{"phrase": "what the professor said", "reason": "why this is important"}]}

Look for signals like: "this is important", "remember this", "this will be on the exam", "pay attention to this", "key concept", "make sure you understand", emphasis through repetition, etc.`;

    const content = await callAI(prompt, { temperature: 0.2, maxTokens: 300 });
    const parsed = extractJSON(content);
    res.json({ hasCue: !!parsed.hasCue, cues: Array.isArray(parsed.cues) ? parsed.cues : [] });
  } catch (err) {
    console.error('[ai] detect-cues error:', err);
    res.json({ hasCue: false, cues: [] });
  }
});
