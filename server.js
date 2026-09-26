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

const BOT_USERNAME =
  "GubiCommunityBot";

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

  // ----------------------------------------------
  // METHOD 1
  // ----------------------------------------------

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

  // ----------------------------------------------
  // METHOD 2
  // ----------------------------------------------

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
      JSON.parse(
        rawUser
      );

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
            ? JSON.stringify(
                body
              )
            : undefined
      }
    );

  const raw =
    await response.text();

  let data = null;

  if (raw) {

    try {

      data =
        JSON.parse(
          raw
        );

    } catch {

      data =
        raw;
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
// LEVELS
// ======================================================

function formatUser(
  user
) {

  if (!user) {

    return null;
  }

  const xp =
    Number(
      user.xp ||
      0
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
// REFERRALS
// ======================================================

function createReferralLink(
  telegramId
) {

  return (
    `https://t.me/${BOT_USERNAME}` +
    `?start=ref_${telegramId}`
  );
}

function extractReferralId(
  startParam
) {

  if (
    !startParam ||
    !startParam.startsWith(
      "ref_"
    )
  ) {

    return null;
  }

  const rawId =
    startParam.substring(
      4
    );

  const inviterId =
    Number(
      rawId
    );

  if (
    !Number.isSafeInteger(
      inviterId
    ) ||
    inviterId <= 0
  ) {

    return null;
  }

  return inviterId;
}

async function processReferral(
  inviteeTelegramUser,
  startParam
) {

  const inviterId =
    extractReferralId(
      startParam
    );

  if (!inviterId) {

    return {
      applied: false,
      reason:
        "no-referral"
    };
  }

  const inviteeId =
    Number(
      inviteeTelegramUser.id
    );

  // ===============================================
  // NO SELF REFERRALS
  // ===============================================

  if (
    inviterId ===
    inviteeId
  ) {

    return {
      applied: false,
      reason:
        "self-referral"
    };
  }

  // ===============================================
  // MAKE SURE INVITEE EXISTS
  // ===============================================

  await createOrUpdateUser(
    inviteeTelegramUser
  );

  const invitee =
    await getUser(
      inviteeId
    );

  if (!invitee) {

    return {
      applied: false,
      reason:
        "invitee-not-found"
    };
  }

  // ===============================================
  // ONE REFERRER PER ACCOUNT
  // ===============================================

  if (
    invitee.referred_by
  ) {

    return {
      applied: false,
      reason:
        "already-referred"
    };
  }

  // ===============================================
  // INVITER MUST EXIST
  // ===============================================

  const inviter =
    await getUser(
      inviterId
    );

  if (!inviter) {

    return {
      applied: false,
      reason:
        "inviter-not-found"
    };
  }

  // ===============================================
  // LOCK REFERRAL FIRST
  // ===============================================

  const referralLock =
    await supabaseRequest(
      `users?telegram_id=eq.${inviteeId}&referred_by=is.null`,
      {

        method:
          "PATCH",

        body: {

          referred_by:
            inviterId,

          updated_at:
            new Date()
              .toISOString()
        },

        prefer:
          "return=representation"
      }
    );

  if (
    !referralLock ||
    referralLock.length ===
      0
  ) {

    return {
      applied: false,
      reason:
        "already-referred"
    };
  }

  // ===============================================
  // REWARD INVITER
  // ===============================================

  const inviterXp =
    Number(
      inviter.xp ||
      0
    );

  const inviterReferrals =
    Number(
      inviter.referral_count ||
      0
    );

  const updatedInviter =
    await supabaseRequest(
      `users?telegram_id=eq.${inviterId}`,
      {

        method:
          "PATCH",

        body: {

          xp:
            inviterXp +
            50,

          referral_count:
            inviterReferrals +
            1,

          updated_at:
            new Date()
              .toISOString()
        },

        prefer:
          "return=representation"
      }
    );

  console.log(
    `✅ REFERRAL ${inviterId} -> ${inviteeId} | +50 XP`
  );

  return {

    applied:
      true,

    reward:
      50,

    inviter:
      updatedInviter?.[0] ||
      null
  };
}

// ======================================================
// API ME
// ======================================================

app.post(
  "/api/me",
  async (req, res) => {

    try {

      const {
        initData
      } =
        req.body;

      const telegramData =
        await validateTelegramInitData(
          initData
        );

      await createOrUpdateUser(
        telegramData.user
      );

      // Backup:
      // if Mini App itself has start_param
      // process referral here too.
      if (
        telegramData.startParam
      ) {

        await processReferral(
          telegramData.user,
          telegramData.startParam
        );
      }

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
        "/api/me:",
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
// API CHECK-IN
// ======================================================

app.post(
  "/api/checkin",
  async (req, res) => {

    try {

      const {
        initData
      } =
        req.body;

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
        new Date(
          now
        );

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

          ok:
            true,

          already_claimed:
            true,

          reward:
            0,

          user:
            formatUser(
              user
            )
        });
      }

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

          ok:
            true,

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
        `✅ CHECK-IN ${user.telegram_id} +10 XP`
      );

      return res.json({

        ok:
          true,

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
        "/api/checkin:",
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
// API LEADERBOARD
// ======================================================

app.post(
  "/api/leaderboard",
  async (req, res) => {

    try {

      const {
        initData
      } =
        req.body;

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

      const rankings =
        (users || [])
          .map(
            (
              user,
              index
            ) => ({

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
                  user.xp ||
                  0
                ),

              streak:
                Number(
                  user.streak ||
                  0
                )
            })
          );

      const leaderboard =
        rankings.slice(
          0,
          50
        );

      const me =
        rankings.find(
          user =>
            String(
              user.telegram_id
            ) ===
            String(
              telegramData.user.id
            )
        ) ||
        null;

      return res.json({

        ok:
          true,

        leaderboard,

        me
      });

    } catch (error) {

      console.error(
        "/api/leaderboard:",
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
// API REFERRAL
// ======================================================

app.post(
  "/api/referral",
  async (req, res) => {

    try {

      const {
        initData
      } =
        req.body;

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
          "User not found"
        );
      }

      const link =
        createReferralLink(
          user.telegram_id
        );

      return res.json({

        ok:
          true,

        referral: {

          link,

          count:
            Number(
              user.referral_count ||
              0
            ),

          reward:
            50,

          total_referral_xp:
            Number(
              user.referral_count ||
              0
            ) * 50
        }
      });

    } catch (error) {

      console.error(
        "/api/referral:",
        error
      );

      return res
        .status(500)
        .json({

          ok:
            false,

          error:
            error?.message ||
            "Referral failed"
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

      const sender =
        message.from;

      const text =
        message.text.trim();

      const parts =
        text.split(
          /\s+/
        );

      const command =
        parts[0];

      const startParam =
        parts[1] ||
        null;

      // ----------------------------------------------
      // CREATE USER
      // ----------------------------------------------

      if (sender) {

        await createOrUpdateUser(
          sender
        );
      }

      // ==============================================
      // /START
      // ==============================================

      if (
        command ===
        "/start"
      ) {

        let referral =
          null;

        if (
          sender &&
          startParam
        ) {

          referral =
            await processReferral(
              sender,
              startParam
            );
        }

        let messageText =
`❄️ Welcome to GUBI

Welcome to the snow.

Complete missions, earn XP and climb the leaderboard. 👀

GUBI eats the market. 🟢`;

        if (
          referral?.applied
        ) {

          messageText +=
`\n\n👥 Referral registered successfully.`;
        }

        await sendHubButton(
          chatId,
          messageText
        );
      }

      // ==============================================
      // /HUB
      // ==============================================

      else if (
        command ===
        "/hub"
      ) {

        await sendHubButton(
          chatId,
          "❄️ Enter the GUBI Community Hub:"
        );
      }

      // ==============================================
      // /PROFILE
      // ==============================================

      else if (
        command ===
        "/profile"
      ) {

        const user =
          await getUser(
            sender.id
          );

        const formatted =
          formatUser(
            user
          );

        await sendMessage(
          chatId,

`👤 GUBI PROFILE

❄️ Level ${formatted?.level || 1}
⚡ ${formatted?.xp || 0} XP
🔥 ${formatted?.streak || 0} day streak
👥 ${formatted?.referral_count || 0} friends invited`,

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

      // ==============================================
      // /MISSIONS
      // ==============================================

      else if (
        command ===
        "/missions"
      ) {

        await sendHubButton(
          chatId,
          "⚡ Open GUBI Hub to view active missions."
        );
      }

      // ==============================================
      // /RAIDS
      // ==============================================

      else if (
        command ===
        "/raids"
      ) {

        await sendHubButton(
          chatId,
          "📣 Open GUBI Hub to view active raids."
        );
      }

      // ==============================================
      // /LEADERBOARD
      // ==============================================

      else if (
        command ===
        "/leaderboard"
      ) {

        await sendHubButton(
          chatId,
          "🏆 Open GUBI Hub to view the leaderboard."
        );
      }

      // ==============================================
      // /INVITE
      // ==============================================

      else if (
        command ===
        "/invite"
      ) {

        const user =
          await getUser(
            sender.id
          );

        if (!user) {

          throw new Error(
            "User not found"
          );
        }

        const link =
          createReferralLink(
            user.telegram_id
          );

        await sendMessage(
          chatId,

`👥 INVITE A FRIEND

Invite someone into GUBI.

You earn +50 XP when a new member joins through your personal link.

Your link:
${link}

Friends invited: ${user.referral_count || 0}`,

          null
        );
      }

      // ==============================================
      // /OFFICIAL
      // ==============================================

      else if (
        command ===
        "/official"
      ) {

        await sendMessage(
          chatId,

`❄️ OFFICIAL GUBI

X:
https://x.com/ItsGubi

GUBI Hub:
https://t.me/GubiCommunityBot/gubihub

⚠️ No official GUBI token yet.`,

          null
        );
      }

      // ==============================================
      // /HELP
      // ==============================================

      else if (
        command ===
        "/help"
      ) {

        await sendMessage(
          chatId,

`❄️ GUBI BOT

/start - Welcome
/hub - Open GUBI Hub
/profile - View profile
/missions - View missions
/raids - Active raids
/leaderboard - Rankings
/invite - Invite friends
/official - Official links`,

          null
        );
      }

      return res.sendStatus(
        200
      );

    } catch (error) {

      console.error(
        "Webhook error:",
        error
      );

      return res.sendStatus(
        200
      );
    }
  }
);

// ======================================================
// SEND HUB BUTTON
// ======================================================

async function sendHubButton(
  chatId,
  text =
    "❄️ Enter the GUBI Community Hub:"
) {

  return sendMessage(
    chatId,
    text,
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

// ======================================================
// SEND MESSAGE
// ======================================================

async function sendMessage(
  chatId,
  text,
  replyMarkup = null
) {

  const body = {

    chat_id:
      chatId,

    text
  };

  if (replyMarkup) {

    body.reply_markup =
      replyMarkup;
  }

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
          JSON.stringify(
            body
          )
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
// START
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
