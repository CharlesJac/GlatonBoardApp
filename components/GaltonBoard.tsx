import React, { useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';
import { SimulationConfig, BallColor, SimulationStatus } from '../types';

interface GaltonBoardProps {
  status: SimulationStatus;
  config: SimulationConfig;
  ballPattern: BallColor[];
  bucketLabels: string[];
  onComplete: () => void;
  onLabelChange: (index: number, value: string) => void;
}

const GaltonBoard: React.FC<GaltonBoardProps> = ({ 
  status, 
  config, 
  ballPattern, 
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

  // Simulation Loop (Dropping Balls)
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
      if (ballsDroppedRef.current < config.ballCount) {
        if (timestamp - lastDropTimeRef.current > config.dropSpeedMs) {
          spawnBall();
          lastDropTimeRef.current = timestamp;
          ballsDroppedRef.current += 1;
        }
      } else if (onComplete && ballsDroppedRef.current >= config.ballCount) {
         // Check if we should auto-complete (optional)
      }

      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [status, config, ballPattern, onComplete]);


  const setupBoard = () => {
    if (!engineRef.current || !canvasContainerRef.current) return;
    
    const world = engineRef.current.world;
    Matter.World.clear(world, false); 

    const width = canvasContainerRef.current.clientWidth;
    const height = canvasContainerRef.current.clientHeight;

    // --- Configuration ---
    const { rowCount, bucketCount, pegSize } = config;
    
    // Board positioning
    // We want the pegs to form a triangle/pyramid.
    const paddingX = 40;
    const paddingTop = 80; // Space for funnel
    const availableWidth = width - (paddingX * 2);
    
    // Calculate Spacing
    const spacingX = availableWidth / (rowCount + 2); 
    const spacingY = spacingX * 0.866; // Hexagonal packing

    // --- 1. Pegs (Triangles) ---
    const pegs: Matter.Body[] = [];
    
    for (let row = 0; row < rowCount; row++) {
      const itemsInRow = row + 1; 
      const rowWidth = (itemsInRow - 1) * spacingX;
      const startX = (width / 2) - (rowWidth / 2);
      
      for (let col = 0; col < itemsInRow; col++) {
        const x = startX + col * spacingX;
        const y = paddingTop + row * spacingY;
        
        const triangle = Matter.Bodies.polygon(x, y, 3, pegSize * 1.8, {
          isStatic: true,
          angle: -Math.PI / 2, // Pointing UP
          render: {
            fillStyle: '#94a3b8' 
          },
          chamfer: { radius: 2 }
        });
        
        pegs.push(triangle);
      }
    }

    // --- 2. Funnel ---
    // Guides balls to the center top
    const funnelY = 40;
    const funnelGap = 40;
    const funnelWidth = 120;
    
    const funnelLeft = Matter.Bodies.rectangle(
        (width / 2) - (funnelGap/2) - (funnelWidth/2), 
        funnelY, 
        funnelWidth, 
        10, 
        { 
            isStatic: true, 
            angle: Math.PI / 6, // 30 degrees
            render: { fillStyle: '#64748b' } 
        }
    );
    
    const funnelRight = Matter.Bodies.rectangle(
        (width / 2) + (funnelGap/2) + (funnelWidth/2), 
        funnelY, 
        funnelWidth, 
        10, 
        { 
            isStatic: true, 
            angle: -Math.PI / 6, 
            render: { fillStyle: '#64748b' } 
        }
    );

    const wallLeft = Matter.Bodies.rectangle(0, height/2, 20, height, { isStatic: true, render: { visible: false } });
    const wallRight = Matter.Bodies.rectangle(width, height/2, 20, height, { isStatic: true, render: { visible: false } });
    
    // --- 3. Buckets ---
    const bins: Matter.Body[] = [];
    const bucketHeight = 220;
    
    // Center the bins
    const totalBinWidth = bucketCount * spacingX;
    const binStartX = (width / 2) - (totalBinWidth / 2);
    
    for (let i = 0; i <= bucketCount; i++) {
        const divX = binStartX + (i * spacingX);
        const divider = Matter.Bodies.rectangle(
            divX, 
            height - (bucketHeight/2), 
            4, 
            bucketHeight, 
            { 
                isStatic: true,
                render: { fillStyle: '#cbd5e1' },
                chamfer: { radius: 2 }
            }
        );
        bins.push(divider);
    }
    
    // Floor
    const floor = Matter.Bodies.rectangle(width/2, height + 10, width, 40, { isStatic: true });

    Matter.World.add(world, [
        ...pegs,
        ...bins,
        funnelLeft,
        funnelRight,
        wallLeft,
        wallRight,
        floor
    ]);
  };

  const spawnBall = () => {
    if (!engineRef.current || !canvasContainerRef.current) return;
    
    const width = canvasContainerRef.current.clientWidth;
    const { ballSize, ballRestitution } = config;
    
    const patternIndex = ballsDroppedRef.current % ballPattern.length;
    const colorObj = ballPattern[patternIndex] || ballPattern[0];
    
    // Small jitter to prevent perfect stacking
    const jitter = (Math.random() - 0.5) * 4; 
    
    // Spawn above the funnel
    const ball = Matter.Bodies.circle(width / 2 + jitter, -30, ballSize, {
      restitution: ballRestitution,
      friction: 0.001,
      density: 0.004,
      render: {
        fillStyle: colorObj.color
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