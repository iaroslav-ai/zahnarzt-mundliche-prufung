import { useEffect, useState, useRef } from "react";
import { useAuthenticator } from '@aws-amplify/ui-react';
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { TranscribeStreamingClient, StartStreamTranscriptionCommand } from "@aws-sdk/client-transcribe-streaming";
import { fetchAuthSession } from 'aws-amplify/auth';


function App() {
  const initialState = "Generate new question"

  const { user, signOut } = useAuthenticator();
  const [question, setQuestion] = useState("");
  const [transcript, setTranscript] = useState("");
  const [evaluation, setEvaluation] = useState("");
  const [indicator, setIndicator] = useState(initialState);
  const startedRef = useRef(false);

  async function startTranscription() {
    try {
      
      const session = await fetchAuthSession();
      const transcribe = new TranscribeStreamingClient({
        region: 'eu-central-1',
        credentials: session.credentials
      });
  
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new AudioContext({ sampleRate: 16000 });
      const audioInput = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      
      const audioChunks: Int16Array[] = [];
      
      processor.onaudioprocess = (e) => {
        const float32Array = e.inputBuffer.getChannelData(0);
        const int16Array = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
          int16Array[i] = Math.max(-32768, Math.min(32767, Math.floor(float32Array[i] * 32768)));
        }
        audioChunks.push(int16Array);
      };
  
      audioInput.connect(processor);
      processor.connect(audioContext.destination);
  
      // Create streaming generator
      async function* audioStream() {
        while (true) {
          if (audioChunks.length > 0) {
            const chunk = audioChunks.shift()!;
            yield { AudioEvent: { AudioChunk: new Uint8Array(chunk.buffer) } };
          }
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
  
      const command = new StartStreamTranscriptionCommand({
        LanguageCode: 'de-DE',
        MediaEncoding: 'pcm',
        MediaSampleRateHertz: 16000,
        AudioStream: audioStream()
      });
  
      const response = await transcribe.send(command);
      
      for await (const event of response.TranscriptResultStream!) {
        const result = event.TranscriptEvent?.Transcript?.Results?.[0];
        const localTranscript = result?.Alternatives?.[0]?.Transcript;

        if (result?.IsPartial === false) {
          console.log(localTranscript);
          setTranscript(prev => prev + " " + localTranscript);
        }
      }
    } catch (error) {
      console.error('Transcription error:', error);
    }
  }

  useEffect(() => {
    if (user && !startedRef.current) {
      startedRef.current = true;
      startTranscription();
    }
  }, [user]);

  async function speakText(text: string) {
    const session = await fetchAuthSession();
    const polly = new PollyClient({ 
      region: 'us-east-1',
      credentials: session.credentials 
    });
  
    const command = new SynthesizeSpeechCommand({
      Text: text,
      OutputFormat: "mp3",
      VoiceId: "Vicki",
      Engine: "neural"
    });
  
    const response = await polly.send(command);

    if (response.AudioStream) {
      console.log("Got response from Polly")
      const audioBuffer = await response.AudioStream.transformToByteArray();
      const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });
      const audio = new Audio(URL.createObjectURL(audioBlob));
      audio.play();
    } else {
      console.log("Got null response from Polly!")
    }
  }

  async function getNewQuestion() {
    const newQuestion = 'Welche am meisten populäre Restaurationsmöglichkeiten gibt es? Bitte ausreichende Details anzeigen'
    setQuestion(newQuestion)
    setIndicator('Please answer the question')
    setTranscript('')
    setEvaluation('')
    speakText(newQuestion)
  }

  async function submitAnswer() {
    console.log(transcript)
    setTranscript('')
    setQuestion('')
    setIndicator('Question complete, evaluation available.')
    setEvaluation('Examiner evaluation.')
  }

  return (
    <main>
      <p>Hello {user?.signInDetails?.loginId}!</p>
      <h1>Mündliche Prüfung Simulation</h1>
      <p>
        * Speak your answer into the microphone as if you are in the exam. <br></br>
        * Once you are finished answering, click on 'Submit answer'. <br></br>
        * AI will review your answer and provde feedback. <br></br> 
      </p>

      <hr></hr>
      <button onClick={getNewQuestion}>New question</button>

      <p>
      <button disabled={question.length === 0} onClick={() => speakText(question)}>
        🔊 Ask examiner to repeat
      </button>
      </p>

      <p><b>Status: </b> {indicator}</p>
      <button disabled={question.length === 0} onClick={submitAnswer}>Submit</button>
      <hr></hr>
      <button disabled={evaluation.length === 0}>Load evaluation</button>
      <hr></hr>
      <button onClick={signOut}>Sign out</button>
    </main>
  );
}

export default App;
