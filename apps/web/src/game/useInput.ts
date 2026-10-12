import { useCallback, useEffect, useMemo, useRef } from "react";
import { unlockAudio } from "../lib/sound";
import type { RoomActions } from "./useRoomConnection";

/*
 * O direcional. Teclado e toque caem no mesmo lugar: um conjunto de direções
 * apertadas, em ordem de chegada. A que vale é a ÚLTIMA apertada — quem vem
 * segurando "direita" e aperta "cima" quer virar, e soltar "cima" devolve a
 * "direita" que continua segurada.
 */

export type Dir = "up" | "down" | "left" | "right";

const KEYS: Record<string, Dir> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  KeyW: "up",
  KeyS: "down",
  KeyA: "left",
  KeyD: "right",
};

const BOMB_KEYS = new Set(["Space", "Enter", "KeyX", "KeyZ", "KeyJ", "KeyK"]);
/** O controle remoto: detona a remota mais antiga. */
const DETONATE_KEYS = new Set(["KeyB", "ShiftLeft", "ShiftRight"]);

const VECTOR: Record<Dir, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

export type InputControls = {
  press: (dir: Dir) => void;
  release: (dir: Dir) => void;
  bomb: () => void;
  detonate: () => void;
  /** Solta tudo: a aba perdeu o foco, a rodada acabou. */
  clear: () => void;
};

export function useInput(actions: RoomActions, enabled: boolean): InputControls {
  const held = useRef<Dir[]>([]);

  const send = useCallback(() => {
    const top = held.current.at(-1);
    const [dx, dy] = top ? VECTOR[top] : [0, 0];
    actions.input(dx, dy);
  }, [actions]);

  const controls = useMemo<InputControls>(
    () => ({
      press: (dir) => {
        held.current = [...held.current.filter((d) => d !== dir), dir];
        send();
      },
      release: (dir) => {
        held.current = held.current.filter((d) => d !== dir);
        send();
      },
      bomb: () => {
        unlockAudio();
        actions.bomb();
      },
      detonate: () => actions.detonate(),
      clear: () => {
        held.current = [];
        send();
      },
    }),
    [actions, send],
  );

  useEffect(() => {
    if (!enabled) {
      controls.clear();
      return;
    }
    const down = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      const dir = KEYS[event.code];
      if (dir) {
        event.preventDefault();
        if (!event.repeat) controls.press(dir);
        return;
      }
      if (BOMB_KEYS.has(event.code)) {
        event.preventDefault();
        if (!event.repeat) controls.bomb();
        return;
      }
      if (DETONATE_KEYS.has(event.code)) {
        event.preventDefault();
        if (!event.repeat) controls.detonate();
      }
    };
    const up = (event: KeyboardEvent) => {
      const dir = KEYS[event.code];
      if (dir) controls.release(dir);
    };
    const blur = () => controls.clear();
    addEventListener("keydown", down);
    addEventListener("keyup", up);
    addEventListener("blur", blur);
    document.addEventListener("visibilitychange", blur);
    return () => {
      removeEventListener("keydown", down);
      removeEventListener("keyup", up);
      removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", blur);
      controls.clear();
    };
  }, [controls, enabled]);

  return controls;
}
