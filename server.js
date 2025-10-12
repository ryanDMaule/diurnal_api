import express from "express";
import cors from "cors";

const app = express();
app.use(cors());

const wordOfTheDay = {
  date: "2025-10-05",
  word: "Diurnal",
  type: "Adjective",
  phonetic: "/dīˈərnəl/",
  definition: "Occurring or active during the daytime; relating to or happening once every day.",
  usage: "Unlike nocturnal creatures, diurnal animals such as squirrels and hawks are active during the day.",
  synonyms: ["Daily", "Daytime", "Circadian"],
//   audio_url: "https://yourdomain.com/audio/diurnal.mp3"
};

app.get("/", (req, res) => {
    res.send("🌞 Diurnal API is running! Try /word");
  });

app.get("/word", (req, res) => {
  res.json(wordOfTheDay);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
