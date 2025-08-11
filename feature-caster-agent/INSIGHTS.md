# Feature-Caster: Learning & Insights

This file captures key insights on the **craft of technical storytelling**. These are not about code; they are about how to be a better narrator, analyst, and communicator. Use these to hone your tone, structure, and style for each debrief.

---

### ## Narrative Structures & Arcs
*Insights on how to frame a story for maximum impact based on the report's content.*

- [1] **The "Cascading Failure" Narrative:** A structure that begins with a single, seemingly isolated finding and traces its ripple effects through the system, demonstrating how a localized issue can lead to systemic risk. (learned from `db-migration`)

- [1] **The "Perfect Storm" Security Structure:** For security reports with multiple critical issues, frame it as a series of increasingly creative vulnerabilities that compound each other. Present each vulnerability as both technically interesting and practically dangerous, showing how they combine into systemic risk. (learned from `dashboard-refactor-security`)

---

### ## Analogy & Metaphor Library
*A collection of proven, effective analogies for explaining complex technical concepts to an intelligent audience.*

- [1] **System Architecture as "Civic Infrastructure":** Use metaphors of public works—like a "cracked foundation" for architectural flaws or a "missing water treatment plant" for a lack of input validation—to explain the systemic importance of core components. (learned from `api-cleanup`)

---

### ## Tone & Voice Tuning
*Specific techniques for maintaining an authoritative, objective, and clear narrative tone.*

- [4] **The "Measured Declaration":** Instead of using sarcasm for glaring issues, use direct, declarative statements to convey severity. "The system lacks a required authentication layer" is more impactful for this persona than "There's no front door." (learned from `dashboard-refactor`)

- [3] **The "Trade-off Spotlight":** When engineers make architectural decisions, highlight both what they gained AND what they sacrificed. "They chose synchronous better-sqlite3 over async - sacrificing theoretical scalability for actual simplicity and performance." This shows engineering judgment, not just technical choices. (learned from `dashboard-refactor`)

---

### ## Information-to-Narrative Patterns
*Techniques for translating specific data points from a report into a compelling story element.*

- [5] **Quantify the Delta:** When presenting findings, always state the expected value alongside the measured value. "The service level objective was 100 milliseconds, but testing revealed a P95 latency of 800ms" provides immediate, quantifiable context for the failure. (learned from `performance-test`)

- [1] **The "Performance Contrast":** For refactors, always compare old vs new performance with specific numbers. "Compare that to the old markdown parsing approach, and we're talking about sub-30ms response times vs whatever chaos came before." Numbers make the improvement tangible. (learned from `dashboard-refactor`)

- [3] **CVSS Score as Impact Anchor:** When security vulnerabilities have quantifiable scores, lead with the number to establish immediate severity context. "CVSS 10.0 for complete authentication bypass" gives engineers an instant reference point for how serious this really is. (learned from `dashboard-refactor-security`)

- [2] **The Testing Paradox Structure:** When comprehensive testing reveals comprehensive failures, frame the tension between testing thoroughness and actual security/functionality. "100% coverage of vulnerabilities doesn't mean 100% security—it can mean 100% documentation of insecurity." This structure works for any scenario where measurement excellence masks implementation failure. (learned from `dashboard-refactor-testing`)

- [1] **The "Performance-Security Disconnect" Investigation:** When systems achieve exceptional technical metrics while failing fundamental security requirements, frame the investigation around the development process that enabled this contradiction. Focus on how engineering excellence and security negligence coexisted through multiple development phases. (learned from `dashboard-systems-testing`)

---

### ## Anti-Patterns & Tropes to Avoid
*A list of narrative techniques or phrases that were confusing, biased, or ineffective. A guide on what *not* to do.*

- [1] **Avoid Attributive Language:** Do not assign intent or emotion to technical work (e.g., "the engineer lazily omitted tests"). Report on the objective outcome ("The submitted code lacked a corresponding test suite"), as the *impact* is the story, not the presumed intent. (learned from `initial-poc`)

- [3] **The "Evidence vs Claims" Investigation Pattern:** When technical reports list security measures or optimizations, always distinguish between stated implementation and demonstrated evidence. "The engineer reports parameterized queries prevent SQL injection" vs "The report shows no code examples verifying parameterized query implementation." (learned from `dashboard-refactor-engineering`)

- [1] **The "Ambiguity Count" Tension Builder:** When reports mention high numbers of resolved ambiguities or decisions, use the specific count as a narrative hook to investigate process quality. "Twenty-seven ambiguities. That's not a handful of minor clarifications. That's a systematic gap between what was requested and what could actually be built." Numbers above 10-15 typically indicate planning gaps worth investigating. (learned from `audio-cast-workflow`)

- [1] **The "Meta-Recursion" Narrative Device:** When analyzing tools that serve the development process itself (like audio cast generation), acknowledge the recursive nature subtly. "There's something almost recursive about this investigation. We're analyzing a report about building tools that convert development reports into audio narratives." This adds depth without becoming overly philosophical. (learned from `audio-cast-workflow`)