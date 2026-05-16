import express from 'express';
import cors from 'cors';
import racesRouter from './routes/races';
import settingsRouter from './routes/settings';
import updateRouter from './routes/update';
import shutubaRouter from './routes/shutuba';
import horsesRouter from './routes/horses';
import picksRouter from './routes/picks';
import ticketsRouter from './routes/tickets';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

app.use('/api', racesRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/update', updateRouter);
app.use('/api/shutuba', shutubaRouter);
app.use('/api/horses', horsesRouter);
app.use('/api/picks', picksRouter);
app.use('/api/tickets', ticketsRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
