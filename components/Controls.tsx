import React from 'react';
import { SimulationConfig, BallColor, DEFAULT_COLORS } from '../types';
import { Trash2, Plus, GripVertical } from 'lucide-react';

interface ControlsProps {
  config: SimulationConfig;
  setConfig: React.Dispatch<React.SetStateAction<SimulationConfig>>;
  ballPattern: BallColor[];
  setBallPattern: React.Dispatch<React.SetStateAction<BallColor[]>>;
  disabled: boolean;
}

const Controls: React.FC<ControlsProps> = ({ config, setConfig, ballPattern, setBallPattern, disabled }) => {

  const handleChange = (key: keyof SimulationConfig, value: number) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const addBallToPattern = (color: BallColor) => {
    setBallPattern(prev => [...prev, color]);
  };

  const removeBallFromPattern = (index: number) => {
    if (ballPattern.length <= 1) return; // Prevent empty
    setBallPattern(prev => prev.filter((_, i) => i !== index));
  };

  const clearPattern = () => {
    setBallPattern([DEFAULT_COLORS[0]]);
  };

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
                      bucketCount: val + 1 // Auto adjust buckets for valid galton
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
              type="range" min="4" max="30" step="1"
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
              type="range" min="3" max="10" step="1"
              value={config.pegSize}
              onChange={(e) => handleChange('pegSize', parseInt(e.target.value))}
              disabled={disabled}
              className="w-full accent-indigo-600 cursor-pointer disabled:opacity-50"
            />
          </div>
        </div>
      </section>

      <hr className="border-slate-100" />

      {/* 2. Ball Configuration */}
      <section>
        <h2 className="text-sm uppercase tracking-wide text-slate-500 font-bold mb-4">Ball Configuration</h2>
        
        <div className="space-y-4">
          <div>
            <div className="flex justify-between mb-1">
              <label className="text-sm font-medium text-slate-700">Total Balls</label>
              <span className="text-sm text-slate-500">{config.ballCount}</span>
            </div>
            <input 
              type="range" min="10" max="1000" step="10"
              value={config.ballCount}
              onChange={(e) => handleChange('ballCount', parseInt(e.target.value))}
              disabled={disabled}
              className="w-full accent-indigo-600 cursor-pointer disabled:opacity-50"
            />
          </div>

          <div>
            <div className="flex justify-between mb-1">
              <label className="text-sm font-medium text-slate-700">Ball Size</label>
              <span className="text-sm text-slate-500">{config.ballSize}px</span>
            </div>
            <input 
              type="range" min="2" max="10" step="1"
              value={config.ballSize}
              onChange={(e) => handleChange('ballSize', parseInt(e.target.value))}
              disabled={disabled}
              className="w-full accent-indigo-600 cursor-pointer disabled:opacity-50"
            />
          </div>
          
          <div>
            <div className="flex justify-between mb-1">
              <label className="text-sm font-medium text-slate-700">Drop Rate (ms)</label>
              <span className="text-sm text-slate-500">{config.dropSpeedMs}ms</span>
            </div>
            <input 
              type="range" min="10" max="500" step="10"
              value={config.dropSpeedMs}
              onChange={(e) => handleChange('dropSpeedMs', parseInt(e.target.value))}
              disabled={disabled}
              className="w-full accent-indigo-600 cursor-pointer disabled:opacity-50"
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
              disabled={disabled}
              className="w-full accent-indigo-600 cursor-pointer disabled:opacity-50"
            />
          </div>
        </div>
      </section>

      <hr className="border-slate-100" />

      {/* 3. Color Pattern Builder */}
      <section className={disabled ? "opacity-50 pointer-events-none" : ""}>
        <div className="flex justify-between items-end mb-4">
            <h2 className="text-sm uppercase tracking-wide text-slate-500 font-bold">Color Pattern</h2>
            <button onClick={clearPattern} className="text-xs text-red-500 hover:text-red-700 underline">Reset Pattern</button>
        </div>
        
        <p className="text-xs text-slate-500 mb-3">
          Balls will cycle through this sequence.
        </p>

        {/* Pattern Visualizer */}
        <div className="flex flex-wrap gap-2 mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200 min-h-[60px] items-center">
            {ballPattern.map((ball, idx) => (
                <div key={`${ball.id}-${idx}`} className="group relative">
                    <div 
                        className="w-6 h-6 rounded-full border border-black/10 shadow-sm"
                        style={{ backgroundColor: ball.color }}
                        title={ball.name}
                    />
                    <button 
                        onClick={() => removeBallFromPattern(idx)}
                        className="absolute -top-2 -right-2 bg-white rounded-full p-0.5 border border-slate-200 shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <Trash2 className="w-3 h-3 text-slate-500" />
                    </button>
                </div>
            ))}
            
            {/* Add Button Dropdown */}
            <div className="relative group">
                <button className="w-6 h-6 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors">
                    <Plus className="w-4 h-4" />
                </button>
                
                {/* Palette Popover */}
                <div className="absolute top-full left-0 mt-2 bg-white rounded-lg shadow-xl border border-slate-200 p-2 grid grid-cols-5 gap-2 w-[180px] z-20 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-all">
                    {DEFAULT_COLORS.map(c => (
                        <button 
                            key={c.id}
                            onClick={() => addBallToPattern(c)}
                            className="w-8 h-8 rounded-full border border-slate-100 hover:scale-110 transition-transform"
                            style={{ backgroundColor: c.color }}
                            title={c.name}
                        />
                    ))}
                </div>
            </div>
        </div>
      </section>
      
    </div>
  );
};

export default Controls;
