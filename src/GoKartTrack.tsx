import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Trophy, Zap, RotateCcw, Volume2, VolumeX, Flag } from 'lucide-react';

interface GoKartTrackProps {
  onExit: () => void;
  playerName: string;
}

interface Coin {
  id: number;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  collected: boolean;
}

const INITIAL_COINS: Coin[] = [
  { id: 1, x: 20, y: 30, collected: false },
  { id: 2, x: 35, y: 22, collected: false },
  { id: 3, x: 50, y: 28, collected: false },
  { id: 4, x: 75, y: 25, collected: false },
  { id: 5, x: 85, y: 45, collected: false },
  { id: 6, x: 80, y: 70, collected: false },
  { id: 7, x: 60, y: 78, collected: false },
  { id: 8, x: 40, y: 72, collected: false },
  { id: 9, x: 22, y: 75, collected: false },
  { id: 10, x: 18, y: 52, collected: false },
];

export const GoKartTrack: React.FC<GoKartTrackProps> = ({ onExit, playerName }) => {
  // Kart Physics State
  const [kartPos, setKartPos] = useState({ x: 22, y: 40 }); // percentage
  const [kartAngle, setKartAngle] = useState(0); // degrees
  const [speed, setSpeed] = useState(0);
  const [isBoosting, setIsBoosting] = useState(false);
  const [coins, setCoins] = useState<Coin[]>(INITIAL_COINS);
  const [score, setScore] = useState(0);
  const [lapTime, setLapTime] = useState(0);
  const [bestLap, setBestLap] = useState<number | null>(() => {
    const saved = localStorage.getItem('prime_gokart_best_time');
    return saved ? parseFloat(saved) : null;
  });

  const keysDownRef = useRef<Record<string, boolean>>({});
  const kartStateRef = useRef({ x: 22, y: 40, angle: 0, speed: 0, isBoosting: false });
  const animFrameRef = useRef<number | null>(null);

  // Key event listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysDownRef.current[e.code] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysDownRef.current[e.code] = false;
      if (e.code === 'Escape') {
        onExit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [onExit]);

  // Main game physics loop
  useEffect(() => {
    let lastTimestamp = performance.now();

    const loop = (timestamp: number) => {
      const dt = Math.min((timestamp - lastTimestamp) / 1000, 0.1);
      lastTimestamp = timestamp;

      setLapTime(prev => prev + dt);

      const keys = keysDownRef.current;
      const state = kartStateRef.current;

      const isUp = keys['ArrowUp'] || keys['KeyW'];
      const isDown = keys['ArrowDown'] || keys['KeyS'];
      const isLeft = keys['ArrowLeft'] || keys['KeyA'];
      const isRight = keys['ArrowRight'] || keys['KeyD'];
      const isBoost = keys['Space'] || keys['ShiftLeft'] || keys['ShiftRight'];

      state.isBoosting = Boolean(isBoost && isUp);

      const maxFwdSpeed = state.isBoosting ? 38 : 22; // percent per second
      const maxRevSpeed = -10;
      const accel = state.isBoosting ? 45 : 25;
      const friction = 12;
      const turnSpeed = state.isBoosting ? 130 : 160; // deg per sec

      // Accelerate / Decelerate
      if (isUp) {
        state.speed = Math.min(state.speed + accel * dt, maxFwdSpeed);
      } else if (isDown) {
        state.speed = Math.max(state.speed - accel * dt, maxRevSpeed);
      } else {
        // Friction slowing down
        if (state.speed > 0) {
          state.speed = Math.max(state.speed - friction * dt, 0);
        } else if (state.speed < 0) {
          state.speed = Math.min(state.speed + friction * dt, 0);
        }
      }

      // Steering (only if moving)
      if (Math.abs(state.speed) > 0.5) {
        const dir = state.speed > 0 ? 1 : -1;
        if (isLeft) {
          state.angle -= turnSpeed * dt * dir;
        }
        if (isRight) {
          state.angle += turnSpeed * dt * dir;
        }
      }

      // Calculate next position
      const rad = (state.angle * Math.PI) / 180;
      const dx = Math.sin(rad) * state.speed * dt;
      const dy = -Math.cos(rad) * state.speed * dt * 0.75; // aspect ratio adjustment

      // Boundaries with bounce
      let nextX = state.x + dx;
      let nextY = state.y + dy;

      if (nextX < 6 || nextX > 94) {
        state.speed = -state.speed * 0.4;
        nextX = Math.max(6, Math.min(94, nextX));
      }
      if (nextY < 12 || nextY > 88) {
        state.speed = -state.speed * 0.4;
        nextY = Math.max(12, Math.min(88, nextY));
      }

      state.x = nextX;
      state.y = nextY;

      // Update component state
      setKartPos({ x: state.x, y: state.y });
      setKartAngle(state.angle);
      setSpeed(Math.round(Math.abs(state.speed) * 3));
      setIsBoosting(state.isBoosting);

      // Check coin collection
      setCoins(prevCoins => {
        let collectedNew = false;
        const next = prevCoins.map(c => {
          if (c.collected) return c;
          const dist = Math.hypot(c.x - state.x, (c.y - state.y) * 1.3);
          if (dist < 4.5) {
            collectedNew = true;
            return { ...c, collected: true };
          }
          return c;
        });

        if (collectedNew) {
          setScore(s => s + 100);
        }

        // All coins collected -> Lap Complete!
        const allDone = next.every(c => c.collected);
        if (allDone && !prevCoins.every(c => c.collected)) {
          setBestLap(old => {
            const currentLap = parseFloat(lapTime.toFixed(1));
            if (!old || currentLap < old) {
              localStorage.setItem('prime_gokart_best_time', currentLap.toString());
              return currentLap;
            }
            return old;
          });
        }

        return next;
      });

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [lapTime]);

  const handleResetLap = () => {
    kartStateRef.current = { x: 22, y: 40, angle: 0, speed: 0, isBoosting: false };
    setKartPos({ x: 22, y: 40 });
    setKartAngle(0);
    setSpeed(0);
    setLapTime(0);
    setCoins(INITIAL_COINS);
    setScore(0);
  };

  const handleTouchDown = (key: string) => {
    keysDownRef.current[key] = true;
  };

  const handleTouchUp = (key: string) => {
    keysDownRef.current[key] = false;
  };

  return (
    <div className="gokart-track-overlay">
      {/* HUD Header */}
      <div className="gokart-hud-top">
        <div className="gokart-hud-item brand">
          <span className="gokart-flag-icon"><Flag size={18} color="#eab308" /></span>
          <div>
            <strong>OFFICE GO-KART GRAND PRIX</strong>
            <small>นักซิ่ง: {playerName}</small>
          </div>
        </div>

        <div className="gokart-hud-stats">
          <div className="hud-metric">
            <span className="hud-metric-label">ความเร็ว</span>
            <strong className="hud-metric-val">{speed} <small>KM/H</small></strong>
          </div>

          <div className="hud-metric">
            <span className="hud-metric-label">เวลาต่อรอบ</span>
            <strong className="hud-metric-val">{lapTime.toFixed(1)} <small>วินาที</small></strong>
          </div>

          <div className="hud-metric gold">
            <span className="hud-metric-label">เหรียญทอง ({coins.filter(c => c.collected).length}/{coins.length})</span>
            <strong className="hud-metric-val">{score} <small>PTS</small></strong>
          </div>

          {bestLap !== null && (
            <div className="hud-metric best">
              <span className="hud-metric-label"><Trophy size={11} /> เวลาดีที่สุด</span>
              <strong className="hud-metric-val">{bestLap} <small>วินาที</small></strong>
            </div>
          )}
        </div>

        <div className="gokart-hud-actions">
          <button type="button" className="gokart-hud-btn" onClick={handleResetLap} title="เริ่มรอบใหม่">
            <RotateCcw size={15} />
            <span>เริ่มรอบใหม่</span>
          </button>
          <button type="button" className="gokart-exit-btn" onClick={onExit} title="จอดรถโกคาร์ท (กลับสู่ออฟฟิศ)">
            <X size={16} />
            <span>จอดรถโกคาร์ท (Esc)</span>
          </button>
        </div>
      </div>

      {/* Track Overlay Canvas Area */}
      <div className="gokart-stage-container">
        {/* Track Markings & Start Line */}
        <div className="gokart-start-line" style={{ left: '20%', top: '35%' }}>
          <span className="finish-checkered" />
          <span className="start-label">START / FINISH</span>
        </div>

        {/* Collectible Gold Coins */}
        {coins.map(c => !c.collected && (
          <div
            key={c.id}
            className="gokart-gold-coin"
            style={{ left: `${c.x}%`, top: `${c.y}%` }}
          >
            <span className="coin-glow" />
            <span className="coin-emoji">🪙</span>
          </div>
        ))}

        {/* THE GO-KART VEHICLE */}
        <div
          className={`gokart-vehicle ${isBoosting ? 'is-boosting' : ''}`}
          style={{
            left: `${kartPos.x}%`,
            top: `${kartPos.y}%`,
            transform: `translate(-50%, -50%) rotate(${kartAngle}deg)`,
          }}
        >
          {/* Turbo Exhaust Flame */}
          {isBoosting && <div className="gokart-flame" />}

          {/* Kart Body */}
          <div className="gokart-chassis">
            <div className="gokart-wheels front-left" />
            <div className="gokart-wheels front-right" />
            <div className="gokart-wheels rear-left" />
            <div className="gokart-wheels rear-right" />

            {/* Spoiler & Front Wing */}
            <div className="gokart-front-bumper" />
            <div className="gokart-spoiler" />

            {/* Pilot Helmet */}
            <div className="gokart-pilot">
              <span className="pilot-helmet">🏎️</span>
            </div>

            {/* Number Pin */}
            <div className="gokart-number">#1</div>
          </div>

          {/* Driver Name Tag */}
          <div
            className="gokart-pilot-tag"
            style={{ transform: `translateX(-50%) rotate(${-kartAngle}deg)` }}
          >
            {playerName}
          </div>
        </div>
      </div>

      {/* Mobile Touch On-Screen Controls */}
      <div className="gokart-mobile-controls">
        <div className="mobile-dpad">
          <button
            type="button"
            className="dpad-btn steer-left"
            onTouchStart={() => handleTouchDown('ArrowLeft')}
            onTouchEnd={() => handleTouchUp('ArrowLeft')}
            onMouseDown={() => handleTouchDown('ArrowLeft')}
            onMouseUp={() => handleTouchUp('ArrowLeft')}
          >
            ◄
          </button>
          <button
            type="button"
            className="dpad-btn steer-right"
            onTouchStart={() => handleTouchDown('ArrowRight')}
            onTouchEnd={() => handleTouchUp('ArrowRight')}
            onMouseDown={() => handleTouchDown('ArrowRight')}
            onMouseUp={() => handleTouchUp('ArrowRight')}
          >
            ►
          </button>
        </div>

        <div className="mobile-pedals">
          <button
            type="button"
            className="pedal-btn brake"
            onTouchStart={() => handleTouchDown('ArrowDown')}
            onTouchEnd={() => handleTouchUp('ArrowDown')}
            onMouseDown={() => handleTouchDown('ArrowDown')}
            onMouseUp={() => handleTouchUp('ArrowDown')}
          >
            เบรก
          </button>
          <button
            type="button"
            className="pedal-btn gas"
            onTouchStart={() => handleTouchDown('ArrowUp')}
            onTouchEnd={() => handleTouchUp('ArrowUp')}
            onMouseDown={() => handleTouchDown('ArrowUp')}
            onMouseUp={() => handleTouchUp('ArrowUp')}
          >
            เร่งเครื่อง ▲
          </button>
          <button
            type="button"
            className="pedal-btn nitro"
            onTouchStart={() => handleTouchDown('Space')}
            onTouchEnd={() => handleTouchUp('Space')}
            onMouseDown={() => handleTouchDown('Space')}
            onMouseUp={() => handleTouchUp('Space')}
          >
            <Zap size={14} /> ไนตรัส!
          </button>
        </div>
      </div>
    </div>
  );
};
