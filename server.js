const express = require('express');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// === Health check root ===
app.get('/', (req, res) => {
  res.json({ message: "🚀 Server is running on Railway!", version: "test-1.0" });
});

// === Dummy auth ===
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === "test" && password === "1234") {
    return res.json({ success: true, token: "dummy-jwt-token" });
  }
  return res.status(401).json({ error: "Invalid credentials" });
});

// === Dummy tickets API ===
app.get('/api/tickets', (req, res) => {
  res.json([
    { id: 1, id_tiket: "TCK-001", deskripsi: "Tes tiket pertama", status: "OPEN" },
    { id: 2, id_tiket: "TCK-002", deskripsi: "Tes tiket kedua", status: "CLOSED" }
  ]);
});

app.listen(port, () => {
  console.log(`✅ Minimal server running on port ${port}`);
});
