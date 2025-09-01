import { useEffect, useState } from "react";
import type { Schema } from "../amplify/data/resource";
import { generateClient } from "aws-amplify/data";
import { useAuthenticator } from '@aws-amplify/ui-react';
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { fetchAuthSession } from 'aws-amplify/auth';


const client = generateClient<Schema>();

function App() {
  const { user, signOut } = useAuthenticator();
  const [todos, setTodos] = useState<Array<Schema["Todo"]["type"]>>([]);

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
    
    console.log("Got response from Polly")

    // Fix: Convert stream to array buffer first
    const audioStream = response.AudioStream;
    const audioBuffer = await audioStream?.transformToByteArray();
    const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });
    
    const audio = new Audio(URL.createObjectURL(audioBlob));
    audio.play();
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

      <p>
        <button onClick={() => speakText('Welche am meisten populäre Restaurationsmöglichkeiten gibt es?')}>
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
