
import React from 'react';
import { SimulationConfig, BallDefinition, DEFAULT_COLORS } from '../types';
import { Users, Info } from 'lucide-react';

interface ControlsProps {
  config: SimulationConfig;
  setConfig: React.Dispatch<React.SetStateAction<SimulationConfig>>;
  ballDefinitions: BallDefinition[];
  setBallDefinitions: React.Dispatch<React.SetStateAction<BallDefinition[]>>;
  disabled: boolean;
}

const Controls: React.FC<ControlsProps> = ({ config, setConfig, ballDefinitions, setBallDefinitions, disabled }) => {

  const handleChange = (key: keyof SimulationConfig, value: number) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleCountChange = (colorId: string, newCount: number) => {
    if (newCount < 0) return;
    setBallDefinitions(prev => {
      const exists = prev.find(d => d.color.id === colorId);
      if (exists) {
        return prev.map(d => d.color.id === colorId ? { ...d, count: newCount } : d);
      } else {
        // Should not happen with current logic, but safe fallback
        const color = DEFAULT_COLORS.find(c => c.id === colorId);
        if (color) return [...prev, { color, count: newCount }];
        return prev;
      }
    });
  };

  const totalBalls = ballDefinitions.reduce((acc, curr) => acc + curr.count, 0);

  return (
    <div className="p-6 space-y-8 pb-20">
      
      {/* 1. Board Settings */}
      <section>
        <h2 className="text-sm uppercase tracking-wide text-slate-500 font-bold mb-4">Board Settings</h2>
        
        <div className="space-y-4">
          <div>
            <div className="flex justify-between mb-1">
              <label className="text-sm font-medium text-slate-700">Rows (Pegs)</label>
              <span className="text-sm text-slate-500">{config.rowCount}</span>
            </div>
            <input 
              type="range" min="4" max="24" step="1"
              value={config.rowCount}
              onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setConfig(prev => ({
                      ...prev, 
                      rowCount: val,
                      bucketCount: Math.floor(val * 2) // Heuristic auto adjust, but user can override below
                    }));
              }}
              disabled={disabled}
              className="w-full accent-indigo-600 cursor-pointer disabled:opacity-50"
            />
          </div>

          <div>
             <div className="flex justify-between mb-1">
              <label className="text-sm font-medium text-slate-700">Bucket Columns</label>
              <span className="text-sm text-slate-500">{config.bucketCount}</span>
            </div>
             <input 
              type="range" min="4" max="50" step="1"
              value={config.bucketCount}
              onChange={(e) => handleChange('bucketCount', parseInt(e.target.value))}
              disabled={disabled}
              className="w-full accent-indigo-600 cursor-pointer disabled:opacity-50"
            />
          </div>
          
           <div>
             <div className="flex justify-between mb-1">
              <label className="text-sm font-medium text-slate-700">Peg Size</label>
              <span className="text-sm text-slate-500">{config.pegSize}px</span>
            </div>
             <input 
              type="range" min="2" max="10" step="1"
              value={config.pegSize}
              onChange={(e) => handleChange('pegSize', parseInt(e.target.value))}
              disabled={disabled}
              className="w-full accent-indigo-600 cursor-pointer disabled:opacity-50"
            />
          </div>
        </div>
      </section>

      <hr className="border-slate-100" />

      {/* 2. Physics Configuration */}
      <section>
        <h2 className="text-sm uppercase tracking-wide text-slate-500 font-bold mb-4">Physics</h2>
        
        <div className="space-y-4">
          <div>
            <div className="flex justify-between mb-1">
              <label className="text-sm font-medium text-slate-700">Ball Size</label>
              <span className="text-sm text-slate-500">{config.ballSize}px</span>
            </div>
            <input 
              type="range" min="1" max="10" step="1"
              value={config.ballSize}
              onChange={(e) => handleChange('ballSize', parseInt(e.target.value))}
              // Enabled always for runtime tuning
              className="w-full accent-indigo-600 cursor-pointer"
            />
          </div>
          
          <div>
            <div className="flex justify-between mb-1">
              <label className="text-sm font-medium text-slate-700">Bounciness</label>
              <span className="text-sm text-slate-500">{config.ballRestitution}</span>
            </div>
            <input 
              type="range" min="0.1" max="1.0" step="0.1"
              value={config.ballRestitution}
              onChange={(e) => handleChange('ballRestitution', parseFloat(e.target.value))}
              // Enabled always for runtime tuning
              className="w-full accent-indigo-600 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between mb-1">
              <label className="text-sm font-medium text-slate-700">Friction</label>
              <span className="text-sm text-slate-500">{config.ballFriction.toFixed(3)}</span>
            </div>
            <input 
              type="range" min="0.000" max="0.100" step="0.001"
              value={config.ballFriction}
              onChange={(e) => handleChange('ballFriction', parseFloat(e.target.value))}
              // Enabled always for runtime tuning
              className="w-full accent-indigo-600 cursor-pointer"
            />
          </div>
        </div>
      </section>

      <hr className="border-slate-100" />

      {/* 3. Ball Pool Configuration */}
      <section className={disabled ? "opacity-50 pointer-events-none" : ""}>
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm uppercase tracking-wide text-slate-500 font-bold">Ball Pool</h2>
            <div className="text-xs font-semibold bg-indigo-50 text-indigo-700 px-2 py-1 rounded">
                Total: {totalBalls}
            </div>
        </div>
        
        <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 space-y-3">
            {DEFAULT_COLORS.map((color) => {
                const def = ballDefinitions.find(d => d.color.id === color.id);
                const count = def ? def.count : 0;
                
                return (
                    <div key={color.id} className="flex items-center gap-3">
                        <div 
                            className="w-6 h-6 rounded-full border border-black/10 flex-none shadow-sm"
                            style={{ backgroundColor: color.color }}
                        />
                        <span className="text-sm text-slate-700 font-medium w-16">{color.name}</span>
                        <div className="flex-1 flex items-center gap-2">
                             <input 
                                type="number" 
                                min="0" 
                                max="2000"
                                value={count}
                                onChange={(e) => handleCountChange(color.id, parseInt(e.target.value) || 0)}
                                className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                             />
                        </div>
                    </div>
                );
            })}
        </div>
      </section>
      
    </div>
  );
};

export default Controls;
