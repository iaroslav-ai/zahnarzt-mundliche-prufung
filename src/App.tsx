import { useEffect, useState } from "react";
import type { Schema } from "../amplify/data/resource";
import { generateClient } from "aws-amplify/data";
import { useAuthenticator } from '@aws-amplify/ui-react';

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
