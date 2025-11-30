import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Landing() {
        const [name, setName] = useState('');
        const [description, setDescription] = useState('');
        const [timeout, setTimeoutVal] = useState(60);
        const navigate = useNavigate();

        const handleSubmit = async (e: React.FormEvent) => {
                e.preventDefault();
                try {
                        const res = await fetch('/api/resources', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ name, description, timeoutSeconds: Number(timeout) })
                        });
                        if (!res.ok) throw new Error('Failed to create resource');
                        const data = await res.json();
                        navigate(`/r/${data.id}`);
                } catch (err) {
                        console.error(err);
                        alert('Error creating resource');
                }
        };

        return (
                <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
                        <div className="max-w-md w-full bg-gray-800 p-8 rounded-lg shadow-lg border border-gray-700">
                                <h1 className="text-3xl font-bold mb-6 text-center bg-gradient-to-r from-blue-400 to-purple-500 text-transparent bg-clip-text">Create Resource</h1>
                                <form onSubmit={handleSubmit} className="space-y-4">
                                        <div>
                                                <label className="block text-sm font-medium mb-1 text-gray-300">Resource Name</label>
                                                <input
                                                        type="text"
                                                        value={name}
                                                        onChange={e => setName(e.target.value)}
                                                        className="w-full bg-gray-700 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 border border-gray-600"
                                                        placeholder="e.g. GPU Server 1"
                                                        required
                                                />
                                        </div>
                                        <div>
                                                <label className="block text-sm font-medium mb-1 text-gray-300">Description (Optional)</label>
                                                <textarea
                                                        value={description}
                                                        onChange={e => setDescription(e.target.value)}
                                                        className="w-full bg-gray-700 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 border border-gray-600"
                                                        placeholder="Brief details about the resource..."
                                                />
                                        </div>
                                        <div>
                                                <label className="block text-sm font-medium mb-1 text-gray-300">Offer Timeout (Seconds)</label>
                                                <input
                                                        type="number"
                                                        value={timeout}
                                                        onChange={e => setTimeoutVal(Number(e.target.value))}
                                                        className="w-full bg-gray-700 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 border border-gray-600"
                                                        min="10"
                                                />
                                                <p className="text-xs text-gray-400 mt-1">Time allowed for a user to accept their turn.</p>
                                        </div>
                                        <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition duration-200 shadow-md">
                                                Create Queue
                                        </button>
                                </form>
                        </div>
                </div>
        );
}
