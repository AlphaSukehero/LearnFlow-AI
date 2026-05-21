require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { YoutubeTranscript } = require('youtube-transcript');
const { GoogleGenAI } = require('@google/genai');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// For local testing, we'll initialize the AI client
// Provide a default API key or fallback
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.post('/api/analyze', async (req, res) => {
    try {
        const { url, text } = req.body;
        let contentToAnalyze = text;

        if (url) {
            try {
                const transcriptData = await YoutubeTranscript.fetchTranscript(url);
                contentToAnalyze = transcriptData.map(t => t.text).join(' ');
            } catch (err) {
                return res.status(400).json({ error: "Failed to extract YouTube transcript. The video may not have captions. Please paste the transcript manually." });
            }
        }

        if (!contentToAnalyze || contentToAnalyze.trim() === '') {
            return res.status(400).json({ error: "No content provided for analysis." });
        }

        // Use Gemini to analyze the content
        const prompt = `
        You are an expert educational AI. Analyze the following transcript/notes.
        
        Extract the main topic, difficulty level (Beginner/Intermediate/Advanced), key concepts, and common misconceptions.
        For each concept, provide a name, description, why it exists, how it works, a real-world analogy, and related concepts.
        For misconceptions, provide the name, why it happens, and the truth.
        
        Respond ONLY with a valid JSON object matching this structure:
        {
          "topic": "String",
          "difficulty": "String",
          "concepts": [
            {
              "name": "String",
              "description": "String",
              "why": "String",
              "how": "String",
              "analogy": "String",
              "related": ["String"]
            }
          ],
          "misconceptions": [
            {
              "name": "String",
              "why": "String",
              "truth": "String"
            }
          ]
        }

        Content to analyze:
        ${contentToAnalyze.substring(0, 30000)} // Limit to roughly 30k chars to avoid token limits
        `;

        let jsonResult;
        if (process.env.GEMINI_API_KEY) {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                }
            });
            jsonResult = JSON.parse(response.text);
        } else {
            // Fallback dynamic mock based on actual content
            const words = contentToAnalyze.split(' ').slice(0, 50).join(' ');
            jsonResult = {
                topic: "Generated from transcript: " + words.substring(0, 30) + "...",
                difficulty: "Intermediate",
                concepts: [
                    {
                        name: "Concept 1 from video",
                        description: "First 20 words: " + contentToAnalyze.split(' ').slice(0, 20).join(' '),
                        why: "Real backend processed the URL successfully.",
                        how: "Using youtube-transcript library.",
                        analogy: "Like a mock but with real data integration.",
                        related: ["Backend API", "Node.js"]
                    },
                    {
                        name: "Concept 2",
                        description: "The video has a total of " + contentToAnalyze.split(' ').length + " words.",
                        why: "To show processing worked.",
                        how: "Calculated from the fetched transcript.",
                        analogy: "Like counting grains of sand.",
                        related: ["Word Count"]
                    }
                ],
                misconceptions: [
                    {
                        name: "UI only mock",
                        why: "Because Phase 1 didn't implement the backend.",
                        truth: "Now the backend is fetching real transcripts!"
                    }
                ]
            };
        }

        res.json(jsonResult);
        
    } catch (error) {
        console.error("Analysis Error:", error);
        res.status(500).json({ error: "An internal error occurred during analysis." });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
});
