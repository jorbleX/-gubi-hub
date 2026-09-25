import express from "express";
import crypto from "node:crypto";

const app = express();

app.use(express.json({ limit: "100kb" }));

// ======================================================
// ENVIRONMENT VARIABLES
// ======================================================

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;

const GUBI_HUB = "https://jorblex.github.io/-gubi-hub/";
const WEBHOOK_URL = "https://gubi-hub.onrender.com/webhook";

const ALLOWED_ORIGIN = "https://jorblex.github.io";

// ======================================================
// CORS
// ======================================================

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// ======================================================
// BASIC HEALTH CHECK
// ======================================================

app.get("/", (req, res) => {
  res.send("❄️ GUBI Bot is running!");
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "GUBI Community Hub"
  });
});

// ======================================================
// TELEGRAM MINI APP VALIDATION
// ======================================================

function validateTelegramInitData(initData) {
  if (!initData) {
    throw new Error("Missing Telegram initData");
  }

  const params = new URLSearchParams(initData);

  const receivedHash = params.get("hash");
  const authDate = Number(params.get("auth_date"));

  if (!receivedHash || !authDate) {
    throw new Error("Invalid Telegram data");
  }

  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(TOKEN)
    .digest();

  const calculatedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const receivedBuffer = Buffer.from(receivedHash, "hex");
  const calculatedBuffer = Buffer.from(calculatedHash, "hex");

  if (
    receivedBuffer.length !== calculatedBuffer.length ||
    !crypto.timingSafeEqual(receivedBuffer, calculatedBuffer)
  ) {
    throw new Error("Invalid Telegram signature");
  }

  // Reject very old Telegram sessions
  const now = Math.floor(Date.now() / 1000);
  const maxAge = 60 * 60 * 24;

  if (Math.abs(now - authDate) > maxAge) {
    throw new Error("Telegram session expired");
  }

  const rawUser = params.get("user");

  if (!rawUser) {
    throw new Error("Telegram user not found");
  }

  const user = JSON.parse(rawUser);

  return {
    user,
    startParam: params.get("start_param") || null
  };
}

// ======================================================
// SUPABASE REST HELPER
// ======================================================

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
    throw new Error(`Supabase request failed: ${response.status}`);
  }

  return data;
}

// ======================================================
// USER
// ======================================================

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
      prefer: "resolution=merge-duplicates,return=representation"
    }
  );

  return data?.[0];
}

async function getUser(telegramId) {
  const data = await supabaseRequest(
    `users?telegram_id=eq.${telegramId}&select=*`
  );

  return data?.[0] || null;
}

function formatUser(user) {
  const xp = Number(user.xp || 0);

  const level = Math.floor(xp / 100) + 1;
  const levelXp = xp % 100;

  return {
    ...user,
    level,
    level_xp: levelXp,
    level_max_xp: 100
  };
}

// ======================================================
// GET CURRENT USER
// ======================================================

app.post("/api/me", async (req, res) => {
  try {
    const { initData } = req.body;

    const telegramData =
      validateTelegramInitData(initData);

    let user = await createOrUpdateUser(
      telegramData.user
    );

    user = formatUser(user);

    res.json({
      ok: true,
      user
    });
  } catch (error) {
    console.error("/api/me error:", error.message);

    res.status(401).json({
      ok: false,
      error: error.message
    });
  }
});

// ======================================================
// DAILY CHECK-IN
// ======================================================

app.post("/api/checkin", async (req, res) => {
  try {
    const { initData } = req.body;

    const telegramData =
      validateTelegramInitData(initData);

    await createOrUpdateUser(telegramData.user);

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

    const yesterdayDate = new Date(now);
    yesterdayDate.setUTCDate(
      yesterdayDate.getUTCDate() - 1
    );

    const yesterday = yesterdayDate
      .toISOString()
      .slice(0, 10);

    // Already claimed today
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

    // Conditional update prevents repeated claims
    const updatedRows =
      await supabaseRequest(
        `users?telegram_id=eq.${user.telegram_id}&or=(last_checkin.is.null,last_checkin.neq.${today})`,
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

    // Another request already claimed it
    if (!updatedRows?.length) {
      const currentUser =
        await getUser(user.telegram_id);

      return res.json({
        ok: true,
        already_claimed: true,
        reward: 0,
        user: formatUser(currentUser)
      });
    }

    const updatedUser =
      formatUser(updatedRows[0]);

    res.json({
      ok: true,
      already_claimed: false,
      reward: 10,
      user: updatedUser
    });
  } catch (error) {
    console.error(
      "/api/checkin error:",
      error.message
    );

    res.status(401).json({
      ok: false,
      error: error.message
    });
  }
});

// ======================================================
// TELEGRAM BOT WEBHOOK
// ======================================================

app.post("/webhook", async (req, res) => {
  try {
    const message = req.body.message;

    if (!message || !message.text) {
      return res.sendStatus(200);
    }

    const chatId = message.chat.id;

    const command =
      message.text.split(" ")[0];

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
    console.error(
      "Webhook error:",
      error
    );

    res.sendStatus(200);
  }
});

// ======================================================
// TELEGRAM SEND MESSAGE
// ======================================================

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
        "Content-Type":
          "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        reply_markup: replyMarkup
      })
    }
  );

  const data = await response.json();

  if (!data.ok) {
    console.error(
      "Telegram error:",
      data
    );
  }

  return data;
}

// ======================================================
// START SERVER + SET WEBHOOK
// ======================================================

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

    const data =
      await response.json();

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
