import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { textToSpeech } from './functions/resource';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';

const backend = defineBackend({
  auth,
  data,
  textToSpeech,
});

// Add Polly permissions to authenticated users
backend.auth.resources.authenticatedUserIamRole.addToPrincipalPolicy(
  new PolicyStatement({
    actions: [
      'polly:SynthesizeSpeech',
      'transcribe:StartStreamTranscription',
      'transcribe:StartStreamTranscriptionWebSocket',
    ],
    resources: ['*'],
  })
);
