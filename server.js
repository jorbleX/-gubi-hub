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

  let validated =
    false;

  try {

    validate(
      initData,
      TOKEN,
      {
        expiresIn:
          86400
      }
    );

    validated =
      true;

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

  if (!validated) {

    try {

      await validate3rd(
        initData,
        BOT_ID,
        {
          expiresIn:
            86400,

          test:
            false
        }
      );

      validated =
        true;

      console.log(
        "✅ Telegram validation: public signature"
      );

    } catch (error) {

      console.error(
        "Third-party validation failed:",
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
    params.get(
      "user"
    );

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

  let data =
    null;

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

  const inviterId =
    Number(
      startParam.substring(
        4
      )
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
      applied:
        false
    };
  }

  const inviteeId =
    Number(
      inviteeTelegramUser.id
    );

  if (
    inviterId ===
    inviteeId
  ) {

    return {
      applied:
        false,

      reason:
        "self-referral"
    };
  }

  await createOrUpdateUser(
    inviteeTelegramUser
  );

  const invitee =
    await getUser(
      inviteeId
    );

  if (
    !invitee ||
    invitee.referred_by
  ) {

    return {
      applied:
        false,

      reason:
        "already-referred"
    };
  }

  const inviter =
    await getUser(
      inviterId
    );

  if (!inviter) {

    return {
      applied:
        false,

      reason:
        "inviter-not-found"
    };
  }

  const locked =
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
    !locked ||
    locked.length ===
      0
  ) {

    return {
      applied:
        false,

      reason:
        "already-referred"
    };
  }

  await supabaseRequest(
    `users?telegram_id=eq.${inviterId}`,
    {

      method:
        "PATCH",

      body: {

        xp:
          Number(
            inviter.xp ||
            0
          ) + 50,

        referral_count:
          Number(
            inviter.referral_count ||
            0
          ) + 1,

        updated_at:
          new Date()
            .toISOString()
      },

      prefer:
        "return=representation"
    }
  );

  console.log(
    `✅ REFERRAL ${inviterId} -> ${inviteeId} +50 XP`
  );

  return {

    applied:
      true,

    reward:
      50
  };
}

// ======================================================
// MISSION HELPERS
// ======================================================

async function getActiveMissions() {

  return await supabaseRequest(
    "missions?is_active=eq.true&select=*&order=sort_order.asc"
  );
}

async function getMission(
  missionId
) {

  const data =
    await supabaseRequest(
      `missions?id=eq.${encodeURIComponent(
        missionId
      )}&is_active=eq.true&select=*`
    );

  return (
    data?.[0] ||
    null
  );
}

async function getUserMissions(
  telegramId
) {

  return await supabaseRequest(
    `user_missions?telegram_id=eq.${telegramId}&select=*`
  );
}

async function ensureMissionProgress(
  telegramId,
  missionId
) {

  await supabaseRequest(
    "user_missions?on_conflict=telegram_id,mission_id",
    {

      method:
        "POST",

      body: {

        telegram_id:
          telegramId,

        mission_id:
          missionId,

        completed:
          false,

        claimed:
          false
      },

      prefer:
        "resolution=ignore-duplicates"
    }
  );
}

// ======================================================
// API: ME
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

        ok:
          true,

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

          ok:
            false,

          error:
            error?.message ||
            "Authentication failed"
        });
    }
  }
);

// ======================================================
// API: CHECK-IN
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

      const updated =
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
        !updated ||
        updated.length ===
          0
      ) {

        const latest =
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
              latest
            )
        });
      }

      user =
        updated[0];

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
// API: MISSIONS
// ======================================================

app.post(
  "/api/missions",
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

      const missions =
        await getActiveMissions();

      const progress =
        await getUserMissions(
          user.telegram_id
        );

      const progressMap =
        new Map(
          (progress || []).map(
            item => [
              item.mission_id,
              item
            ]
          )
        );

      const today =
        new Date()
          .toISOString()
          .slice(
            0,
            10
          );

      const formattedMissions =
        (missions || []).map(
          mission => {

            const userMission =
              progressMap.get(
                mission.id
              );

            let status =
              "available";

            let claimed =
              Boolean(
                userMission?.claimed
              );

            if (
              mission.id ===
              "daily_checkin"
            ) {

              claimed =
                user.last_checkin ===
                today;

              status =
                claimed
                  ? "completed"
                  : "available";

            } else if (
              mission.id ===
              "invite_friend"
            ) {

              status =
                "automatic";

            } else if (
              claimed
            ) {

              status =
                "completed";
            }

            return {

              id:
                mission.id,

              title:
                mission.title,

              description:
                mission.description,

              xp_reward:
                Number(
                  mission.xp_reward ||
                  0
                ),

              mission_type:
                mission.mission_type,

              action_url:
                mission.action_url,

              status,

              claimed
            };
          }
        );

      return res.json({

        ok:
          true,

        missions:
          formattedMissions,

        user:
          formatUser(
            user
          )
      });

    } catch (error) {

      console.error(
        "/api/missions:",
        error
      );

      return res
        .status(500)
        .json({

          ok:
            false,

          error:
            error?.message ||
            "Missions failed"
        });
    }
  }
);

// ======================================================
// API: CLAIM MISSION
// ======================================================

app.post(
  "/api/claim-mission",
  async (req, res) => {

    try {

      const {
        initData,
        missionId
      } =
        req.body;

      const telegramData =
        await validateTelegramInitData(
          initData
        );

      if (!missionId) {

        throw new Error(
          "Mission ID required"
        );
      }

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

      const mission =
        await getMission(
          missionId
        );

      if (!mission) {

        throw new Error(
          "Mission not found"
        );
      }

      // These are rewarded elsewhere.
      if (
        mission.id ===
          "daily_checkin" ||
        mission.id ===
          "invite_friend"
      ) {

        throw new Error(
          "This mission is rewarded automatically."
        );
      }

      await ensureMissionProgress(
        user.telegram_id,
        mission.id
      );

      const now =
        new Date()
          .toISOString();

      // Only one request can change
      // claimed=false -> claimed=true.
      const claimedRows =
        await supabaseRequest(
          `user_missions?telegram_id=eq.${user.telegram_id}&mission_id=eq.${encodeURIComponent(
            mission.id
          )}&claimed=eq.false`,
          {

            method:
              "PATCH",

            body: {

              completed:
                true,

              claimed:
                true,

              completed_at:
                now,

              claimed_at:
                now
            },

            prefer:
              "return=representation"
          }
        );

      // Already claimed.
      if (
        !claimedRows ||
        claimedRows.length ===
          0
      ) {

        user =
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

          mission_id:
            mission.id,

          user:
            formatUser(
              user
            )
        });
      }

      const reward =
        Number(
          mission.xp_reward ||
          0
        );

      const newXp =
        Number(
          user.xp ||
          0
        ) + reward;

      const updatedUserRows =
        await supabaseRequest(
          `users?telegram_id=eq.${user.telegram_id}`,
          {

            method:
              "PATCH",

            body: {

              xp:
                newXp,

              updated_at:
                now
            },

            prefer:
              "return=representation"
          }
        );

      user =
        updatedUserRows?.[0] ||
        await getUser(
          user.telegram_id
        );

      console.log(
        `✅ MISSION ${mission.id}: ${user.telegram_id} +${reward} XP`
      );

      return res.json({

        ok:
          true,

        already_claimed:
          false,

        mission_id:
          mission.id,

        reward,

        user:
          formatUser(
            user
          )
      });

    } catch (error) {

      console.error(
        "/api/claim-mission:",
        error
      );

      return res
        .status(500)
        .json({

          ok:
            false,

          error:
            error?.message ||
            "Mission claim failed"
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
          item =>
            String(
              item.telegram_id
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
// API: REFERRAL
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

      return res.json({

        ok:
          true,

        referral: {

          link:
            createReferralLink(
              user.telegram_id
            ),

          count:
            Number(
              user.referral_count ||
              0
            ),

          reward:
            50
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

      if (sender) {

        await createOrUpdateUser(
          sender
        );
      }

      // START
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

        let welcome =
`❄️ Welcome to GUBI

Welcome to the snow.

Complete missions, earn XP and climb the leaderboard. 👀

GUBI eats the market. 🟢`;

        if (
          referral?.applied
        ) {

          welcome +=
`\n\n👥 Referral registered successfully.`;
        }

        await sendHubButton(
          chatId,
          welcome
        );
      }

      // HUB
      else if (
        command ===
        "/hub"
      ) {

        await sendHubButton(
          chatId,
          "❄️ Enter the GUBI Community Hub:"
        );
      }

      // PROFILE
      else if (
        command ===
        "/profile"
      ) {

        const user =
          formatUser(
            await getUser(
              sender.id
            )
          );

        await sendMessage(
          chatId,

`👤 GUBI PROFILE

❄️ Level ${user?.level || 1}
⚡ ${user?.xp || 0} XP
🔥 ${user?.streak || 0} day streak
👥 ${user?.referral_count || 0} friends invited`,

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

      // MISSIONS
      else if (
        command ===
        "/missions"
      ) {

        await sendHubButton(
          chatId,
          "⚡ Open GUBI Hub to complete missions and earn XP."
        );
      }

      // RAIDS
      else if (
        command ===
        "/raids"
      ) {

        await sendHubButton(
          chatId,
          "📣 Open GUBI Hub to see active raids."
        );
      }

      // LEADERBOARD
      else if (
        command ===
        "/leaderboard"
      ) {

        await sendHubButton(
          chatId,
          "🏆 Open GUBI Hub to see the leaderboard."
        );
      }

      // INVITE
      else if (
        command ===
        "/invite"
      ) {

        const user =
          await getUser(
            sender.id
          );

        const link =
          createReferralLink(
            user.telegram_id
          );

        await sendMessage(
          chatId,

`👥 INVITE A FRIEND

Invite someone into GUBI.

You earn +50 XP when a new member joins through your personal link.

${link}

Friends invited: ${user.referral_count || 0}`,

          null
        );
      }

      // OFFICIAL
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

      // HELP
      else if (
        command ===
        "/help"
      ) {

        await sendMessage(
          chatId,

`❄️ GUBI BOT

/start - Welcome
/hub - Open GUBI Hub
/profile - Profile
/missions - Missions
/raids - Raids
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
        "Webhook:",
        error
      );

      return res.sendStatus(
        200
      );
    }
  }
);

// ======================================================
// SEND HUB
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
