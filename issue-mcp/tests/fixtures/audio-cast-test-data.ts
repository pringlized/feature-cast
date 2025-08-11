// Test fixtures for audio cast functionality

export const testTranscripts = {
  short: `This is a short test transcript for audio generation.
It contains basic text that should be processed quickly.`,
  
  medium: `# Engineer Agent Report

## Summary
This is a medium-length test transcript simulating an actual agent report.
The implementation phase has been completed successfully with all core features implemented.

## Key Achievements
- Database schema updated
- API endpoints created
- Frontend components integrated
- Test coverage at 85%

## Challenges Faced
During implementation, we encountered some issues with TypeScript types that required
careful resolution. The team worked through these systematically.

## Next Steps
The feature is ready for security review and systems testing.`,
  
  long: Array(100).fill('This is a test sentence. ').join(''),
  
  tooLong: Array(500).fill('This is a very long sentence that exceeds limits. ').join(''),
  
  empty: '',
  
  withSpecialChars: `Test with special characters: <>&"'@#$%^&*(){}[]|\\;:,.?/~\`!
And unicode: 你好世界 🚀 ñ é ü ä ö ß`
};

export const testFeaturePaths = {
  valid: '/planning/projects/planning/milestone-1/sprint-1.3/feature-1.3.3-test',
  invalidTraversal: '/planning/projects/../../../etc/passwd',
  outsideBase: '/home/user/documents/test',
  relative: 'planning/projects/test',
  withSpaces: '/planning/projects/test feature/path'
};

export const testEpisodeNumbers = {
  valid: [1, 2, 99, 1000],
  invalid: [0, -1, -100, 0.5, NaN, Infinity]
};

export const testAgentNames = [
  'engineer',
  'security-analyst',
  'unit-test-developer',
  'systems-tester',
  'requirements-discovery',
  'architect',
  'sprint-planner'
];

// Mock WAV file header (44 bytes) + minimal data
export const mockWavData = Buffer.from([
  // RIFF header
  0x52, 0x49, 0x46, 0x46, // "RIFF"
  0x24, 0x08, 0x00, 0x00, // File size - 8
  0x57, 0x41, 0x56, 0x45, // "WAVE"
  // fmt subchunk
  0x66, 0x6D, 0x74, 0x20, // "fmt "
  0x10, 0x00, 0x00, 0x00, // Subchunk size
  0x01, 0x00,             // Audio format (PCM)
  0x01, 0x00,             // Number of channels (mono)
  0x22, 0x56, 0x00, 0x00, // Sample rate (22050)
  0x44, 0xAC, 0x00, 0x00, // Byte rate
  0x02, 0x00,             // Block align
  0x10, 0x00,             // Bits per sample (16)
  // data subchunk
  0x64, 0x61, 0x74, 0x61, // "data"
  0x00, 0x08, 0x00, 0x00, // Data size
  // Actual audio data (silence)
  ...Array(2048).fill(0x00)
]);

export const mockProcessedWavData = Buffer.concat([
  mockWavData,
  Buffer.from([0xFF, 0xFF]) // Marker to show processing occurred
]);