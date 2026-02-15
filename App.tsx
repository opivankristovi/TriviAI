
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleGenAI, Type, LiveServerMessage, Modality } from '@google/genai';
import { PERSONALITIES, MODELS } from './constants';
import { Personality, GameState, TriviaQuestion, GroundingSource, PlayerStats } from './types';
import { encode, decode, decodeAudioData } from './utils/audio';

const STORAGE_KEY = 'persona-trivia-save-v2';
const XP_PER_LEVEL = 100;
const XP_PER_POINT = 20;

type Language = 'en' | 'nl' | 'fr';

const UI_STRINGS: Record<Language, any> = {
  en: {
    lvl: 'LVL',
    playerLevel: 'Player Level',
    profile: 'PLAYER PROFILE',
    rank: 'Knowledge Seeker',
    score: 'PTS',
    globalScore: 'Global Score',
    xp: 'XP Progress',
    games: 'Games',
    lastPlay: 'Last Play',
    wipe: 'Wipe Data',
    edit: 'Edit Profile',
    cancel: 'Cancel',
    save: 'Save Identity',
    chooseHost: 'Choose Your AI Host',
    hostSub: 'The personality you select will judge your knowledge of 2024-2025.',
    summon: 'Summon Host',
    openingRift: 'Opening Rift...',
    connecting: 'Connecting to the live host entity',
    endSave: 'End & Save',
    micActive: 'Mic Active',
    trials: 'The Trials',
    sessionScore: 'Session Score',
    challenge: 'Challenge',
    namePlaceholder: 'Enter your name...',
    identity: 'CUSTOMIZE YOUR IDENTITY',
    chooseAvatar: 'Choose Avatar'
  },
  nl: {
    lvl: 'NIV',
    playerLevel: 'Spelersniveau',
    profile: 'SPELERSPROFIEL',
    rank: 'Kenniszoeker',
    score: 'PNT',
    globalScore: 'Globale Score',
    xp: 'XP Voortgang',
    games: 'Spellen',
    lastPlay: 'Laatst Gespeeld',
    wipe: 'Gegevens Wissen',
    edit: 'Profiel Bewerken',
    cancel: 'Annuleren',
    save: 'Identiteit Opslaan',
    chooseHost: 'Kies Je AI-Host',
    hostSub: 'De persoonlijkheid die je selecteert zal je kennis van 2024-2025 beoordelen.',
    summon: 'Host Oproepen',
    openingRift: 'Rift Openen...',
    connecting: 'Verbinden met de live host-entiteit',
    endSave: 'Beëindigen & Opslaan',
    micActive: 'Microfoon Actief',
    trials: 'De Beproevingen',
    sessionScore: 'Sessiescore',
    challenge: 'Uitdaging',
    namePlaceholder: 'Voer je naam in...',
    identity: 'PAS JE IDENTITEIT AAN',
    chooseAvatar: 'Kies Avatar'
  },
  fr: {
    lvl: 'NIV',
    playerLevel: 'Niveau du Joueur',
    profile: 'PROFIL DU JOUEUR',
    rank: 'Chercheur de Savoir',
    score: 'PTS',
    globalScore: 'Score Global',
    xp: 'Progression XP',
    games: 'Jeux',
    lastPlay: 'Dernière Session',
    wipe: 'Effacer Données',
    edit: 'Modifier Profil',
    cancel: 'Annuler',
    save: 'Enregistrer Identité',
    chooseHost: 'Choisissez Votre Hôte IA',
    hostSub: 'La personnalité que vous choisirez jugera vos connaissances de 2024-2025.',
    summon: 'Invoquer l\'Hôte',
    openingRift: 'Ouverture de la Faille...',
    connecting: 'Connexion à l\'entité hôte en direct',
    endSave: 'Terminer & Sauver',
    micActive: 'Micro Actif',
    trials: 'Les Épreuves',
    sessionScore: 'Score de Session',
    challenge: 'Défi',
    namePlaceholder: 'Entrez votre nom...',
    identity: 'PERSONNALISEZ VOTRE IDENTITÉ',
    chooseAvatar: 'Choisir Avatar'
  }
};

const PRESET_AVATARS = [
  'https://api.dicebear.com/9.x/avataaars/svg?seed=Felix',
  'https://api.dicebear.com/9.x/avataaars/svg?seed=Aneka',
  'https://api.dicebear.com/9.x/avataaars/svg?seed=John',
  'https://api.dicebear.com/9.x/avataaars/svg?seed=Maria',
  'https://api.dicebear.com/9.x/bottts/svg?seed=Dusty',
  'https://api.dicebear.com/9.x/bottts/svg?seed=Gizmo',
  'https://api.dicebear.com/9.x/pixel-art/svg?seed=Hero',
  'https://api.dicebear.com/9.x/pixel-art/svg?seed=Sidekick'
];

const Header = ({ stats, lang, onLangChange }: { stats: PlayerStats, lang: Language, onLangChange: (l: Language) => void }) => {
  const t = UI_STRINGS[lang];
  return (
    <header className="py-6 px-8 border-b border-white/10 flex justify-between items-center glass sticky top-0 z-50">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-rose-600 rounded-lg flex items-center justify-center shadow-lg shadow-rose-500/20">
            <span className="text-2xl font-bold">Q</span>
          </div>
          <h1 className="text-2xl font-bold font-brand tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
            Persona-Trivia AI
          </h1>
        </div>

        <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
          {(['en', 'nl', 'fr'] as Language[]).map(l => (
            <button
              key={l}
              onClick={() => onLangChange(l)}
              className={`px-3 py-1 rounded-lg text-[10px] font-black transition-all ${lang === l ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden sm:flex flex-col items-end">
          <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{stats.name || 'New Player'}</span>
          <span className="text-sm font-bold text-indigo-400">{t.lvl} {stats.level}</span>
        </div>
        <img 
          src={stats.avatar} 
          alt="Player" 
          className="w-12 h-12 rounded-full border-2 border-indigo-500 shadow-lg object-cover bg-slate-800"
        />
      </div>
    </header>
  );
};

const App: React.FC = () => {
  const [lang, setLang] = useState<Language>('en');
  const [gameState, setGameState] = useState<GameState>(GameState.LOBBY);
  const [personality, setPersonality] = useState<Personality | null>(null);
  const [questions, setQuestions] = useState<TriviaQuestion[]>([]);
  const [sources, setSources] = useState<GroundingSource[]>([]);
  const [currentPoints, setCurrentPoints] = useState(0);
  const [isLive, setIsLive] = useState(false);
  const [transcriptions, setTranscriptions] = useState<string[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  
  const t = UI_STRINGS[lang];

  // Persistent Stats
  const [playerStats, setPlayerStats] = useState<PlayerStats>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : {
      name: 'Brainiac',
      avatar: PRESET_AVATARS[0],
      totalScore: 0,
      level: 1,
      experience: 0,
      gamesPlayed: 0,
      lastPlayed: new Date().toISOString()
    };
  });

  const [editName, setEditName] = useState(playerStats.name);
  const [editAvatar, setEditAvatar] = useState(playerStats.avatar);

  const audioContextRef = useRef<AudioContext | null>(null);
  const outAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesSetRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

  const saveProgress = (newStats: PlayerStats) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newStats));
    setPlayerStats(newStats);
  };

  const handleLevelUp = (pointsEarned: number) => {
    const xpGained = pointsEarned * XP_PER_POINT;
    let newXp = playerStats.experience + xpGained;
    let newLevel = playerStats.level;
    while (newXp >= XP_PER_LEVEL) {
      newXp -= XP_PER_LEVEL;
      newLevel += 1;
    }
    saveProgress({
      ...playerStats,
      totalScore: playerStats.totalScore + pointsEarned,
      level: newLevel,
      experience: newXp,
      gamesPlayed: playerStats.gamesPlayed + 1,
      lastPlayed: new Date().toISOString()
    });
  };

  const fetchTrivia = async (persona: Personality) => {
    setGameState(GameState.PREPARING);
    setIsThinking(true);
    setCurrentPoints(0);
    
    const langNames = { en: 'English', nl: 'Dutch', fr: 'French' };

    try {
      const response = await ai.models.generateContent({
        model: MODELS.SEARCH,
        contents: `Generate 5 challenging trivia questions in ${langNames[lang]} about current world events or weird science (2024-2025). 
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
      setGameState(GameState.PLAYING);
      startLiveSession(persona, parsedQuestions);
    } catch (error) {
      console.error("Failed to fetch trivia:", error);
      setGameState(GameState.LOBBY);
    } finally {
      setIsThinking(false);
    }
  };

  const startLiveSession = async (persona: Personality, qSet: TriviaQuestion[]) => {
    if (!ai) return;

    const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    audioContextRef.current = inputCtx;
    outAudioContextRef.current = outputCtx;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const langNames = { en: 'English', nl: 'Dutch', fr: 'French' };
    
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
          if (message.serverContent?.outputTranscription) {
            const text = message.serverContent.outputTranscription.text;
            setTranscriptions(prev => [...prev.slice(-12), `Host: ${text}`]);
            if (text.toLowerCase().includes("correct") || text.toLowerCase().includes("juist") || text.toLowerCase().includes("correcte")) {
              setCurrentPoints(p => Math.min(5, p + 1));
            }
          } else if (message.serverContent?.inputTranscription) {
            const text = message.serverContent.inputTranscription.text;
            setTranscriptions(prev => [...prev.slice(-12), `You: ${text}`]);
          }

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
            sourcesSetRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
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
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: persona.id === 'demonic-robot' ? 'Fenrir' : persona.id === 'flirty-host' ? 'Kore' : 'Zephyr'
            }
          }
        },
        systemInstruction: `
          ${persona.systemInstruction}
          
          LANGUAGE REQUIREMENT:
          Speak ONLY in ${langNames[lang]}. This is non-negotiable.
          
          GAME CONTEXT:
          You are hosting for player: ${playerStats.name}. 
          Questions provided: ${JSON.stringify(qSet)}
          
          SPECIFIC BEHAVIOR RULES:
          1. Greet the user by name (${playerStats.name}) in ${langNames[lang]}.
          2. Present questions one by one.
          3. If correct, clearly say "Correct" in ${langNames[lang]}.
          4. Total questions: 5. 
          5. After 5 questions, clearly state that the game is over.
        `,
      }
    });
    sessionRef.current = await sessionPromise;
  };

  const finishGame = () => {
    handleLevelUp(currentPoints);
    cleanup();
  };

  const cleanup = () => {
    if (sessionRef.current) sessionRef.current.close();
    if (audioContextRef.current) audioContextRef.current.close();
    if (outAudioContextRef.current) outAudioContextRef.current.close();
    setIsLive(false);
    setGameState(GameState.LOBBY);
    setTranscriptions([]);
  };

  const resetProgress = () => {
    if (confirm("Are you sure?")) {
      const initial = {
        name: 'New Player',
        avatar: PRESET_AVATARS[0],
        totalScore: 0,
        level: 1,
        experience: 0,
        gamesPlayed: 0,
        lastPlayed: new Date().toISOString()
      };
      saveProgress(initial);
      setEditName(initial.name);
      setEditAvatar(initial.avatar);
    }
  };

  const saveProfile = () => {
    saveProgress({ ...playerStats, name: editName, avatar: editAvatar });
    setIsEditingProfile(false);
  };

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-1000 ${personality?.id === 'demonic-robot' ? 'bg-red-950/20' : personality?.id === 'flirty-host' ? 'bg-pink-950/10' : ''}`}>
      <Header stats={playerStats} lang={lang} onLangChange={setLang} />
      
      <main className="flex-1 flex flex-col container mx-auto px-4 py-8">
        {gameState === GameState.LOBBY && (
          <div className="flex-1 flex flex-col items-center justify-start max-w-6xl mx-auto w-full">
            
            <div className="w-full glass rounded-[2.5rem] p-8 mb-12 flex flex-col md:flex-row items-center gap-8 border-white/5 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4">
                <button 
                  onClick={() => setIsEditingProfile(!isEditingProfile)}
                  className="px-4 py-2 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 text-xs font-bold transition-all border border-indigo-500/30"
                >
                  {isEditingProfile ? t.cancel : t.edit}
                </button>
              </div>

              {!isEditingProfile ? (
                <>
                  <div className="relative group">
                    <img src={playerStats.avatar} alt="Avatar" className="w-32 h-32 rounded-full border-4 border-indigo-500 shadow-xl object-cover bg-slate-800" />
                    <div className="absolute -bottom-2 -right-2 bg-indigo-500 text-[10px] font-black px-3 py-1 rounded-full border-2 border-[#0f172a]">{t.lvl} {playerStats.level}</div>
                  </div>
                  
                  <div className="flex-1 w-full space-y-4">
                    <div className="flex justify-between items-end">
                      <div>
                        <h2 className="text-3xl font-black font-brand tracking-tight">{playerStats.name.toUpperCase()}</h2>
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Rank: {t.rank}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-indigo-400 font-black text-xl">{playerStats.totalScore} {t.score}</p>
                        <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{t.globalScore}</p>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] font-black uppercase text-slate-400 tracking-tighter">
                        <span>{t.xp}</span>
                        <span>{playerStats.experience} / {XP_PER_LEVEL} XP</span>
                      </div>
                      <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden border border-white/5">
                        <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-1000" style={{ width: `${(playerStats.experience / XP_PER_LEVEL) * 100}%` }}></div>
                      </div>
                    </div>

                    <div className="flex gap-8 pt-2 items-center">
                      <div>
                        <p className="text-lg font-bold">{playerStats.gamesPlayed}</p>
                        <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">{t.games}</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold">{new Date(playerStats.lastPlayed).toLocaleDateString()}</p>
                        <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">{t.lastPlay}</p>
                      </div>
                      <button onClick={resetProgress} className="ml-auto text-slate-600 hover:text-red-500 text-[10px] font-black uppercase transition-colors">{t.wipe}</button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="w-full space-y-6">
                  <h3 className="text-xl font-bold font-brand tracking-tighter">{t.identity}</h3>
                  <div className="flex flex-col md:flex-row gap-8">
                    <div className="space-y-4 flex-1">
                      <label className="block text-xs font-black text-slate-500 uppercase tracking-widest">Player Name</label>
                      <input 
                        type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                        placeholder={t.namePlaceholder}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-4">{t.chooseAvatar}</label>
                      <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
                        {PRESET_AVATARS.map((url, i) => (
                          <button key={i} onClick={() => setEditAvatar(url)} className={`relative rounded-full overflow-hidden w-10 h-10 border-2 transition-all bg-slate-800 ${editAvatar === url ? 'border-indigo-500 scale-110 shadow-lg' : 'border-transparent opacity-50 hover:opacity-100'}`}>
                            <img src={url} className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <button onClick={saveProfile} className="bg-indigo-600 hover:bg-indigo-500 px-8 py-3 rounded-xl font-bold transition-all shadow-lg">{t.save}</button>
                    <button onClick={() => setIsEditingProfile(false)} className="bg-white/5 hover:bg-white/10 px-8 py-3 rounded-xl font-bold transition-all border border-white/10">{t.cancel}</button>
                  </div>
                </div>
              )}
            </div>

            <h2 className="text-4xl md:text-5xl font-bold font-brand text-center mb-4 text-white">{t.chooseHost}</h2>
            <p className="text-slate-400 text-center mb-12 text-lg">{t.hostSub}</p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full">
              {PERSONALITIES.map((p) => (
                <button
                  key={p.id} onClick={() => { setPersonality(p); fetchTrivia(p); }}
                  className={`glass p-8 rounded-[2rem] text-left hover:bg-white/10 transition-all group border-2 border-transparent hover:border-indigo-500/50 flex flex-col h-full ${p.id === 'demonic-robot' ? 'hover:border-red-600/50' : p.id === 'flirty-host' ? 'hover:border-pink-500/50' : ''}`}
                >
                  <div className="relative mb-6">
                    <img src={p.avatar} alt={p.name} className="w-full aspect-square rounded-2xl object-cover shadow-2xl group-hover:scale-[1.02] transition-transform" />
                  </div>
                  <h3 className="text-2xl font-bold mb-2 group-hover:text-indigo-400 uppercase tracking-tighter">{p.name}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed flex-1">{p.description}</p>
                  <div className={`mt-6 flex items-center gap-2 font-bold text-sm ${p.id === 'demonic-robot' ? 'text-red-500' : p.id === 'flirty-host' ? 'text-pink-400' : 'text-indigo-400'}`}>
                    {t.summon} <span className="group-hover:translate-x-1 transition-transform">→</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {gameState === GameState.PREPARING && (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="relative">
               <div className={`w-32 h-32 border-4 border-white/5 border-t-indigo-500 rounded-full animate-spin ${personality?.id === 'demonic-robot' ? 'border-t-red-600' : personality?.id === 'flirty-host' ? 'border-t-pink-500' : ''}`}></div>
            </div>
            <h2 className="text-3xl font-bold mt-12 animate-pulse text-white font-brand uppercase tracking-tighter">{t.openingRift}</h2>
            <p className="text-slate-400 mt-2">{t.connecting}</p>
          </div>
        )}

        {gameState === GameState.PLAYING && (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-8 space-y-6">
              <div className="glass rounded-[3rem] p-8 md:p-12 relative overflow-hidden border-white/5 shadow-2xl">
                <div className={`absolute -top-24 -right-24 w-96 h-96 blur-[120px] rounded-full ${personality?.id === 'demonic-robot' ? 'bg-red-900/30' : personality?.id === 'flirty-host' ? 'bg-pink-600/20' : 'bg-indigo-600/20'}`}></div>
                <div className="relative z-10 flex flex-col items-center text-center">
                  <div className="mb-8 relative group">
                    <img src={personality?.avatar} alt="Host" className={`w-52 h-52 rounded-full border-8 border-white/5 object-cover shadow-2xl transition-all duration-500 ${isLive ? 'pulse-glow' : ''}`} />
                    {isLive && <div className={`absolute -bottom-2 right-4 text-white text-xs font-black px-4 py-1.5 rounded-full animate-pulse shadow-xl ${personality?.id === 'demonic-robot' ? 'bg-red-600' : personality?.id === 'flirty-host' ? 'bg-pink-500' : 'bg-indigo-600'}`}>LIVE</div>}
                  </div>
                  <h3 className="text-4xl font-black mb-6 font-brand tracking-tight uppercase">{personality?.name}</h3>
                  <div className="w-full h-64 bg-black/40 rounded-[2rem] p-8 overflow-y-auto text-left space-y-6 font-mono text-sm scrollbar-hide border border-white/5">
                    {transcriptions.map((t, i) => (
                      <div key={i} className={`flex flex-col ${t.startsWith('You:') ? 'items-end' : 'items-start'}`}>
                        <span className={`text-[10px] uppercase font-bold tracking-widest mb-1 ${t.startsWith('You:') ? 'text-indigo-400' : 'text-slate-500'}`}>
                          {t.startsWith('You:') ? playerStats.name : 'Host'}
                        </span>
                        <div className={`px-4 py-3 rounded-2xl max-w-[85%] ${t.startsWith('You:') ? 'bg-indigo-600/20 text-indigo-100' : 'bg-white/5 text-slate-200'}`}>
                          {t.replace(/^(Host:|You:)\s*/, '')}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-8 flex gap-4 w-full max-w-md">
                    <button onClick={finishGame} className="flex-1 py-4 bg-white/5 hover:bg-white/10 rounded-2xl font-bold transition-all border border-white/5 text-slate-400 uppercase tracking-tighter">{t.endSave}</button>
                    <div className={`flex-[2] flex items-center justify-center gap-3 rounded-2xl py-4 shadow-xl ${personality?.id === 'demonic-robot' ? 'bg-red-700' : personality?.id === 'flirty-host' ? 'bg-pink-600' : 'bg-indigo-600'}`}>
                      <span className="font-black uppercase tracking-tighter">{t.micActive}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-4 space-y-6">
              <div className="glass rounded-[2rem] p-6 border-white/5">
                <h4 className="text-lg font-black mb-6 font-brand flex items-center gap-2 uppercase tracking-tighter">{t.trials}</h4>
                <div className="space-y-4">
                  {questions.map((q, i) => (
                    <div key={i} className="p-5 rounded-2xl bg-white/5 border border-white/5">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{t.challenge} {i + 1}</p>
                      <p className="text-sm text-slate-300 leading-relaxed font-medium">{q.question}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className={`rounded-[2rem] p-8 shadow-2xl transition-colors duration-500 ${personality?.id === 'demonic-robot' ? 'bg-red-900/40 border border-red-600/20' : personality?.id === 'flirty-host' ? 'bg-pink-900/40 border border-pink-500/20' : 'bg-indigo-600 border border-white/10'}`}>
                 <p className="text-white/40 text-xs font-black uppercase tracking-[0.2em]">{t.sessionScore}</p>
                 <div className="flex items-baseline gap-2">
                    <p className="text-7xl font-black mt-2 tracking-tighter">{currentPoints}</p>
                    <p className="text-white/20 text-xl font-bold italic">/ 5</p>
                 </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="py-8 px-8 text-center text-slate-600 text-[10px] font-black uppercase tracking-[0.3em] glass border-t border-white/5">
        &copy; 2025 Persona-Trivia AI // {playerStats.name} // {lang.toUpperCase()}
      </footer>
    </div>
  );
};

export default App;
