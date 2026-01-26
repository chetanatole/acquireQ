import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

// Icons as components for clean code
const QueueIcon = () => (
  <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
  </svg>
);

const ClockIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const SparklesIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
  </svg>
);

const ArrowRightIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
  </svg>
);

export default function Landing() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [timeout, setTimeoutVal] = useState(60);
  const [timeoutUnit, setTimeoutUnit] = useState<'seconds' | 'minutes'>('seconds');
  const [maxHoldTime, setMaxHoldTime] = useState<number | ''>('');
  const [maxHoldUnit, setMaxHoldUnit] = useState<'seconds' | 'minutes' | 'hours'>('minutes');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const convertToSeconds = (value: number, unit: string) => {
    switch (unit) {
      case 'minutes': return value * 60;
      case 'hours': return value * 3600;
      default: return value;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch('/api/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          timeoutSeconds: convertToSeconds(Number(timeout), timeoutUnit),
          maxHoldSeconds: maxHoldTime ? convertToSeconds(Number(maxHoldTime), maxHoldUnit) : null
        })
      });
      if (!res.ok) throw new Error('Failed to create resource');
      const data = await res.json();
      navigate(`/r/${data.id}`);
    } catch (err) {
      console.error(err);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Ambient background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-accent-500/10 rounded-full blur-[128px] animate-pulse-slow" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-violet-500/10 rounded-full blur-[128px] animate-pulse-slow" style={{ animationDelay: '1s' }} />
      </div>

      {/* Header */}
      <header className="relative z-10 px-6 py-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-500 to-violet-500 flex items-center justify-center shadow-glow">
              <QueueIcon />
            </div>
            <span className="text-xl font-semibold tracking-tight">acquireQ</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <SparklesIcon />
            <span>Real-time Queue Management</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg">
          {/* Hero text */}
          <div className="text-center mb-10 animate-fade-in-up">
            <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
              <span className="gradient-text">Create a Queue</span>
            </h1>
            <p className="text-gray-400 text-lg">
              Set up a shared resource and let users take turns seamlessly.
            </p>
          </div>

          {/* Form Card */}
          <div className="glass-card rounded-2xl p-8 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Resource Name */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">
                  Resource Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="input-modern"
                  placeholder="e.g. GPU Server Alpha"
                  required
                  autoFocus
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">
                  Description
                  <span className="text-gray-500 font-normal ml-2">Optional</span>
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="input-modern resize-none h-24"
                  placeholder="Brief details about the resource..."
                />
              </div>

              {/* Timeout */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-300">
                  Offer Timeout
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                    <ClockIcon />
                  </div>
                  <input
                    type="number"
                    value={timeout}
                    onChange={e => setTimeoutVal(Number(e.target.value))}
                    className="input-modern pl-12"
                    min="1"
                  />
                </div>
                <div className="flex rounded-xl bg-dark-800/40 border border-white/[0.06] p-1.5 gap-1.5">
                  {(['seconds', 'minutes'] as const).map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      onClick={() => setTimeoutUnit(unit)}
                      className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${
                        timeoutUnit === unit
                          ? 'bg-accent-500 text-white shadow-lg shadow-accent-500/25'
                          : 'text-gray-400 hover:text-white hover:bg-white/[0.05]'
                      }`}
                    >
                      {unit === 'seconds' ? 'Seconds' : 'Minutes'}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500">
                  Time users have to accept when it's their turn
                </p>
              </div>

              {/* Max Hold Time */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-300">
                  Max Hold Time
                  <span className="text-gray-500 font-normal ml-2">Optional</span>
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                    <ClockIcon />
                  </div>
                  <input
                    type="number"
                    value={maxHoldTime}
                    onChange={e => setMaxHoldTime(e.target.value ? Number(e.target.value) : '')}
                    className="input-modern pl-12"
                    min="1"
                    placeholder="Leave empty for unlimited"
                  />
                </div>
                <div className="flex rounded-xl bg-dark-800/40 border border-white/[0.06] p-1.5 gap-1.5">
                  {(['seconds', 'minutes', 'hours'] as const).map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      onClick={() => setMaxHoldUnit(unit)}
                      className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${
                        maxHoldUnit === unit
                          ? 'bg-accent-500 text-white shadow-lg shadow-accent-500/25'
                          : 'text-gray-400 hover:text-white hover:bg-white/[0.05]'
                      }`}
                    >
                      {unit === 'seconds' ? 'Seconds' : unit === 'minutes' ? 'Minutes' : 'Hours'}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500">
                  Maximum time a user can hold the resource before auto-release
                </p>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading || !name.trim()}
                className="group w-full relative overflow-hidden bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-400 hover:to-accent-500 disabled:from-gray-600 disabled:to-gray-600 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-300 shadow-glow hover:shadow-glow-lg disabled:shadow-none disabled:cursor-not-allowed"
              >
                <span className="relative z-10 flex items-center justify-center gap-3">
                  {isLoading ? (
                    <>
                      <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Creating...
                    </>
                  ) : (
                    <>
                      Create Queue
                      <ArrowRightIcon />
                    </>
                  )}
                </span>
                {/* Shimmer effect */}
                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              </button>
            </form>
          </div>

          {/* Features hint */}
          <div className="mt-8 flex items-center justify-center gap-8 text-sm text-gray-500 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-success-400" />
              Real-time updates
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-accent-400" />
              Instant sharing
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
              Auto rotation
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-6 py-6 text-center text-sm text-gray-600">
        <p>Built for seamless resource sharing</p>
      </footer>
    </div>
  );
}
