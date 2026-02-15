
export interface Personality {
  id: string;
  name: string;
  description: string;
  systemInstruction: string;
  avatar: string;
}

export interface TriviaQuestion {
  question: string;
  answer: string;
  hint: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface PlayerStats {
  name: string;
  avatar: string;
  totalScore: number;
  level: number;
  experience: number;
  gamesPlayed: number;
  lastPlayed: string;
}

export enum GameState {
  LOBBY = 'LOBBY',
  PREPARING = 'PREPARING',
  PLAYING = 'PLAYING',
  FINISHED = 'FINISHED'
}
