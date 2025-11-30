import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Play, RotateCcw, Pause } from 'lucide-react';
import GaltonBoard from './components/GaltonBoard';
import Controls from './components/Controls';
import { SimulationConfig, BallColor, DEFAULT_COLORS, SimulationStatus } from './types';

const App: React.FC = () => {
  const [status, setStatus] = useState<SimulationStatus>('idle');
  const [config, setConfig] = useState<SimulationConfig>({
    rowCount: 12,
    ballCount: 200,
    bucketCount: 13, // Usually rowCount + 1
    pegSize: 6,
    ballSize: 5,
    ballRestitution: 0.5,
    dropSpeedMs: 50,
  });

  // The user defines a pattern of balls to drop.
  const [ballPattern, setBallPattern] = useState<BallColor[]>([DEFAULT_COLORS[0]]);
  
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

  const handleStart = () => setStatus('running');
  const handlePause = () => setStatus('paused');
  const handleReset = () => setStatus('idle');

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
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-md font-medium shadow-sm transition-colors"
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
        <div className="flex-1 relative bg-slate-50 p-4 flex items-center justify-center overflow-hidden">
          <div className="w-full h-full bg-white rounded-xl shadow-inner border border-slate-200 overflow-hidden relative">
             <GaltonBoard 
                status={status}
                config={config}
                ballPattern={ballPattern}
                onComplete={() => setStatus('completed')}
                bucketLabels={bucketLabels}
                onLabelChange={handleLabelChange}
             />
          </div>
        </div>

        {/* Sidebar Controls */}
        <aside className="w-96 flex-none bg-white border-l border-slate-200 overflow-y-auto">
          <Controls 
            config={config} 
            setConfig={setConfig} 
            ballPattern={ballPattern}
            setBallPattern={setBallPattern}
            disabled={status === 'running'}
          />
        </aside>
      </main>
    </div>
  );
};

export default App;