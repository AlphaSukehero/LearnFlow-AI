require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Gemini AI Client ────────────────────────────────────────────────
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('⚠ GEMINI_API_KEY not set in .env — AI features will not work.');
}
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const MODEL = 'gemini-3.5-flash';

// ─── Utility: Call Gemini (with retry for rate limits) ───────────────
async function callGemini(prompt, jsonMode = false, retries = 3) {
  const config = {};
  if (jsonMode) {
    config.responseMimeType = 'application/json';
  }

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
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

      if (isRateLimit && attempt < retries - 1) {
        const waitSec = Math.pow(2, attempt + 1) * 2; // 4s, 8s, 16s
        console.warn(`Rate limited, retrying in ${waitSec}s (attempt ${attempt + 1}/${retries})...`);
        await new Promise(r => setTimeout(r, waitSec * 1000));
        continue;
      }

      if (isRateLimit) {
        throw new Error('AI rate limit reached. Please wait a minute and try again.');
      }
      throw err;
    }
  }
}

// ─── Utility: Extract Transcript ─────────────────────────────────────
async function extractTranscript(url) {
  try {
    const { YoutubeTranscript } = require('youtube-transcript');
    const data = await YoutubeTranscript.fetchTranscript(url);
    return data.map(t => t.text).join(' ');
  } catch (err) {
    console.warn('YouTube transcript fetch failed:', err.message);
    return null;
  }
}

// ─── Utility: Resolve Content ────────────────────────────────────────
async function resolveContent(body) {
  const { url, text } = body;
  let content = text || '';

  if (url && url.trim()) {
    const transcript = await extractTranscript(url.trim());
    if (transcript) {
      content = transcript;
    } else if (!content) {
      throw new Error('Could not extract transcript from the provided YouTube URL. Please paste the transcript manually.');
    }
  }

  if (!content || content.trim().length < 10) {
    throw new Error('Please provide a YouTube URL or paste text content (at least 10 characters).');
  }

  // Cap at 30k characters to stay within token limits
  return content.substring(0, 30000);
}

// ═══════════════════════════════════════════════════════════════════════
//  ENDPOINT 1: /api/analyze — Content analysis (topic extraction)
// ═══════════════════════════════════════════════════════════════════════
app.post('/api/analyze', async (req, res) => {
  try {
    const content = await resolveContent(req.body);

    const prompt = `You are an expert educational AI analyst. Analyze the following content thoroughly.

Extract:
- The main topic title (concise, 3-8 words)
- Difficulty level: "Beginner", "Intermediate", or "Advanced"
- Key concepts (5-10 concepts minimum)
- Common misconceptions students have about this topic

For each concept provide:
- name: short concept name
- description: 2-3 sentence explanation
- why: why this concept matters / exists
- how: how it works mechanically
- analogy: a vivid real-world analogy
- related: array of 2-3 related concept names

For each misconception provide:
- name: the misconception statement
- why: why students believe this
- truth: the correct understanding

Respond ONLY with a valid JSON object:
{
  "topic": "string",
  "difficulty": "string",
  "concepts": [{"name":"","description":"","why":"","how":"","analogy":"","related":[]}],
  "misconceptions": [{"name":"","why":"","truth":""}]
}

Content to analyze:
${content}`;

    const result = await callGemini(prompt, true);
    const parsed = JSON.parse(result);
    res.json(parsed);
  } catch (error) {
    console.error('Analyze Error:', error.message);
    res.status(error.message.includes('Please provide') || error.message.includes('Could not') ? 400 : 500)
       .json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
//  ENDPOINT 2: /api/chat — Universal chat for ALL modes
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

    // Build conversation context from history
    const historyText = (conversationHistory || [])
      .slice(-10) // keep last 10 messages for context
      .map(m => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content}`)
      .join('\n');

    let systemPrompt = '';

    switch (mode) {
      case 1: // Deep Tutor
        systemPrompt = buildDeepTutorPrompt(topicContext, analysisData, conceptIndex, userMessage);
        break;
      case 2: // Exam Mode
        systemPrompt = buildExamModePrompt(topicContext, analysisData, userMessage);
        break;
      case 3: // Notes Mode
        systemPrompt = buildNotesModePrompt(topicContext, analysisData, userMessage);
        break;
      case 4: // ADHD Mode
        systemPrompt = buildADHDModePrompt(topicContext, analysisData, conceptIndex, userMessage);
        break;
      case 5: // Socratic Mode
        systemPrompt = buildSocraticModePrompt(topicContext, analysisData, userMessage);
        break;
      case 6: // Prompt Chain
        systemPrompt = buildPromptChainPrompt(topicContext, analysisData, userMessage);
        break;
      case 7: // Weakness Scan
        systemPrompt = buildWeaknessScanPrompt(topicContext, analysisData, userMessage);
        break;
      case 8: // Final Summary
        systemPrompt = buildFinalSummaryPrompt(topicContext, analysisData, userMessage);
        break;
      default:
        return res.status(400).json({ error: `Unknown mode: ${mode}` });
    }

    const fullPrompt = `${systemPrompt}

Previous conversation:
${historyText || '(This is the start of the conversation)'}

Student's message: ${userMessage || '(Session just started — give your opening message)'}`;

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
    version: '2.0.0',
    ai: GEMINI_API_KEY ? 'connected' : 'no-key',
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
  console.log(`  ║   LearnFlow AI Server v2.0.0         ║`);
  console.log(`  ║   Running on http://localhost:${PORT}   ║`);
  console.log(`  ║   AI: ${GEMINI_API_KEY ? '✅ Gemini Connected' : '❌ No API Key'}         ║`);
  console.log(`  ╚══════════════════════════════════════╝\n`);
});
