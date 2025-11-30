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
}

const GaltonBoard: React.FC<GaltonBoardProps> = ({ 
  status, 
  config, 
  ballQueue, 
  bucketLabels, 
  onComplete,
  onLabelChange 
}) => {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);
  const runnerRef = useRef<Matter.Runner | null>(null);
  const gateRef = useRef<Matter.Body | null>(null);
  
  // Refs for simulation state
  const animationFrameRef = useRef<number>(0);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);
  
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Initialize Physics Engine
  useEffect(() => {
    if (!canvasContainerRef.current) return;

    const width = canvasContainerRef.current.clientWidth;
    const height = canvasContainerRef.current.clientHeight;

    // We can allow initialization even with small dims, resize will catch it.
    
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

    // Use ResizeObserver to track container size changes driven by parent
    const resizeObserver = new ResizeObserver(() => {
        if (!canvasContainerRef.current || !renderRef.current) return;
        const newWidth = canvasContainerRef.current.clientWidth;
        const newHeight = canvasContainerRef.current.clientHeight;
  
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
    const topMargin = 20;
    
    // Vertical Allocation
    // Funnel takes ~15% of height, minimum 80px
    const funnelHeight = Math.max(80, height * 0.15);
    const gap = 30; // Gap between funnel and pegs
    
    // 1. Prioritize Width: Calculate target spacing to cover the WHOLE horizontal area
    // Remove side margins effectively by setting total width = width
    const targetSpacingX = width / bucketCount;
    const targetSpacingY = targetSpacingX * 0.866; // Hex/Triangular grid ratio
    
    const targetPegBlockHeight = (rowCount - 1) * targetSpacingY;
    
    // Check available height if we use full width
    const usedHeightPreBin = funnelHeight + topMargin + gap + targetPegBlockHeight;
    const remainingForBins = height - usedHeightPreBin;
    
    // Minimum viable bin height to ensure functionality.
    // Ideally we want deep bins, but if screen is small we accept smaller bins to keep full width.
    const minViableBinHeight = Math.max(40, height * 0.08);

    let spacingX, spacingY;

    if (remainingForBins >= minViableBinHeight) {
        // Option A: Full width fits!
        // We use the target spacing and let the bins take up all remaining vertical space.
        spacingX = targetSpacingX;
        spacingY = targetSpacingY;
    } else {
        // Option B: Full width makes the board too tall.
        // We must scale down the spacing to fit vertically, sacrificing some horizontal width.
        // Calculate max possible peg height leaving room for minimal bins.
        const maxAvailablePegHeight = height - funnelHeight - topMargin - gap - minViableBinHeight;
        spacingY = maxAvailablePegHeight / (rowCount - 1);
        spacingX = spacingY / 0.866;
    }
    
    // Recalculate block height based on the CHOSEN spacingY
    const finalPegBlockHeight = (rowCount - 1) * spacingY;

    const funnelTipY = funnelHeight;
    const pegStartY = funnelTipY + gap;
    
    // Bins start below the last peg row
    const binStartY = pegStartY + finalPegBlockHeight + (spacingY * 0.5);
    
    // Recalculate binHeight precisely based on startY
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

  // Board Setup and Gate Control
  useEffect(() => {
    if (!engineRef.current || dimensions.width === 0) return;
    
    // Only rebuild board when idle. 
    // This allows balls to settle in the funnel before "Start" is clicked.
    if (status === 'idle') {
        setupBoard();
    } else if (status === 'running') {
        // When switching to running, remove the gate to release balls
        if (gateRef.current) {
            Matter.World.remove(engineRef.current.world, gateRef.current);
            gateRef.current = null;
        }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, config, dimensions, ballQueue]); 

  // Simulation Loop (Physics Updates & Completion Check)
  useEffect(() => {
    if (status !== 'running') {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
        }
        return;
    }

    const loop = () => {
      if (status !== 'running') return;

      if (engineRef.current && dimensions.width > 0) {
         // 1. Dynamic Restitution Logic
         const layout = getLayoutMetrics(dimensions.width, dimensions.height, config);
         const balls = Matter.Composite.allBodies(engineRef.current.world).filter(b => b.label === 'ball');
         
         balls.forEach(ball => {
             // In Funnel Area: Zero restitution to prevent crazy bouncing
             if (ball.position.y < layout.funnelTipY + 10) {
                 ball.restitution = 0;
             } 
             // In Bin Area: Zero restitution to help settling
             else if (ball.position.y > layout.binStartY - 10) {
                 ball.restitution = 0;
             } 
             // In Peg Area: Use configured restitution
             else {
                 ball.restitution = config.ballRestitution;
             }
         });

         // 2. Completion Logic
         if (balls.length > 0) {
             // Check if all balls have settled at the bottom
             const allSettled = balls.every(b => {
                 return b.speed < 0.15 && b.angularSpeed < 0.1 && b.position.y > layout.binStartY;
             });
             
             if (allSettled) {
                 onCompleteRef.current();
             }
         }
      }

      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [status, dimensions, config]); // config dependency needed for restitution


  const setupBoard = () => {
    if (!engineRef.current || !canvasContainerRef.current) return;
    
    const world = engineRef.current.world;
    Matter.World.clear(world, false); 

    const width = canvasContainerRef.current.clientWidth;
    const height = canvasContainerRef.current.clientHeight;
    
    const layout = getLayoutMetrics(width, height, config);
    const { 
        funnelTipY, 
        pegStartY, 
        binStartY, 
        binHeight, 
        spacingX, 
        spacingY 
    } = layout;

    const { rowCount, bucketCount, pegSize, ballSize } = config;
    const woodRender = { fillStyle: '#d97706', strokeStyle: '#b45309', lineWidth: 1 };

    // --- 1. Funnel (Two Triangles) ---
    // User Requirement: "Opening 2x the size of the ball"
    // ballSize is radius, so opening = 2 * diameter = 4 * radius
    const gap = ballSize * 4;
    
    const halfWidth = width / 2;
    const tipXLeft = halfWidth - gap / 2;
    const tipXRight = halfWidth + gap / 2;

    const leftVerts = [
        { x: 0, y: 0 },
        { x: tipXLeft, y: funnelTipY },
        { x: 0, y: funnelTipY }
    ];
    const leftCentroid = {
        x: (0 + tipXLeft + 0) / 3,
        y: (0 + funnelTipY + funnelTipY) / 3
    };
    const funnelLeft = Matter.Bodies.fromVertices(leftCentroid.x, leftCentroid.y, [leftVerts], {
        isStatic: true,
        render: woodRender,
        friction: 0,
        restitution: 0
    });

    const rightVerts = [
        { x: width, y: 0 },
        { x: width, y: funnelTipY },
        { x: tipXRight, y: funnelTipY }
    ];
    const rightCentroid = {
        x: (width + width + tipXRight) / 3,
        y: (0 + funnelTipY + funnelTipY) / 3
    };
    const funnelRight = Matter.Bodies.fromVertices(rightCentroid.x, rightCentroid.y, [rightVerts], {
        isStatic: true,
        render: woodRender,
        friction: 0,
        restitution: 0
    });

    // --- Gate ---
    const gate = Matter.Bodies.rectangle(width/2, funnelTipY + 5, gap + 20, 10, {
        isStatic: true,
        render: { visible: false } 
    });
    gateRef.current = gate;

    // --- 2. Rectangle of Pegs (ZigZag) ---
    const pegs: Matter.Body[] = [];
    const colsPerRow = Math.ceil(width / spacingX) + 2; 
    
    for (let row = 0; row < rowCount; row++) {
      const y = pegStartY + row * spacingY;
      const isOddRow = row % 2 !== 0;
      const maxOffset = Math.ceil(colsPerRow / 2);
      
      for (let i = -maxOffset; i <= maxOffset; i++) {
        let xOffset = i * spacingX;
        if (isOddRow) {
           xOffset += spacingX / 2; 
        }
        
        const x = width / 2 + xOffset;
        
        // Ensure pegs stay within bounds, slightly looser constraint
        if (x > -10 && x < width + 10) {
             const circle = Matter.Bodies.circle(x, y, pegSize, {
                isStatic: true,
                friction: 0,
                render: {
                  fillStyle: '#334155' 
                }
              });
              pegs.push(circle);
        }
      }
    }

    // --- 3. Bins ---
    const bins: Matter.Body[] = [];
    const totalBinWidth = bucketCount * spacingX;
    const binAreaStartX = (width / 2) - (totalBinWidth / 2);
    // Determine center Y for the rectangle body. 
    // MatterJS rectangles are positioned by their center.
    // If binHeight is 0 or negative, this body is invalid. 
    // We ensured binHeight >= 0 in getLayoutMetrics.
    const validBinHeight = Math.max(1, binHeight);
    const binCenterY = binStartY + (validBinHeight / 2);
    
    for (let i = 0; i <= bucketCount; i++) {
        const divX = binAreaStartX + (i * spacingX);
        const divider = Matter.Bodies.rectangle(
            divX, 
            binCenterY, 
            4, 
            validBinHeight, 
            { 
                isStatic: true,
                render: { fillStyle: '#cbd5e1' },
                chamfer: { radius: 2 },
                friction: 0
            }
        );
        bins.push(divider);
    }
    
    // Floor
    const floor = Matter.Bodies.rectangle(width/2, height + 50, width * 2, 100, { isStatic: true, friction: 0 });

    // --- 4. Spawn All Balls ---
    const ballBodyRadius = ballSize;
    // Pack tightly but allow randomness
    const ballSpacing = ballBodyRadius * 2.2;
    const ballsPerRow = 25; 

    const balls = ballQueue.map((color, i) => {
        const col = i % ballsPerRow;
        const row = Math.floor(i / ballsPerRow);
        
        const rowWidth = ballsPerRow * ballSpacing;
        const startX = (width - rowWidth) / 2;
        
        const x = startX + (col * ballSpacing) + (Math.random() - 0.5) * 4;
        const y = funnelTipY - 30 - (row * ballSpacing);

        return Matter.Bodies.circle(x, y, ballSize, {
            label: 'ball',
            restitution: 0, // Start with 0 in funnel
            friction: 0,
            frictionAir: 0.02,
            density: 0.004,
            render: {
                fillStyle: color.color
            }
        });
    });

    Matter.World.add(world, [
        ...pegs,
        ...bins,
        funnelLeft,
        funnelRight,
        floor,
        gate,
        ...balls
    ]);
  };

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