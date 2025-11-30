import { io } from 'socket.io-client';

export const socket = io('http://localhost:8000', {
        path: '/socket.io',
        autoConnect: true,
        transports: ['websocket', 'polling'] // Force websocket first
});

socket.on('connect', () => {
        console.log('Socket connected:', socket.id);
});

socket.on('connect_error', (err) => {
        console.error('Socket connection error:', err);
});

socket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
});
