import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { socket } from '../socket';

interface User {
        userId: number;
        displayName: string;
        isOffered?: boolean;
}

interface ResourceState {
        resourceId: string;
        name: string;
        timeoutSeconds: number;
        holder: User | null;
        queue: User[];
        offerExpiresAt: string | null;
}

export default function Resource() {
        const { id } = useParams();
        console.log('Resource component mounted, ID:', id);

        const [state, setState] = useState<ResourceState | null>(null);
        const [myUserId, setMyUserId] = useState<number | null>(null);
        const [joinName, setJoinName] = useState('');
        const [showJoin, setShowJoin] = useState(false);
        const [timeLeft, setTimeLeft] = useState<string | null>(null);

        useEffect(() => {
                // Request notification permission
                if ('Notification' in window && Notification.permission === 'default') {
                        Notification.requestPermission();
                }

                // Restore userId and name from localStorage
                const storedId = localStorage.getItem(`queue_user_${id}`);
                const storedName = localStorage.getItem(`queue_name_${id}`);

                if (storedId) {
                        setMyUserId(Number(storedId));
                }
                if (storedName) {
                        setJoinName(storedName);
                }

                console.log('Emitting join_resource for:', id);
                socket.emit('join_resource', id);

                // Handle reconnection - CRITICAL for dynamic updates after disconnects
                const handleConnect = () => {
                        console.log('Socket reconnected, re-joining resource:', id);
                        socket.emit('join_resource', id);
                };
                socket.on('connect', handleConnect);

                socket.on('state_update', (data: ResourceState) => {
                        console.log('Received state_update:', data);
                        console.log('  - Queue length:', data.queue.length);
                        console.log('  - Offer active:', data.offerExpiresAt !== null);
                        if (data.offerExpiresAt) {
                                console.log('  - Offer expires at:', data.offerExpiresAt);
                        }
                        data.queue.forEach((user, idx) => {
                                console.log(`  - Queue[${idx}]: ${user.displayName} (ID: ${user.userId}, Offered: ${user.isOffered})`);
                        });

                        // Check if this user just got offered
                        const myStoredId = localStorage.getItem(`queue_user_${id}`);
                        if (myStoredId) {
                                const myId = Number(myStoredId);
                                const myQueueItem = data.queue.find(u => u.userId === myId);

                                // Show notification if it's my turn
                                if (myQueueItem?.isOffered && 'Notification' in window && Notification.permission === 'granted') {
                                        const timeout = data.timeoutSeconds || 60;
                                        new Notification('Your Turn!', {
                                                body: `It's your turn to access ${data.name}. You have ${timeout} seconds to accept.`,
                                                icon: '/favicon.ico',
                                                tag: 'queue-offer' // Prevents duplicate notifications
                                        });
                                }
                        }

                        setState(data);
                });

                socket.on('joined_queue', (data: { userId: number }) => {
                        console.log('Joined queue, userId:', data.userId);
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

                const interval = setInterval(() => {
                        const now = new Date().getTime();
                        const expiry = new Date(state.offerExpiresAt!).getTime();
                        const diff = expiry - now;

                        if (diff <= 0) {
                                setTimeLeft("0s");
                                clearInterval(interval);
                        } else {
                                const seconds = Math.ceil(diff / 1000);
                                setTimeLeft(`${seconds}s`);
                        }
                }, 1000);

                return () => clearInterval(interval);
        }, [state?.offerExpiresAt]);

        const copyLink = () => {
                navigator.clipboard.writeText(window.location.href);
                alert('Link copied to clipboard!');
        };

        const handleJoinClick = () => {
                if (myUserId && joinName) {
                        // Direct re-join - skip modal
                        socket.emit('join_queue', {
                                resourceId: id,
                                displayName: joinName,
                                userId: myUserId
                        });
                } else {
                        // Show modal for new users
                        setShowJoin(true);
                }
        };

        const handleJoin = (e: React.FormEvent) => {
                e.preventDefault();
                // Save name for future
                localStorage.setItem(`queue_name_${id}`, joinName);

                // Pass userId if we have it, to re-join as same user
                socket.emit('join_queue', {
                        resourceId: id,
                        displayName: joinName,
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
                if (confirm('Are you sure you want to reject this offer? You will be removed from the queue.')) {
                        socket.emit('reject_offer', { resourceId: id, userId: myUserId });
                }
        };

        const handleLeave = () => {
                if (!myUserId) return;
                if (confirm('Are you sure you want to leave the queue?')) {
                        socket.emit('leave_queue', { resourceId: id, userId: myUserId });
                }
        };

        if (!state) return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Loading...</div>;

        const isHolder = state.holder?.userId === myUserId;
        const myQueueItem = state.queue.find(u => u.userId === myUserId);
        const isInQueue = !!myQueueItem;

        return (
                <div className="min-h-screen bg-gray-900 text-white p-4 font-sans">
                        <div className="max-w-4xl mx-auto">
                                <header className="mb-8 border-b border-gray-700 pb-4 flex justify-between items-end">
                                        <div>
                                                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 text-transparent bg-clip-text">{state.name}</h1>
                                                <p className="text-gray-400 text-sm">Queue System</p>
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                                <button onClick={copyLink} className="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-blue-300 transition">
                                                        Share Link 🔗
                                                </button>
                                                <div className="text-xs text-gray-500">ID: {id}</div>
                                        </div>
                                </header>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        {/* Current Holder */}
                                        <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700 flex flex-col">
                                                <h2 className="text-xl font-semibold mb-4 text-gray-300 uppercase tracking-wider text-sm">Current Holder</h2>
                                                <div className="flex-1 flex flex-col items-center justify-center py-8">
                                                        {state.holder ? (
                                                                <>
                                                                        <div className="text-5xl font-bold text-green-400 mb-4 animate-pulse-slow">{state.holder.displayName}</div>
                                                                        <div className="text-sm text-gray-400 mb-6">is currently using the resource</div>
                                                                        {isHolder && (
                                                                                <button
                                                                                        onClick={handleRelease}
                                                                                        className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-8 rounded-full transition shadow-lg hover:shadow-red-500/50 transform hover:-translate-y-1"
                                                                                >
                                                                                        Release Resource
                                                                                </button>
                                                                        )}
                                                                </>
                                                        ) : (
                                                                <div className="text-center text-gray-500 italic">
                                                                        <div className="text-4xl mb-2">🟢</div>
                                                                        Currently Available
                                                                </div>
                                                        )}
                                                </div>
                                        </div>

                                        {/* Queue */}
                                        <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
                                                <div className="flex justify-between items-center mb-6">
                                                        <h2 className="text-xl font-semibold text-gray-300 uppercase tracking-wider text-sm">Queue ({state.queue.length})</h2>
                                                        <div className="flex gap-2">
                                                                {isInQueue && (
                                                                        <button
                                                                                onClick={handleLeave}
                                                                                className="bg-red-600 hover:bg-red-700 text-sm px-4 py-2 rounded transition font-medium shadow-md"
                                                                        >
                                                                                Leave Queue
                                                                        </button>
                                                                )}
                                                                {!isInQueue && !showJoin && !isHolder && (
                                                                        <button
                                                                                onClick={handleJoinClick}
                                                                                className="bg-blue-600 hover:bg-blue-700 text-sm px-4 py-2 rounded transition font-medium shadow-md"
                                                                        >
                                                                                {myUserId && joinName ? 'Re-Join Queue' : 'Join Queue'}
                                                                        </button>
                                                                )}
                                                        </div>
                                                </div>

                                                {showJoin && (
                                                        <form onSubmit={handleJoin} className="mb-6 p-4 bg-gray-700/50 rounded-lg border border-gray-600 animate-fade-in">
                                                                <label className="block text-xs text-gray-400 mb-1">Display Name</label>
                                                                <input
                                                                        type="text"
                                                                        value={joinName}
                                                                        onChange={e => setJoinName(e.target.value)}
                                                                        placeholder="Enter your name"
                                                                        className="w-full bg-gray-900 rounded px-3 py-2 mb-3 focus:outline-none focus:ring-1 focus:ring-blue-500 border border-gray-700"
                                                                        required
                                                                        autoFocus
                                                                />
                                                                <div className="flex gap-2">
                                                                        <button type="submit" className="flex-1 bg-green-600 hover:bg-green-700 py-2 rounded text-sm font-bold">Join</button>
                                                                        <button type="button" onClick={() => setShowJoin(false)} className="flex-1 bg-gray-600 hover:bg-gray-500 py-2 rounded text-sm">Cancel</button>
                                                                </div>
                                                        </form>
                                                )}

                                                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                                                        {state.queue.map((user, idx) => (
                                                                <div
                                                                        key={user.userId}
                                                                        className={`flex items-center justify-between p-3 rounded-lg transition-all ${user.userId === myUserId
                                                                                ? 'bg-blue-900/40 border border-blue-500/50 shadow-blue-900/20 shadow-lg'
                                                                                : 'bg-gray-700/30 border border-gray-700'
                                                                                }`}
                                                                >
                                                                        <div className="flex items-center gap-3">
                                                                                <span className={`font-mono text-sm w-6 ${idx === 0 ? 'text-yellow-500 font-bold' : 'text-gray-500'}`}>
                                                                                        #{idx + 1}
                                                                                </span>
                                                                                <span className={`font-medium ${user.userId === myUserId ? 'text-blue-300' : 'text-gray-300'}`}>
                                                                                        {user.displayName} {user.userId === myUserId && '(You)'}
                                                                                </span>
                                                                        </div>

                                                                        {user.isOffered && (
                                                                                <div className="flex items-center gap-3">
                                                                                        <div className="flex flex-col items-end">
                                                                                                <span className={`text-xs font-bold uppercase animate-pulse ${user.userId === myUserId ? 'text-yellow-400' : 'text-gray-400'}`}>
                                                                                                        {user.userId === myUserId ? 'Your Turn!' : 'Offered'}
                                                                                                </span>
                                                                                                {timeLeft && (
                                                                                                        <span className="text-xs text-red-400 font-mono font-bold">
                                                                                                                {timeLeft}
                                                                                                        </span>
                                                                                                )}
                                                                                        </div>
                                                                                        {user.userId === myUserId && (
                                                                                                <div className="flex gap-2">
                                                                                                        <button
                                                                                                                onClick={handleAccept}
                                                                                                                className="bg-yellow-600 hover:bg-yellow-700 text-white text-xs px-3 py-2 rounded font-bold shadow-lg hover:shadow-yellow-600/50 transition"
                                                                                                        >
                                                                                                                ACCEPT
                                                                                                        </button>
                                                                                                        <button
                                                                                                                onClick={handleReject}
                                                                                                                className="bg-gray-600 hover:bg-gray-700 text-white text-xs px-3 py-2 rounded font-bold shadow-lg hover:shadow-gray-600/50 transition"
                                                                                                        >
                                                                                                                REJECT
                                                                                                        </button>
                                                                                                </div>
                                                                                        )}
                                                                                </div>
                                                                        )}
                                                                </div>
                                                        ))}

                                                        {state.queue.length === 0 && (
                                                                <div className="text-center text-gray-500 py-12 border-2 border-dashed border-gray-700 rounded-lg">
                                                                        Queue is empty
                                                                </div>
                                                        )}
                                                </div>
                                        </div>
                                </div>
                        </div>
                </div>
        );
}
