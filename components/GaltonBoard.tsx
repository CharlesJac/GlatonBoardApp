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
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);
  const runnerRef = useRef<Matter.Runner | null>(null);
  
  // Refs for simulation state
  const ballsDroppedRef = useRef(0);
  const lastDropTimeRef = useRef(0);
  const animationFrameRef = useRef<number>(0);
  const isResettingRef = useRef(false);

  // Track container dimensions for overlay rendering
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Initialize Physics Engine
  useEffect(() => {
    if (!containerRef.current) return;

    // Create Engine
    const engine = Matter.Engine.create({
      gravity: { x: 0, y: 1, scale: 0.001 } // Adjusted gravity for scale
    });
    engineRef.current = engine;

    // Create Renderer
    const render = Matter.Render.create({
      element: containerRef.current,
      engine: engine,
      options: {
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
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

    // Initial measurement
    setDimensions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight
    });

    // Resize Handler
    const handleResize = () => {
      if (!containerRef.current || !renderRef.current) return;
      const newWidth = containerRef.current.clientWidth;
      const newHeight = containerRef.current.clientHeight;

      renderRef.current.canvas.width = newWidth;
      renderRef.current.canvas.height = newHeight;
      
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // Watch for Reset or Config Change (setupBoard)
  useEffect(() => {
    if (status === 'idle') {
      isResettingRef.current = true;
      ballsDroppedRef.current = 0;
      setupBoard();
      isResettingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, config, dimensions]); // Re-setup if dimensions change while idle

  // Main Simulation Loop
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
      } else {
         // All balls dropped.
      }

      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [status, config, ballPattern]);


  const setupBoard = () => {
    if (!engineRef.current || !renderRef.current || !containerRef.current) return;
    
    const world = engineRef.current.world;
    Matter.World.clear(world, false); // Clear bodies, keep constraints if any

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // --- Configuration ---
    const { rowCount, bucketCount, pegSize } = config;
    
    // Calculate dimensions
    // Board padding
    const paddingX = 40;
    const paddingTop = 60;
    const availableWidth = width - (paddingX * 2);
    
    // Determine horizontal spacing based on rows (Pyramid structure)
    // The visual pyramid is usually 'rowCount' tall.
    const spacingX = availableWidth / (rowCount + 2); 
    const spacingY = spacingX * 0.866; // Hexagonal packing height ratio (sin(60deg))

    // --- 1. Pegs (Triangles) ---
    const pegs: Matter.Body[] = [];
    
    for (let row = 0; row < rowCount; row++) {
      const itemsInRow = row + 1; // Pyramid
      const rowWidth = (itemsInRow - 1) * spacingX;
      const startX = (width / 2) - (rowWidth / 2);
      
      for (let col = 0; col < itemsInRow; col++) {
        const x = startX + col * spacingX;
        const y = paddingTop + row * spacingY;
        
        // Triangle pointing UP
        const triangle = Matter.Bodies.polygon(x, y, 3, pegSize * 1.5, {
          isStatic: true,
          angle: -Math.PI / 2, // Rotated to point up
          render: {
            fillStyle: '#94a3b8' // Slate 400
          },
          chamfer: { radius: 2 }
        });
        
        pegs.push(triangle);
      }
    }

    // --- 2. Walls ---
    const funnelLeft = Matter.Bodies.rectangle(width/2 - 40, 20, 80, 10, { isStatic: true, angle: Math.PI/3, render: { fillStyle: '#cbd5e1' } });
    const funnelRight = Matter.Bodies.rectangle(width/2 + 40, 20, 80, 10, { isStatic: true, angle: -Math.PI/3, render: { fillStyle: '#cbd5e1' } });
    
    const wallLeft = Matter.Bodies.rectangle(0, height/2, 20, height, { isStatic: true, render: { visible: false } });
    const wallRight = Matter.Bodies.rectangle(width, height/2, 20, height, { isStatic: true, render: { visible: false } });
    
    // --- 3. Buckets/Bins ---
    const bins: Matter.Body[] = [];
    const bucketHeight = 200;
    
    // Calculate bin positioning
    // We want `bucketCount` bins, meaning `bucketCount + 1` dividers.
    // The width of the entire bin area should match the spread of the balls.
    // The spread is related to `bucketCount * spacingX`.
    const totalBinWidth = bucketCount * spacingX;
    const binStartX = (width / 2) - (totalBinWidth / 2);
    
    for (let i = 0; i <= bucketCount; i++) {
        // Divider positions
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
    if (!engineRef.current) return;
    
    const { width } = renderRef.current?.canvas || { width: 800 };
    const { ballSize, ballRestitution } = config;
    
    const patternIndex = ballsDroppedRef.current % ballPattern.length;
    const colorObj = ballPattern[patternIndex] || ballPattern[0];
    
    // Jitter for center drop
    const jitter = (Math.random() - 0.5) * 2; 
    
    const ball = Matter.Bodies.circle(width / 2 + jitter, -20, ballSize, {
      restitution: ballRestitution,
      friction: 0.001,
      density: 0.004,
      render: {
        fillStyle: colorObj.color
      }
    });

    Matter.World.add(engineRef.current.world, ball);
  };

  // Helper to render editable labels overlay
  const renderLabels = () => {
      if (dimensions.width === 0) return null;
      
      const { rowCount, bucketCount } = config;
      const width = dimensions.width;
      
      // Mirror physics calculations for positioning
      const paddingX = 40;
      const availableWidth = width - (paddingX * 2);
      const spacingX = availableWidth / (rowCount + 2);
      const totalBinWidth = bucketCount * spacingX;
      const binStartX = (width / 2) - (totalBinWidth / 2);

      return (
        <div className="absolute bottom-0 left-0 w-full pointer-events-none" style={{ height: '40px' }}>
            {bucketLabels.map((label, i) => {
                const centerX = binStartX + (i * spacingX) + (spacingX / 2);
                return (
                    <input
                        key={i}
                        type="text"
                        value={label}
                        onChange={(e) => onLabelChange(i, e.target.value)}
                        className="absolute bottom-1 text-center bg-transparent border-none focus:bg-white/80 focus:ring-1 focus:ring-indigo-300 focus:outline-none text-xs font-bold text-slate-600 pointer-events-auto transition-all rounded hover:bg