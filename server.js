import express from "express";

const app = express();

app.use(express.json());

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;
const GUBI_HUB = "https://jorblex.github.io/-gubi-hub/";

app.get("/", (req, res) => {
  res.send("❄️ GUBI Bot is running!");
});

app.post("/webhook", async (req, res) => {
  try {
    const message = req.body.message;

    if (!message || !message.text) {
      return res.sendStatus(200);
    }

    const chatId = message.chat.id;
    const command = message.text.split(" ")[0];

    if (command === "/start") {
      await sendMessage(
        chatId,
        `❄️ Welcome to GUBI

Welcome to the snow.

Complete missions, earn XP and climb the leaderboard. 👀

GUBI eats the market. 🟢`,
        {
          inline_keyboard: [
            [
              {
                text: "❄️ OPEN GUBI HUB",
                web_app: {
                  url: GUBI_HUB
                }
              }
            ]
          ]
        }
      );
    }

    if (command === "/hub") {
      await sendMessage(
        chatId,
        "❄️ Enter the GUBI Community Hub:",
        {
          inline_keyboard: [
            [
              {
                text: "❄️ OPEN GUBI HUB",
                web_app: {
                  url: GUBI_HUB
                }
              }
            ]
          ]
        }
      );
    }

    res.sendStatus(200);
  } catch (error) {
    console.error(error);
    res.sendStatus(200);
  }
});

async function sendMessage(chatId, text, replyMarkup) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: replyMarkup
    })
  });
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`GUBI Bot running on port ${PORT}`);
});
