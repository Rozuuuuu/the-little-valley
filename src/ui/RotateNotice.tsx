import { useEffect, useRef, useState } from 'react';
import type { GameController } from '../engine/GameController';
import { needsLandscape } from './platform';

function upright(): boolean {
  return needsLandscape({ coarse: window.matchMedia?.('(pointer: coarse)').matches ?? false, width: window.innerWidth, height: window.innerHeight });
}

/**
 * Phones and tablets play in landscape. The installed app asks the system to stay sideways;
 * where it can't (iPhone, or a rotation lock that is off), this covers the screen while the
 * device is held upright and pauses the game until it is turned.
 */
export function RotateNotice({ game, playing }: { game: GameController | undefined; playing: boolean }) {
  const [show, setShow] = useState(upright);
  const pausedByUs = useRef(false);

  useEffect(() => {
    const update = () => setShow(upright());
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  // Pause while upright, and resume when turned back (only if this notice paused it).
  useEffect(() => {
    if (!game || !playing) return;
    if (show && !game.paused) {
      game.togglePause();
      pausedByUs.current = true;
    } else if (!show && pausedByUs.current) {
      pausedByUs.current = false;
      if (game.paused) game.togglePause();
    }
  }, [show, game, playing]);

  if (!show) return null;
  return (
    <div className="rotate-notice" role="alertdialog" aria-label="Turn your device sideways">
      <div className="rotate-phone" aria-hidden>
        <i />
      </div>
      <h2>Turn your device sideways</h2>
      <p>Little Valley is played in landscape.</p>
    </div>
  );
}

/** In the installed app, ask the system to keep the screen in landscape (Android honours it). */
export function lockLandscape(): void {
  const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  o?.lock?.('landscape').catch(() => {
    // Not allowed here (iOS, or not full screen): the rotate notice covers it.
  });
}
