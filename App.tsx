import React, { useState, useEffect, useMemo, useRef } from 'react';
import { LayoutDashboard, Play, RotateCcw, Pause } from 'lucide-react';
import GaltonBoard from './components/GaltonBoard';
import Controls from './components/Controls';
import { SimulationConfig, BallColor, DEFAULT_COLORS, SimulationStatus, BallDefinition } from './types';

const App: React.FC = () => {
  const [status, setStatus] = useState<SimulationStatus>('idle');
  const [config, setConfig] = useState<SimulationConfig>({
    rowCount: 12,
    ballCount: 200, // This will be overwritten by the sum of ballDefinitions
    bucketCount: 13, 
    pegSize: 6,
    ballSize: 5,
    ballRestitution: 0.5,
    dropSpeedMs: 50,
  });

  // User defines counts for each color
  const [ballDefinitions, setBallDefinitions] = useState<BallDefinition[]>([
    { color: DEFAULT_COLORS[0], count: 100 },
    { color: DEFAULT_COLORS[1], count: 100 },
    { color: DEFAULT_COLORS[2], count: 0 },
    { color: DEFAULT_COLORS[3], count: 0 },
    { color: DEFAULT_COLORS[4], count: 0 },
  ]);

  // Derived: Flattened queue of balls to drop
  const ballQueue = useMemo(() => {
    const queue: BallColor[] = [];
    ballDefinitions.forEach(def => {
      for (let i = 0; i < def.count; i++) {
        queue.push(def.color);
      }
    });
    return queue;
  }, [ballDefinitions]);

  // Sync config.ballCount with the total defined balls
  useEffect(() => {
    setConfig(prev => ({
      ...prev,
      ballCount: ballQueue.length
    }));
  }, [ballQueue.length]);

  // Editable labels for the bucket columns
  const [bucketLabels, setBucketLabels] = useState<string[]>([]);

  // Sync labels with bucketCount
  useEffect(() => {
    setBucketLabels(prev => {
      const count = config.bucketCount;
      if (prev.length === count) return prev;
      
      const newLabels = [...prev];
      if (newLabels.length < count) {
        // Add new labels with default numbering
        for (let i = newLabels.length; i < count; i++) {
          newLabels.push(`${i + 1}`);
        }
      } else {
        // Truncate if fewer buckets
        newLabels.length = count;
      }
      return newLabels;
    });
  }, [config.bucketCount]);

  const handleLabelChange = (index: number, value: string) => {
    const newLabels = [...bucketLabels];
    newLabels[index] = value;
    setBucketLabels(newLabels);
  };

  const handleStart = () => {
    if (ballQueue.length === 0) return;
    setStatus('running');
  };
  const handlePause = () => setStatus('paused');
  const handleReset = () => setStatus('idle');

  // Triggered when simulation detects all balls have settled
  const handleComplete = () => {
    if (status === 'running') {
        setStatus('paused');
    }
  };

  const handleResetAndPlay = () => {
    setStatus('idle');
    // Allow a brief moment for the board to clear (useEffect in GaltonBoard runs on 'idle')
    setTimeout(() => {
        if (ballQueue.length > 0) {
            setStatus('running');
        }
    }, 50);
  };

  // Keyboard Shortcuts (Space to Reset + Play)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.code === 'Space') {
             // Ignore if user is typing in an input field
             if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') {
                 return;
             }
             e.preventDefault();
             handleResetAndPlay();
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [ballQueue.length]);


  // Aspect Ratio Logic
  const mainContainerRef = useRef<HTMLDivElement>(null);
  const [boardSize, setBoardSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!mainContainerRef.current) return;
    
    const calculateSize = () => {
        if (!mainContainerRef.current) return;
        const { clientWidth: width, clientHeight: height } = mainContainerRef.current;
        
        // Target Aspect Ratio 9:16
        const targetRatio = 9 / 16;
        const containerRatio = width / height;

        let w, h;
        if (containerRatio > targetRatio) {
            // Container is wider than target -> constrained by height
            h = height;
            w = height * targetRatio;
        } else {
            // Container is taller than target -> constrained by width
            w = width;
            h = width / targetRatio;
        }
        setBoardSize({ width: w, height: h });
    };

    // Initial calculation
    calculateSize();

    const observer = new ResizeObserver(calculateSize);
    observer.observe(mainContainerRef.current);

    return () => observer.disconnect();
  }, []);


  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-100">
      {/* Header */}
      <header className="flex-none h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600 rounded-lg">
            <LayoutDashboard className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">Galton Board Sim</h1>
        </div>
        
        <div className="flex items-center gap-3">
          {status === 'running' ? (
             <button
             onClick={handlePause}
             className="flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-700 hover:bg-amber-200 rounded-md font-medium transition-colors"
           >
             <Pause className="w-4 h-4" /> Pause
           </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={ballQueue.length === 0}
              className={`flex items-center gap-2 px-4 py-2 text-white rounded-md font-medium shadow-sm transition-colors ${ballQueue.length === 0 ? 'bg-slate-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
            >
              <Play className="w-4 h-4" /> {status === 'paused' ? 'Resume' : 'Start'}
            </button>
          )}
         
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-md font-medium transition-colors"
          >
            <RotateCcw className="w-4 h-4" /> Reset
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Canvas Area */}
        <div 
          ref={mainContainerRef}
          className="flex-1 relative bg-slate-50 p-4 flex items-center justify-center overflow-hidden"
          onDoubleClick={handleResetAndPlay}
          title="Double click to Reset & Play"
        >
          <div 
            className="bg-white rounded-xl shadow-inner border border-slate-200 overflow-hidden relative flex-none"
            style={{ 
                width: boardSize.width, 
                height: boardSize.height,
                // Fallback / transition smoothness
                transition: 'width 0.1s ease-out, height 0.1s ease-out'
            }}
          >
             <GaltonBoard 
                status={status}
                config={config}
                ballQueue={ballQueue}
                onComplete={handleComplete}
                bucketLabels={bucketLabels}
                onLabelChange={handleLabelChange}
             />
          </div>
        </div>

        {/* Sidebar Controls */}
        <aside className="w-96 flex-none bg-white border-l border-slate-200 overflow-y-auto z-20 shadow-lg">
          <Controls 
            config={config} 
            setConfig={setConfig} 
            ballDefinitions={ballDefinitions}
            setBallDefinitions={setBallDefinitions}
            disabled={status === 'running'}
          />
        </aside>
      </main>
    </div>
  );
};

export default App;