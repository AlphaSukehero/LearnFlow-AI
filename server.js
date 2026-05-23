require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');
const cache = require('./cache');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Gemini AI Client (Dual-Key Rotation) ────────────────────────────
const API_KEYS = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY, // legacy fallback
].filter(Boolean);

if (API_KEYS.length === 0) {
  console.error('⚠ No GEMINI_API_KEY set in .env — AI features will not work.');
}
let currentKeyIndex = 0;
function getAI() {
  const key = API_KEYS[currentKeyIndex % API_KEYS.length];
  return new GoogleGenAI({ apiKey: key });
}
function rotateKey() {
  if (API_KEYS.length > 1) {
    currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
    console.log(`[key-rotate] Switched to API key #${currentKeyIndex + 1}`);
  }
}
const MODEL = 'gemini-2.5-flash';

// ─── Utility: Call Gemini (with retry for rate limits) ───────────────
async function callGemini(prompt, jsonMode = false, retries = 4) {
  const config = {};
  if (jsonMode) {
    config.responseMimeType = 'application/json';
  }

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const ai = getAI();
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config
      });
      return response.text;
    } catch (err) {
      const isRateLimit = err?.status === 429 ||
        (err?.message && err.message.includes('429')) ||
        (err?.message && err.message.includes('RESOURCE_EXHAUSTED')) ||
        (err?.message && err.message.includes('quota'));

      if (isRateLimit) {
        rotateKey(); // switch to next API key
        if (attempt < retries - 1) {
          const waitSec = Math.pow(2, attempt + 1) * 2;
          console.warn(`[callGemini] Attempt ${attempt+1} rate-limited, rotating key & retrying in ${waitSec}s...`);
          await new Promise(r => setTimeout(r, waitSec * 1000));
          continue;
        }
        throw new Error('AI rate limit reached on all keys. Please wait a minute and try again.');
      }

      // Parse ugly API errors into clean messages
      let cleanMsg = err.message || 'Unknown AI error';
      try {
        const parsed = JSON.parse(cleanMsg);
        if (parsed?.error?.message) cleanMsg = parsed.error.message;
      } catch (_) {}
      console.error(`[callGemini] Error (attempt ${attempt+1}):`, cleanMsg);
      throw new Error(`AI error: ${cleanMsg}`);
    }
  }
}

// ─── Utility: Call Gemini with streaming (for chat) ──────────────────
async function callGeminiStream(prompt, onChunk) {
  const ai = getAI();
  try {
    const response = await ai.models.generateContentStream({
      model: MODEL,
      contents: prompt,
      config: {}
    });
    let full = '';
    for await (const chunk of response) {
      const text = chunk.text || '';
      if (text) {
        full += text;
        onChunk(text);
      }
    }
    return full;
  } catch (err) {
    const isRateLimit = err?.status === 429 ||
      (err?.message && err.message.includes('429')) ||
      (err?.message && err.message.includes('RESOURCE_EXHAUSTED'));
    if (isRateLimit) {
      rotateKey();
      throw new Error('AI rate limit reached. Please wait a moment and try again.');
    }
    throw err;
  }
}

// ─── Named error classes from youtube-transcript ─────────────────────
const {
  YoutubeTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptVideoUnavailableError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptTooManyRequestError,
} = require('youtube-transcript');

// ─── Utility: Scrape YouTube Metadata (fallback for no-subtitle videos)
async function scrapeYouTubeMetadata(videoUrl) {
  return new Promise((resolve) => {
    const https = require('https');
    const opts = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    };
    let data = '';
    const req = https.get(videoUrl, opts, (res) => {
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        const title    = (data.match(/"title":\{"runs":\[\{"text":"([^"]+)"/) || [])[1] || '';
        const desc     = (data.match(/"shortDescription":"((?:[^"\\]|\\.){0,1000})/) || [])[1] || '';
        const keywords = (data.match(/"keywords":\[([^\]]+)\]/) || [])[1] || '';
        resolve({
          title: title.trim(),
          description: desc.replace(/\\n/g, '\n').replace(/\\"/g, '"').trim(),
          keywords: keywords.replace(/"/g, '').trim(),
        });
      });
    });
    req.on('error', () => resolve({ title: '', description: '', keywords: '' }));
    req.setTimeout(8000, () => { req.destroy(); resolve({ title: '', description: '', keywords: '' }); });
  });
}

// ─── Utility: Extract Transcript (with metadata fallback) ─────────────
async function extractTranscript(videoUrl) {
  try {
    const data = await YoutubeTranscript.fetchTranscript(videoUrl);
    if (!data || data.length === 0) return null;
    return data.map(t => t.text).join(' ');
  } catch (err) {
    // Disabled / unavailable subtitles → try metadata fallback
    if (
      err instanceof YoutubeTranscriptDisabledError ||
      err instanceof YoutubeTranscriptNotAvailableError ||
      err instanceof YoutubeTranscriptVideoUnavailableError
    ) {
      console.warn(`No transcript for ${videoUrl} — trying metadata fallback...`);
      const meta = await scrapeYouTubeMetadata(videoUrl);
      if (meta.title) {
        return `[NO TRANSCRIPT — METADATA ONLY]\nTitle: ${meta.title}\nDescription: ${meta.description}\nKeywords: ${meta.keywords}`;
      }
      throw new Error('⚠️ The creator has disabled subtitles for this video, and no metadata could be retrieved. Please paste the content manually.');
    }
    if (err instanceof YoutubeTranscriptTooManyRequestError) {
      throw new Error('⚠️ YouTube is rate-limiting transcript requests. Please wait a few minutes and try again.');
    }
    // Generic / network error
    console.warn('Transcript fetch failed:', err.message);
    return null;
  }
}

// ─── Utility: Extract video ID from YouTube URL ───────────────────────
function extractVideoId(url) {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// ─── Utility: Resolve Content ────────────────────────────────────────
async function resolveContent(body) {
  const { url, text } = body;
  let content = text || '';

  if (url && url.trim()) {
    const cleanUrl = url.trim();

    if (cleanUrl.includes('list=')) {
      // ── PLAYLIST PATH ──────────────────────────────────────────────
      const ytpl = require('@distube/ytpl');
      let playlist;
      try {
        playlist = await ytpl(cleanUrl, { limit: Infinity });
      } catch (err) {
        throw new Error(`Failed to fetch playlist. Make sure it is public and the URL is valid. (${err.message})`);
      }

      console.log(`📋 Playlist: "${playlist.title}" — ${playlist.items.length} videos`);
      let fullTranscript = '';
      let skipped = 0;

      for (const item of playlist.items) {
        try {
          // Per-video timeout via Promise.race (with cleanup)
          let timer;
          const t = await Promise.race([
            extractTranscript(item.shortUrl),
            new Promise((_, reject) => {
              timer = setTimeout(() => reject(new Error('timeout')), 20000);
            }),
          ]).finally(() => clearTimeout(timer));
          if (t) {
            fullTranscript += `\n\n--- Video: ${item.title} ---\n${t}`;
          } else {
            skipped++;
          }
        } catch (e) {
          console.warn(`Skipping "${item.title}": ${e.message}`);
          skipped++;
        }
      }

      if (!fullTranscript) {
        throw new Error('Could not extract any transcripts from this playlist. The creator may have disabled subtitles on all videos.');
      }

      const note = skipped > 0 ? `\n\n[NOTE: ${skipped} video(s) were skipped due to missing transcripts]` : '';
      content = fullTranscript + note;

    } else {
      // ── SINGLE VIDEO PATH ──────────────────────────────────────────
      let transcript;
      try {
        transcript = await extractTranscript(cleanUrl);
      } catch (err) {
        // Re-throw user-friendly errors directly
        throw err;
      }

      if (transcript) {
        content = transcript;
      } else if (!content) {
        throw new Error('Could not extract transcript from this YouTube URL. Try pasting the transcript manually in the "Text / Transcript" tab.');
      }
    }
  }

  if (!content || content.trim().length < 10) {
    throw new Error('Please provide a YouTube URL or paste text content (at least 10 characters).');
  }

  // Cap at 8 million characters to handle entire large playlists
  return content.substring(0, 8000000);
}

// ═══════════════════════════════════════════════════════════════════════
//  ENDPOINT 1a: /api/analyze-progress — SSE stream for playlist progress
// ═══════════════════════════════════════════════════════════════════════
app.get('/api/analyze-progress', async (req, res) => {
  // Server-Sent Events setup
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const url = req.query.url;
    if (!url || !url.includes('list=')) {
      send({ type: 'error', message: 'Not a playlist URL.' });
      return res.end();
    }

    // Check cache first
    const cached = cache.get({ url });
    if (cached) {
      send({ type: 'cached', result: cached });
      return res.end();
    }

    const ytpl = require('@distube/ytpl');
    let playlist;
    try {
      playlist = await ytpl(url.trim(), { limit: Infinity });
    } catch (err) {
      send({ type: 'error', message: `Failed to fetch playlist: ${err.message}` });
      return res.end();
    }

    const total = playlist.items.length;
    send({ type: 'playlist', title: playlist.title, total });

    let fullTranscript = '';
    let skipped = 0;

    for (let i = 0; i < playlist.items.length; i++) {
      const item = playlist.items[i];
      send({ type: 'progress', current: i + 1, total, title: item.title });

      try {
        let timer;
        const t = await Promise.race([
          extractTranscript(item.shortUrl),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('timeout')), 20000);
          }),
        ]).finally(() => clearTimeout(timer));
        if (t) {
          fullTranscript += `\n\n--- Video: ${item.title} ---\n${t}`;
        } else { skipped++; }
      } catch (e) {
        console.warn(`[SSE] Skipping "${item.title}": ${e.message}`);
        skipped++;
      }
    }

    if (!fullTranscript) {
      send({ type: 'error', message: 'No transcripts found in playlist — subtitles may be disabled on all videos.' });
      return res.end();
    }

    const note = skipped > 0 ? `\n\n[NOTE: ${skipped} video(s) skipped — no subtitles]` : '';
    const content = (fullTranscript + note).substring(0, 8000000);

    send({ type: 'analyzing', message: 'Fetching done — running AI analysis...' });

    const isMetadataOnly = content.startsWith('[NO TRANSCRIPT — METADATA ONLY]');
    const parsed = await runAnalysis(content, isMetadataOnly);

    // Save to cache
    cache.set({ url }, parsed);
    send({ type: 'done', result: parsed });
  } catch (err) {
    send({ type: 'error', message: err.message });
  }
  res.end();
});

// ─── Shared AI analysis logic (used by both endpoints) ───────────────
async function runAnalysis(content, isMetadataOnly) {
  const contentWords = content.split(/\s+/).length;
  const minConcepts = Math.min(Math.max(10, Math.floor(contentWords / 300)), 40);
  const minMisconceptions = Math.min(Math.max(5, Math.floor(contentWords / 600)), 20);

  const prompt = `You are a world-class AI content analyst with perfect recall. Your job is to analyze the COMPLETE content below — read EVERY part of it from start to finish before producing output.

${isMetadataOnly ? `NOTE: No transcript was available. The content below is metadata only. Extract as much meaning as possible from it.` : `CRITICAL INSTRUCTION: The content below spans MULTIPLE VIDEOS or a very long lecture. You MUST scan from the very beginning to the very end. Do NOT stop at the first few topics. Cover ALL sections, chapters, and topics that appear throughout — early, middle, AND late portions equally.`}

Step 1 — Identify:
- Content Type (e.g., Educational Tutorial, Music Video, Podcast, Vlog, Documentary, News, Entertainment)
- Main topic/title (concise, 5-10 words)
- Difficulty/Vibe: Educational → Beginner/Intermediate/Advanced. Music → genre + emotional vibe. Other → describe appropriately.

Step 2 — Extract ALL Key Concepts/Topics (MINIMUM ${minConcepts} — more is better for long content):
You MUST identify and cover concepts from EVERY PART of the content — beginning, middle, and end.
  • If Educational: every major concept, formula, definition, sub-topic taught
  • If Music: lyrical themes, song structure, musical style, artist background, cultural context
  • If Podcast/Talk: every argument, talking point, story, case study covered
  • Do NOT stop early. Each sub-topic should be its own concept entry.

For each concept provide:
- name: concise name of the concept/topic/section
- description: 2-3 sentence explanation of what it is
- why: why it matters or its deeper significance
- how: how it works / how it is explained or demonstrated in the content
- analogy: a vivid real-world analogy or cultural reference
- related: array of 2-3 other concepts from this content it connects to

Step 3 — Extract Misconceptions / Fun Facts (MINIMUM ${minMisconceptions}):
  • Educational → common student misconceptions, tricky exam traps
  • Music → hidden meanings, commonly misheard lyrics, fun facts
  • Other → surprising, counterintuitive, or commonly misunderstood aspects

For each misconception/fact provide:
- name: the misconception or fact statement
- why: why people believe it or why it is interesting
- truth: the correct understanding or deeper truth

Respond ONLY with a valid JSON object. Keep key names exactly as shown:
{
  "topic": "string",
  "difficulty": "string",
  "concepts": [{"name":"","description":"","why":"","how":"","analogy":"","related":[]}],
  "misconceptions": [{"name":"","why":"","truth":""}]
}

FULL CONTENT TO ANALYZE (read all of it):
${content}`;



  const result = await callGemini(prompt, true);
  let parsed;
  try {
    parsed = JSON.parse(result);
  } catch (e) {
    let clean = result.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    let depth = 0, start = -1, end = -1;
    for (let i = 0; i < clean.length; i++) {
      if (clean[i] === '{') { if (depth === 0) start = i; depth++; }
      else if (clean[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (start !== -1 && end !== -1) {
      try { parsed = JSON.parse(clean.slice(start, end + 1)); }
      catch (e2) { throw new Error('AI returned malformed JSON. Please try again.'); }
    } else {
      throw new Error('AI returned malformed JSON. Please try again.');
    }
  }
  if (!parsed.topic || !Array.isArray(parsed.concepts)) {
    throw new Error('AI response was missing required fields. Please try again.');
  }
  return parsed;
}

// ═══════════════════════════════════════════════════════════════════════
//  ENDPOINT 1: /api/analyze — Content analysis (topic extraction)
// ═══════════════════════════════════════════════════════════════════════
app.post('/api/analyze', async (req, res) => {
  try {
    // ── Cache check ──────────────────────────────────────────────────
    const cached = cache.get(req.body);
    if (cached) {
      console.log('[cache] HIT —', req.body.url || '(text input)');
      return res.json({ ...cached, _cached: true });
    }

    const content = await resolveContent(req.body);

    const isMetadataOnly = content.startsWith('[NO TRANSCRIPT — METADATA ONLY]');

    // Scale concept count to content size (more content = more concepts extracted)
    const contentWords = content.split(/\s+/).length;
    const minConcepts = Math.min(Math.max(10, Math.floor(contentWords / 300)), 40);
    const minMisconceptions = Math.min(Math.max(5, Math.floor(contentWords / 600)), 20);

    const prompt = `You are a world-class AI content analyst with perfect recall. Your job is to analyze the COMPLETE content below — read EVERY part of it from start to finish before producing output.

${isMetadataOnly ? `NOTE: No transcript was available for this video. The content below is metadata only (title, description, keywords). Analyze and extract as much meaning as possible from this metadata.` : `CRITICAL INSTRUCTION: The content below spans the ENTIRE video/lecture. You MUST scan from the very beginning to the very end. Do NOT stop at the first few topics. Cover ALL sections, chapters, and topics that appear throughout the content — early, middle, AND late portions equally.`}

Step 1 — Identify:
- Content Type (e.g., Educational Tutorial, Music Video, Podcast, Vlog, Documentary, News, Entertainment)
- Main topic/title (concise, 5-10 words)
- Difficulty/Vibe: Educational → Beginner/Intermediate/Advanced. Music → genre + emotional vibe (e.g., "Soulful Telugu Melody"). Other → describe appropriately.

Step 2 — Extract ALL Key Concepts/Topics (MINIMUM ${minConcepts} — more is better for long content):
You MUST identify and cover concepts from EVERY PART of the content — beginning, middle, and end.
  • If Educational: every major concept, formula, definition, sub-topic taught
  • If Music: lyrical themes, song structure, musical style, artist background, cultural context
  • If Podcast/Talk: every argument, talking point, story, case study covered
  • If Story/Vlog: every major plot point, scene, theme covered
  • Do NOT stop early. If you see sub-topics in the content, each should be its own concept.

For each concept provide:
- name: concise name of the concept/topic/section
- description: 2-3 sentence explanation of what it is
- why: why it matters or its deeper significance
- how: how it works / how it is explained or demonstrated in the content
- analogy: a vivid real-world analogy or cultural reference
- related: array of 2-3 other concepts from this content it connects to

Step 3 — Extract Misconceptions / Fun Facts (MINIMUM ${minMisconceptions}):
  • Educational → common student misconceptions, tricky exam traps
  • Music → hidden meanings, commonly misheard lyrics, fun facts
  • Other → surprising, counterintuitive, or commonly misunderstood aspects

For each misconception/fact provide:
- name: the misconception or fact statement
- why: why people believe it or why it is interesting
- truth: the correct understanding or deeper truth

Respond ONLY with a valid JSON object. Keep key names exactly as shown:
{
  "topic": "string",
  "difficulty": "string",
  "concepts": [{"name":"","description":"","why":"","how":"","analogy":"","related":[]}],
  "misconceptions": [{"name":"","why":"","truth":""}]
}

FULL CONTENT TO ANALYZE (read all of it):
${content}`;


    const parsed = await runAnalysis(content, isMetadataOnly);
    // ── Save to cache and respond ────────────────────────────────────
    cache.set(req.body, parsed);
    res.json(parsed);
  } catch (error) {
    console.error('Analyze Error:', error.message);
    res.status(error.message.includes('Please provide') || error.message.includes('Could not') ? 400 : 500)
       .json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
//  ENDPOINT 2: /api/chat/stream — SSE streaming chat for ALL modes
// ═══════════════════════════════════════════════════════════════════════
app.post('/api/chat/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const { mode, analysisData, userMessage, conversationHistory, conceptIndex } = req.body;

    if (!analysisData || !mode) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Missing mode or analysis data.' })}\n\n`);
      return res.end();
    }

    const topicContext = `
TOPIC: ${analysisData.topic}
DIFFICULTY: ${analysisData.difficulty}
CONCEPTS: ${JSON.stringify(analysisData.concepts.map(c => c.name))}
FULL CONCEPT DATA: ${JSON.stringify(analysisData.concepts)}
MISCONCEPTIONS: ${JSON.stringify(analysisData.misconceptions)}
`;

    const historyText = (conversationHistory || [])
      .slice(-10)
      .map(m => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content}`)
      .join('\n');

    let systemPrompt = '';
    switch (mode) {
      case 1: systemPrompt = buildDeepTutorPrompt(topicContext, analysisData, conceptIndex, userMessage); break;
      case 2: systemPrompt = buildExamModePrompt(topicContext, analysisData, userMessage); break;
      case 3: systemPrompt = buildNotesModePrompt(topicContext, analysisData, userMessage); break;
      case 4: systemPrompt = buildADHDModePrompt(topicContext, analysisData, conceptIndex, userMessage); break;
      case 5: systemPrompt = buildSocraticModePrompt(topicContext, analysisData, userMessage); break;
      case 6: systemPrompt = buildPromptChainPrompt(topicContext, analysisData, userMessage); break;
      case 7: systemPrompt = buildWeaknessScanPrompt(topicContext, analysisData, userMessage); break;
      case 8: systemPrompt = buildFinalSummaryPrompt(topicContext, analysisData, userMessage); break;
      default:
        res.write(`data: ${JSON.stringify({ type: 'error', message: `Unknown mode: ${mode}` })}\n\n`);
        return res.end();
    }

    const fullPrompt = `${systemPrompt}\n\nPrevious conversation:\n${historyText || '(This is the start of the conversation)'}\n\nStudent's message: ${userMessage || '(Session just started — give your opening message)'}`;

    await callGeminiStream(fullPrompt, (chunk) => {
      res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`);
    });

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  } catch (error) {
    console.error('Chat Stream Error:', error.message);
    res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
  }
  res.end();
});

// ═══════════════════════════════════════════════════════════════════════
//  ENDPOINT 2b: /api/chat — Non-streaming fallback
// ═══════════════════════════════════════════════════════════════════════
app.post('/api/chat', async (req, res) => {
  try {
    const { mode, analysisData, userMessage, conversationHistory, conceptIndex } = req.body;

    if (!analysisData || !mode) {
      return res.status(400).json({ error: 'Missing mode or analysis data.' });
    }

    const topicContext = `
TOPIC: ${analysisData.topic}
DIFFICULTY: ${analysisData.difficulty}
CONCEPTS: ${JSON.stringify(analysisData.concepts.map(c => c.name))}
FULL CONCEPT DATA: ${JSON.stringify(analysisData.concepts)}
MISCONCEPTIONS: ${JSON.stringify(analysisData.misconceptions)}
`;

    const historyText = (conversationHistory || [])
      .slice(-10)
      .map(m => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content}`)
      .join('\n');

    let systemPrompt = '';
    switch (mode) {
      case 1: systemPrompt = buildDeepTutorPrompt(topicContext, analysisData, conceptIndex, userMessage); break;
      case 2: systemPrompt = buildExamModePrompt(topicContext, analysisData, userMessage); break;
      case 3: systemPrompt = buildNotesModePrompt(topicContext, analysisData, userMessage); break;
      case 4: systemPrompt = buildADHDModePrompt(topicContext, analysisData, conceptIndex, userMessage); break;
      case 5: systemPrompt = buildSocraticModePrompt(topicContext, analysisData, userMessage); break;
      case 6: systemPrompt = buildPromptChainPrompt(topicContext, analysisData, userMessage); break;
      case 7: systemPrompt = buildWeaknessScanPrompt(topicContext, analysisData, userMessage); break;
      case 8: systemPrompt = buildFinalSummaryPrompt(topicContext, analysisData, userMessage); break;
      default: return res.status(400).json({ error: `Unknown mode: ${mode}` });
    }

    const fullPrompt = `${systemPrompt}\n\nPrevious conversation:\n${historyText || '(This is the start of the conversation)'}\n\nStudent's message: ${userMessage || '(Session just started — give your opening message)'}`;

    const result = await callGemini(fullPrompt);
    res.json({ response: result });
  } catch (error) {
    console.error('Chat Error:', error.message);
    const msg = error.message.includes('rate limit') ? error.message : 'AI response failed. Please try again.';
    res.status(500).json({ error: msg });
  }
});

// ═══════════════════════════════════════════════════════════════════════
//  MODE PROMPT BUILDERS
// ═══════════════════════════════════════════════════════════════════════

function buildDeepTutorPrompt(topicContext, data, conceptIndex, userMessage) {
  const idx = conceptIndex || 0;
  const concept = data.concepts[idx] || data.concepts[0];

  return `You are a world-class Deep Tutor AI. Your role is to teach concepts one at a time with extreme clarity.

${topicContext}

CURRENT CONCEPT TO TEACH (index ${idx}/${data.concepts.length - 1}): ${JSON.stringify(concept)}

RULES:
- If the student says "next", teach the CURRENT concept using the 5-layer method:
  1. 📖 WHAT IT IS — clear definition
  2. 🤔 WHY IT EXISTS — motivation and context
  3. ⚙️ HOW IT WORKS — mechanics with examples
  4. 💡 ANALOGY — a vivid, memorable real-world analogy
  5. 🔗 CONNECTIONS — how it relates to other concepts in this topic
- After explaining, ask ONE targeted comprehension question.
- If the student answers a question, evaluate their answer:
  - If correct: praise specifically what they got right, add a nuance, then say "Type 'next' for the next concept"
  - If partially correct: acknowledge what's right, gently correct the gap, re-explain briefly
  - If incorrect: don't shame — use a different analogy, break it down simpler
- Keep responses well-structured with headers and bullet points.
- Use markdown formatting (bold, italics, headers, blockquotes for analogies).
- Be encouraging, patient, and enthusiastic about teaching.
- If all concepts are covered, congratulate the student and summarize key takeaways.`;
}

function buildExamModePrompt(topicContext, data, userMessage) {
  return `You are a strict but fair Exam Tutor AI. You test the student's understanding through questions.

${topicContext}

RULES:
- Generate questions that progress from Easy → Medium → Hard.
- Start with a foundational question when the session begins.
- For each question:
  - Present it clearly with the difficulty tag [Easy], [Medium], or [Hard]
  - Wait for the student's answer
- When the student answers:
  - Grade it: ✅ Correct, ⚠️ Partially Correct, or ❌ Incorrect
  - Explain WHY the answer is right or wrong
  - Show the ideal answer
  - Then present the NEXT question (harder if they got it right, same level if wrong)
- After every 3 questions, give a mini-progress report:
  - Score so far
  - Strengths identified
  - Areas to review
- Use markdown formatting for clarity.
- Mix question types: multiple choice, short answer, true/false, scenario-based.
- Base ALL questions on the actual concepts and misconceptions from the analysis.`;
}

function buildNotesModePrompt(topicContext, data, userMessage) {
  return `You are an expert Study Notes Generator AI. Create structured, revision-ready notes.

${topicContext}

RULES:
- When the session starts, generate comprehensive structured notes covering ALL concepts.
- Format the notes as:
  ## 📋 ${data.topic} — Study Notes

  ### Key Concepts
  For each concept, create a compact note card:
  - **Concept Name** — one-line definition
  - Key details in bullet points
  - 💡 Memory aid / analogy

  ### ⚡ Quick-Fire Flashcards
  Generate Q&A flashcards from the concepts:
  - **Q:** [question]
  - **A:** [answer]

  ### ⚠️ Common Traps
  List misconceptions students should watch out for.

  ### 🔗 Concept Map
  Show how concepts connect to each other in a text-based diagram.

- If the student asks to expand on any concept, provide deeper notes for that specific area.
- If the student says "flashcards", generate more flashcard pairs.
- If the student says "summary", give a 1-paragraph executive summary.
- Use markdown formatting extensively (bold, italics, headers, lists, blockquotes).`;
}

function buildADHDModePrompt(topicContext, data, conceptIndex, userMessage) {
  const idx = conceptIndex || 0;
  const concept = data.concepts[idx] || data.concepts[0];

  return `You are an ADHD-Friendly Tutor AI. You make learning engaging, fast-paced, and dopamine-friendly.

${topicContext}

CURRENT CONCEPT (index ${idx}/${data.concepts.length - 1}): ${JSON.stringify(concept)}

RULES — THIS IS CRITICAL:
- Keep EVERYTHING short. Max 3-4 sentences per block.
- Use lots of emojis to maintain visual interest 🎯🧠⚡🔥
- Break information into tiny, digestible chunks (micro-learning).
- Structure each concept as:
  🎯 **ONE SENTENCE** — what is it
  ⚡ **WHY CARE** — one sentence on why it matters
  🧠 **BRAIN HACK** — a super memorable analogy or mnemonic
  ✅ **QUICK CHECK** — one yes/no or fill-in-the-blank question

- When the student answers:
  - Instant feedback (1 sentence max)
  - Encouragement with emoji 🎉👏🔥
  - Immediately move to the next micro-chunk

- Pace is FAST. No long paragraphs. No walls of text.
- Use visual separators (--- or ═══) between chunks.
- After every 2 concepts, insert a "🏆 CHECKPOINT" with a fun recap.
- If the student says "next" — move to the next concept immediately.
- If the student seems stuck — simplify even further, use humor.`;
}

function buildSocraticModePrompt(topicContext, data, userMessage) {
  return `You are a Socratic Method Tutor AI. You NEVER directly explain — you only ask questions to guide discovery.

${topicContext}

RULES — ABSOLUTE:
- You must NEVER give direct answers or explanations.
- Guide the student to discover concepts through carefully crafted questions.
- Start with a broad, thought-provoking question about the topic.
- Based on their answer:
  - If on track: ask a deeper, more specific question
  - If off track: ask a simpler guiding question that redirects
  - If stuck: provide a subtle hint in the form of another question
- Use the Socratic ladder:
  1. 🤔 Start with WHAT questions (observation level)
  2. 🔍 Move to WHY questions (analysis level)
  3. 💡 Then HOW questions (synthesis level)
  4. 🎯 Finally WHAT IF questions (evaluation level)
- After 3-4 exchanges on a concept, provide a brief synthesis:
  "🎯 Let's capture what you just discovered: [summary of their insights]"
- Then move to the next concept area.
- Keep each question focused and concise.
- Use markdown formatting. Emojis are OK but minimal.
- Be genuinely curious and encouraging about their reasoning process.`;
}

function buildPromptChainPrompt(topicContext, data, userMessage) {
  return `You are a Prompt Chain Generator AI. You create a sequence of self-contained learning prompts.

${topicContext}

RULES:
- Generate a MASTER INDEX of all prompts (one per concept).
- Then generate each prompt as a complete, self-contained learning prompt that can be used with any AI.
- Format each prompt in a code block like this:

\`\`\`
┌─────────────────────────────────────┐
│ PROMPT [N] of [TOTAL]              │
│ Topic: [concept name]              │
│ From: ${data.topic}                │
└─────────────────────────────────────┘

You are an expert tutor. Teach me the following concept
from the subject "${data.topic}".

CONCEPT: [concept name]
CONTEXT: [how it fits in the broader topic]

YOUR TASK:
1. Explain what it is in simple terms
2. Explain WHY it exists / matters
3. HOW does it work? (with examples)
4. Give one strong real-world analogy
5. How does it connect to [related concepts]?
6. Ask me one question to test understanding
\`\`\`

- Generate ALL prompts at once.
- If the student asks about a specific concept, generate a deeper, more detailed prompt for it.
- Use markdown formatting throughout.`;
}

function buildWeaknessScanPrompt(topicContext, data, userMessage) {
  return `You are a Weakness Scanner AI. You identify knowledge gaps and misconceptions.

${topicContext}

RULES:
- When the session starts, present an overview of common weaknesses for this topic.
- Structure the scan as:

  ## 🔍 Weakness Scan: ${data.topic}

  ### 🚨 High-Risk Misconceptions
  For each misconception from the data, explain:
  - ❌ The misconception
  - 🤔 Why students believe this
  - ✅ The truth
  - 💡 How to remember the correct understanding

  ### 📊 Concept Difficulty Ranking
  Rank the concepts from most to least commonly misunderstood.

  ### 🎯 Diagnostic Questions
  Generate 3 targeted diagnostic questions designed to reveal if the student has these misconceptions.

- When the student answers diagnostic questions:
  - Identify which misconceptions they hold
  - Provide targeted correction
  - Generate follow-up questions to verify understanding
- If the student says "test me", generate a mini-quiz focused on the weak areas.
- Use markdown formatting extensively.`;
}

// ═══════════════════════════════════════════════════════════════════════
//  Health Check
// ═══════════════════════════════════════════════════════════════════════

function buildFinalSummaryPrompt(topicContext, data, userMessage) {
  return `You are a Final Summary Generator AI. Create a comprehensive, well-structured summary of the entire topic.

${topicContext}

RULES:
- When the session starts, generate a COMPLETE summary covering everything.
- Structure it as:

  ## 📄 Complete Summary: ${data.topic}

  ### 🎯 Overview
  A 3-4 sentence executive summary of the entire topic.

  ### 📚 Key Concepts Covered
  For each concept, provide a concise 2-3 sentence summary:
  - **Concept Name**: What it is and why it matters.

  ### 🔗 How Everything Connects
  Explain how all the concepts relate to each other in a flowing narrative (not bullet points).

  ### ⚠️ Common Pitfalls
  List the top misconceptions and traps to avoid.

  ### 💡 Key Takeaways
  Numbered list of the 5-7 most important things to remember.

  ### 📖 Further Study Recommendations
  Suggest what to learn next based on this topic.

- If the student asks to expand on any section, provide more detail.
- If the student says "short", give a 1-paragraph ultra-condensed summary.
- If the student says "bullet", convert everything to bullet points.
- Use markdown formatting extensively.
- Make the summary comprehensive enough that someone could study ONLY this summary and understand the topic.`;
}

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '2.1.0',
    ai: API_KEYS.length > 0 ? 'connected' : 'no-key',
    keys: API_KEYS.length,
    timestamp: new Date().toISOString()
  });
});

// ─── Serve Frontend ──────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start Server ────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n  ╔══════════════════════════════════════╗`);
  console.log(`  ║   LearnFlow AI Server v2.1.0         ║`);
  console.log(`  ║   Running on http://localhost:${PORT}   ║`);
  console.log(`  ║   AI: ${API_KEYS.length > 0 ? `✅ ${API_KEYS.length} Key(s) Loaded` : '❌ No API Key'}       ║`);
  console.log(`  ╚══════════════════════════════════════╝\n`);
});
