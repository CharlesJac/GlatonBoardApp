
import React, { useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';
import { SimulationConfig, BallColor, SimulationStatus } from '../types';

interface GaltonBoardProps {
  status: SimulationStatus;
  config: SimulationConfig;
  ballQueue: BallColor[];
  bucketLabels: string[];
  onComplete: () => void;
  onLabelChange: (index: number, value: string) => void;
  fillTrigger: number;
  resetTrigger: number;
  isGateOpen: boolean;
}

const GaltonBoard: React.FC<GaltonBoardProps> = ({ 
  status, 
  config, 
  ballQueue, 
  bucketLabels, 
  onComplete,
  onLabelChange,
  fillTrigger,
  resetTrigger,
  isGateOpen
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Two canvases: One for static elements (pegs/walls), one for dynamic (balls/gates)
  const staticCanvasRef = useRef<HTMLCanvasElement>(null);
  const dynamicCanvasRef = useRef<HTMLCanvasElement>(null);

  const engineRef = useRef<Matter.Engine | null>(null);
  const runnerRef = useRef<Matter.Runner | null>(null);
  
  // Gate Refs
  const leftGateRef = useRef<Matter.Body | null>(null);
  const rightGateRef = useRef<Matter.Body | null>(null);
  
  // Optimization Refs
  const ballsRef = useRef<Matter.Body[]>([]); // Direct access to ball bodies to avoid world filtering
  const spriteCacheRef = useRef<Record<string, HTMLCanvasElement>>({}); // Pre-rendered sprites
  const layoutRef = useRef<any>(null); // Cached layout metrics
  
  // State Refs for Loop Access
  const isGateOpenRef = useRef(isGateOpen);
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const animationFrameRef = useRef<number>(0);
  const onCompleteRef = useRef(onComplete);

  // Track bodies for custom rendering
  const staticBodiesRef = useRef<Matter.Body[]>([]);

  // FPS and Stats Tracking
  const [fps, setFps] = useState(0);
  const [activeBallCount, setActiveBallCount] = useState(0);
  const fpsRef = useRef({ startTime: 0, frameCount: 0 });
  const lastStateUpdateRef = useRef(0);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    isGateOpenRef.current = isGateOpen;
    
    // Initial wake up signal when gate opens
    if (isGateOpen && engineRef.current) {
        // Use the optimized ref
        const balls = ballsRef.current;
        for (const body of balls) {
             Matter.Sleeping.set(body, false);
        }
    }
  }, [isGateOpen]);
  
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Helper to calculate consistent layout metrics
  const getLayoutMetrics = (width: number, height: number, cfg: SimulationConfig) => {
    const { rowCount, bucketCount } = cfg;
    const topMargin = 10;
    
    const funnelSlopeHeight = Math.max(70, height * 0.15);
    const funnelNeckHeight = 40; // EXTENDED: Vertical channel to straighten balls for normal distribution
    const funnelExitY = funnelSlopeHeight + funnelNeckHeight;
    
    const gap = 30; // Gap between funnel exit and first peg
    
    // NEW LOGIC: Always fill the full width of the container
    const spacingX = width / bucketCount;
    
    // Ideal vertical spacing based on ratio (0.75 for better clearance)
    const idealSpacingY = spacingX * 0.75; 
    
    // Calculate available vertical space for the peg block
    const minViableBinHeight = Math.max(150, height * 0.3);
    const availableHeightForPegs = height - funnelExitY - topMargin - gap - minViableBinHeight;
    
    let spacingY = idealSpacingY;
    const requiredHeight = (rowCount - 1) * spacingY;
    
    // If the ideal layout doesn't fit vertically, squash the vertical spacing
    if (requiredHeight > availableHeightForPegs) {
        spacingY = Math.max(10, availableHeightForPegs / (rowCount - 1));
    }
    
    const finalPegBlockHeight = (rowCount - 1) * spacingY;
    
    // Use funnelSlopeHeight for where the angle ends, but exit is lower
    const pegStartY = funnelExitY + gap;
    const binStartY = pegStartY + finalPegBlockHeight + (spacingY * 0.5);
    const realBinHeight = Math.max(0, height - binStartY);

    return {
        funnelSlopeHeight,
        funnelNeckHeight,
        funnelExitY,
        pegStartY,
        binStartY,
        binHeight: realBinHeight,
        spacingX,
        spacingY
    };
  };

  // Update cached layout when dimensions or config change
  useEffect(() => {
      if (dimensions.width > 0) {
          layoutRef.current = getLayoutMetrics(dimensions.width, dimensions.height, config);
      }
  }, [dimensions, config]);

  // Generate Sprites for GPU Optimized Rendering
  useEffect(() => {
      const pixelRatio = window.devicePixelRatio || 1;
      const radius = config.ballSize;
      const size = (radius * 2) + 2; // +2 for antialiasing padding
      const newCache: Record<string, HTMLCanvasElement> = {};
      
      // Get unique colors from the queue and defaults to be safe
      const colors = new Set<string>();
      ballQueue.forEach(b => colors.add(b.color));
      
      colors.forEach(color => {
          const c = document.createElement('canvas');
          c.width = size * pixelRatio;
          c.height = size * pixelRatio;
          const ctx = c.getContext('2d');
          if (ctx) {
              ctx.scale(pixelRatio, pixelRatio);
              ctx.beginPath();
              // Center the circle in the sprite
              ctx.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
              ctx.fillStyle = color;
              ctx.fill();
          }
          newCache[color] = c;
      });
      
      spriteCacheRef.current = newCache;
  }, [config.ballSize, ballQueue]);

  // Initialize Physics Engine
  useEffect(() => {
    if (!containerRef.current) return;

    // OPTIMIZATION: Enable Sleeping
    const engine = Matter.Engine.create({
      enableSleeping: true, 
      gravity: { x: 0, y: 1, scale: 0.001 }
    });
    engineRef.current = engine;

    const runner = Matter.Runner.create();
    runnerRef.current = runner;

    // Start the physics runner
    Matter.Runner.run(runner, engine);

    // Initial sizing
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    setDimensions({ width, height });

    const resizeObserver = new ResizeObserver(() => {
        if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
        
        // Debounce resize
        resizeTimeoutRef.current = setTimeout(() => {
            if (!containerRef.current) return;
            const newWidth = containerRef.current.clientWidth;
            const newHeight = containerRef.current.clientHeight;
            
            if (newWidth === 0 || newHeight === 0) return;
            setDimensions({ width: newWidth, height: newHeight });
        }, 100); 
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      Matter.Runner.stop(runner);
      Matter.World.clear(engine.world, false);
      Matter.Engine.clear(engine);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  // Sync Canvas Sizes to State
  useEffect(() => {
      if (dimensions.width === 0) return;
      
      const pixelRatio = window.devicePixelRatio || 1;
      
      [staticCanvasRef.current, dynamicCanvasRef.current].forEach(canvas => {
          if (canvas) {
              canvas.width = dimensions.width * pixelRatio;
              canvas.height = dimensions.height * pixelRatio;
              canvas.style.width = `${dimensions.width}px`;
              canvas.style.height = `${dimensions.height}px`;
              
              const ctx = canvas.getContext('2d');
              if (ctx) ctx.scale(pixelRatio, pixelRatio);
          }
      });

      // Re-draw static elements whenever dimensions change
      if (engineRef.current) {
          drawStaticLayer();
      }
      
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimensions]);

  // --- Event Listeners for Triggers ---

  // 1. Reset Trigger: Rebuild Static Board
  useEffect(() => {
      if (dimensions.width === 0) return;
      setupStaticBoard();
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetTrigger, config, dimensions]); 

  // 2. Fill Trigger: Spawn Balls
  useEffect(() => {
      if (fillTrigger > 0 && dimensions.width > 0) {
          spawnBalls();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fillTrigger]);

  
  // --- CUSTOM RENDERING LOGIC ---

  const drawStaticLayer = () => {
    const canvas = staticCanvasRef.current;
    if (!canvas || !engineRef.current) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear
    ctx.clearRect(0, 0, canvas.width / window.devicePixelRatio, canvas.height / window.devicePixelRatio);
    
    // Draw all static bodies
    staticBodiesRef.current.forEach(body => {
        ctx.beginPath();
        if (body.label === 'peg') {
             const r = body.circleRadius || config.pegSize;
             ctx.arc(body.position.x, body.position.y, r, 0, 2 * Math.PI);
             ctx.fillStyle = '#334155';
             ctx.fill();
        } else if (body.label === 'funnel') {
             ctx.fillStyle = '#d97706';
             ctx.strokeStyle = '#b45309';
             ctx.lineWidth = 1;
             
             if (body.vertices && body.vertices.length > 0) {
                 ctx.moveTo(body.vertices[0].x, body.vertices[0].y);
                 for (let j = 1; j < body.vertices.length; j++) {
                     ctx.lineTo(body.vertices[j].x, body.vertices[j].y);
                 }
                 ctx.closePath();
                 ctx.fill();
                 ctx.stroke();
             }
        } else if (body.label === 'bin' || body.label === 'floor') {
             // Treat as vertices polygon
             ctx.fillStyle = body.label === 'bin' ? '#cbd5e1' : 'transparent';
             if (body.vertices && body.vertices.length > 0) {
                 ctx.moveTo(body.vertices[0].x, body.vertices[0].y);
                 for (let j = 1; j < body.vertices.length; j++) {
                     ctx.lineTo(body.vertices[j].x, body.vertices[j].y);
                 }
                 ctx.closePath();
                 ctx.fill();
             }
        }
    });
  };

  const drawDynamicLayer = () => {
      const canvas = dynamicCanvasRef.current;
      if (!canvas || !engineRef.current) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Clear
      const w = dimensions.width;
      const h = dimensions.height;
      ctx.clearRect(0, 0, w, h);

      // 1. Draw Gates (Black)
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      
      const drawBody = (b: Matter.Body | null) => {
        if (b && b.vertices) {
            ctx.moveTo(b.vertices[0].x, b.vertices[0].y);
            for (let j = 1; j < b.vertices.length; j++) ctx.lineTo(b.vertices[j].x, b.vertices[j].y);
        }
      };

      drawBody(leftGateRef.current);
      drawBody(rightGateRef.current);
      ctx.fill();

      // 2. Draw Balls using Cached Sprites (GPU Optimized)
      // Use the direct ballsRef to avoid filtering all world bodies
      const balls = ballsRef.current;
      const spriteSize = (config.ballSize * 2) + 2;
      const spriteOffset = spriteSize / 2;

      for (let i = 0; i < balls.length; i++) {
          const ball = balls[i];
          const color = ball.render.fillStyle as string;
          const sprite = spriteCacheRef.current[color];
          
          if (sprite) {
              // drawImage is extremely fast on GPU
              // Rounding positions can help crispness, but let's stick to sub-pixel for physics smoothness
              ctx.drawImage(sprite, ball.position.x - spriteOffset, ball.position.y - spriteOffset, spriteSize, spriteSize);
          } else {
              // Fallback if sprite missing (should not happen)
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(ball.position.x, ball.position.y, config.ballSize, 0, 2 * Math.PI);
              ctx.fill();
          }
      }
  };

  // --- Board Setup Logic ---

  const setupStaticBoard = () => {
    if (!engineRef.current || dimensions.width === 0) return;
    
    const world = engineRef.current.world;
    Matter.World.clear(world, false); // Keep engine, clear bodies
    
    staticBodiesRef.current = [];
    ballsRef.current = []; // Clear direct ball reference
    setFps(0);
    setActiveBallCount(0);

    const width = dimensions.width;
    const height = dimensions.height;
    
    const layout = getLayoutMetrics(width, height, config);
    const { funnelSlopeHeight, funnelNeckHeight, funnelExitY, pegStartY, binStartY, binHeight, spacingX, spacingY } = layout;

    const { rowCount, bucketCount, pegSize, ballSize } = config;

    // --- Funnel ---
    // STRICT SINGLE FILE GAP for Normal Distribution
    // Gap needs to be just slightly larger than 1 ball diameter (2 * radius)
    // Ball diam = 2 * ballSize. Gap = 2.2 * 2 * ballSize approx?
    const gap = Math.max(ballSize * 2.2, 5); 

    const halfWidth = width / 2;
    const tipXLeft = halfWidth - gap / 2;
    const tipXRight = halfWidth + gap / 2;

    // Merge Slope and Neck into single bodies to prevent cracks where balls get stuck.
    
    // Left Wall Body (Polygon)
    // Vertices order: Top-Left -> Slope-Corner -> Neck-Bottom -> Wall-Bottom
    const leftVerts = [
        { x: 0, y: 0 }, 
        { x: tipXLeft, y: funnelSlopeHeight }, 
        { x: tipXLeft, y: funnelExitY }, 
        { x: 0, y: funnelExitY }
    ];
    // Calculate centroid manually to ensure correct absolute positioning with fromVertices
    const leftCentre = Matter.Vertices.centre(leftVerts);
    const funnelLeft = Matter.Bodies.fromVertices(leftCentre.x, leftCentre.y, [leftVerts], {
        isStatic: true, label: 'funnel', friction: 0, restitution: 0
    });

    // Right Wall Body (Polygon)
    const rightVerts = [
        { x: width, y: 0 }, 
        { x: width, y: funnelExitY }, 
        { x: tipXRight, y: funnelExitY }, 
        { x: tipXRight, y: funnelSlopeHeight }
    ];
    const rightCentre = Matter.Vertices.centre(rightVerts);
    const funnelRight = Matter.Bodies.fromVertices(rightCentre.x, rightCentre.y, [rightVerts], {
        isStatic: true, label: 'funnel', friction: 0, restitution: 0
    });

    // --- Sliding Gates ---
    const gateOverlap = 30;
    const centerOverlap = 5; 
    const gateWidth = (gap / 2) + gateOverlap; 
    const gateHeight = 14;
    // Position gate at the exit of the neck
    const gateY = funnelExitY; 

    // Initial Positions (Closed)
    const leftGateX = (width / 2) - (gateWidth / 2) + centerOverlap;
    const rightGateX = (width / 2) + (gateWidth / 2) - centerOverlap;

    const leftGate = Matter.Bodies.rectangle(leftGateX, gateY, gateWidth, gateHeight, {
        isStatic: true, label: 'gate',
        render: { fillStyle: '#000000' },
        friction: 0.1
    });
    
    const rightGate = Matter.Bodies.rectangle(rightGateX, gateY, gateWidth, gateHeight, {
        isStatic: true, label: 'gate',
        render: { fillStyle: '#000000' },
        friction: 0.1
    });

    leftGateRef.current = leftGate;
    rightGateRef.current = rightGate;

    // --- Pegs ---
    const pegs: Matter.Body[] = [];
    const colsPerRow = bucketCount + 2; 
    
    for (let row = 0; row < rowCount; row++) {
      const y = pegStartY + row * spacingY;
      const isOddRow = row % 2 !== 0;
      const maxOffset = Math.floor(colsPerRow / 2);
      
      for (let i = -maxOffset; i <= maxOffset; i++) {
        let xOffset = i * spacingX;
        if (isOddRow) xOffset += spacingX / 2; 
        
        const x = width / 2 + xOffset;
        if (x > -20 && x < width + 20) {
             const circle = Matter.Bodies.circle(x, y, pegSize, {
                isStatic: true, 
                label: 'peg', 
                friction: 0.001, // Slight friction to aid rolling
                restitution: config.ballRestitution
              });
              pegs.push(circle);
        }
      }
    }

    // --- Bins ---
    const bins: Matter.Body[] = [];
    const totalBinWidth = bucketCount * spacingX;
    const binAreaStartX = (width / 2) - (totalBinWidth / 2);
    const validBinHeight = Math.max(1, binHeight);
    const binCenterY = binStartY + (validBinHeight / 2);
    
    for (let i = 0; i <= bucketCount; i++) {
        const divX = binAreaStartX + (i * spacingX);
        const divider = Matter.Bodies.rectangle(divX, binCenterY, 4, validBinHeight, { 
                isStatic: true, label: 'bin', chamfer: { radius: 2 }, friction: 0
        });
        bins.push(divider);
    }
    
    const floor = Matter.Bodies.rectangle(width/2, height + 50, width * 2, 100, { isStatic: true, label: 'floor', friction: 0 });

    const staticBodies = [...pegs, ...bins, funnelLeft, funnelRight, floor];
    staticBodiesRef.current = staticBodies;

    Matter.World.add(world, [...staticBodies, leftGate, rightGate]);
    
    // Trigger static draw
    drawStaticLayer();
    // Clear dynamic layer (fix for Reset)
    drawDynamicLayer();
  };

  // Spawn Balls
  const spawnBalls = () => {
      if (!engineRef.current || dimensions.width === 0) return;
      const width = dimensions.width;
      const height = dimensions.height;
      
      // Use ref if available, else calc
      const layout = layoutRef.current || getLayoutMetrics(width, height, config);
      const { funnelSlopeHeight } = layout;
      const { ballSize } = config;

      const ballBodyRadius = ballSize;
      const ballSpacing = ballBodyRadius * 2.2;
      const ballsPerRow = Math.max(1, Math.floor(width / ballSpacing) - 2); 

      const newBalls = ballQueue.map((color, i) => {
            const col = i % ballsPerRow;
            const row = Math.floor(i / ballsPerRow);
            
            const rowWidth = ballsPerRow * ballSpacing;
            const startX = (width - rowWidth) / 2;
            
            // Spawn above the funnel slope
            const x = startX + (col * ballSpacing) + (Math.random() - 0.5) * 6;
            const y = funnelSlopeHeight - 50 - (row * ballSpacing * 1.1) - (Math.random() * 50);

            return Matter.Bodies.circle(x, y, ballSize, {
                label: 'ball',
                restitution: 0, 
                friction: config.ballFriction, // Configurable Friction
                frictionAir: 0.005, 
                density: 0.004,
                sleepThreshold: 30, // Default is 60, lower means they sleep sooner
                render: { fillStyle: color.color }
            });
        });
      
      // Update persistent ref
      ballsRef.current = [...ballsRef.current, ...newBalls];
      Matter.World.add(engineRef.current.world, newBalls);
  };

  // Simulation Loop
  useEffect(() => {
    if (status !== 'running') {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        return;
    }

    const loop = (time: number) => {
      if (status !== 'running') return;

      // FPS Calc
      if (time - fpsRef.current.startTime > 500) {
          const delta = time - fpsRef.current.startTime;
          const frames = fpsRef.current.frameCount;
          const currentFps = Math.round((frames / delta) * 1000);
          
          if (time - lastStateUpdateRef.current > 500) {
              setFps(currentFps);
              lastStateUpdateRef.current = time;
          }
          
          fpsRef.current.startTime = time;
          fpsRef.current.frameCount = 0;
      }
      fpsRef.current.frameCount++;


      if (engineRef.current && dimensions.width > 0) {
         drawDynamicLayer();

         // OPTIMIZATION: Use cached layout
         const layout = layoutRef.current || getLayoutMetrics(dimensions.width, dimensions.height, config);
         
         // --- Gate Animation ---
         if (leftGateRef.current && rightGateRef.current) {
             const isOpen = isGateOpenRef.current;
             // Gap matches static setup logic for water tight seal
             const ballSize = config.ballSize;
             const gap = Math.max(ballSize * 2.2, 5);
             
             const gateOverlap = 30; 
             const centerOverlap = 5;
             const gateWidth = (gap / 2) + gateOverlap;
             const width = dimensions.width;
             const center = width / 2;
             
             // Targets
             const closedLeftX = center - (gateWidth / 2) + centerOverlap;
             const closedRightX = center + (gateWidth / 2) - centerOverlap;
             
             const slideDist = gateWidth + 5;
             const openLeftX = closedLeftX - slideDist;
             const openRightX = closedRightX + slideDist;
             
             const targetLeftX = isOpen ? openLeftX : closedLeftX;
             const targetRightX = isOpen ? openRightX : closedRightX;
             
             const currentLeft = leftGateRef.current.position.x;
             const currentRight = rightGateRef.current.position.x;
             
             const t = 0.2;
             
             const newLeftX = currentLeft + (targetLeftX - currentLeft) * t;
             const newRightX = currentRight + (targetRightX - currentRight) * t;
             
             Matter.Body.setPosition(leftGateRef.current, { x: newLeftX, y: leftGateRef.current.position.y });
             Matter.Body.setPosition(rightGateRef.current, { x: newRightX, y: rightGateRef.current.position.y });
         }


         // --- Ball Physics Adjustments ---
         // OPTIMIZATION: Iterate persistent array
         const balls = ballsRef.current;
         let activeCount = 0;
         let totalBalls = balls.length;
         
         // Pre-calculate constants for loop
         const binLimit = layout.binStartY - 10;
         const funnelLimit = layout.funnelExitY + 10;
         const restitution = config.ballRestitution;
         const friction = config.ballFriction;
         const gateOpen = isGateOpenRef.current;
         const binStartY = layout.binStartY;

         for (let i = 0; i < totalBalls; i++) {
             const ball = balls[i];
             
             // CRITICAL: Force wake up balls if the gate is open and they are above the bins
             if (gateOpen && ball.position.y < binStartY) {
                 if (ball.isSleeping) {
                     Matter.Sleeping.set(ball, false);
                 }
             }
             
             // Dynamic Friction update
             if (ball.friction !== friction) {
                 ball.friction = friction;
             }

             if (ball.isSleeping) continue;
             
             activeCount++;
             
             const y = ball.position.y;

             // Reduce bounce in funnel and bins
             if (y < funnelLimit) {
                 if (ball.restitution !== 0.1) ball.restitution = 0.1; // Small damping
             } else if (y > binLimit) {
                 if (ball.restitution !== 0) ball.restitution = 0;
             } else {
                 if (ball.restitution !== restitution) ball.restitution = restitution;
             }
             
             // Anti-jamming: slight noise for almost stopped balls in funnel
             if (gateOpen && y < funnelLimit && ball.speed < 0.1 && Math.random() < 0.05) {
                 Matter.Body.applyForce(ball, ball.position, { x: (Math.random() - 0.5) * 0.0001, y: 0 });
             }
         }
         
         if (time - lastStateUpdateRef.current < 10) { 
             setActiveBallCount(activeCount);
         }

         if (totalBalls > 0) {
             if (activeCount === 0 && totalBalls === config.ballCount) {
                  onCompleteRef.current();
             } else {
                 if (activeCount === 0) {
                     onCompleteRef.current();
                 }
             }
         }
      }
      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [status, dimensions, config]); 

  const renderLabels = () => {
      if (dimensions.width === 0) return null;
      const layout = getLayoutMetrics(dimensions.width, dimensions.height, config);
      const { spacingX } = layout;
      const { bucketCount } = config;
      const width = dimensions.width;
      
      const totalBinWidth = bucketCount * spacingX;
      const binStartX = (width / 2) - (totalBinWidth / 2);

      return (
        <div className="absolute bottom-0 left-0 w-full h-[40px] pointer-events-none z-10">
            {bucketLabels.map((label, i) => {
                const centerX = binStartX + (i * spacingX) + (spacingX / 2);
                return (
                    <input
                        key={i}
                        type="text"
                        value={label}
                        onChange={(e) => onLabelChange(i, e.target.value)}
                        className="absolute bottom-1 text-center bg-transparent border-none focus:bg-white/80 focus:ring-1 focus:ring-indigo-300 focus:outline-none text-xs font-bold text-slate-800 pointer-events-auto transition-all rounded hover:bg-white/40 shadow-sm"
                        style={{
                            width: Math.max(20, spacingX - 4),
                            left: centerX - (Math.max(20, spacingX - 4) / 2),
                        }}
                    />
                );
            })}
        </div>
      );
  };

  return (
    <div className="w-full h-full relative bg-[#eaddcf] isolate overflow-hidden" ref={containerRef}>
       <canvas 
         ref={staticCanvasRef} 
         className="absolute inset-0 z-0 pointer-events-none" 
       />
       <canvas 
         ref={dynamicCanvasRef} 
         className="absolute inset-0 z-1 pointer-events-none" 
       />
       {renderLabels()}
       <div className="absolute top-2 left-2 text-xs text-slate-600 font-mono pointer-events-none select-none z-20 font-bold bg-white/80 p-2 rounded backdrop-blur-sm border border-white/50 shadow-sm">
          <div>FPS: {fps}</div>
          <div>Balls: {activeBallCount} / {ballsRef.current.length}</div>
       </div>
    </div>
  );
};

export default GaltonBoard;
