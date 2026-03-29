/**
 * Mock Transcript Service
 *
 * Simulates RTMS transcript output by POSTing transcript chunks
 * to the backend at regular intervals. Used for local development
 * so Live Anchor, Glossary, Auto-Bookmarks, and Recovery Agent
 * can be built without a live Zoom meeting.
 *
 * Usage: npm run dev -w mock-transcript
 */

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3001';
const MEETING_ID = process.env.MOCK_MEETING_ID ?? 'mock-meeting-001';
const INTERVAL_MS = 3000; // Emit one chunk every 3 seconds

// Sample lecture transcript (math lecture on derivatives)
const TRANSCRIPT_CHUNKS = [
  { speaker: 'Professor', text: "Alright everyone, let's get started. Today we're going to talk about derivatives." },
  { speaker: 'Professor', text: 'A derivative measures how a function changes as its input changes.' },
  { speaker: 'Professor', text: "Think of it as the slope of the tangent line at any point on a curve." },
  { speaker: 'Professor', text: "The formal definition uses limits. We write f prime of x equals the limit as h approaches zero of f of x plus h minus f of x, all divided by h." },
  { speaker: 'Professor', text: "Let's start with a simple example. If f of x equals x squared, what's the derivative?" },
  { speaker: 'Professor', text: "Using the power rule, we bring down the exponent and subtract one. So f prime of x equals 2x." },
  { speaker: 'Professor', text: "The power rule is one of the most important rules you'll learn. For any function x to the n, the derivative is n times x to the n minus 1." },
  { speaker: 'Professor', text: "Now let's move on to a new topic — the chain rule." },
  { speaker: 'Professor', text: "The chain rule is used when you have a composition of functions, like f of g of x." },
  { speaker: 'Professor', text: "The chain rule says: the derivative of f of g of x equals f prime of g of x times g prime of x." },
  { speaker: 'Professor', text: "This is really important for the exam, make sure you understand this concept." },
  { speaker: 'Professor', text: "Let me give you an example. If h of x equals the square root of 3x plus 1..." },
  { speaker: 'Professor', text: "We can rewrite this as 3x plus 1 to the power of one half." },
  { speaker: 'Professor', text: "The outer function is u to the one half, and the inner function is 3x plus 1." },
  { speaker: 'Professor', text: "Applying the chain rule: one half times 3x plus 1 to the negative one half, times 3." },
  { speaker: 'Professor', text: "Which simplifies to 3 over 2 times the square root of 3x plus 1." },
];

let seqNo = 0;

async function emitChunk(chunk: (typeof TRANSCRIPT_CHUNKS)[number]) {
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
  console.log(`[mock-transcript] Starting — posting to ${BACKEND_URL}`);
  console.log(`[mock-transcript] Meeting ID: ${MEETING_ID}`);
  console.log(`[mock-transcript] ${TRANSCRIPT_CHUNKS.length} chunks, ${INTERVAL_MS}ms interval\n`);

  for (const chunk of TRANSCRIPT_CHUNKS) {
    await emitChunk(chunk);
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
  }

  console.log('\n[mock-transcript] All chunks emitted. Restarting in 5s...');
  setTimeout(run, 5000);
}

run();
