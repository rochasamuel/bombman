import { create } from "zustand";
import { prefersReducedMotion, watchReducedMotion } from "../lib/motion";
import { loadPlayerName, loadPrefs, savePrefs, type StoredPrefs } from "../lib/session";

const prefs = loadPrefs();

/** Client-side only. The game state lives on the server and arrives through Colyseus. */
type UiStore = {
  playerName: string;
  soundEnabled: boolean;
  lowMotion: boolean;
  touchPad: StoredPrefs["touchPad"];
  setPlayerName: (name: string) => void;
  toggleSound: () => void;
  setLowMotion: (low: boolean) => void;
  setTouchPad: (mode: StoredPrefs["touchPad"]) => void;
};

export const useUi = create<UiStore>((set, get) => ({
  playerName: loadPlayerName(),
  soundEnabled: true,
  lowMotion: prefs.lowMotion,
  touchPad: prefs.touchPad,
  setPlayerName: (playerName) => set({ playerName }),
  toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),
  setLowMotion: (lowMotion) => {
    set({ lowMotion });
    persist(get());
  },
  setTouchPad: (touchPad) => {
    set({ touchPad });
    persist(get());
  },
}));

const persist = ({ lowMotion, touchPad }: UiStore) => savePrefs({ lowMotion, touchPad });

export const isLowMotion = () => useUi.getState().lowMotion || prefersReducedMotion();

export function syncMotionClass() {
  const apply = () => document.documentElement.classList.toggle("motion-off", isLowMotion());
  apply();
  useUi.subscribe(apply);
  watchReducedMotion(apply);
}
