import React, { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { socket } from '../socket';

// Types
interface User {
  userId: number;
  displayName: string;
  isOffered?: boolean;
}

interface ResourceState {
  resourceId: string;
  name: string;
  description: string | null;
  timeoutSeconds: number;
  holder: User | null;
  queue: User[];
  offerExpiresAt: string | null;
}

// Icons
const QueueIcon = () => (
  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
  </svg>
);

const UserIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
);

const XMarkIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const ClockIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const LinkIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
  </svg>
);

const PlusIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>
);

const LogOutIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
  </svg>
);

const BoltIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path fillRule="evenodd" d="M14.615 1.595a.75.75 0 01.359.852L12.982 9.75h7.268a.75.75 0 01.548 1.262l-10.5 11.25a.75.75 0 01-1.272-.71l1.992-7.302H3.75a.75.75 0 01-.548-1.262l10.5-11.25a.75.75 0 01.913-.143z" clipRule="evenodd" />
  </svg>
);

// Countdown Ring Component
function CountdownRing({ timeLeft, total }: { timeLeft: number; total: number }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const progress = timeLeft / total;
  const strokeDashoffset = circumference * (1 - progress);

  const getColor = () => {
    if (progress > 0.5) return '#22d3ee'; // accent-400
    if (progress > 0.25) return '#fbbf24'; // warning-400
    return '#f87171'; // danger-400
  };

  return (
    <div className="relative w-24 h-24">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        {/* Background ring */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          className="text-dark-700"
        />
        {/* Progress ring */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={getColor()}
          strokeWidth="4"
          strokeLinecap="round"
          style={{
            strokeDasharray: circumference,
            strokeDashoffset,
            transition: 'stroke-dashoffset 1s linear, stroke 0.3s ease',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-2xl font-bold font-mono" style={{ color: getColor() }}>
          {timeLeft}
        </span>
      </div>
    </div>
  );
}

export default function Resource() {
  const { id } = useParams();
  const [state, setState] = useState<ResourceState | null>(null);
  const [myUserId, setMyUserId] = useState<number | null>(null);
  const [joinName, setJoinName] = useState('');
  const [joinEmail, setJoinEmail] = useState('');
  const [showJoin, setShowJoin] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // Restore userId, name, and email from localStorage
    const storedId = localStorage.getItem(`queue_user_${id}`);
    const storedName = localStorage.getItem(`queue_name_${id}`);
    const storedEmail = localStorage.getItem(`queue_email_${id}`);

    if (storedId) setMyUserId(Number(storedId));
    if (storedName) setJoinName(storedName);
    if (storedEmail) setJoinEmail(storedEmail);

    socket.emit('join_resource', id);

    const handleConnect = () => {
      socket.emit('join_resource', id);
    };
    socket.on('connect', handleConnect);

    socket.on('state_update', (data: ResourceState) => {
      const myStoredId = localStorage.getItem(`queue_user_${id}`);
      if (myStoredId) {
        const myId = Number(myStoredId);
        const myQueueItem = data.queue.find(u => u.userId === myId);

        if (myQueueItem?.isOffered && 'Notification' in window && Notification.permission === 'granted') {
          new Notification('Your Turn!', {
            body: `It's your turn to access ${data.name}. You have ${data.timeoutSeconds} seconds to accept.`,
            icon: '/favicon.ico',
            tag: 'queue-offer'
          });
        }
      }
      setState(data);
    });

    socket.on('joined_queue', (data: { userId: number }) => {
      setMyUserId(data.userId);
      localStorage.setItem(`queue_user_${id}`, String(data.userId));
      setShowJoin(false);
    });

    return () => {
      socket.off('connect', handleConnect);
      socket.off('state_update');
      socket.off('joined_queue');
    };
  }, [id]);

  // Timer effect
  useEffect(() => {
    if (!state?.offerExpiresAt) {
      setTimeLeft(null);
      return;
    }

    const updateTimer = () => {
      const now = new Date().getTime();
      const expiry = new Date(state.offerExpiresAt!).getTime();
      const diff = Math.max(0, Math.ceil((expiry - now) / 1000));
      setTimeLeft(diff);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [state?.offerExpiresAt]);

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleJoinClick = () => {
    if (myUserId && joinName) {
      socket.emit('join_queue', {
        resourceId: id,
        displayName: joinName,
        email: joinEmail || undefined,
        userId: myUserId
      });
    } else {
      setShowJoin(true);
    }
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem(`queue_name_${id}`, joinName);
    if (joinEmail) {
      localStorage.setItem(`queue_email_${id}`, joinEmail);
    }
    socket.emit('join_queue', {
      resourceId: id,
      displayName: joinName,
      email: joinEmail || undefined,
      userId: myUserId
    });
  };

  const handleRelease = () => {
    if (!myUserId) return;
    socket.emit('release_resource', { resourceId: id, userId: myUserId });
  };

  const handleAccept = () => {
    if (!myUserId) return;
    socket.emit('accept_offer', { resourceId: id, userId: myUserId });
  };

  const handleReject = () => {
    if (!myUserId) return;
    if (confirm('Reject offer and leave the queue?')) {
      socket.emit('reject_offer', { resourceId: id, userId: myUserId });
    }
  };

  const handleLeave = () => {
    if (!myUserId) return;
    if (confirm('Leave the queue?')) {
      socket.emit('leave_queue', { resourceId: id, userId: myUserId });
    }
  };

  // Computed values
  const isHolder = state?.holder?.userId === myUserId;
  const myQueueItem = useMemo(() => state?.queue.find(u => u.userId === myUserId), [state, myUserId]);
  const isInQueue = !!myQueueItem;
  const isMyTurn = myQueueItem?.isOffered;

  if (!state) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-400">
          <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Ambient background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-accent-500/8 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-violet-500/8 rounded-full blur-[120px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3 group">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent-500 to-violet-500 flex items-center justify-center shadow-glow-sm group-hover:shadow-glow transition-shadow">
                <QueueIcon />
              </div>
              <span className="text-lg font-semibold tracking-tight">acquireQ</span>
            </Link>

            <button
              onClick={copyLink}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-dark-800/60 border border-white/[0.08] hover:border-white/[0.15] hover:bg-dark-700/60 transition-all text-sm"
            >
              <LinkIcon />
              {copied ? 'Copied!' : 'Share Link'}
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 flex-1 max-w-6xl mx-auto w-full px-6 py-8">
        {/* Resource Info */}
        <div className="mb-8 animate-fade-in">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight gradient-text mb-2">
                {state.name}
              </h1>
              {state.description && (
                <p className="text-gray-400 max-w-2xl">{state.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500 shrink-0">
              <ClockIcon />
              <span>{state.timeoutSeconds}s timeout</span>
            </div>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Current Holder Card */}
          <div className="lg:col-span-2 glass-card rounded-2xl p-6 animate-fade-in-up">
            <div className="flex items-center gap-2 mb-6">
              <div className={`w-2 h-2 rounded-full ${state.holder ? 'bg-danger-400' : 'bg-success-400'} animate-pulse`} />
              <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
                Current Holder
              </h2>
            </div>

            <div className="flex flex-col items-center justify-center py-8">
              {state.holder ? (
                <>
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-accent-500/20 to-violet-500/20 border border-accent-500/30 flex items-center justify-center mb-4">
                    <span className="text-3xl font-bold text-accent-400">
                      {state.holder.displayName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-1">
                    {state.holder.displayName}
                  </h3>
                  <p className="text-sm text-gray-500 mb-6">Currently using the resource</p>

                  {isHolder && (
                    <button
                      onClick={handleRelease}
                      className="flex items-center gap-2 px-6 py-3 rounded-xl bg-danger-500/10 border border-danger-500/30 text-danger-400 hover:bg-danger-500/20 hover:border-danger-500/50 transition-all font-medium"
                    >
                      <LogOutIcon />
                      Release Resource
                    </button>
                  )}
                </>
              ) : (
                <>
                  <div className="w-20 h-20 rounded-2xl bg-success-500/10 border border-success-500/30 flex items-center justify-center mb-4">
                    <BoltIcon className="w-10 h-10 text-success-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-success-400 mb-1">Available</h3>
                  <p className="text-sm text-gray-500">No one is using this resource</p>
                </>
              )}
            </div>
          </div>

          {/* Queue Card */}
          <div className="lg:col-span-3 glass-card rounded-2xl p-6 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
                  Queue
                </h2>
                <span className="badge badge-accent">{state.queue.length}</span>
              </div>

              <div className="flex items-center gap-2">
                {isInQueue && !isMyTurn && (
                  <button
                    onClick={handleLeave}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-danger-400 hover:bg-danger-500/10 transition-all"
                  >
                    <XMarkIcon />
                    Leave
                  </button>
                )}
                {!isInQueue && !showJoin && !isHolder && (
                  <button
                    onClick={handleJoinClick}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-500/10 border border-accent-500/30 text-accent-400 hover:bg-accent-500/20 hover:border-accent-500/50 transition-all font-medium text-sm"
                  >
                    <PlusIcon />
                    Join Queue
                  </button>
                )}
              </div>
            </div>

            {/* Join Form */}
            {showJoin && (
              <div className="mb-6 p-4 rounded-xl bg-dark-700/50 border border-white/[0.08] animate-fade-in">
                <form onSubmit={handleJoin} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Your Display Name
                    </label>
                    <input
                      type="text"
                      value={joinName}
                      onChange={e => setJoinName(e.target.value)}
                      className="input-modern"
                      placeholder="Enter your name"
                      required
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      Email (optional)
                    </label>
                    <input
                      type="email"
                      value={joinEmail}
                      onChange={e => setJoinEmail(e.target.value)}
                      className="input-modern"
                      placeholder="Get notified when it's your turn"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="flex-1 py-2.5 rounded-xl bg-accent-500 hover:bg-accent-400 text-white font-medium transition-colors"
                    >
                      Join
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowJoin(false)}
                      className="flex-1 py-2.5 rounded-xl bg-dark-600 hover:bg-dark-500 text-gray-300 font-medium transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Queue List */}
            <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
              {state.queue.map((user, idx) => {
                const isMe = user.userId === myUserId;
                const isOffered = user.isOffered;

                return (
                  <div
                    key={user.userId}
                    className={`relative flex items-center justify-between p-4 rounded-xl transition-all ${
                      isMe
                        ? isOffered
                          ? 'bg-gradient-to-r from-accent-500/15 to-violet-500/15 border border-accent-500/40 shadow-glow-sm'
                          : 'bg-dark-700/60 border border-accent-500/30'
                        : 'bg-dark-800/40 border border-white/[0.05] hover:border-white/[0.1]'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      {/* Position */}
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono text-sm font-semibold ${
                        isMe
                          ? 'bg-accent-500/20 text-accent-400'
                          : 'bg-dark-600 text-gray-500'
                      }`}>
                        {idx + 1}
                      </div>

                      {/* Avatar */}
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        isMe
                          ? 'bg-gradient-to-br from-accent-500/30 to-violet-500/30 border border-accent-500/40'
                          : 'bg-dark-600 border border-white/[0.08]'
                      }`}>
                        <span className={`text-sm font-semibold ${isMe ? 'text-accent-300' : 'text-gray-400'}`}>
                          {user.displayName.charAt(0).toUpperCase()}
                        </span>
                      </div>

                      {/* Name */}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`font-medium ${isMe ? 'text-white' : 'text-gray-300'}`}>
                            {user.displayName}
                          </span>
                          {isMe && (
                            <span className="text-xs text-accent-400 bg-accent-500/10 px-2 py-0.5 rounded-full">
                              You
                            </span>
                          )}
                        </div>
                        {isOffered && isMe && (
                          <span className="text-xs text-accent-400 font-medium">
                            It's your turn!
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions for offered user */}
                    {isOffered && isMe && (
                      <div className="flex items-center gap-3">
                        {timeLeft !== null && (
                          <CountdownRing timeLeft={timeLeft} total={state.timeoutSeconds} />
                        )}
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={handleAccept}
                            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-success-500 hover:bg-success-400 text-white font-semibold transition-all shadow-glow-sm hover:shadow-glow"
                          >
                            <CheckIcon />
                            Accept
                          </button>
                          <button
                            onClick={handleReject}
                            className="flex items-center justify-center gap-2 px-5 py-2 rounded-xl bg-dark-600 hover:bg-dark-500 text-gray-300 font-medium transition-colors text-sm"
                          >
                            <XMarkIcon />
                            Reject
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Timer for others viewing */}
                    {isOffered && !isMe && timeLeft !== null && (
                      <div className="flex items-center gap-2 text-sm">
                        <div className="w-2 h-2 rounded-full bg-warning-400 animate-pulse" />
                        <span className="text-gray-400">Waiting for response</span>
                        <span className="font-mono text-warning-400">{timeLeft}s</span>
                      </div>
                    )}
                  </div>
                );
              })}

              {state.queue.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-dark-700/50 border border-dashed border-white/[0.1] flex items-center justify-center mb-4">
                    <UserIcon />
                  </div>
                  <p className="text-gray-500 mb-1">Queue is empty</p>
                  <p className="text-sm text-gray-600">Be the first to join!</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Resource ID footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-gray-600 font-mono">
            Resource ID: {id}
          </p>
        </div>
      </main>
    </div>
  );
}
