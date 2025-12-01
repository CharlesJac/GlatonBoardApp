
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { LayoutDashboard, Play, RotateCcw, Pause, ArrowDownToLine, PlusCircle, Lock, Unlock } from 'lucide-react';
import GaltonBoard from './components/GaltonBoard';
import Controls from './components/Controls';
import { SimulationConfig, BallColor, DEFAULT_COLORS, SimulationStatus, BallDefinition } from './types';

const App: React.FC = () => {
  const [status, setStatus] = useState<SimulationStatus>('empty');
  const [config, setConfig] = useState<SimulationConfig>({
    rowCount: 6,
    ballCount: 2000, 
    bucketCount: 22, 
    pegSize: 4,
    ballSize: 2,
    ballRestitution: 0.5,
    dropSpeedMs: 50,
  });

  // User defines counts for each color
  const [ballDefinitions, setBallDefinitions] = useState<BallDefinition[]>([
    { color: DEFAULT_COLORS[0], count: 1000 },
    { color: DEFAULT_COLORS[1], count: 1000 },
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

  // Triggers for Board Actions
  const [fillTrigger, setFillTrigger] = useState(0);
  const [resetTrigger, setResetTrigger] = useState(0);
  const [isGateOpen, setIsGateOpen] = useState(false);

  const handleFill = () => {
    // Ensure physics is running so balls can stack
    if (status !== 'running') {
        setStatus('running');
    }
    setFillTrigger(prev => prev + 1);
  };

  const handleRelease = () => {
    setIsGateOpen(prev => !prev);
  };

  const handleReset = () => {
    setIsGateOpen(false);
    setResetTrigger(prev => prev + 1);
    setStatus('empty');
  };

  // Triggered when simulation detects all balls have settled
  const handleComplete = () => {
    // Optional: Auto-pause logic could go here, but with manual controls we might want to keep it running
  };

  const handleResetAndPlay = () => {
     handleReset();
  };

  // Aspect Ratio Logic
  const mainContainerRef = useRef<HTMLDivElement>(null);
  const [boardSize, setBoardSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!mainContainerRef.current) return;
    
    const calculateSize = () => {
        if (!mainContainerRef.current) return;
        const { clientWidth: width, clientHeight: height } = mainContainerRef.current;
        
        // Target Aspect Ratio 1.6 (Wide Landscape)
        const targetRatio = 1.6;
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
          
          {/* 1. Add balls Button (Incremental) */}
          <button
            onClick={handleFill}
            // Always enabled unless we decide otherwise. Usually Fill is allowed whenever.
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-indigo-600 hover:bg-indigo-50 rounded-md font-medium transition-colors shadow-sm active:translate-y-0.5"
          >
            <PlusCircle className="w-4 h-4" /> Add balls
          </button>

          {/* 2. Open/Close Button (Switch) */}
          <button
            onClick={handleRelease}
            className={`flex items-center gap-2 px-4 py-2 text-white rounded-md font-medium shadow-sm transition-colors w-32 justify-center ${
                isGateOpen 
                ? 'bg-amber-500 hover:bg-amber-600' 
                : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {isGateOpen ? (
                <>
                    <Lock className="w-4 h-4" /> Close
                </>
            ) : (
                <>
                    <Unlock className="w-4 h-4" /> Open
                </>
            )}
          </button>
         
          {/* 3. Reset Button */}
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
          onDoubleClick={handleReset}
          title="Double click to Reset"
        >
          <div 
            className="bg-white rounded-xl shadow-inner border border-slate-200 overflow-hidden relative flex-none"
            style={{ 
                width: boardSize.width, 
                height: boardSize.height,
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
                fillTrigger={fillTrigger}
                resetTrigger={resetTrigger}
                isGateOpen={isGateOpen}
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
            // Disable controls if balls are on the board (running status is loosely used for physics active)
            // A better check might be if fillTrigger > 0, but status === 'running' is a good proxy for "active session"
            disabled={status === 'running'}
          />
        </aside>
      </main>
    </div>
  );
};

export default App;
