# Requirements

## v1 Requirements

### Extraction
- [ ] **EXTR-01**: User can input a YouTube URL to extract transcript, title, channel, and duration.
- [ ] **EXTR-02**: System gracefully falls back to prompting for manual transcript if YouTube captions are unavailable.
- [ ] **EXTR-03**: User can input a plain text transcript or upload a PDF of notes/slides.
- [ ] **EXTR-04**: System cleans text by removing filler words, fixing fragments, and merging lines.

### Analysis
- [ ] **ANAL-01**: System analyzes cleaned text to extract main topics, subtopics, and key concepts.
- [ ] **ANAL-02**: System determines prerequisite knowledge required for the extracted concepts.
- [ ] **ANAL-03**: System identifies common confusion points and misconceptions.
- [ ] **ANAL-04**: System evaluates the difficulty level and identifies real-world applications.
- [ ] **ANAL-05**: System internally maps each concept to its definition, purpose, advantages/limitations, and a real-world analogy.

### Interface
- [ ] **UI-01**: System presents a clean Learning Menu showing topic, difficulty, concept count, and 7 available learning modes.
- [ ] **UI-02**: User can select a mode via number or description.
- [ ] **UI-03**: User can type "menu" at any time to return to the mode selection.
- [ ] **UI-04**: User can type "next" to continue to the next concept.

### Modes
- [ ] **MODE-01**: Deep Tutor Mode explains concepts step-by-step with real-world analogies and asks a conceptual check question every 2 concepts.
- [ ] **MODE-02**: Exam Mode generates 3 easy, 3 medium, and 2 hard questions (mixed formats) and tracks user score.
- [ ] **MODE-03**: Notes Mode generates structured notes, bullet points, flashcards, or cheat sheets based on user preference.
- [ ] **MODE-04**: ADHD Mode breaks content into 2-4 minute chunks with short bullet points and quick quizzes.
- [ ] **MODE-05**: Socratic Mode uses guided questioning and hints to help users arrive at answers without direct explanation.
- [ ] **MODE-06**: Prompt Chain Mode generates a numbered chain of self-contained GPT prompts covering the entire lecture logically.
- [ ] **MODE-07**: Weakness Scan Mode highlights 3-5 common misconceptions and provides targeted practice questions.

## v2 Requirements
- TBD

## Out of Scope
- Passive text summarization.
- Heavy mathematical derivations (unless requested by user).

## Traceability
*(To be populated by ROADMAP)*
