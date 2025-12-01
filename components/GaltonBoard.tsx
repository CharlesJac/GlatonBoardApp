
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
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);
  const runnerRef = useRef<Matter.Runner | null>(null);
  
  // Gate Refs
  const leftGateRef = useRef<Matter.Body | null>(null);
  const rightGateRef = useRef<Matter.Body | null>(null);
  
  // State Refs for Loop Access
  const isGateOpenRef = useRef(isGateOpen);
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const animationFrameRef = useRef<number>(0);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    isGateOpenRef.current = isGateOpen;
  }, [isGateOpen]);
  
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Initialize Physics Engine
  useEffect(() => {
    if (!canvasContainerRef.current) return;

    const width = canvasContainerRef.current.clientWidth;
    const height = canvasContainerRef.current.clientHeight;

    const engine = Matter.Engine.create({
      gravity: { x: 0, y: 1, scale: 0.001 }
    });
    engineRef.current = engine;

    const render = Matter.Render.create({
      element: canvasContainerRef.current,
      engine: engine,
      options: {
        width: width,
        height: height,
        wireframes: false,
        background: '#eaddcf', // Cork-like background
        pixelRatio: window.devicePixelRatio,
      }
    });
    renderRef.current = render;

    const runner = Matter.Runner.create();
    runnerRef.current = runner;

    Matter.Render.run(render);
    Matter.Runner.run(runner, engine);

    setDimensions({ width, height });

    const resizeObserver = new ResizeObserver(() => {
        if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
        
        resizeTimeoutRef.current = setTimeout(() => {
            if (!canvasContainerRef.current || !renderRef.current) return;
            const newWidth = canvasContainerRef.current.clientWidth;
            const newHeight = canvasContainerRef.current.clientHeight;
            
            if (newWidth === 0 || newHeight === 0) return;
      
            const render = renderRef.current;
            render.bounds.max.x = newWidth;
            render.bounds.max.y = newHeight;
            render.options.width = newWidth;
            render.options.height = newHeight;
            
            render.canvas.width = newWidth * window.devicePixelRatio;
            render.canvas.height = newHeight * window.devicePixelRatio;
            render.canvas.style.width = `${newWidth}px`;
            render.canvas.style.height = `${newHeight}px`;
      
            setDimensions({ width: newWidth, height: newHeight });
        }, 100); 
    });

    resizeObserver.observe(canvasContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      Matter.Render.stop(render);
      Matter.Runner.stop(runner);
      if (render.canvas) render.canvas.remove();
      Matter.World.clear(engine.world, false);
      Matter.Engine.clear(engine);
    };
  }, []);

  // Helper to calculate consistent layout metrics
  const getLayoutMetrics = (width: number, height: number, cfg: SimulationConfig) => {
    const { rowCount, bucketCount } = cfg;
    const topMargin = 10;
    const funnelHeight = Math.max(70, height * 0.15);
    const gap = funnelHeight * 1.2; 
    
    const targetSpacingX = width / bucketCount;
    const targetSpacingY = targetSpacingX * 0.6; 
    const targetPegBlockHeight = (rowCount - 1) * targetSpacingY;
    
    const usedHeightPreBin = funnelHeight + topMargin + gap + targetPegBlockHeight;
    const remainingForBins = height - usedHeightPreBin;
    const minViableBinHeight = Math.max(150, height * 0.3);

    let spacingX, spacingY;

    if (remainingForBins >= minViableBinHeight) {
        spacingX = targetSpacingX;
        spacingY = targetSpacingY;
    } else {
        const maxAvailablePegHeight = height - funnelHeight - topMargin - gap - minViableBinHeight;
        spacingY = maxAvailablePegHeight / (rowCount - 1);
        spacingX = spacingY / 0.6; 
    }
    
    const finalPegBlockHeight = (rowCount - 1) * spacingY;
    const funnelTipY = funnelHeight;
    const pegStartY = funnelTipY + gap;
    const binStartY = pegStartY + finalPegBlockHeight + (spacingY * 0.5);
    const realBinHeight = Math.max(0, height - binStartY);

    return {
        funnelHeight,
        funnelTipY,
        pegStartY,
        binStartY,
        binHeight: realBinHeight,
        spacingX,
        spacingY
    };
  };


  // --- Event Listeners for Triggers ---

  // 1. Reset Trigger: Rebuild Static Board (clears balls)
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

  // 3. Gate Trigger is now handled in the loop via refs for animation


  // Setup Static Board (Funnel, Pegs, Bins, Gate)
  const setupStaticBoard = () => {
    if (!engineRef.current || !canvasContainerRef.current) return;
    
    const world = engineRef.current.world;
    Matter.World.clear(world, false); // Keep engine, clear bodies

    const width = canvasContainerRef.current.clientWidth;
    const height = canvasContainerRef.current.clientHeight;
    
    const layout = getLayoutMetrics(width, height, config);
    const { funnelTipY, pegStartY, binStartY, binHeight, spacingX, spacingY } = layout;

    const { rowCount, bucketCount, pegSize, ballSize } = config;
    const woodRender = { fillStyle: '#d97706', strokeStyle: '#b45309', lineWidth: 1 };

    // --- Funnel ---
    const gap = ballSize * 4;
    const halfWidth = width / 2;
    const tipXLeft = halfWidth - gap / 2;
    const tipXRight = halfWidth + gap / 2;

    const leftVerts = [{ x: 0, y: 0 }, { x: tipXLeft, y: funnelTipY }, { x: 0, y: funnelTipY }];
    const leftCentroid = { x: (0 + tipXLeft + 0) / 3, y: (0 + funnelTipY + funnelTipY) / 3 };
    const funnelLeft = Matter.Bodies.fromVertices(leftCentroid.x, leftCentroid.y, [leftVerts], {
        isStatic: true, render: woodRender, friction: 0, restitution: 0
    });

    const rightVerts = [{ x: width, y: 0 }, { x: width, y: funnelTipY }, { x: tipXRight, y: funnelTipY }];
    const rightCentroid = { x: (width + width + tipXRight) / 3, y: (0 + funnelTipY + funnelTipY) / 3 };
    const funnelRight = Matter.Bodies.fromVertices(rightCentroid.x, rightCentroid.y, [rightVerts], {
        isStatic: true, render: woodRender, friction: 0, restitution: 0
    });

    // --- Sliding Gates ---
    // Width needs to cover half the gap plus overlap to slide under funnel
    const gateOverlap = 30;
    const centerOverlap = 5; // Overlap at the center to prevent leaks
    const gateWidth = (gap / 2) + gateOverlap; 
    const gateHeight = 14;
    // Position gate at the funnel tip level so it physically overlaps vertically
    const gateY = funnelTipY; 

    // Initial Positions (Closed)
    // Left gate right edge at center + centerOverlap
    const leftGateX = (width / 2) - (gateWidth / 2) + centerOverlap;
    // Right gate left edge at center - centerOverlap
    const rightGateX = (width / 2) + (gateWidth / 2) - centerOverlap;

    const leftGate = Matter.Bodies.rectangle(leftGateX, gateY, gateWidth, gateHeight, {
        isStatic: true,
        render: { fillStyle: '#000000' },
        friction: 0.1
    });
    
    const rightGate = Matter.Bodies.rectangle(rightGateX, gateY, gateWidth, gateHeight, {
        isStatic: true,
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
                isStatic: true, friction: 0, render: { fillStyle: '#334155' }
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
                isStatic: true, render: { fillStyle: '#cbd5e1' }, chamfer: { radius: 2 }, friction: 0
        });
        bins.push(divider);
    }
    
    const floor = Matter.Bodies.rectangle(width/2, height + 50, width * 2, 100, { isStatic: true, friction: 0 });

    const bodiesToAdd = [...pegs, ...bins, funnelLeft, funnelRight, floor, leftGate, rightGate];
    
    Matter.World.add(world, bodiesToAdd);
  };

  // Spawn Balls (Incremental)
  const spawnBalls = () => {
      if (!engineRef.current || !canvasContainerRef.current) return;
      const width = canvasContainerRef.current.clientWidth;
      const height = canvasContainerRef.current.clientHeight;
      const layout = getLayoutMetrics(width, height, config);
      const { funnelTipY } = layout;
      const { ballSize } = config;

      const ballBodyRadius = ballSize;
      const ballSpacing = ballBodyRadius * 2.2;
      const ballsPerRow = Math.max(1, Math.floor(width / ballSpacing) - 2); 

      // Spread balls loosely above the funnel
      const balls = ballQueue.map((color, i) => {
            // Randomize slightly to prevent stacking towers that don't fall
            const col = i % ballsPerRow;
            const row = Math.floor(i / ballsPerRow);
            
            const rowWidth = ballsPerRow * ballSpacing;
            const startX = (width - rowWidth) / 2;
            
            const x = startX + (col * ballSpacing) + (Math.random() - 0.5) * 6;
            // Spawn higher up
            const y = funnelTipY - 50 - (row * ballSpacing * 1.1) - (Math.random() * 50);

            return Matter.Bodies.circle(x, y, ballSize, {
                label: 'ball',
                restitution: 0, 
                friction: 0,
                frictionAir: 0.02,
                density: 0.004,
                render: { fillStyle: color.color }
            });
        });

      Matter.World.add(engineRef.current.world, balls);
  };

  // Simulation Loop
  useEffect(() => {
    if (status !== 'running') {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        return;
    }

    const loop = () => {
      if (status !== 'running') return;

      if (engineRef.current && dimensions.width > 0) {
         const layout = getLayoutMetrics(dimensions.width, dimensions.height, config);
         
         // --- Gate Animation ---
         if (leftGateRef.current && rightGateRef.current) {
             const isOpen = isGateOpenRef.current;
             const gap = config.ballSize * 4;
             const gateOverlap = 30; 
             const centerOverlap = 5; // Must match static setup to align
             const gateWidth = (gap / 2) + gateOverlap;
             const width = dimensions.width;
             const center = width / 2;
             
             // Targets
             // Closed: Shifted inwards by centerOverlap for tight seal
             const closedLeftX = center - (gateWidth / 2) + centerOverlap;
             const closedRightX = center + (gateWidth / 2) - centerOverlap;
             
             // Open: Slide out
             const slideDist = gateWidth + 5;
             const openLeftX = closedLeftX - slideDist;
             const openRightX = closedRightX + slideDist;
             
             const targetLeftX = isOpen ? openLeftX : closedLeftX;
             const targetRightX = isOpen ? openRightX : closedRightX;
             
             const currentLeft = leftGateRef.current.position.x;
             const currentRight = rightGateRef.current.position.x;
             
             // Lerp factor
             const t = 0.2;
             
             const newLeftX = currentLeft + (targetLeftX - currentLeft) * t;
             const newRightX = currentRight + (targetRightX - currentRight) * t;
             
             Matter.Body.setPosition(leftGateRef.current, { x: newLeftX, y: leftGateRef.current.position.y });
             Matter.Body.setPosition(rightGateRef.current, { x: newRightX, y: rightGateRef.current.position.y });
         }


         // --- Ball Physics Adjustments ---
         const balls = Matter.Composite.allBodies(engineRef.current.world).filter(b => b.label === 'ball');
         
         balls.forEach(ball => {
             if (ball.position.y < layout.funnelTipY + 10) {
                 ball.restitution = 0;
             } else if (ball.position.y > layout.binStartY - 10) {
                 ball.restitution = 0;
             } else {
                 ball.restitution = config.ballRestitution;
             }
         });

         if (balls.length > 0) {
             const allSettled = balls.every(b => b.speed < 0.15 && b.angularSpeed < 0.1 && b.position.y > layout.binStartY);
             if (allSettled) onCompleteRef.current();
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
    <div className="w-full h-full relative bg-white isolate">
       <div ref={canvasContainerRef} className="absolute inset-0 z-0 cursor-crosshair" />
       {renderLabels()}
       <div className="absolute top-2 left-2 text-xs text-slate-500 font-mono pointer-events-none select-none z-10 font-bold">
          Balls: {config.ballCount}
       </div>
    </div>
  );
};

export default GaltonBoard;
