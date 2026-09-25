import express from "express";
import { validate } from "@tma.js/init-data-node";

const app = express();

app.use(express.json({ limit: "100kb" }));

// ======================================================
// ENVIRONMENT VARIABLES
// ======================================================

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!TOKEN) {
  throw new Error("Missing TELEGRAM_BOT_TOKEN");
}

if (!SUPABASE_URL) {
  throw new Error("Missing SUPABASE_URL");
}

if (!SUPABASE_SECRET_KEY) {
  throw new Error("Missing SUPABASE_SECRET_KEY");
}

const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;

const GUBI_HUB =
  "https://jorblex.github.io/-gubi-hub/";

const WEBHOOK_URL =
  "https://gubi-hub.onrender.com/webhook";

const ALLOWED_ORIGIN =
  "https://jorblex.github.io";

// ======================================================
// CORS
// ======================================================

app.use((req, res, next) => {
  res.setHeader(
    "Access-Control-Allow-Origin",
    ALLOWED_ORIGIN
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

// ======================================================
// HEALTH
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
    throw new Error(
      "Open GUBI Hub from Telegram."
    );
  }

  // Validate Telegram signature
  validate(initData, TOKEN);

  const params =
    new URLSearchParams(initData);

  const authDate =
    Number(params.get("auth_date"));

  if (!authDate) {
    throw new Error(
      "Missing Telegram auth date"
    );
  }

  const now =
    Math.floor(Date.now() / 1000);

  // Session valid for 24 hours
  if (
    now - authDate > 86400 ||
    authDate > now + 60
  ) {
    throw new Error(
      "Telegram session expired"
    );
  }

  const rawUser =
    params.get("user");

  if (!rawUser) {
    throw new Error(
      "Telegram user not found"
    );
  }

  let user;

  try {
    user = JSON.parse(rawUser);
  } catch {
    throw new Error(
      "Invalid Telegram user data"
    );
  }

  if (!user?.id) {
    throw new Error(
      "Telegram user ID missing"
    );
  }

  return {
    user,
    startParam:
      params.get("start_param") || null
  };
}

// ======================================================
// SUPABASE REST API
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
    // IMPORTANT:
    // New sb_secret_ keys go in apikey.
    // Do NOT use them as Bearer JWTs.
    apikey: SUPABASE_SECRET_KEY,

    "Content-Type":
      "application/json"
  };

  if (prefer) {
    headers.Prefer = prefer;
  }

  const response =
    await fetch(
      `${SUPABASE_URL}/rest/v1/${path}`,
      {
        method,
        headers,

        body:
          body !== null
            ? JSON.stringify(body)
            : undefined
      }
    );

  const text =
    await response.text();

  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    console.error(
      "SUPABASE ERROR:",
      response.status,
      data
    );

    throw new Error(
      `Database error ${response.status}`
    );
  }

  return data;
}

// ======================================================
// USERS
// ======================================================

async function createOrUpdateUser(
  telegramUser
) {
  const payload = {
    telegram_id:
      telegramUser.id,

    username:
      telegramUser.username || null,

    first_name:
      telegramUser.first_name ||
      "GUBI Member",

    last_name:
      telegramUser.last_name || null,

    photo_url:
      telegramUser.photo_url || null,

    updated_at:
      new Date().toISOString()
  };

  const data =
    await supabaseRequest(
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

async function getUser(
  telegramId
) {
  const data =
    await supabaseRequest(
      `users?telegram_id=eq.${telegramId}&select=*`
    );

  return data?.[0] || null;
}

// ======================================================
// USER LEVEL
// ======================================================

function formatUser(user) {
  if (!user) {
    return null;
  }

  const xp =
    Number(user.xp || 0);

  const level =
    Math.floor(xp / 100) + 1;

  return {
    ...user,

    xp,

    level,

    level_xp:
      xp % 100,

    level_max_xp:
      100
  };
}

// ======================================================
// GET CURRENT TELEGRAM USER
// ======================================================

app.post(
  "/api/me",
  async (req, res) => {
    try {
      const {
        initData
      } = req.body;

      const telegramData =
        validateTelegramInitData(
          initData
        );

      await createOrUpdateUser(
        telegramData.user
      );

      const user =
        await getUser(
          telegramData.user.id
        );

      if (!user) {
        throw new Error(
          "Could not create GUBI user"
        );
      }

      res.json({
        ok: true,

        user:
          formatUser(user)
      });
    } catch (error) {
      console.error(
        "/api/me ERROR:",
        error
      );

      res.status(401).json({
        ok: false,

        error:
          error?.message ||
          "Telegram validation failed"
      });
    }
  }
);

// ======================================================
// DAILY CHECK-IN
// ======================================================

app.post(
  "/api/checkin",
  async (req, res) => {
    try {
      const {
        initData
      } = req.body;

      const telegramData =
        validateTelegramInitData(
          initData
        );

      // Ensure user exists
      await createOrUpdateUser(
        telegramData.user
      );

      let user =
        await getUser(
          telegramData.user.id
        );

      if (!user) {
        throw new Error(
          "User not found"
        );
      }

      const now =
        new Date();

      const today =
        now
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

      // --------------------------------------
      // ALREADY CLAIMED TODAY
      // --------------------------------------

      if (
        user.last_checkin === today
      ) {
        return res.json({
          ok: true,

          already_claimed:
            true,

          reward: 0,

          user:
            formatUser(user)
        });
      }

      // --------------------------------------
      // STREAK
      // --------------------------------------

      let newStreak = 1;

      if (
        user.last_checkin ===
        yesterday
      ) {
        newStreak =
          Number(
            user.streak || 0
          ) + 1;
      }

      // --------------------------------------
      // XP
      // --------------------------------------

      const newXp =
        Number(
          user.xp || 0
        ) + 10;

      // Conditional update:
      // prevents double claim if two requests arrive.
      const updatedRows =
        await supabaseRequest(
          `users?telegram_id=eq.${user.telegram_id}&or=(last_checkin.is.null,last_checkin.neq.${today})`,
          {
            method: "PATCH",

            body: {
              xp:
                newXp,

              streak:
                newStreak,

              last_checkin:
                today,

              updated_at:
                new Date()
                  .toISOString()
            },

            prefer:
              "return=representation"
          }
        );

      // Another request may have claimed it
      if (
        !updatedRows ||
        updatedRows.length === 0
      ) {
        const latestUser =
          await getUser(
            user.telegram_id
          );

        return res.json({
          ok: true,

          already_claimed:
            true,

          reward: 0,

          user:
            formatUser(
              latestUser
            )
        });
      }

      user =
        updatedRows[0];

      console.log(
        `CHECK-IN SUCCESS: ${user.telegram_id} +10 XP`
      );

      res.json({
        ok: true,

        already_claimed:
          false,

        reward:
          10,

        user:
          formatUser(user)
      });
    } catch (error) {
      console.error(
        "/api/checkin ERROR:",
        error
      );

      res.status(500).json({
        ok: false,

        error:
          error?.message ||
          "Check-in failed"
      });
    }
  }
);

// ======================================================
// TELEGRAM BOT WEBHOOK
// ======================================================

app.post(
  "/webhook",
  async (req, res) => {
    try {
      const message =
        req.body.message;

      if (
        !message ||
        !message.text
      ) {
        return res.sendStatus(
          200
        );
      }

      const chatId =
        message.chat.id;

      const command =
        message.text
          .split(" ")[0];

      // --------------------------------------
      // /START
      // --------------------------------------

      if (
        command === "/start"
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
                  text:
                    "❄️ OPEN GUBI HUB",

                  web_app: {
                    url:
                      GUBI_HUB
                  }
                }
              ]
            ]
          }
        );
      }

      // --------------------------------------
      // /HUB
      // --------------------------------------

      if (
        command === "/hub"
      ) {
        await sendMessage(
          chatId,

          "❄️ Enter the GUBI Community Hub:",

          {
            inline_keyboard: [
              [
                {
                  text:
                    "❄️ OPEN GUBI HUB",

                  web_app: {
                    url:
                      GUBI_HUB
                  }
                }
              ]
            ]
          }
        );
      }

      res.sendStatus(
        200
      );
    } catch (error) {
      console.error(
        "WEBHOOK ERROR:",
        error
      );

      res.sendStatus(
        200
      );
    }
  }
);

// ======================================================
// SEND TELEGRAM MESSAGE
// ======================================================

async function sendMessage(
  chatId,
  text,
  replyMarkup
) {
  const response =
    await fetch(
      `${TELEGRAM_API}/sendMessage`,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            chat_id:
              chatId,

            text,

            reply_markup:
              replyMarkup
          })
      }
    );

  const data =
    await response.json();

  if (!data.ok) {
    console.error(
      "TELEGRAM SEND ERROR:",
      data
    );
  }

  return data;
}

// ======================================================
// START SERVER
// ======================================================

const PORT =
  process.env.PORT || 3000;

app.listen(
  PORT,
  async () => {
    console.log(
      `GUBI Bot running on port ${PORT}`
    );

    // Set webhook automatically
    try {
      const response =
        await fetch(
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
  }
);
