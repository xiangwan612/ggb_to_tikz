import CommandPanel from './components/CommandPanel';
import NativeBoard from './components/NativeBoard';
import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_SPLIT = 'ggb_split_left_percent';
const MIN_LEFT = 38;
const MAX_LEFT = 78;

export default function App() {
  const [ggbApi, setGgbApi] = useState(null);
  const [ggbReady, setGgbReady] = useState(false);
  const [leftPercent, setLeftPercent] = useState(() => {
    const raw = Number(localStorage.getItem(STORAGE_SPLIT));
    if (Number.isFinite(raw) && raw >= MIN_LEFT && raw <= MAX_LEFT) return raw;
    return 62;
  });
  const shellRef = useRef(null);

  const openLegacy = () => {
    window.open('/legacy-index.html', '_blank', 'noopener,noreferrer');
  };

  const handleBoardReadyChange = useCallback((api, ready) => {
    setGgbApi(api || null);
    setGgbReady(!!ready);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_SPLIT, String(leftPercent));
  }, [leftPercent]);

  const startResize = (event) => {
    event.preventDefault();

    const onMove = (moveEvent) => {
      if (!shellRef.current) return;
      const rect = shellRef.current.getBoundingClientRect();
      if (!rect.width) return;
      const x = moveEvent.clientX - rect.left;
      const next = Math.max(MIN_LEFT, Math.min(MAX_LEFT, (x / rect.width) * 100));
      setLeftPercent(next);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div className="app-shell" ref={shellRef}>
      <div className="split-pane split-left" style={{ width: `${leftPercent}%` }}>
        <CommandPanel ggbApi={ggbApi} ggbReady={ggbReady} onOpenLegacy={openLegacy} />
      </div>
      <div
        className="split-divider"
        onPointerDown={startResize}
        role="separator"
        aria-label="调整左右面板宽度"
        aria-orientation="vertical"
      />
      <div className="split-pane split-right">
        <NativeBoard onReadyChange={handleBoardReadyChange} />
      </div>
    </div>
  );
}
