
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleGenAI, Type, LiveServerMessage, Modality } from '@google/genai';
import { PERSONALITIES, MODELS } from './constants';
import { Personality, GameState, TriviaQuestion, GroundingSource } from './types';
import { encode, decode, decodeAudioData } from './utils/audio';

// UI Components
const Header = () => (
  <header className="py-6 px-8 border-b border-white/10 flex justify-between items-center glass sticky top-0 z-50">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
        <span className="text-2xl font-bold">Q</span>
      </div>
      <h1 className="text-2xl font-bold font-brand tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
        Persona-Trivia AI
      </h1>
    </div>
  </header>
);

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.LOBBY);
  const [personality, setPersonality] = useState<Personality | null>(null);
  const [questions, setQuestions] = useState<TriviaQuestion[]>([]);
  const [sources, setSources] = useState<GroundingSource[]>([]);
  const [score, setScore] = useState(0);
  const [isLive, setIsLive] = useState(false);
  const [transcriptions, setTranscriptions] = useState<string[]>([]);
  const [isThinking, setIsThinking] = useState(false);

  // Audio Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const outAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesSetRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

  // 1. Fetch Trivia Questions using Search Grounding
  const fetchTrivia = async (persona: Personality) => {
    setGameState(GameState.PREPARING);
    setIsThinking(true);
    try {
      const response = await ai.models.generateContent({
        model: MODELS.SEARCH,
        contents: `Generate 5 challenging trivia questions about current pop culture, science, and world events (2024-2025). 
                   Format strictly as a JSON array of objects with 'question', 'answer', and 'hint'.`,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                answer: { type: Type.STRING },
                hint: { type: Type.STRING }
              },
              required: ['question', 'answer', 'hint']
            }
          }
        },
      });

      const parsedQuestions = JSON.parse(response.text || '[]');
      setQuestions(parsedQuestions);
      
      const grounding = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (grounding) {
        const extractedSources: GroundingSource[] = grounding
          .map((chunk: any) => chunk.web)
          .filter((web: any) => !!web)
          .map((web: any) => ({ title: web.title, uri: web.uri }));
        setSources(extractedSources);
      }
      
      setGameState(GameState.PLAYING);
      startLiveSession(persona, parsedQuestions);
    } catch (error) {
      console.error("Failed to fetch trivia:", error);
      setGameState(GameState.LOBBY);
    } finally {
      setIsThinking(false);
    }
  };

  // 2. Start Live Conversation
  const startLiveSession = async (persona: Personality, qSet: TriviaQuestion[]) => {
    if (!ai) return;

    const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    audioContextRef.current = inputCtx;
    outAudioContextRef.current = outputCtx;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    const sessionPromise = ai.live.connect({
      model: MODELS.LIVE,
      callbacks: {
        onopen: () => {
          setIsLive(true);
          const source = inputCtx.createMediaStreamSource(stream);
          const processor = inputCtx.createScriptProcessor(4096, 1, 1);
          
          processor.onaudioprocess = (e) => {
            const data = e.inputBuffer.getChannelData(0);
            const l = data.length;
            const int16 = new Int16Array(l);
            for (let i = 0; i < l; i++) int16[i] = data[i] * 32768;
            
            const pcmBlob = {
              data: encode(new Uint8Array(int16.buffer)),
              mimeType: 'audio/pcm;rate=16000',
            };
            
            sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
          };
          
          source.connect(processor);
          processor.connect(inputCtx.destination);
        },
        onmessage: async (message: LiveServerMessage) => {
          // Handle transcriptions
          if (message.serverContent?.outputTranscription) {
            const text = message.serverContent.outputTranscription.text;
            setTranscriptions(prev => [...prev.slice(-10), `Host: ${text}`]);
          } else if (message.serverContent?.inputTranscription) {
            const text = message.serverContent.inputTranscription.text;
            setTranscriptions(prev => [...prev.slice(-10), `You: ${text}`]);
          }

          // Handle Audio
          const audioBase64 = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
          if (audioBase64) {
            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
            const audioBuffer = await decodeAudioData(decode(audioBase64), outputCtx, 24000, 1);
            const sourceNode = outputCtx.createBufferSource();
            sourceNode.buffer = audioBuffer;
            sourceNode.connect(outputCtx.destination);
            sourceNode.start(nextStartTimeRef.current);
            nextStartTimeRef.current += audioBuffer.duration;
            sourcesSetRef.current.add(sourceNode);
            sourceNode.onended = () => sourcesSetRef.current.delete(sourceNode);
          }

          if (message.serverContent?.interrupted) {
            sourcesSetRef.current.forEach(s => s.stop());
            sourcesSetRef.current.clear();
            nextStartTimeRef.current = 0;
          }
        },
        onerror: (e) => console.error("Live Error:", e),
        onclose: () => setIsLive(false),
      },
      config: {
        responseModalities: [Modality.AUDIO],
        outputAudioTranscription: {},
        inputAudioTranscription: {},
        systemInstruction: `
          ${persona.systemInstruction}
          
          GAME CONTEXT:
          You are hosting a trivia session. 
          Here are the questions you must use: ${JSON.stringify(qSet)}
          
          RULES:
          1. Greet the user and ask the first question.
          2. Wait for their answer.
          3. If they are correct, congratulate them and increment their "mental score" (you don't have to manage state, just acknowledge).
          4. If they struggle, offer the hint.
          5. Proceed through all 5 questions.
          6. After 5 questions, wrap up the game.
          
          KEEP CONVERSATION NATURAL AND LIVE.
        `,
      }
    });

    sessionRef.current = await sessionPromise;
  };

  const cleanup = () => {
    if (sessionRef.current) sessionRef.current.close();
    if (audioContextRef.current) audioContextRef.current.close();
    if (outAudioContextRef.current) outAudioContextRef.current.close();
    setIsLive(false);
    setGameState(GameState.LOBBY);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 flex flex-col container mx-auto px-4 py-8">
        {gameState === GameState.LOBBY && (
          <div className="flex-1 flex flex-col items-center justify-center max-w-4xl mx-auto w-full">
            <h2 className="text-4xl md:text-5xl font-bold font-brand text-center mb-4 text-white">
              Choose Your AI Host
            </h2>
            <p className="text-slate-400 text-center mb-12 text-lg">
              Select a personality to start your interactive trivia adventure.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
              {PERSONALITIES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setPersonality(p);
                    fetchTrivia(p);
                  }}
                  className="glass p-8 rounded-3xl text-left hover:bg-white/10 transition-all group border-transparent hover:border-indigo-500/50 border flex flex-col h-full"
                >
                  <img src={p.avatar} alt={p.name} className="w-20 h-20 rounded-2xl mb-6 object-cover shadow-2xl group-hover:scale-105 transition-transform" />
                  <h3 className="text-2xl font-bold mb-2 group-hover:text-indigo-400">{p.name}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed flex-1">{p.description}</p>
                  <div className="mt-6 flex items-center gap-2 text-indigo-400 font-semibold text-sm">
                    Select Persona <span className="group-hover:translate-x-1 transition-transform">→</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {gameState === GameState.PREPARING && (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="relative">
               <div className="w-24 h-24 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
               <div className="absolute inset-0 flex items-center justify-center">
                 <div className="w-12 h-12 bg-indigo-500/20 rounded-full animate-pulse"></div>
               </div>
            </div>
            <h2 className="text-2xl font-bold mt-8 animate-pulse text-indigo-400">Consulting the Knowledge Oracles...</h2>
            <p className="text-slate-400 mt-2">Using Google Search to fetch the latest trivia</p>
          </div>
        )}

        {gameState === GameState.PLAYING && (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Host Section */}
            <div className="lg:col-span-8 space-y-6">
              <div className="glass rounded-[2.5rem] p-8 md:p-12 relative overflow-hidden">
                {/* Decorative backgrounds */}
                <div className="absolute -top-24 -right-24 w-64 h-64 bg-indigo-600/20 blur-[100px] rounded-full"></div>
                <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-purple-600/20 blur-[100px] rounded-full"></div>
                
                <div className="relative z-10 flex flex-col items-center text-center">
                  <div className="mb-8 relative">
                    <img 
                      src={personality?.avatar} 
                      alt="Host" 
                      className={`w-40 h-40 rounded-full border-4 border-white/10 object-cover shadow-2xl ${isLive ? 'pulse-glow ring-4 ring-indigo-500/50' : ''}`} 
                    />
                    {isLive && (
                      <div className="absolute -bottom-2 right-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                        <div className="w-1.5 h-1.5 bg-white rounded-full"></div> LIVE
                      </div>
                    )}
                  </div>
                  
                  <h3 className="text-3xl font-bold mb-4 font-brand">{personality?.name}</h3>
                  <div className="w-full h-48 bg-black/30 rounded-2xl p-6 overflow-y-auto text-left space-y-4 font-mono text-sm scrollbar-hide">
                    {transcriptions.length === 0 && (
                      <p className="text-slate-500 italic">Waiting for host to speak...</p>
                    )}
                    {transcriptions.map((t, i) => (
                      <div key={i} className={`${t.startsWith('You:') ? 'text-indigo-400 text-right' : 'text-slate-200'}`}>
                        {t}
                      </div>
                    ))}
                  </div>

                  <div className="mt-8 flex gap-4 w-full">
                    <button 
                      onClick={cleanup}
                      className="flex-1 py-4 bg-white/5 hover:bg-white/10 rounded-2xl font-bold transition-all border border-white/5"
                    >
                      Quit Game
                    </button>
                    <div className="flex-1 flex items-center justify-center gap-3 bg-indigo-600 rounded-2xl py-4 shadow-lg shadow-indigo-500/20">
                      <div className="w-2 h-2 bg-white rounded-full animate-bounce"></div>
                      <span className="font-bold">Listening...</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Information grounding sources */}
              {sources.length > 0 && (
                <div className="glass rounded-3xl p-6">
                  <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Verification Sources</h4>
                  <div className="flex flex-wrap gap-3">
                    {sources.map((s, idx) => (
                      <a 
                        key={idx} 
                        href={s.uri} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-xs bg-white/5 hover:bg-white/10 px-4 py-2 rounded-full border border-white/5 transition-colors flex items-center gap-2"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        {s.title}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Questions List (for user reference) */}
            <div className="lg:col-span-4 space-y-6">
              <div className="glass rounded-3xl p-6">
                <h4 className="text-lg font-bold mb-4 font-brand flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Current Challenge
                </h4>
                <div className="space-y-4">
                  {questions.map((q, i) => (
                    <div key={i} className="p-4 rounded-xl bg-white/5 border border-white/5">
                      <p className="text-sm font-medium text-slate-300">Question {i + 1}</p>
                      <p className="text-xs text-slate-500 line-clamp-2 mt-1">{q.question}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-indigo-600 rounded-3xl p-6 shadow-xl">
                 <p className="text-white/60 text-sm font-bold uppercase tracking-widest">Scoreboard</p>
                 <p className="text-5xl font-black mt-1">{score}</p>
                 <p className="text-white/60 text-xs mt-2 italic">Speak to the host to answer!</p>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="py-6 px-8 text-center text-slate-500 text-sm glass">
        Powered by Gemini 2.5 Live & Google Search Grounding
      </footer>
    </div>
  );
};

export default App;
