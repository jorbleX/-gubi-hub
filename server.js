import express from "express";
import {
  validate,
  validate3rd
} from "@tma.js/init-data-node";

const app = express();

app.use(
  express.json({
    limit: "100kb"
  })
);

// ======================================================
// ENVIRONMENT
// ======================================================

const TOKEN =
  process.env.TELEGRAM_BOT_TOKEN?.trim();

const SUPABASE_URL =
  process.env.SUPABASE_URL?.trim();

const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY?.trim();

if (!TOKEN) {
  throw new Error(
    "Missing TELEGRAM_BOT_TOKEN"
  );
}

if (!SUPABASE_URL) {
  throw new Error(
    "Missing SUPABASE_URL"
  );
}

if (!SUPABASE_SECRET_KEY) {
  throw new Error(
    "Missing SUPABASE_SECRET_KEY"
  );
}

const BOT_ID =
  Number(
    TOKEN.split(":")[0]
  );

if (!BOT_ID) {
  throw new Error(
    "Invalid Telegram bot token"
  );
}

const TELEGRAM_API =
  `https://api.telegram.org/bot${TOKEN}`;

const GUBI_HUB =
  "https://jorblex.github.io/-gubi-hub/";

const WEBHOOK_URL =
  "https://gubi-hub.onrender.com/webhook";

const ALLOWED_ORIGIN =
  "https://jorblex.github.io";

// ======================================================
// CORS
// ======================================================

app.use(
  (req, res, next) => {
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

    if (
      req.method === "OPTIONS"
    ) {
      return res.sendStatus(204);
    }

    next();
  }
);

// ======================================================
// HEALTH
// ======================================================

app.get(
  "/",
  (req, res) => {
    res.send(
      "❄️ GUBI Bot is running!"
    );
  }
);

app.get(
  "/api/health",
  (req, res) => {
    res.json({
      ok: true,
      service:
        "GUBI Community Hub"
    });
  }
);

// ======================================================
// TELEGRAM VALIDATION
// ======================================================

async function validateTelegramInitData(
  initData
) {
  if (!initData) {
    throw new Error(
      "Open GUBI Hub from Telegram."
    );
  }

  let validated = false;

  // Method 1
  try {
    validate(
      initData,
      TOKEN,
      {
        expiresIn: 86400
      }
    );

    validated = true;

    console.log(
      "✅ Telegram validation: bot token"
    );
  } catch (error) {
    console.log(
      "Bot-token validation failed:",
      error?.name ||
      error?.message
    );
  }

  // Method 2
  if (!validated) {
    try {
      await validate3rd(
        initData,
        BOT_ID,
        {
          expiresIn: 86400,
          test: false
        }
      );

      validated = true;

      console.log(
        "✅ Telegram validation: public signature"
      );
    } catch (error) {
      console.error(
        "Third-party Telegram validation failed:",
        error?.name ||
        error?.message
      );
    }
  }

  if (!validated) {
    throw new Error(
      "Telegram validation failed"
    );
  }

  const params =
    new URLSearchParams(
      initData
    );

  const rawUser =
    params.get("user");

  if (!rawUser) {
    throw new Error(
      "Telegram user not found"
    );
  }

  let user;

  try {
    user =
      JSON.parse(rawUser);
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
      params.get(
        "start_param"
      ) || null
  };
}

// ======================================================
// SUPABASE
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
    apikey:
      SUPABASE_SECRET_KEY,

    "Content-Type":
      "application/json"
  };

  if (prefer) {
    headers.Prefer =
      prefer;
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

  const raw =
    await response.text();

  let data = null;

  if (raw) {
    try {
      data =
        JSON.parse(raw);
    } catch {
      data = raw;
    }
  }

  if (!response.ok) {
    console.error(
      "SUPABASE ERROR:",
      {
        status:
          response.status,
        path,
        data
      }
    );

    throw new Error(
      `Database error (${response.status})`
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
      telegramUser.username ||
      null,

    first_name:
      telegramUser.first_name ||
      "GUBI Member",

    last_name:
      telegramUser.last_name ||
      null,

    photo_url:
      telegramUser.photo_url ||
      null,

    updated_at:
      new Date()
        .toISOString()
  };

  const data =
    await supabaseRequest(
      "users?on_conflict=telegram_id",
      {
        method:
          "POST",

        body:
          payload,

        prefer:
          "resolution=merge-duplicates,return=representation"
      }
    );

  return (
    data?.[0] ||
    null
  );
}

async function getUser(
  telegramId
) {
  const data =
    await supabaseRequest(
      `users?telegram_id=eq.${telegramId}&select=*`
    );

  return (
    data?.[0] ||
    null
  );
}

// ======================================================
// LEVEL SYSTEM
// ======================================================

function formatUser(
  user
) {
  if (!user) {
    return null;
  }

  const xp =
    Number(
      user.xp || 0
    );

  const level =
    Math.floor(
      xp / 100
    ) + 1;

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
// API: CURRENT USER
// ======================================================

app.post(
  "/api/me",
  async (req, res) => {
    try {
      const {
        initData
      } = req.body;

      const telegramData =
        await validateTelegramInitData(
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
          "Could not create user"
        );
      }

      return res.json({
        ok: true,

        user:
          formatUser(
            user
          )
      });

    } catch (error) {

      console.error(
        "/api/me error:",
        error
      );

      return res
        .status(401)
        .json({
          ok: false,

          error:
            error?.message ||
            "Authentication failed"
        });
    }
  }
);

// ======================================================
// API: DAILY CHECK-IN
// ======================================================

app.post(
  "/api/checkin",
  async (req, res) => {
    try {
      const {
        initData
      } = req.body;

      const telegramData =
        await validateTelegramInitData(
          initData
        );

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
          .slice(
            0,
            10
          );

      const yesterdayDate =
        new Date(now);

      yesterdayDate.setUTCDate(
        yesterdayDate.getUTCDate() -
        1
      );

      const yesterday =
        yesterdayDate
          .toISOString()
          .slice(
            0,
            10
          );

      // Already claimed
      if (
        user.last_checkin ===
        today
      ) {
        return res.json({
          ok: true,

          already_claimed:
            true,

          reward: 0,

          user:
            formatUser(
              user
            )
        });
      }

      // Streak
      let newStreak =
        1;

      if (
        user.last_checkin ===
        yesterday
      ) {
        newStreak =
          Number(
            user.streak ||
            0
          ) + 1;
      }

      // XP
      const newXp =
        Number(
          user.xp ||
          0
        ) + 10;

      const updatedRows =
        await supabaseRequest(
          `users?telegram_id=eq.${user.telegram_id}&or=(last_checkin.is.null,last_checkin.neq.${today})`,
          {
            method:
              "PATCH",

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

      if (
        !updatedRows ||
        updatedRows.length ===
        0
      ) {
        const latestUser =
          await getUser(
            user.telegram_id
          );

        return res.json({
          ok: true,

          already_claimed:
            true,

          reward:
            0,

          user:
            formatUser(
              latestUser
            )
        });
      }

      user =
        updatedRows[0];

      console.log(
        `✅ GUBI CHECK-IN: ${user.telegram_id} +10 XP`
      );

      return res.json({
        ok: true,

        already_claimed:
          false,

        reward:
          10,

        user:
          formatUser(
            user
          )
      });

    } catch (error) {

      console.error(
        "/api/checkin error:",
        error
      );

      return res
        .status(500)
        .json({
          ok:
            false,

          error:
            error?.message ||
            "Check-in failed"
        });
    }
  }
);

// ======================================================
// API: LEADERBOARD
// ======================================================

app.post(
  "/api/leaderboard",
  async (req, res) => {
    try {
      const {
        initData
      } = req.body;

      const telegramData =
        await validateTelegramInitData(
          initData
        );

      await createOrUpdateUser(
        telegramData.user
      );

      const users =
        await supabaseRequest(
          "users?select=telegram_id,username,first_name,photo_url,xp,streak,created_at&order=xp.desc,created_at.asc&limit=1000"
        );

      const normalized =
        (users || []).map(
          (user, index) => ({
            rank:
              index + 1,

            telegram_id:
              user.telegram_id,

            username:
              user.username,

            first_name:
              user.first_name,

            photo_url:
              user.photo_url,

            xp:
              Number(
                user.xp || 0
              ),

            streak:
              Number(
                user.streak || 0
              )
          })
        );

      const leaderboard =
        normalized.slice(
          0,
          50
        );

      const me =
        normalized.find(
          user =>
            String(
              user.telegram_id
            ) ===
            String(
              telegramData.user.id
            )
        );

      return res.json({
        ok:
          true,

        leaderboard,

        me:
          me || {
            rank:
              null,

            telegram_id:
              telegramData.user.id,

            xp:
              0
          }
      });

    } catch (error) {

      console.error(
        "/api/leaderboard error:",
        error
      );

      return res
        .status(500)
        .json({
          ok:
            false,

          error:
            error?.message ||
            "Leaderboard failed"
        });
    }
  }
);

// ======================================================
// DATABASE HEALTH
// ======================================================

app.get(
  "/api/database-health",
  async (req, res) => {
    try {
      await supabaseRequest(
        "users?select=telegram_id&limit=1"
      );

      return res.json({
        ok:
          true,

        database:
          "Supabase connected"
      });

    } catch (error) {

      console.error(
        "Database health:",
        error
      );

      return res
        .status(500)
        .json({
          ok:
            false,

          database:
            "Supabase failed",

          error:
            error.message
        });
    }
  }
);

// ======================================================
// TELEGRAM WEBHOOK
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

      if (
        command ===
        "/start"
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

      if (
        command ===
        "/hub"
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

      return res.sendStatus(
        200
      );

    } catch (error) {

      console.error(
        "Telegram webhook error:",
        error
      );

      return res.sendStatus(
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
      "Telegram send error:",
      data
    );
  }

  return data;
}

// ======================================================
// START SERVER
// ======================================================

const PORT =
  process.env.PORT ||
  3000;

app.listen(
  PORT,
  async () => {

    console.log(
      `❄️ GUBI Bot running on port ${PORT}`
    );

    console.log(
      `Telegram Bot ID: ${BOT_ID}`
    );

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
