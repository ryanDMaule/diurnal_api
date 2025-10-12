import express from "express";
import cors from "cors";

const app = express();
app.use(cors());

// ✅ Root route (must come before 404 handler)
app.get("/", (req, res) => {
  res.send("🌞 Diurnal API is running! Try /word");
});

// ✅ Word of the day
const wordOfTheDay = {
  date: "2025-10-05",
  word: "Diurnal",
  type: "Adjective",
  phonetic: "/dīˈərnəl/",
  definition:
    "Occurring or active during the daytime; relating to or happening once every day.",
  usage:
    "Unlike nocturnal creatures, diurnal animals such as squirrels and hawks are active during the day.",
  synonyms: ["Daily", "Daytime", "Circadian"]
};

app.get("/word", (req, res) => {
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
