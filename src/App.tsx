import { useEffect, useState, useRef } from "react";
import { useAuthenticator } from '@aws-amplify/ui-react';
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { fetchAuthSession } from 'aws-amplify/auth';
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import data from './questions.json'


function App() {
  const initialState = "Generate new question"

  const { user, signOut } = useAuthenticator();
  const [ question, setQuestion ] = useState("");
  const [ answer, setAnswer ] = useState("");
  const [ conversation, setConversation ] = useState("");
  const [ transcript, setTranscript ] = useState("");
  const [ evaluation, setEvaluation ] = useState("Evaluation will appear here.");
  const [ indicator, setIndicator ] = useState(initialState);
  const [ context, setContext ] = useState("");
  const [ reference, setReference ] = useState("");
  const startedRef = useRef(false);

  const recognitionRef = useRef<any>(null);

  const transcribeNotice = "Very important: dentist responses text was obtained using Amazon Transcribe from audio of dentist speaking. Some of the text may not be correctly interpreted from the audio - e.g. 'Gengiva' can become 'mir gegenüber', please ignore such parts. Please if the sentence looks weird with out of context words, try to see if it can be explained by bad transcription.";

  async function callBedrock(prompt: string, modelId = 'eu.anthropic.claude-sonnet-4-20250514-v1:0') {
    console.log(prompt)

    const session = await fetchAuthSession();
    const bedrock = new BedrockRuntimeClient({
      region: 'eu-central-1',
      credentials: session.credentials
    });
  
    const command = new ConverseCommand({
      modelId: modelId,
      messages: [
        {
          role: "user",
          content: [{ text: prompt }]
        }
      ],
      inferenceConfig: {
        maxTokens: 4000,
      }
    });
  
    const response = await bedrock.send(command);
    console.log(response)
    return response.output?.message?.content?.[0]?.text || '';
  }

  function parseAnswerTag(feedback: string): string {
    const match = feedback.match(/<answer>(.*?)<\/answer>/s);
    return match ? match[1].trim() : '';
  }   

  async function examinerNextAction(convo: string, examiner_question: string, student_response: string, context: string, reference: string) {
    const feedback = await callBedrock(`
You are a German professor who conducts an oral approbation exam for a dentist from another country, who wants to get permit to work in Germany.
Your task is to ensure that the dentist has knowledge that matches knowledge of German dentist.
You had this conversation with the foreign dentist: 
<conversation>
${convo}
</conversation>
After this conversation, you asked this to the foreign dentist:
<question>
${examiner_question}
</question>
The dentist's response was:
<dentist_response>
${student_response}
</dentist_response>
Your task is to decide if you want to ask a follow up question or not. 

Your follow up question - if you decide to ask it - should be STRICTLY based on information given in this excerpt from authoritative teaching material for dentists:
<authoritative_source_excerpt>
${context}
</authoritative_source_excerpt>
In particular, you originally wanted to focus on this subset:
<focused_excerpt>
${reference}
</focused_excerpt>

You should ask a follow up questions if you think that will help you gauge how well does the dentist responds.
That could happen for example if you feel the question was too easy for the dentist, or too hard.

Strictly avoid asking more than 2 follow up questions to the dentist as you do not have much time for the exam, and there is lots to cover. Your main intent was to ask about information that is given in the <focused_excerpt> text. If that is well covered by the student, you can maybe ask one question to challenge the student, or you can also skip - choose at random for good coverage case.

Strictly base your questions only on information in <authoritative_source_excerpt> tag. You want to ensure that you base your question on authoritative information in the excerpt, to avoid hallucinating information that is outside of this excerpt. 

Ask any (follow up) questions in a way that does not hint at an answer. You should not implicitly help dentist pass the exam.

First, I want you to think through in <think> tag reasons to ask follow up questions, and reasons not to. Then, I want you to brainstorm what follow up questions you may ask. 

Then produce result in <answer> tag. Produce answer tag with empty content (<answer></answer>) if you do not want to ask any follow up questions. Otherwise put the follow up question in <answer> tag. 

Be sure to provide any communications in German in your answer.
${transcribeNotice}
  `);
      console.log(`Feedback output: ${feedback}`);
      return parseAnswerTag(feedback);
  }

  async function launchTextToSpeech() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR();
    recognitionRef.current = rec;

    rec.lang = "de-DE";
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (e) => {
      const newTranscript = [...e.results].map(r => r[0].transcript).join(" ");
      setTranscript(newTranscript);
    };
    rec.onend = () => {
      if (recognitionRef.current !== null) {
        submitAnswer()
      }
    };
    rec.start();
  }

  useEffect(() => {
    if (user && !startedRef.current) {
      startedRef.current = true;
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

      audio.onended = () => {
        launchTextToSpeech();
      };

      audio.play();
    } else {
      console.log("Got null response from Polly!")
    }
  }

  async function getNewQuestion() {
    const selectData = data[Math.floor(Math.random() * data.length)];        
    const examinerQuestion = selectData['question']
    
    console.log(selectData)

    setQuestion(examinerQuestion)
    setContext(selectData['context'])
    setAnswer(selectData['answer'])
    setReference(selectData['reference'])
    
    setIndicator('Please answer the question')
    setTranscript('')
    setEvaluation('')
    setConversation('')

    speakText(examinerQuestion)
  }

  async function submitAnswer() {
    if (recognitionRef.current) {
      const currentaudio = recognitionRef.current
      recognitionRef.current = null;
      currentaudio.stop();
    }

    console.log(transcript)

    setQuestion('')
    setIndicator('Deciding next action...')

    const followup = await examinerNextAction(
      conversation,
      question,
      transcript,
      context,
      reference
    )

    console.log(`Got follow up: ${followup}`)

    const updatedConversation = conversation + '\n\n' + `Examiner: ${question}\n\nDentist: ${transcript}`;
    setConversation(updatedConversation);
    setQuestion(followup)

    if (followup.length > 0) {
      setIndicator('Please answer the follow up question')
      setTranscript('')
      setEvaluation('')
      speakText(followup)
    } else {
      setIndicator('Evaluating response...')
      const aiEval = await callBedrock(`
You are a professor of dentistry in Germany. You are evaluating in an oral exam a foreign dentist if that dentist has knowledge that matches that of a dentistry school student at the time of graduation. You had the following conversation with the student: 
<conversation>
${updatedConversation}
</conversation>
You have some materials available for you to evaluate the dentist:
<evaluation_materials>
${context}
</evaluation_materials>

I want you to first think in <think> tag if the dentist has knowledge that matches that of equivalent German dentist at time of university graduation. Think through what were strong parts of dentist response, and what could be improved. See if there are some patterns in dentist response that indicate systemic issues.

Trust information in <evaluation_materials> more than 

Then I want you to produce <evaluation> tag, where you should provide details to the student where answer of student was not sufficient. I want you to cite exact statement / sentence that student said, and provide information on how that statement should be changed to be correct or be improved. Please keep evaluation concise and to the point.

Finally, I want you to output <pass_mark> tag, where you can specify two values: PASS or FAIL, which indicates if student answer at the level of a German student or not. 

Provide all communications in German.
${transcribeNotice}
`
      );
      console.log(`Evaluatoin output: ${aiEval}`);
      setIndicator('Question complete, evaluation available.')
      setEvaluation(aiEval)
      setTranscript('')
    }
  }

  return (
    <main>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p>Hello {user?.signInDetails?.loginId}!</p>
        <a onClick={signOut} href="#">Sign out</a>
      </div>

      <h1>Mündliche Prüfung Simulation</h1>
      <p>
        Speak your answer into the microphone as if you are in the exam. Once you are finished answering, click on 'Submit answer'. AI will review your answer and provde feedback. <br></br> 
      </p>

      <hr></hr>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
        <button onClick={getNewQuestion}>New question</button>
        <button disabled={question.length === 0} onClick={() => speakText(question)}> 🔊 Ask examiner to repeat </button>
        <button disabled={question.length === 0} onClick={submitAnswer}>Submit</button>
      </div>
      
      <br></br>

      <details>
        <summary>Question</summary> {question}
      </details>

      <details>
        <summary>Example answer</summary> {answer}
      </details>

      <details>
        <summary>Transcript, length: {transcript.length} </summary> {transcript}
      </details>

      <details>
        <summary>Reference information</summary> {reference}
      </details>

      <details>
        <summary>Context information</summary> {context}
      </details>

      <p><b>Status: </b> {indicator} </p>
      <hr></hr>

      <details>
        <summary>Conversation</summary>
        <p style={{whiteSpace: 'pre-wrap'}}>
          {conversation}
        </p>
      </details>

      <p style={{whiteSpace: 'pre-wrap'}}>
        {evaluation}
      </p>

    </main>
  );
}

export default App;
