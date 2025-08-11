![FeatureCast Header](images/featurecast-header.png)

**Transform dense technical reports into compelling audio narratives**

FeatureCast is an AI-powered investigative journalism agent that converts lengthy engineering reports into NPR-style audio segments. Instead of reading through pages of technical documentation, listen to professionally-narrated summaries that highlight what actually got built versus what was specified.

## The Problem

- Engineering reports are long, dense, and time-consuming to read
- Hard to quickly understand what was actually delivered vs. requirements
- Technical updates pile up faster than you can review them
- Need to consume project updates while multitasking

## The Solution

FeatureCast transforms your technical reports into **investigative audio journalism**:

1. **Comparative Analysis**: Audits engineer reports against original specifications (PRPs)
2. **Narrative Generation**: Creates flowing, NPR-style scripts optimized for audio
3. **Text-to-Speech**: Converts scripts to professional-quality audio segments
4. **Podcast-Style Consumption**: Listen to technical updates like news segments

## How It Works

```
Technical Specification (PRP) ──┐
                                ├─► FeatureCast Agent ──► Audio Script ──► TTS ──► Audio Segment
Engineering Report ─────────────┘
```

The agent doesn't just summarize—it **investigates**:
- Compares what was specified vs. what was delivered
- Identifies gaps, risks, and architectural decisions
- Explains the "so what?" behind technical choices
- Maintains professional skepticism throughout

## Quick Start

### 1. Set Up TTS Server (Wyoming-Piper)

```bash
docker-compose up -d
```

This starts a Wyoming-Piper text-to-speech server for converting scripts to audio.

### 2. Use the FeatureCast Agent

Provide the agent with:
- **Technical Specification (PRP)**: What should have been built
- **Engineer's Report**: What was actually built

The agent will generate an audio script in `feature-caster-agent/system-prompt.md` style.

### 3. Convert to Audio

Send the generated script to your TTS server to create the final audio segment.

## Example Output

Check out `example-output/` to see:
- **`.md` file**: The generated audio script (optimized for speech)
- **`.wav` file**: The final audio segment from TTS

## Agent Features

### Investigative Approach
- Compares specifications against implementation
- Questions claims and identifies evidence gaps
- Explains technical trade-offs and their implications
- Maintains calm, authoritative NPR-style tone

### Audio-Optimized Writing
- No bullet points or headers in output
- Flowing narrative with verbal transitions
- Spelled-out acronyms and technical terms
- Natural speech patterns and pacing

### Learning System
The agent improves over time through `INSIGHTS.md`:
- Captures effective narrative techniques
- Builds a library of proven analogies
- Tracks what communication patterns work best
- Avoids documented anti-patterns

## Repository Structure

```
├── docker-compose.yml              # Wyoming-Piper TTS server setup
├── example-output/                 # Sample script and audio files
├── feature-caster-agent/
│   ├── system-prompt.md           # Complete agent instructions
│   └── INSIGHTS.md                # Learning library for narrative techniques
└── README.md                      # This file
```

## Use Cases

- **Engineering Teams**: Convert sprint reports into listenable updates
- **Technical Leadership**: Stay informed on project progress during commutes
- **Code Reviews**: Transform complex technical analysis into digestible audio
- **Documentation**: Make architectural decisions and trade-offs more accessible
- **Training**: Create audio explanations of technical implementations

## Why Audio?

- **Multitasking**: Listen while commuting, exercising, or doing other work
- **Retention**: Audio narrative often more engaging than dense text
- **Accessibility**: Easier consumption for visual processing fatigue
- **Speed**: Faster than reading, especially for complex technical content
- **Context**: Investigative approach provides deeper understanding than summaries

## Technical Requirements

- **TTS Server**: Wyoming-Piper (included in docker-compose.yml)
- **AI Agent**: Compatible with Claude, GPT-4, or similar language models
- **Input Format**: Technical specifications and engineering reports
- **Output Format**: Markdown scripts + WAV/MP3 audio files

## Contributing

FeatureCast improves through usage and feedback:
- Share effective narrative patterns in `INSIGHTS.md`
- Contribute audio examples from your technical reports
- Suggest improvements to the investigative approach
- Help expand the agent's communication techniques

## License

MIT License - Feel free to adapt for your team's technical communication needs.

---

**Transform your technical documentation from required reading into compelling listening.**
