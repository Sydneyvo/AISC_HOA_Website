const express = require('express');
const cors    = require('cors');
require('dotenv').config();

const app = express();


app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());

// Routes
app.use('/api/properties',         require('./routes/properties'));
app.use('/api/violations',         require('./routes/violations'));
app.use('/api/dashboard',          require('./routes/dashboard'));

// Health check
app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
