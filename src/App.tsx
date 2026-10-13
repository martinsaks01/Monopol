import { Suspense, lazy, useEffect, useState } from 'react';
import { useStore } from './store/store';
import { initAudio } from './store/director';
import { ProfileScreen, SetupScreen, StartScreen } from './ui/Screens';
import { Hud } from './ui/Hud';
import { Modals } from './ui/Modals';

// 3D-scenen lastes først når den trengs, så menyen åpner raskt
const GameScene = lazy(() => import('./scene/GameScene').then((m) => ({ default: m.GameScene })));

function Toasts() {
  const toasts = useStore((st) => st.toasts);
  const screen = useStore((st) => st.screen);
  if (screen === 'game') return null;
  return <div className="toasts">{toasts.map((t) => <div key={t.id} className={`toast ${t.kind || ''}`}>{t.icon} {t.text}</div>)}</div>;
}

export function App() {
  const screen = useStore((st) => st.screen);
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    const unlock = () => initAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    // Fontene må være lastet før brettets teksturer tegnes
    Promise.all([document.fonts.load('700 32px Fredoka'), document.fonts.load('600 32px Fredoka')]).finally(() => setFontsReady(true));
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  return (
    <>
      {screen === 'start' && <StartScreen />}
      {screen === 'setup' && <SetupScreen />}
      {screen === 'profile' && <ProfileScreen />}
      {screen === 'game' && fontsReady && (
        <div className="game">
          <div className="scene">
            <Suspense fallback={<div className="loading">Laster brettet …</div>}>
              <GameScene />
            </Suspense>
          </div>
          <Hud />
          <Modals />
        </div>
      )}
      <Toasts />
    </>
  );
}
