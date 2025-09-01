import { useEffect, useState } from "react";
import type { Schema } from "../amplify/data/resource";
import { generateClient } from "aws-amplify/data";
import { useAuthenticator } from '@aws-amplify/ui-react';
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { TranscribeStreamingClient, StartStreamTranscriptionCommand, MediaEncoding } from "@aws-sdk/client-transcribe-streaming";
import { fetchAuthSession } from 'aws-amplify/auth';


const client = generateClient<Schema>();

function App() {
  const { user, signOut } = useAuthenticator();
  const [todos, setTodos] = useState<Array<Schema["Todo"]["type"]>>([]);

  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");

  async function startTranscription() {
    try {
      setIsRecording(true);
      setTranscript("");
      
      const session = await fetchAuthSession();
      const transcribe = new TranscribeStreamingClient({
        region: 'us-east-1',
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
        const transcript = event.TranscriptEvent?.Transcript?.Results?.[0]?.Alternatives?.[0]?.Transcript;
        if (transcript) {
          console.log(transcript);
          setTranscript(prev => prev + " " + transcript);
        }
      }
    } catch (error) {
      console.error('Transcription error:', error);
    }
  }

  useEffect(() => {
    client.models.Todo.observeQuery().subscribe({
      next: (data) => setTodos([...data.items]),
    });
  }, []);

  function createTodo() {
    client.models.Todo.create({ content: window.prompt("Todo content") });
  }

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

  return (
    <main>
      <p>Hello {user?.signInDetails?.loginId}!</p>
      <h1>Mündliche Prüfung Simulation</h1>
      <p>
        What to do:  <br></br>
        * Click on the 'create question' button to generate a question and start recording of your answer. <br></br>
        * Speak your answer into the microphone as if you are in the exam. <br></br>
        * Once you are finished answering, click on 'Submit answer'. <br></br>
        * Our AI will review your answer, and provde feedback to you. <br></br> 
      </p>
      <button onClick={startTranscription}>Transcribe</button>

      <p>
        <button onClick={() => speakText('Welche am meisten populäre Restaurationsmöglichkeiten gibt es? Bitte ausreichende Details anzeigen')}>
          🔊 Get question to answer
        </button>
      </p>

      <hr></hr>
      <button onClick={createTodo}>Get question to answer</button>
      <p><b>Question:</b> Welche am meisten populäre Restaurationsmöglichkeiten gibt es?</p>
      <button>Submit answer</button>
      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>{todo.content}</li>
        ))}
      </ul>
      <button onClick={signOut}>Sign out</button>
    </main>
  );
}

export default App;
