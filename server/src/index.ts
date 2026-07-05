import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { registerSocketHandlers } from './socket/handlers.js';
import { roomManager } from './rooms/room-manager.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

const app = express();
app.use(cors());
app.use(express.json());

// Serve built client files (production build from client/dist)
const clientDistPath = path.resolve(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDistPath));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// ── HTTP routes ───────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/api/rooms', (_req, res) => {
  res.json({ rooms: roomManager.list() });
});

// SPA fallback: serve index.html for all non-API routes
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// ── Socket.IO ─────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);
  registerSocketHandlers(socket);
});

// ── Start ─────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`[server] Poker server running on http://localhost:${PORT}`);
});

export default app;
