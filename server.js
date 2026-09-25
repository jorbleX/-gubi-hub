import express from "express";
import { validate } from "@tma.js/init-data-node";

const app = express();
app.use(express.json({ limit: "100kb" }));

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;
const GUBI_HUB = "https://jorblex.github.io/-gubi-hub/";
const WEBHOOK_URL = "https://gubi-hub.onrender.com/webhook";

app.use((req, res, next) => {
  res.setHeader(
    "Access-Control-Allow-Origin",
    "https://jorblex.github.io"
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.get("/", (req, res) => {
  res.send("❄️ GUBI Bot is running!");
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "GUBI Community Hub"
  });
});

// =============================================
// TELEGRAM VALIDATION
// =============================================

function validateTelegramInitData(initData) {
  if (!initData) {
    throw new Error("Open GUBI Hub from Telegram.");
  }

  // Official Telegram Mini App validation library
  validate(initData, TOKEN);

  const params = new URLSearchParams(initData);

  const authDate = Number(params.get("auth_date"));

  if (!authDate) {
    throw new Error("Missing Telegram auth date");
  }

  const now = Math.floor(Date.now() / 1000);

  if (now - authDate > 86400) {
    throw new Error("Telegram session expired");
  }

  const rawUser = params.get("user");

  if (!rawUser) {
    throw new Error("Telegram user not found");
  }

  const user = JSON.parse(rawUser);

  if (!user?.id) {
    throw new Error("Telegram user ID missing");
  }

  return {
    user,
    startParam: params.get("start_param") || null
  };
}

// =============================================
// SUPABASE
// =============================================

async function supabaseRequest(
  path,
  {
    method = "GET",
    body = null,
    prefer = null
  } = {}
) {
  const headers = {
    apikey: SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    "Content-Type": "application/json"
  };

  if (prefer) {
    headers.Prefer = prefer;
  }

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${path}`,
    {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    }
  );

  const text = await response.text();

  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    console.error("Supabase error:", data);
    throw new Error(`Database error ${response.status}`);
  }

  return data;
}

// =============================================
// USERS
// =============================================

async function createOrUpdateUser(telegramUser) {
  const payload = {
    telegram_id: telegramUser.id,
    username: telegramUser.username || null,
    first_name: telegramUser.first_name || "GUBI Member",
    last_name: telegramUser.last_name || null,
    photo_url: telegramUser.photo_url || null,
    updated_at: new Date().toISOString()
  };

  const data = await supabaseRequest(
    "users?on_conflict=telegram_id",
    {
      method: "POST",
      body: payload,
      prefer:
        "resolution=merge-duplicates,return=representation"
    }
  );

  return data?.[0] || null;
}

async function getUser(telegramId) {
  const data = await supabaseRequest(
    `users?telegram_id=eq.${telegramId}&select=*`
  );

  return data?.[0] || null;
}

function formatUser(user) {
  if (!user) return null;

  const xp = Number(user.xp || 0);
  const level = Math.floor(xp / 100) + 1;

  return {
    ...user,
    xp,
    level,
    level_xp: xp % 100,
    level_max_xp: 100
  };
}

// =============================================
// CURRENT USER
// =============================================

app.post("/api/me", async (req, res) => {
  try {
    const { initData } = req.body;

    const telegramData =
      validateTelegramInitData(initData);

    await createOrUpdateUser(
      telegramData.user
    );

    const user = await getUser(
      telegramData.user.id
    );

    if (!user) {
      throw new Error("Could not create user");
    }

    res.json({
      ok: true,
      user: formatUser(user)
    });
  } catch (error) {
    console.error("/api/me:", error);

    res.status(401).json({
      ok: false,
      error:
        error?.message ||
        "Telegram validation failed"
    });
  }
});

// =============================================
// DAILY CHECK-IN
// =============================================

app.post("/api/checkin", async (req, res) => {
  try {
    const { initData } = req.body;

    const telegramData =
      validateTelegramInitData(initData);

    await createOrUpdateUser(
      telegramData.user
    );

    let user = await getUser(
      telegramData.user.id
    );

    if (!user) {
      throw new Error("User not found");
    }

    const now = new Date();

    const today = now
      .toISOString()
      .slice(0, 10);

    const yesterdayDate =
      new Date(now);

    yesterdayDate.setUTCDate(
      yesterdayDate.getUTCDate() - 1
    );

    const yesterday =
      yesterdayDate
        .toISOString()
        .slice(0, 10);

    if (user.last_checkin === today) {
      return res.json({
        ok: true,
        already_claimed: true,
        reward: 0,
        user: formatUser(user)
      });
    }

    let newStreak = 1;

    if (user.last_checkin === yesterday) {
      newStreak =
        Number(user.streak || 0) + 1;
    }

    const newXp =
      Number(user.xp || 0) + 10;

    const updatedRows =
      await supabaseRequest(
        `users?telegram_id=eq.${user.telegram_id}`,
        {
          method: "PATCH",
          body: {
            xp: newXp,
            streak: newStreak,
            last_checkin: today,
            updated_at:
              new Date().toISOString()
          },
          prefer: "return=representation"
        }
      );

    if (!updatedRows?.length) {
      throw new Error(
        "Could not update check-in"
      );
    }

    user = updatedRows[0];

    res.json({
      ok: true,
      already_claimed: false,
      reward: 10,
      user: formatUser(user)
    });
  } catch (error) {
    console.error("/api/checkin:", error);

    res.status(401).json({
      ok: false,
      error:
        error?.message ||
        "Check-in failed"
    });
  }
});

// =============================================
// TELEGRAM BOT
// =============================================

app.post("/webhook", async (req, res) => {
  try {
    const message = req.body.message;

    if (!message?.text) {
      return res.sendStatus(200);
    }

    const chatId = message.chat.id;
    const command =
      message.text.split(" ")[0];

    if (
      command === "/start" ||
      command === "/hub"
    ) {
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

    res.sendStatus(200);
  } catch (error) {
    console.error("Webhook error:", error);
    res.sendStatus(200);
  }
});

async function sendMessage(
  chatId,
  text,
  replyMarkup
) {
  const response = await fetch(
    `${TELEGRAM_API}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        reply_markup: replyMarkup
      })
    }
  );

  return response.json();
}

// =============================================
// START
// =============================================

const PORT =
  process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(
    `GUBI Bot running on port ${PORT}`
  );

  try {
    const response = await fetch(
      `${TELEGRAM_API}/setWebhook?url=${encodeURIComponent(
        WEBHOOK_URL
      )}`
    );

    const data = await response.json();

    console.log(
      "Telegram webhook:",
      data
    );
  } catch (error) {
    console.error(
      "Webhook setup failed:",
      error
    );
  }
});
