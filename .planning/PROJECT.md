# LearnFlow AI

## What This Is
LearnFlow AI is an AI-powered learning platform that transforms educational videos into active, personalized learning experiences. It is not a passive summarizer but an intelligent learning assistant.

## Core Value
Transforming passive video watching and text reading into structured, interactive, and personalized educational experiences through active teaching, step-by-step concept breakdowns, and multiple tailored learning modes.

## Context
The user provides educational content (YouTube URL, plain text transcript, or PDF slides). The system extracts the content, cleans it, analyzes it for key concepts, prerequisites, and common misconceptions, and then presents a multi-mode learning menu.

## Requirements

### Validated
(None yet — ship to validate)

### Active
- [ ] Implement content extraction from YouTube (captions, title, duration).
- [ ] Implement text and PDF transcript processing.
- [ ] Implement transcript cleaning (filler word removal, sentence fixing).
- [ ] Implement content analysis (topics, key concepts, difficulty level, prerequisites).
- [ ] Implement the interactive Learning Menu.
- [ ] Implement Deep Tutor Mode.
- [ ] Implement Exam Mode.
- [ ] Implement Notes Mode.
- [ ] Implement ADHD Mode.
- [ ] Implement Socratic Mode.
- [ ] Implement Prompt Chain Mode.
- [ ] Implement Weakness Scan Mode.

### Out of Scope
- Direct passive video summarization (goal is active teaching, not summarizing).
- Complex mathematical derivations unless explicitly requested by the user.

## Key Decisions
| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Prompt Chain Architecture | The core functionality involves parsing concepts into discrete, logically ordered blocks that form independent, ready-to-paste learning prompts. | Pending |

## Evolution
This document evolves at phase transitions and milestone boundaries.
---
*Last updated: 2026-05-21 after initialization*
