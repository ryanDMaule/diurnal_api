import express from "express";
import cors from "cors";
import { wordLibrary } from "./dictionary.js";

const app = express();
app.use(cors());

// ✅ Root route (must come before 404 handler)
app.get("/", (req, res) => {
  res.send("🌞 Diurnal API is running! Try /word");
});

app.get("/word", (req, res) => {
  const today = new Date();
  const startDate = new Date("2025-10-05"); // Your season start date
  const dayCount = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));

  const index = dayCount % wordLibrary.length; // cycles automatically
  const wordOfTheDay = wordLibrary[index];

  res.json(wordOfTheDay);
});

// ✅ This must be *last* — handles unknown routes
app.use((req, res) => {
  res.status(404).json({ error: "Not Found" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Diurnal API running on port ${PORT}`);
});
