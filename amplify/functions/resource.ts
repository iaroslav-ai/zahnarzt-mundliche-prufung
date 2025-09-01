import { defineFunction } from '@aws-amplify/backend';

export const textToSpeech = defineFunction({
  name: 'text-to-speech',
  entry: './text-to-speech.ts'
});