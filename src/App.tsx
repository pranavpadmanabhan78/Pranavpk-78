import React, { useState, useEffect, useRef } from 'react';
import { Circle, RotateCcw } from 'lucide-react';

type Bubble = {
  id: number;
  x: number; // percentage 0 - 100
  y: number; // percentage 0 - 100
  vx: number; // horizontal drift
  vy: number; // vertical falling speed
  size: number; // in pixels
  color: string;
  borderColor: string;
  wobblePhase: number;
};

const BUBBLE_COLORS = [
  { name: 'green', hex: '#22c55e', border: '#15803d' },
  { name: 'yellow', hex: '#eab308', border: '#a16207' },
  { name: 'red', hex: '#ef4444', border: '#b91c1c' },
  { name: 'blue', hex: '#3b82f6', border: '#1d4ed8' },
  { name: 'orange', hex: '#f97316', border: '#c2410c' },
  { name: 'violet', hex: '#8b5cf6', border: '#6d28d9' },
  { name: 'black', hex: '#000000', border: '#262626' },
  { name: 'skyblue', hex: '#38bdf8', border: '#0284c7' },
  { name: 'pink', hex: '#ec4899', border: '#be185d' },
];

// Mix of 8 colors specified for refill when no matching combinations exist:
// green, red, blue, orange, violet, black, skyblue, pink
const REFILL_BUBBLE_COLORS = [
  { name: 'green', hex: '#22c55e', border: '#15803d' },
  { name: 'red', hex: '#ef4444', border: '#b91c1c' },
  { name: 'blue', hex: '#3b82f6', border: '#1d4ed8' },
  { name: 'orange', hex: '#f97316', border: '#c2410c' },
  { name: 'violet', hex: '#8b5cf6', border: '#6d28d9' },
  { name: 'black', hex: '#000000', border: '#262626' },
  { name: 'skyblue', hex: '#38bdf8', border: '#0284c7' },
  { name: 'pink', hex: '#ec4899', border: '#be185d' },
];

let globalUniqueId = Math.floor(Date.now() % 10000000) * 1000;
const getUniqueId = (): number => {
  globalUniqueId += 1;
  return globalUniqueId;
};

const createBubbleSet = (): Bubble[] => {
  return Array.from({ length: 15 }, (_, i) => {
    const colorDef = BUBBLE_COLORS[i % BUBBLE_COLORS.length];
    return {
      id: getUniqueId(),
      x: 12 + Math.random() * 76,
      // Strictly inside the square near the top (never outside or above)
      y: 4 + (i * 3) + Math.random() * 3,
      vx: (Math.random() - 0.5) * 0.25,
      vy: 0.35 + Math.random() * 0.3,
      size: 16 + Math.random() * 4,
      color: colorDef.hex,
      borderColor: colorDef.border,
      wobblePhase: Math.random() * Math.PI * 2,
    };
  });
};

// Creates 15 bubbles using the 8-color mix (green, red, blue, orange, violet, black, skyblue, pink)
const createRefillBubbleSet = (): Bubble[] => {
  return Array.from({ length: 15 }, (_, i) => {
    const colorDef = REFILL_BUBBLE_COLORS[i % REFILL_BUBBLE_COLORS.length];
    return {
      id: getUniqueId(),
      x: 12 + Math.random() * 76,
      // Descending from top inside the square
      y: 4 + (i * 2.8) + Math.random() * 2,
      vx: (Math.random() - 0.5) * 0.25,
      vy: 0.35 + Math.random() * 0.3,
      size: 16 + Math.random() * 4,
      color: colorDef.hex,
      borderColor: colorDef.border,
      wobblePhase: Math.random() * Math.PI * 2,
    };
  });
};

// Checks if there is any matching combination possible within the square
const checkHasMatchingCombination = (bubblesList: Bubble[]): boolean => {
  if (bubblesList.length < 2) return false;

  const counts: Record<string, number> = {};
  for (const b of bubblesList) {
    counts[b.color] = (counts[b.color] || 0) + 1;
  }

  // Same-color matches for all 9 game colors
  const matchableSameColors = [
    '#22c55e', // green
    '#eab308', // yellow
    '#ef4444', // red
    '#3b82f6', // blue
    '#f97316', // orange
    '#8b5cf6', // violet
    '#000000', // black
    '#38bdf8', // skyblue
    '#ec4899', // pink
  ];
  for (const c of matchableSameColors) {
    if ((counts[c] || 0) >= 2) return true;
  }

  return false;
};

export default function App() {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [isLeftLineRaised, setIsLeftLineRaised] = useState<boolean>(false);
  const [isRightLineRaised, setIsRightLineRaised] = useState<boolean>(false);
  const [isLeftVerticalShifted, setIsLeftVerticalShifted] = useState<boolean>(false);
  const [isRightVerticalShifted, setIsRightVerticalShifted] = useState<boolean>(false);

  // Score counter and collision indicators
  const [score, setScore] = useState<number>(0);
  const [floatingScores, setFloatingScores] = useState<
    { id: number; x: number; y: number; text?: string }[]
  >([]);
  const lastCollisionMapRef = useRef<Map<string, number>>(new Map());

  // Game lifecycle and combination check tracking
  const [noMatchRefillCount, setNoMatchRefillCount] = useState<number>(0);
  const [isGameOver, setIsGameOver] = useState<boolean>(false);
  const isGameOverRef = useRef<boolean>(false);
  const [gameOverReason, setGameOverReason] = useState<string>('');
  const [noMatchNotice, setNoMatchNotice] = useState<string | null>(null);

  const leftResetTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const rightResetTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const leftVerticalTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const rightVerticalTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const respawnTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isRespawningRef = useRef<boolean>(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  const bubblesRef = useRef<Bubble[]>([]);
  const lastRefillTimeRef = useRef<number>(Date.now());
  const initialSpawnTimeRef = useRef<number>(Date.now());

  // Initialize 15 bubbles strictly inside the square
  const [bubbles, setBubbles] = useState<Bubble[]>(() => {
    const initial = createBubbleSet();
    bubblesRef.current = initial;
    return initial;
  });

  // Keep bubblesRef synchronized
  useEffect(() => {
    bubblesRef.current = bubbles;
  }, [bubbles]);

  const handleRestartGame = () => {
    isGameOverRef.current = false;
    setIsGameOver(false);
    setGameOverReason('');
    setNoMatchRefillCount(0);
    setNoMatchNotice(null);
    setScore(0);
    lastCollisionMapRef.current.clear();
    initialSpawnTimeRef.current = Date.now();
    lastRefillTimeRef.current = Date.now();
    const fresh = createBubbleSet();
    bubblesRef.current = fresh;
    setBubbles(fresh);
  };

  const getAudioContext = (): AudioContext | null => {
    try {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioContextClass) {
          audioContextRef.current = new AudioContextClass();
        }
      }
      const ctx = audioContextRef.current;
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      return ctx;
    } catch {
      return null;
    }
  };

  const playGameOverSound = () => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      [360, 300, 240].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);
        gain.gain.setValueAtTime(0.2, now + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.22);
        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.22);
      });
    } catch {
      // Audio playback fails silently if browser blocks autoplay
    }
  };

  const playBubblePopSound = () => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(600 + Math.random() * 200, now);
      osc.frequency.exponentialRampToValueAtTime(1100, now + 0.04);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
    } catch {
      // Audio playback fails silently if browser blocks autoplay
    }
  };

  const playScoreSound = () => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      // Cheerful point celebration ding (chime chord)
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, now); // A5
      osc.frequency.setValueAtTime(1320, now + 0.05); // E6
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.start(now);
      osc.stop(now + 0.28);
    } catch {
      // Audio playback fails silently if browser blocks autoplay
    }
  };

  const playClickSound = (keyName: string) => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      // Punchy, spring-loaded flipper pop sound for all circles
      const baseFreqs: Record<string, number> = {
        'circle-1': 140,
        'circle-2': 148,
        'circle-3': 156,
        'circle-4': 145,
      };
      const baseFreq = baseFreqs[keyName] || 140;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 2.35, now + 0.05);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.65, now + 0.16);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.start(now);
      osc.stop(now + 0.16);
    } catch {
      // Audio playback fails silently if browser blocks autoplay
    }
  };

  // Combination monitor: after first 15 bubbles appear, if no matching combination exists,
  // 15 more bubbles appear (from the 8 colors). If still no combination after this happens twice, the game ends.
  useEffect(() => {
    if (isGameOver) return;

    const interval = setInterval(() => {
      if (isGameOver) return;
      const now = Date.now();

      // Grace period of 2.2 seconds at startup/restart for bubbles to appear
      if (now - initialSpawnTimeRef.current < 2200) return;

      // Cooldown of 2.5 seconds after a refill for new wave to cascade down
      if (now - lastRefillTimeRef.current < 2500) return;

      const currentBubbles = bubblesRef.current;
      if (currentBubbles.length === 0) return;

      const hasMatch = checkHasMatchingCombination(currentBubbles);
      if (!hasMatch) {
        if (noMatchRefillCount < 2) {
          const nextCount = noMatchRefillCount + 1;
          setNoMatchRefillCount(nextCount);
          lastRefillTimeRef.current = Date.now();
          setNoMatchNotice(`No match! Adding 15 bubbles (${nextCount}/2)`);
          setTimeout(() => setNoMatchNotice(null), 2400);

          // Add 15 bubbles from the 8-color mix (green, red, blue, orange, violet, black, skyblue, pink)
          const newBubbles = createRefillBubbleSet();
          setBubbles((prev) => [...prev, ...newBubbles]);
        } else {
          // Happened twice and still no matching combination: game ends!
          isGameOverRef.current = true;
          setGameOverReason('No matching color combination left after 2 refills!');
          setIsGameOver(true);
          playGameOverSound();
        }
      }
    }, 800);

    return () => clearInterval(interval);
  }, [isGameOver, noMatchRefillCount]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      }
      if (e.key === 'r' || e.key === 'R') {
        handleRestartGame();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (leftResetTimeoutRef.current) clearTimeout(leftResetTimeoutRef.current);
      if (rightResetTimeoutRef.current) clearTimeout(rightResetTimeoutRef.current);
      if (leftVerticalTimeoutRef.current) clearTimeout(leftVerticalTimeoutRef.current);
      if (rightVerticalTimeoutRef.current) clearTimeout(rightVerticalTimeoutRef.current);
      if (respawnTimeoutRef.current) clearTimeout(respawnTimeoutRef.current);
    };
  }, [isGameOver]);

  // Clean-up audio context ONLY when component unmounts entirely
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  // Animation frame loop: bubbles descend and rest above the two thick lines; colliding same-color bubbles are deleted
  useEffect(() => {
    let animationFrameId: number;

    const updateBubbles = () => {
      if (isGameOver || isGameOverRef.current) {
        animationFrameId = requestAnimationFrame(updateBubbles);
        return;
      }

      // Collectors for side-effects to execute OUTSIDE of setBubbles
      let scoreDelta = 0;
      let playPop = false;
      let playScore = false;
      let playGameOver = false;
      let triggerGameOverReason: string | null = null;
      const popupsToAdd: { id: number; x: number; y: number; text?: string }[] = [];

      setBubbles((prevBubbles) => {
        if (prevBubbles.length === 0) {
          if (!isRespawningRef.current && !isGameOverRef.current) {
            isRespawningRef.current = true;
            if (respawnTimeoutRef.current) clearTimeout(respawnTimeoutRef.current);
            respawnTimeoutRef.current = setTimeout(() => {
              const fresh = createBubbleSet();
              bubblesRef.current = fresh;
              setBubbles(fresh);
              isRespawningRef.current = false;
            }, 450);
          }
          return prevBubbles;
        }

        const count = prevBubbles.length;
        const bubblesList = prevBubbles.map((b) => ({ ...b }));

        // Phase 1: Apply physics (gravity, air drift, resting damping, walls, flippers)
        const restY = 79.5;
        for (let i = 0; i < count; i++) {
          const b = bubblesList[i];
          b.wobblePhase += 0.03;

          if (b.y < restY) {
            b.vy = Math.min(b.vy + 0.015, 0.7);
            b.vx = b.vx * 0.98 + Math.sin(b.wobblePhase) * 0.04;
          } else {
            // Resting or interacting with flipper lines
            if (isLeftLineRaised && b.x <= 50) {
              b.vy = -1.4 - Math.random() * 0.3;
              b.vx = (Math.random() - 0.3) * 0.4;
              b.y = 75;
            } else if (isRightLineRaised && b.x > 50) {
              b.vy = -1.4 - Math.random() * 0.3;
              b.vx = (Math.random() - 0.7) * 0.4;
              b.y = 75;
            } else {
              b.y = restY;
              b.vy = 0;
              b.vx *= 0.85; // smooth damping to eliminate jitter
              if (Math.abs(b.vx) < 0.02) b.vx = 0;

              // Do not float in mid-air gap
              if (b.x > 47 && b.x < 53) {
                b.x = b.x <= 50 ? 46 : 54;
              }
            }
          }

          b.x += b.vx;
          b.y += b.vy;

          // Square border clamping
          if (b.x < 9) {
            b.x = 9;
            b.vx = Math.abs(b.vx) * 0.5;
          } else if (b.x > 91) {
            b.x = 91;
            b.vx = -Math.abs(b.vx) * 0.5;
          }

          if (b.y < 4) {
            b.y = 4;
            b.vy = Math.abs(b.vy) * 0.5;
          }
        }

        // Phase 2: Bubble-to-bubble collision and matching
        const toDeleteIds = new Set<number>();
        const newSpawnedBubbles: Bubble[] = [];
        const COLLISION_DIST = 7.5;
        const COLLISION_DIST_SQ = COLLISION_DIST * COLLISION_DIST;

        for (let i = 0; i < count; i++) {
          const b1 = bubblesList[i];
          for (let j = i + 1; j < count; j++) {
            const b2 = bubblesList[j];

            const dx = b2.x - b1.x;
            const dy = b2.y - b1.y;
            const distSq = dx * dx + dy * dy;

            if (distSq < COLLISION_DIST_SQ && distSq > 0.0001) {
              const dist = Math.sqrt(distSq);
              const overlap = (COLLISION_DIST - dist) / 2;
              const nx = dx / dist;
              const ny = dy / dist;

              // Both bubbles are resting together at the bottom with flippers down
              const isBothResting =
                b1.y >= restY - 0.5 &&
                b2.y >= restY - 0.5 &&
                Math.abs(b1.vy) < 0.05 &&
                Math.abs(b2.vy) < 0.05 &&
                !isLeftLineRaised &&
                !isRightLineRaised &&
                !isLeftVerticalShifted &&
                !isRightVerticalShifted;

              // Physical repulsion so bubbles never overlap or glitch
              b1.x -= nx * overlap * 0.5;
              b1.y -= ny * overlap * 0.5;
              b2.x += nx * overlap * 0.5;
              b2.y += ny * overlap * 0.5;

              // Elastic bounce along contact normal
              const rvx = b2.vx - b1.vx;
              const rvy = b2.vy - b1.vy;
              const velAlongNormal = rvx * nx + rvy * ny;
              if (velAlongNormal < 0) {
                const impulse = -1.3 * velAlongNormal * 0.5;
                b1.vx -= impulse * nx;
                b1.vy -= impulse * ny;
                b2.vx += impulse * nx;
                b2.vy += impulse * ny;
              }

              // If either bubble is already consumed in a match this frame, skip matching
              if (toDeleteIds.has(b1.id) || toDeleteIds.has(b2.id)) {
                continue;
              }

              // Do not repeatedly score if both are simply resting side-by-side at the bottom
              if (isBothResting) {
                continue;
              }

              // BLUE + YELLOW: When blue bubble and yellow bubble collide, game is over, show points, ask to play again
              const isBlueAndYellow =
                (b1.color === '#3b82f6' && b2.color === '#eab308') ||
                (b1.color === '#eab308' && b2.color === '#3b82f6');

              if (isBlueAndYellow) {
                toDeleteIds.add(b1.id);
                toDeleteIds.add(b2.id);
                scoreDelta += 1;
                playPop = true;
                playScore = true;
                playGameOver = true;
                triggerGameOverReason = 'Blue and yellow bubbles collided! Game Over.';
                popupsToAdd.push({
                  id: getUniqueId(),
                  x: (b1.x + b2.x) / 2,
                  y: (b1.y + b2.y) / 2,
                  text: '+1 (Game Over!)',
                });
                break;
              }

              // Check same-color collision
              if (b1.color === b2.color) {
                const isBlack = b1.color === '#000000';
                const isPink = b1.color === '#ec4899';
                const isGreen = b1.color === '#22c55e';
                const isYellow = b1.color === '#eab308';
                const isViolet = b1.color === '#8b5cf6';
                const isSkyBlue = b1.color === '#38bdf8';

                // BLACK: Game over on collision (earns +1 point)
                if (isBlack) {
                  toDeleteIds.add(b1.id);
                  toDeleteIds.add(b2.id);
                  scoreDelta += 1;
                  playPop = true;
                  playScore = true;
                  playGameOver = true;
                  triggerGameOverReason = 'Two black bubbles collided! Game Over.';
                  popupsToAdd.push({
                    id: getUniqueId(),
                    x: (b1.x + b2.x) / 2,
                    y: (b1.y + b2.y) / 2,
                    text: '+1 (Game Over!)',
                  });
                  break;
                }

                // PINK: when two pink bubbles collide, 1 new pink bubble is added descending from top
                if (isPink) {
                  toDeleteIds.add(b1.id);
                  toDeleteIds.add(b2.id);
                  scoreDelta += 1;
                  playPop = true;
                  playScore = true;
                  popupsToAdd.push({
                    id: getUniqueId(),
                    x: (b1.x + b2.x) / 2,
                    y: (b1.y + b2.y) / 2,
                    text: '+1 Pink!',
                  });

                  // Add 1 new pink bubble descending from top
                  const pinkDef = BUBBLE_COLORS.find((c) => c.name === 'pink') || {
                    hex: '#ec4899',
                    border: '#be185d',
                  };
                  newSpawnedBubbles.push({
                    id: getUniqueId(),
                    x: 15 + Math.random() * 70,
                    y: 4 + Math.random() * 2,
                    vx: (Math.random() - 0.5) * 0.15,
                    vy: 0.35 + Math.random() * 0.2,
                    size: 16 + Math.random() * 4,
                    color: pinkDef.hex,
                    borderColor: pinkDef.border,
                    wobblePhase: Math.random() * Math.PI * 2,
                  });
                  continue;
                }

                // GREEN: when two green bubbles collide, they are deleted and a new red bubble is added
                if (isGreen) {
                  toDeleteIds.add(b1.id);
                  toDeleteIds.add(b2.id);
                  scoreDelta += 1;
                  playPop = true;
                  playScore = true;
                  popupsToAdd.push({
                    id: getUniqueId(),
                    x: (b1.x + b2.x) / 2,
                    y: (b1.y + b2.y) / 2,
                    text: '+1 Red!',
                  });

                  // Add 1 new red color bubble descending from top
                  const redDef = BUBBLE_COLORS.find((c) => c.name === 'red') || {
                    hex: '#ef4444',
                    border: '#b91c1c',
                  };
                  newSpawnedBubbles.push({
                    id: getUniqueId(),
                    x: 15 + Math.random() * 70,
                    y: 4 + Math.random() * 2,
                    vx: (Math.random() - 0.5) * 0.15,
                    vy: 0.35 + Math.random() * 0.2,
                    size: 16 + Math.random() * 4,
                    color: redDef.hex,
                    borderColor: redDef.border,
                    wobblePhase: Math.random() * Math.PI * 2,
                  });
                  continue;
                }

                // YELLOW: when two yellow bubbles collide, they are deleted and add a new black color bubble
                if (isYellow) {
                  toDeleteIds.add(b1.id);
                  toDeleteIds.add(b2.id);
                  scoreDelta += 1;
                  playPop = true;
                  playScore = true;
                  popupsToAdd.push({
                    id: getUniqueId(),
                    x: (b1.x + b2.x) / 2,
                    y: (b1.y + b2.y) / 2,
                    text: '+1 Black!',
                  });

                  // Add 1 new black color bubble descending from top
                  const blackDef = BUBBLE_COLORS.find((c) => c.name === 'black') || {
                    hex: '#000000',
                    border: '#262626',
                  };
                  newSpawnedBubbles.push({
                    id: getUniqueId(),
                    x: 15 + Math.random() * 70,
                    y: 4 + Math.random() * 2,
                    vx: (Math.random() - 0.5) * 0.15,
                    vy: 0.35 + Math.random() * 0.2,
                    size: 16 + Math.random() * 4,
                    color: blackDef.hex,
                    borderColor: blackDef.border,
                    wobblePhase: Math.random() * Math.PI * 2,
                  });
                  continue;
                }

                // VIOLET: when two violet bubbles collide, they are deleted and 2 new black color bubbles are added
                if (isViolet) {
                  toDeleteIds.add(b1.id);
                  toDeleteIds.add(b2.id);
                  scoreDelta += 1;
                  playPop = true;
                  playScore = true;
                  popupsToAdd.push({
                    id: getUniqueId(),
                    x: (b1.x + b2.x) / 2,
                    y: (b1.y + b2.y) / 2,
                    text: '+2 Black!',
                  });

                  // Add 2 new black color bubbles descending from top
                  const blackDef = BUBBLE_COLORS.find((c) => c.name === 'black') || {
                    hex: '#000000',
                    border: '#262626',
                  };
                  for (let k = 0; k < 2; k++) {
                    newSpawnedBubbles.push({
                      id: getUniqueId(),
                      x: 15 + Math.random() * 70,
                      y: 4 + Math.random() * 2 + k * 2.5,
                      vx: (Math.random() - 0.5) * 0.15,
                      vy: 0.35 + Math.random() * 0.2,
                      size: 16 + Math.random() * 4,
                      color: blackDef.hex,
                      borderColor: blackDef.border,
                      wobblePhase: Math.random() * Math.PI * 2,
                    });
                  }
                  continue;
                }

                // SKYBLUE: when two skyblue color bubbles collide, they are deleted and get one point that collision
                if (isSkyBlue) {
                  toDeleteIds.add(b1.id);
                  toDeleteIds.add(b2.id);
                  scoreDelta += 1;
                  playPop = true;
                  playScore = true;
                  popupsToAdd.push({
                    id: getUniqueId(),
                    x: (b1.x + b2.x) / 2,
                    y: (b1.y + b2.y) / 2,
                    text: '+1',
                  });
                  continue;
                }

                // ALL OTHER MATCHABLE COLORS (Orange, Red, Blue):
                // Pop both, delete them, and award +1 point
                toDeleteIds.add(b1.id);
                toDeleteIds.add(b2.id);
                scoreDelta += 1;
                playPop = true;
                playScore = true;
                popupsToAdd.push({
                  id: getUniqueId(),
                  x: (b1.x + b2.x) / 2,
                  y: (b1.y + b2.y) / 2,
                  text: '+1',
                });
              } else {
                // Different-color bubble collision: each collision earns a point!
                const pairKey = b1.id < b2.id ? `${b1.id}-${b2.id}` : `${b2.id}-${b1.id}`;
                const lastTime = lastCollisionMapRef.current.get(pairKey) || 0;
                const nowTime = Date.now();
                if (nowTime - lastTime > 160) {
                  lastCollisionMapRef.current.set(pairKey, nowTime);
                  scoreDelta += 1;
                  playPop = true;
                  playScore = true;
                  popupsToAdd.push({
                    id: getUniqueId(),
                    x: (b1.x + b2.x) / 2,
                    y: (b1.y + b2.y) / 2,
                    text: '+1',
                  });
                }
              }
            }
          }
        }

        // Filter out deleted bubbles and append newly spawned ones
        const remaining = [
          ...bubblesList.filter((b) => !toDeleteIds.has(b.id)),
          ...newSpawnedBubbles,
        ];

        // If all bubbles cleared, respawn 15 fresh bubbles
        if (
          remaining.length === 0 &&
          !isRespawningRef.current &&
          !isGameOverRef.current
        ) {
          isRespawningRef.current = true;
          if (respawnTimeoutRef.current) clearTimeout(respawnTimeoutRef.current);
          respawnTimeoutRef.current = setTimeout(() => {
            const fresh = createBubbleSet();
            bubblesRef.current = fresh;
            setBubbles(fresh);
            isRespawningRef.current = false;
          }, 450);
        }

        return remaining;
      });

      // Execute side effects safely OUTSIDE the setBubbles updater
      if (scoreDelta > 0) {
        setScore((s) => s + scoreDelta);
      }
      if (playPop) {
        playBubblePopSound();
      }
      if (playScore) {
        playScoreSound();
      }
      if (playGameOver) {
        playGameOverSound();
      }
      if (triggerGameOverReason) {
        isGameOverRef.current = true;
        setGameOverReason(triggerGameOverReason);
        setIsGameOver(true);
      }

      if (popupsToAdd.length > 0) {
        setFloatingScores((prev) => [...prev, ...popupsToAdd]);
        const idsToRemove = popupsToAdd.map((p) => p.id);
        setTimeout(() => {
          setFloatingScores((prev) => prev.filter((p) => !idsToRemove.includes(p.id)));
        }, 850);
      }

      animationFrameId = requestAnimationFrame(updateBubbles);
    };

    animationFrameId = requestAnimationFrame(updateBubbles);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isLeftLineRaised, isRightLineRaised, isGameOver]);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else if (document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore if fullscreen cannot be requested
    }
  };

  const handleKeyPress = (keyName: string) => {
    if (isGameOver) return;
    setActiveKey(keyName);
    playClickSound(keyName);

    if (keyName === 'circle-1') {
      if (leftResetTimeoutRef.current) {
        clearTimeout(leftResetTimeoutRef.current);
      }
      setIsLeftLineRaised(true);
      leftResetTimeoutRef.current = setTimeout(() => {
        setIsLeftLineRaised(false);
      }, 220);

      // Launch resting/nearby bubbles upwards on left flipper flick
      setBubbles((prev) =>
        prev.map((b) => {
          if (b.x <= 52 && b.y >= 65) {
            return {
              ...b,
              vy: -1.4 - Math.random() * 0.4,
              vx: b.vx + (Math.random() - 0.2) * 0.6,
              y: Math.min(b.y, 75),
            };
          }
          return b;
        })
      );
    }

    if (keyName === 'circle-2') {
      if (leftVerticalTimeoutRef.current) {
        clearTimeout(leftVerticalTimeoutRef.current);
      }
      setIsLeftVerticalShifted(true);
      leftVerticalTimeoutRef.current = setTimeout(() => {
        setIsLeftVerticalShifted(false);
      }, 220);

      // Deflect nearby bubbles to the right
      setBubbles((prev) =>
        prev.map((b) => {
          if (b.x < 35 && b.y > 35 && b.y < 85) {
            return { ...b, vx: 1.2, vy: b.vy - 0.4 };
          }
          return b;
        })
      );
    }

    if (keyName === 'circle-3') {
      if (rightVerticalTimeoutRef.current) {
        clearTimeout(rightVerticalTimeoutRef.current);
      }
      setIsRightVerticalShifted(true);
      rightVerticalTimeoutRef.current = setTimeout(() => {
        setIsRightVerticalShifted(false);
      }, 220);

      // Deflect nearby bubbles to the left
      setBubbles((prev) =>
        prev.map((b) => {
          if (b.x > 65 && b.y > 35 && b.y < 85) {
            return { ...b, vx: -1.2, vy: b.vy - 0.4 };
          }
          return b;
        })
      );
    }

    if (keyName === 'circle-4') {
      if (rightResetTimeoutRef.current) {
        clearTimeout(rightResetTimeoutRef.current);
      }
      setIsRightLineRaised(true);
      rightResetTimeoutRef.current = setTimeout(() => {
        setIsRightLineRaised(false);
      }, 220);

      // Launch resting/nearby bubbles upwards on right flipper flick
      setBubbles((prev) =>
        prev.map((b) => {
          if (b.x >= 48 && b.y >= 65) {
            return {
              ...b,
              vy: -1.4 - Math.random() * 0.4,
              vx: b.vx - (Math.random() - 0.2) * 0.6,
              y: Math.min(b.y, 75),
            };
          }
          return b;
        })
      );
    }

    setTimeout(() => {
      setActiveKey((prev) => (prev === keyName ? null : prev));
    }, 200);
  };

  const circleButtons = [
    { id: 'circle-1', label: 'Button 1' },
    { id: 'circle-2', label: 'Button 2' },
    { id: 'circle-3', label: 'Button 3' },
    { id: 'circle-4', label: 'Button 4' },
  ];

  return (
    <div
      className="fixed inset-0 w-screen h-screen bg-white overflow-hidden select-none flex items-center justify-center"
      onDoubleClick={toggleFullscreen}
    >
      {/* Inner Phone/Device Box */}
      <div className="relative w-48 h-72 sm:w-64 sm:h-96 bg-white border-4 border-black shadow-xl flex flex-col justify-between overflow-hidden">
        {/* Inner screen content area */}
        <div className="flex-1 w-full bg-white relative overflow-hidden">
          {/* Notification banner when 15 bubbles are added due to no combination */}
          {noMatchNotice && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 z-20">
              <div className="px-2.5 py-0.5 rounded-full bg-amber-500 text-white font-mono font-bold text-[8px] sm:text-[9px] tracking-wide shadow-md animate-pulse text-center whitespace-nowrap border border-white/40">
                {noMatchNotice}
              </div>
            </div>
          )}

          {/* Floating +1 Popups on Same-Color Collision */}
          {floatingScores.map((item) => (
            <div
              key={`score-${item.id}`}
              className="absolute text-[11px] font-black text-amber-500 pointer-events-none select-none z-30 transition-all duration-300 animate-bounce drop-shadow-xs"
              style={{
                left: `${item.x}%`,
                top: `${item.y}%`,
                transform: 'translate(-50%, -100%)',
              }}
            >
              {item.text || '+1'}
            </div>
          ))}

          {/* Descending Mixed-Color Bubbles */}
          {bubbles.map((bubble) => (
            <div
              key={`bubble-${bubble.id}`}
              className="absolute rounded-full pointer-events-none transition-shadow"
              style={{
                left: `${bubble.x}%`,
                top: `${bubble.y}%`,
                width: `${bubble.size}px`,
                height: `${bubble.size}px`,
                backgroundColor: bubble.color,
                boxShadow: bubble.color === '#000000'
                  ? 'inset 1px 1px 2px rgba(255,255,255,0.4), 0 1px 2px rgba(0,0,0,0.3)'
                  : 'inset -1px -1px 2px rgba(0,0,0,0.25), inset 1px 1px 2px rgba(255,255,255,0.7), 0 1px 2px rgba(0,0,0,0.15)',
                border: `1px solid ${bubble.borderColor}`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              {/* Glossy Bubble Glint */}
              <div className="absolute top-[18%] left-[20%] w-[30%] h-[30%] rounded-full bg-white/70 pointer-events-none" />
            </div>
          ))}

          {/* Thick vertical line near the left border */}
          <div
            className={`absolute left-1 sm:left-1.5 bottom-18 sm:bottom-22 h-14 sm:h-20 w-1 sm:w-1.5 bg-black rounded-full transition-transform duration-200 ease-out z-10 ${
              isLeftVerticalShifted ? 'translate-x-1.5 sm:translate-x-2.5' : 'translate-x-0'
            }`}
          />

          {/* Thick vertical line near the right border */}
          <div
            className={`absolute right-1 sm:right-1.5 bottom-18 sm:bottom-22 h-14 sm:h-20 w-1 sm:w-1.5 bg-black rounded-full transition-transform duration-200 ease-out z-10 ${
              isRightVerticalShifted ? '-translate-x-1.5 sm:-translate-x-2.5' : 'translate-x-0'
            }`}
          />

          {/* Divided thick lines positioned a bit up from the bottom */}
          <div className="absolute bottom-7 sm:bottom-9 left-0 right-0 flex items-center gap-3 sm:gap-4 px-1 z-10">
            <div
              className={`flex-1 h-1 sm:h-1.5 bg-black transition-transform duration-200 ease-out origin-center ${
                isLeftLineRaised ? '-translate-y-3 sm:-translate-y-4' : 'translate-y-0'
              }`}
            />
            <div
              className={`flex-1 h-1 sm:h-1.5 bg-black transition-transform duration-200 ease-out origin-center ${
                isRightLineRaised ? '-translate-y-3 sm:-translate-y-4' : 'translate-y-0'
              }`}
            />
          </div>

          {/* Game Over Screen Overlay */}
          {isGameOver && (
            <div className="absolute inset-0 bg-black/75 backdrop-blur-[2px] flex flex-col items-center justify-center p-3 text-center z-40">
              <div className="bg-white rounded-xl p-3.5 sm:p-4 shadow-2xl border-2 border-black w-[90%] max-w-[240px] flex flex-col items-center gap-2">
                <div className="text-xs sm:text-sm font-mono font-black tracking-widest text-red-600 uppercase">
                  GAME OVER
                </div>
                <p className="text-[9px] sm:text-[10px] text-neutral-600 font-semibold leading-tight text-center">
                  {gameOverReason || 'Game Over!'}
                </p>
                <div className="my-0.5 py-1.5 px-3 bg-neutral-100 rounded-lg border border-neutral-300 w-full text-center">
                  <span className="text-[8px] sm:text-[9px] text-neutral-500 font-mono tracking-wider block uppercase font-bold">
                    TOTAL POINTS
                  </span>
                  <span className="text-lg sm:text-xl font-black text-blue-600 leading-tight block">
                    {score}
                  </span>
                </div>
                <p className="text-[9px] sm:text-[10px] text-neutral-800 font-semibold">
                  Would you like to play again?
                </p>
                <button
                  onClick={handleRestartGame}
                  className="mt-0.5 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-[10px] sm:text-[11px] font-bold rounded-lg transition-all cursor-pointer shadow-md w-full"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Play Again</span>
                </button>
                <span className="text-[8px] text-neutral-400 font-mono">Press 'R' to play again</span>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Mobile Key Controls (4 Circle Buttons) */}
        <div className="w-full border-t border-black/15 bg-neutral-50/80 px-2 py-2 flex items-center justify-around z-10">
          {circleButtons.map((btn) => {
            const isPressed = activeKey === btn.id;
            return (
              <button
                key={btn.id}
                onClick={() => handleKeyPress(btn.id)}
                title={btn.label}
                aria-label={btn.label}
                className={`relative flex items-center justify-center w-9 h-9 sm:w-11 sm:h-11 rounded-full text-blue-600 transition-all duration-150 active:scale-90 hover:bg-blue-50 focus:outline-none ${
                  isPressed ? 'bg-blue-100 scale-90' : ''
                }`}
              >
                <Circle className="w-5 h-5 sm:w-7 sm:h-7 stroke-[3] text-blue-600 fill-blue-500" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}





