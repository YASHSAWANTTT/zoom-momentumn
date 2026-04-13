/**
 * Mock Transcript Service
 *
 * Fetches a real CS50 lecture transcript (SRT) from Harvard's CDN
 * and POSTs chunks to the backend at regular intervals. Used for
 * local development so Live Anchor, Glossary, Auto-Bookmarks, and
 * Recovery Agent can be tested with realistic lecture content.
 *
 * Usage: npm run dev -w mock-transcript
 */

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3001';
const MEETING_ID = process.env.MOCK_MEETING_ID ?? 'mock-meeting-001';
const INTERVAL_MS = 3000;
const SRT_URL = 'https://cdn.cs50.net/2023/fall/lectures/0/lang/en/lecture0.srt';

interface Chunk {
  speaker: string;
  text: string;
}

function parseSRT(srt: string): Chunk[] {
  const lines = srt.split('\n');
  const rawTexts: string[] = [];
  let current: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    // Skip sequence numbers, timestamps, empty lines
    if (!line || /^\d+$/.test(line) || /^\d{2}:\d{2}/.test(line)) {
      if (current.length) {
        const text = current.join(' ');
        // Skip pure sound effects like [MUSIC PLAYING]
        if (!/^\[.*\]$/.test(text)) {
          const cleaned = text.replace(/\[.*?\]\s*/g, '').trim();
          if (cleaned.length > 5) rawTexts.push(cleaned);
        }
        current = [];
      }
      continue;
    }
    current.push(line);
  }
  if (current.length) {
    const text = current.join(' ').replace(/\[.*?\]\s*/g, '').trim();
    if (text.length > 5) rawTexts.push(text);
  }

  // Merge into ~2-3 sentence chunks
  const merged: string[] = [];
  let buf = '';
  for (const t of rawTexts) {
    buf = buf ? `${buf} ${t}` : t;
    if (buf.length > 150) {
      merged.push(buf);
      buf = '';
    }
  }
  if (buf) merged.push(buf);

  // Skip intro music — find where Malan starts the actual lecture
  let start = 0;
  for (let i = 0; i < merged.length; i++) {
    if (/my name is david/i.test(merged[i])) { start = i; break; }
    if (/welcome/i.test(merged[i]) && i > 5) { start = i; break; }
  }

  return merged.slice(start).map((text) => ({
    speaker: 'Professor Malan',
    text,
  }));
}

let seqNo = 0;

async function emitChunk(chunk: Chunk) {
  seqNo++;
  try {
    const res = await fetch(`${BACKEND_URL}/api/transcript/segment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meetingId: MEETING_ID,
        speaker: chunk.speaker,
        text: chunk.text,
        timestamp: Date.now(),
        seqNo,
      }),
    });

    if (res.ok) {
      console.log(`[mock] #${seqNo} → "${chunk.text.slice(0, 60)}..."`);
    } else {
      console.error(`[mock] #${seqNo} failed: ${res.status}`);
    }
  } catch (err) {
    console.error(`[mock] #${seqNo} error:`, err);
  }
}

async function run() {
  console.log(`[mock-transcript] Fetching CS50 lecture transcript from ${SRT_URL}...`);

  let chunks: Chunk[];
  try {
    const res = await fetch(SRT_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const srt = await res.text();
    chunks = parseSRT(srt);
    console.log(`[mock-transcript] Parsed ${chunks.length} chunks from SRT`);
  } catch (err) {
    console.error('[mock-transcript] Failed to fetch SRT, using fallback:', err);
    chunks = [
      { speaker: 'Professor Malan', text: "This is CS50, Harvard University's introduction to the intellectual enterprises of computer science and the art of programming." },
      { speaker: 'Professor Malan', text: "My name is David Malan. And I actually took this class, CS50, myself back in 1996 as a sophomore." },
      { speaker: 'Professor Malan', text: "What ultimately matters in this course is not so much where you end up relative to your classmates, but where you end up relative to yourself when you began." },
    ];
  }

  console.log(`[mock-transcript] Starting — posting to ${BACKEND_URL}`);
  console.log(`[mock-transcript] Meeting ID: ${MEETING_ID}`);
  console.log(`[mock-transcript] ${chunks.length} chunks, ${INTERVAL_MS}ms interval\n`);

  for (const chunk of chunks) {
    await emitChunk(chunk);
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
  }

  console.log('\n[mock-transcript] All chunks emitted. Restarting in 10s...');
  setTimeout(run, 10_000);
}

run();
