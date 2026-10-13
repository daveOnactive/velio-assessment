import { config } from 'dotenv';
import http from 'node:http';
import { Server } from 'socket.io';
import { createApp } from './app.js';
import { startRealtime } from './realtime.js';

config({ path: '../../.env' });
const port = Number(process.env.PORT || 3001);
let app: ReturnType<typeof createApp>;
const httpServer = http.createServer((request, response) => app(request, response));
const io = new Server(httpServer, {
  cors: { origin: process.env.WEB_ORIGIN || 'http://localhost:5173' },
});
const realtime = await startRealtime(io);
app = createApp(realtime);
io.on('connection', (s) => s.on('subscribe', ({ activityId }) => s.join(`activity:${activityId}`)));
httpServer.listen(port, () => console.log(`Velio API listening on ${port}`));
