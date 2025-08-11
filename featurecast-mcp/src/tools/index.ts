// Tool Registry - Audio Cast Only
import { createAudioCastTool } from './generate-audio-cast';

export function getAllTools() {
  return [
    createAudioCastTool()
  ];
}

export {
  createAudioCastTool
};