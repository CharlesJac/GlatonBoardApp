import React, { useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';
import { SimulationConfig, BallColor, SimulationStatus } from '../types';

interface GaltonBoardProps {
  status: SimulationStatus;
  config: SimulationConfig;
  ballQueue: BallColor[]; // Changed from ballPattern to ballQueue
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
  
  // Refs for simulation state
  const ballsDroppedRef = useRef(0);
  const lastDropTimeRef = useRef(0);
  const animationFrameRef = useRef<number>(0);
  const onCompleteRef = useRef(onComplete);

  // Update ref when prop changes to avoid effect dependency issues
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);
  
  // Track container dimensions for overlay rendering and physics boundaries
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Initialize Physics Engine
  useEffect(() => {
    if (!canvasContainerRef.current) return;

    // Get initial dimensions
    const width = canvasContainerRef.current.clientWidth;
    const height = canvasContainerRef.current.clientHeight;

    // Avoid initializing if dimensions are 0 (e.g. hidden or not laid out)
    if (width === 0 || height === 0) return;

    // Create Engine
    const engine = Matter.Engine.create({
      gravity: { x: 0, y: 1, scale: 0.001 }
    });
    engineRef.current = engine;

    // Create Renderer
    const render = Matter.Render.create({
      element: canvasContainerRef.current,
      engine: engine,
      options: {
        width: width,
        height: height,
        wireframes: false,
        background: 'transparent',
        pixelRatio: window.devicePixelRatio,
      }
    });
    renderRef.current = render;

    // Create Runner
    const runner = Matter.Runner.create();
    runnerRef.current = runner;

    Matter.Render.run(render);
    Matter.Runner.run(runner, engine);

    setDimensions({ width, height });

    // Handle Window Resize
    const handleResize = () => {
      if (!canvasContainerRef.current || !renderRef.current) return;
      const newWidth = canvasContainerRef.current.clientWidth;
      const newHeight = canvasContainerRef.current.clientHeight;

      // Update Render dimensions
      const render = renderRef.current;
      render.bounds.max.x = newWidth;
      render.bounds.max.y = newHeight;
      render.options.width = newWidth;
      render.options.height = newHeight;
      
      // Critical: Update both resolution and display size for HighDPI
      render.canvas.width = newWidth * window.devicePixelRatio;
      render.canvas.height = newHeight * window.devicePixelRatio;
      render.canvas.style.width = `${newWidth}px`;
      render.canvas.style.height = `${newHeight}px`;

      setDimensions({ width: newWidth, height: newHeight });
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      Matter.Render.stop(render);
      Matter.Runner.stop(runner);
      if (render.canvas) render.canvas.remove();
      Matter.World.clear(engine.world, false);
      Matter.Engine.clear(engine);
    };
  }, []);

  // Board Setup (Walls, Pegs, Bins)
  useEffect(() => {
    // Only run if we have a valid engine and dimensions
    if (!engineRef.current || dimensions.width === 0) return;
    
    // Only reset/setup if idle or if dimensions changed significantly
    if (status === 'idle') {
        setupBoard();
        ballsDroppedRef.current = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, config, dimensions]); 

  // Simulation Loop (Dropping Balls + Check Complete)
  useEffect(() => {
    if (status !== 'running') {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
        }
        return;
    }

    const loop = (timestamp: number) => {
      if (status !== 'running') return;

      // Drop Logic
      if (ballsDroppedRef.current < ballQueue.length) {
        if (timestamp - lastDropTimeRef.current > config.dropSpeedMs) {
          spawnBall();
          lastDropTimeRef.current = timestamp;
          ballsDroppedRef.current += 1;
        }
      } else {
         // Auto-pause check: All balls dropped
         // Check if they are all settled (speed is low and position is low enough)
         if (engineRef.current) {
             const balls = Matter.Composite.allBodies(engineRef.current.world).filter(b => b.label === 'ball');
             if (balls.length > 0) {
                 const allSettled = balls.every(b => {
                     // Check if ball is roughly stationary and has fallen past the funnel area
                     return b.speed < 0.15 && b.angularSpeed < 0.1 && b.position.y > 150;
                 });
                 
                 if (allSettled) {
                     onCompleteRef.current();
                 }
             } else if (balls.length === 0 && ballsDroppedRef.current > 0) {
                 // Should technically not happen unless they fall out of world bounds
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
  }, [status, config, ballQueue]); // Dependency on ballQueue


  const setupBoard = () => {
    if (!engineRef.current || !canvasContainerRef.current) return;
    
    const world = engineRef.current.world;
    Matter.World.clear(world, false); 

    const width = canvasContainerRef.current.clientWidth;
    const height = canvasContainerRef.current.clientHeight;

    // --- Configuration ---
    const { rowCount, bucketCount, pegSize, ballSize } = config;
    
    // Board positioning
    const paddingX = 40;
    // Reduced padding top to lift the board up, giving more room for bins at the bottom
    const paddingTop = 110; 
    const availableWidth = width - (paddingX * 2);
    
    // Calculate Spacing
    const spacingX = availableWidth / (rowCount + 2); 
    const spacingY = spacingX * 0.866; // Hexagonal packing

    // --- 1. Pegs (Circles) ---
    const pegs: Matter.Body[] = [];
    
    for (let row = 0; row < rowCount; row++) {
      const itemsInRow = row + 1; 
      const rowWidth = (itemsInRow - 1) * spacingX;
      const startX = (width / 2) - (rowWidth / 2);
      
      for (let col = 0; col < itemsInRow; col++) {
        const x = startX + col * spacingX;
        const y = paddingTop + row * spacingY;
        
        const circle = Matter.Bodies.circle(x, y, pegSize, {
          isStatic: true,
          friction: 0, // Zero friction for smooth flow
          render: {
            fillStyle: '#94a3b8' 
          }
        });
        
        pegs.push(circle);
      }
    }

    // --- 2. Funnel ---
    // Moved funnel up to match reduced padding
    const funnelY = 30; 
    const funnelAngle = Math.PI / 3.2; // ~56 degrees
    const funnelWidth = 140;
    const funnelThickness = 12;
    // Widened gap to prevent sticking due to wall thickness protrusion
    const funnelGap = Math.max(40, ballSize * 4 + 20); 
    
    // Determine offset from center based on angle and width to maintain the gap
    // Center X offset is calculated so the inner tips are separated by `funnelGap`
    const funnelOffsetX = (funnelGap / 2) + (funnelWidth / 2) * Math.cos(funnelAngle);

    const funnelLeft = Matter.Bodies.rectangle(
        (width / 2) - funnelOffsetX, 
        funnelY, 
        funnelWidth, 
        funnelThickness, 
        { 
            isStatic: true, 
            angle: funnelAngle, 
            chamfer: { radius: 5 },
            render: { fillStyle: '#64748b' },
            friction: 0, 
            restitution: 0 
        }
    );
    
    const funnelRight = Matter.Bodies.rectangle(
        (width / 2) + funnelOffsetX, 
        funnelY, 
        funnelWidth, 
        funnelThickness, 
        { 
            isStatic: true, 
            angle: -funnelAngle, 
            chamfer: { radius: 5 },
            render: { fillStyle: '#64748b' },
            friction: 0,
            restitution: 0
        }
    );

    // Calculate funnel tip positions to connect walls
    // The bottom-most point of the funnel structure
    const funnelBottomY = funnelY + (funnelWidth / 2) * Math.sin(funnelAngle);
    // The horizontal position of the inner tip (approximate)
    const funnelTipXLeft = (width / 2) - (funnelGap / 2);
    const funnelTipXRight = (width / 2) + (funnelGap / 2);

    // --- 3. Buckets ---
    const bins: Matter.Body[] = [];
    const lastRowIndex = rowCount - 1;
    const lastPegY = paddingTop + lastRowIndex * spacingY;
    const binStartY = lastPegY + (spacingY * 0.5) + (pegSize * 2);
    const floorY = height;
    // Maximize bin height based on available space to floor
    const binHeight = Math.max(20, floorY - binStartY); 
    const binCenterY = binStartY + (binHeight / 2);
    
    const totalBinWidth = bucketCount * spacingX;
    const binStartX = (width / 2) - (totalBinWidth / 2);
    
    // Create dividers
    for (let i = 0; i <= bucketCount; i++) {
        const divX = binStartX + (i * spacingX);
        const divider = Matter.Bodies.rectangle(
            divX, 
            binCenterY, 
            4, 
            binHeight, 
            { 
                isStatic: true,
                render: { fillStyle: '#cbd5e1' },
                chamfer: { radius: 2 },
                friction: 0
            }
        );
        bins.push(divider);
    }
    
    // --- 4. Connected Walls (Air-tight & Parallel to Pegs) ---
    // Calculate the angle parallel to the pegs layout
    const pegSlopeAngle = Math.atan((spacingX / 2) / spacingY);
    const tanAngle = Math.tan(pegSlopeAngle);
    
    // Helper to create a wall between two points
    const createConnectionWall = (x1: number, y1: number, x2: number, y2: number) => {
        const length = Math.hypot(x2 - x1, y2 - y1);
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        const thickness = 14;

        return Matter.Bodies.rectangle(cx, cy, length, thickness, {
            isStatic: true,
            angle: angle,
            render: { fillStyle: '#e2e8f0' },
            friction: 0,
        });
    };

    // Calculate wall coordinates using strict geometric projection
    // We start from the funnel tip X/Y reference and project upwards (to seal) and downwards (to bins)
    // using the exact slope derived from the peg grid.
    
    const wallTopY = funnelBottomY; 
    const wallBottomY = binStartY;
    
    // Left Wall: Slope / (X decreases as Y increases)
    // Formula: x = anchorX - (y - anchorY) * tanAngle
    const wallTopXLeft = funnelTipXLeft - (wallTopY - funnelBottomY) * tanAngle;
    const wallBottomXLeft = funnelTipXLeft - (wallBottomY - funnelBottomY) * tanAngle;

    const leftWall = createConnectionWall(
        wallTopXLeft, wallTopY,
        wallBottomXLeft, wallBottomY
    );

    // Right Wall: Slope \ (X increases as Y increases)
    const wallTopXRight = funnelTipXRight + (wallTopY - funnelBottomY) * tanAngle;
    const wallBottomXRight = funnelTipXRight + (wallBottomY - funnelBottomY) * tanAngle;

    const rightWall = createConnectionWall(
        wallTopXRight, wallTopY,
        wallBottomXRight, wallBottomY
    );
    
    // --- 5. Rising Side Borders ---
    const wallThickness = 12;
    
    // Center the vertical walls exactly on the endpoint of the angled walls
    const leftBinWall = Matter.Bodies.rectangle(
        wallBottomXLeft,
        binCenterY, 
        wallThickness,
        binHeight,
        { isStatic: true, render: { fillStyle: '#e2e8f0' }, friction: 0 }
    );
    
    const rightBinWall = Matter.Bodies.rectangle(
        wallBottomXRight,
        binCenterY,
        wallThickness,
        binHeight,
        { isStatic: true, render: { fillStyle: '#e2e8f0' }, friction: 0 }
    );

    // Floor
    const floor = Matter.Bodies.rectangle(width/2, height + 20, width, 40, { isStatic: true, friction: 0 });

    Matter.World.add(world, [
        ...pegs,
        ...bins,
        funnelLeft,
        funnelRight,
        leftWall,
        rightWall,
        leftBinWall,
        rightBinWall,
        floor
    ]);
  };

  const spawnBall = () => {
    if (!engineRef.current || !canvasContainerRef.current) return;
    
    const width = canvasContainerRef.current.clientWidth;
    const { ballSize, ballRestitution } = config;
    
    // Get the specific ball for this drop index
    if (ballsDroppedRef.current >= ballQueue.length) return;
    const color = ballQueue[ballsDroppedRef.current];
    
    // Jitter within the funnel spawn area
    // Ensure jitter is small enough so balls don't spawn inside the walls
    const jitter = (Math.random() - 0.5) * (ballSize); 
    
    // Spawn above the funnel
    const ball = Matter.Bodies.circle(width / 2 + jitter, -20, ballSize, {
      label: 'ball', // Critical for tracking
      restitution: ballRestitution,
      friction: 0, // Zero friction
      frictionAir: 0.02,
      density: 0.004,
      render: {
        fillStyle: color.color
      }
    });

    Matter.World.add(engineRef.current.world, ball);
  };

  // Render input labels at the bottom
  const renderLabels = () => {
      if (dimensions.width === 0) return null;
      
      const { rowCount, bucketCount } = config;
      const width = dimensions.width;
      
      // Re-calculate geometry to align labels with bins
      const paddingX = 40;
      const availableWidth = width - (paddingX * 2);
      const spacingX = availableWidth / (rowCount + 2);
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
                        className="absolute bottom-1 text-center bg-transparent border-none focus:bg-white/80 focus:ring-1 focus:ring-indigo-300 focus:outline-none text-xs font-bold text-slate-600 pointer-events-auto transition-all rounded hover:bg-white/40 shadow-sm"
                        style={{
                            width: Math.max(20, spacingX - 4),
                            left: centerX - (Math.max(20, spacingX - 4) / 2),
                        }}
                        aria-label={`Label for column ${i + 1}`}
                    />
                );
            })}
        </div>
      );
  };

  return (
    <div className="w-full h-full relative bg-white isolate">
       {/* Matter.js Canvas Container */}
       <div ref={canvasContainerRef} className="absolute inset-0 z-0 cursor-crosshair" />
       
       {/* UI Overlays */}
       {renderLabels()}
       
       <div className="absolute top-2 left-2 text-xs text-slate-400 font-mono pointer-events-none select-none z-10">
          Dropped: {ballsDroppedRef.current} / {config.ballCount}
       </div>
    </div>
  );
};

export default GaltonBoard;