# Roadmap

**5 phases** | **20 requirements mapped** | All v1 requirements covered ✓

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 1 | Content Engine | Extract and analyze educational content | EXTR-01, EXTR-02, EXTR-03, EXTR-04, ANAL-01, ANAL-02, ANAL-03, ANAL-04, ANAL-05 | 3 |
| 2 | Interface & Navigation | Build interactive learning menu and state handling | UI-01, UI-02, UI-03, UI-04 | 3 |
| 3 | Deep Learning Modes | Implement Tutor, Socratic, and Weakness Scan | MODE-01, MODE-05, MODE-07 | 3 |
| 4 | Assessment Modes | Implement Exam and Notes modes | MODE-02, MODE-03 | 2 |
| 5 | Specialized Modes | Implement ADHD and Prompt Chain modes | MODE-04, MODE-06 | 3 |

### Phase Details

**Phase 1: Content Engine**
**Goal:** Build the backend capability to extract content from URLs/PDFs/Text and analyze it for concepts, prerequisites, and misconceptions.
**Mode:** mvp
**Requirements:** EXTR-01, EXTR-02, EXTR-03, EXTR-04, ANAL-01, ANAL-02, ANAL-03, ANAL-04, ANAL-05
**Success criteria:**
1. System successfully extracts clean text from a provided YouTube URL or raw text.
2. System correctly outputs a JSON or structured mapping of the core concepts and difficulty level.
3. System identifies 3 common misconceptions for a sample technical transcript.

**Phase 2: Interface & Navigation**
**Goal:** Create the conversational shell and interactive Learning Menu.
**Mode:** mvp
**Requirements:** UI-01, UI-02, UI-03, UI-04
**Success criteria:**
1. User receives a formatted menu showing topic, difficulty, and concept count.
2. User can select any mode 1-7 from the menu.
3. User can type "menu" to return to the selection screen at any time.

**Phase 3: Deep Learning Modes**
**Goal:** Build Deep Tutor, Socratic, and Weakness Scan functionality.
**Mode:** mvp
**Requirements:** MODE-01, MODE-05, MODE-07
**Success criteria:**
1. Deep Tutor asks a conceptual check question after every two concepts.
2. Socratic mode responds with guided questions instead of direct answers.
3. Weakness Scan correctly highlights misconceptions and gives 2 practice questions each.

**Phase 4: Assessment Modes**
**Goal:** Build Exam and Notes generation modes.
**Mode:** mvp
**Requirements:** MODE-02, MODE-03
**Success criteria:**
1. Exam mode correctly generates a mix of 8 questions graded by difficulty.
2. Notes mode prompts the user for format preference and generates notes accordingly.

**Phase 5: Specialized Modes**
**Goal:** Build ADHD chunking and the Prompt Chain generation modes.
**Mode:** mvp
**Requirements:** MODE-04, MODE-06
**Success criteria:**
1. ADHD mode limits chunks to 5 bullet points max and includes a quick quiz.
2. Prompt Chain mode generates a sequential list of self-contained GPT learning prompts.
3. Prompt Chain mode concludes with a Master Index of all generated prompts.
