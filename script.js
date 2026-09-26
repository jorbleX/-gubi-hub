const tg = window.Telegram?.WebApp;

const API_URL = "https://gubi-hub.onrender.com";
const BOT_USERNAME = "GubiCommunityBot";

let currentUser = null;
let activePage = "home";

let leaderboard = [];
let myRank = null;
let leaderboardLoaded = false;

// ======================================================
// TELEGRAM
// ======================================================

if (tg) {
  tg.ready();
  tg.expand();
}

// ======================================================
// HELPERS
// ======================================================

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function todayUTC() {
  return new Date()
    .toISOString()
    .slice(0, 10);
}

function displayName(user) {
  if (!user) {
    return "GUBI Member";
  }

  if (user.username) {
    return `@${user.username}`;
  }

  return user.first_name || "GUBI Member";
}

function showMessage(message) {
  if (tg?.showAlert) {
    tg.showAlert(message);
  } else {
    alert(message);
  }
}

function openLink(url) {
  if (tg?.openLink) {
    tg.openLink(url);
  } else {
    window.open(url, "_blank");
  }
}

// ======================================================
// API
// ======================================================

async function apiRequest(path, options = {}) {
  if (!tg?.initData) {
    throw new Error(
      "Open GUBI Hub from Telegram."
    );
  }

  const response = await fetch(
    `${API_URL}${path}`,
    {
      method: options.method || "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        initData: tg.initData,
        ...(options.body || {})
      })
    }
  );

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      "Invalid server response"
    );
  }

  if (!response.ok || !data.ok) {
    throw new Error(
      data.error ||
      "Something went wrong"
    );
  }

  return data;
}

// ======================================================
// REFERRAL LINK
// ======================================================

function getReferralLink() {
  if (!currentUser?.telegram_id) {
    return null;
  }

  return (
    `https://t.me/${BOT_USERNAME}` +
    `?start=ref_${currentUser.telegram_id}`
  );
}

async function copyReferralLink() {
  const link =
    getReferralLink();

  if (!link) {
    showMessage(
      "Referral link unavailable."
    );

    return;
  }

  try {
    await navigator.clipboard
      .writeText(link);

    tg?.HapticFeedback
      ?.notificationOccurred(
        "success"
      );

    showMessage(
      "Invite link copied. ❄️"
    );

  } catch {

    const textarea =
      document.createElement(
        "textarea"
      );

    textarea.value = link;

    document.body
      .appendChild(textarea);

    textarea.select();

    document.execCommand(
      "copy"
    );

    textarea.remove();

    showMessage(
      "Invite link copied. ❄️"
    );
  }
}

function shareReferral() {
  const link =
    getReferralLink();

  if (!link) {
    showMessage(
      "Referral link unavailable."
    );

    return;
  }

  const message =
    "Join me in the GUBI Community Hub. ❄️👀";

  const shareUrl =
    "https://t.me/share/url" +
    `?url=${encodeURIComponent(link)}` +
    `&text=${encodeURIComponent(message)}`;

  if (tg?.openTelegramLink) {
    tg.openTelegramLink(
      shareUrl
    );
  } else {
    window.open(
      shareUrl,
      "_blank"
    );
  }
}

// ======================================================
// HEADER
// ======================================================

function updateHeader() {
  if (!currentUser) {
    return;
  }

  const firstName =
    currentUser.first_name ||
    currentUser.username ||
    "GUBI";

  const hello =
    document.querySelector(
      "#hello"
    );

  const level =
    document.querySelector(
      "#level"
    );

  const xp =
    document.querySelector(
      "#xp"
    );

  const rank =
    document.querySelector(
      "#rank"
    );

  if (hello) {
    hello.textContent =
      `Welcome, ${firstName} 👀`;
  }

  if (level) {
    level.textContent =
      currentUser.level || 1;
  }

  if (xp) {
    xp.textContent =
      currentUser.xp || 0;
  }

  if (rank) {
    rank.textContent =
      currentUser.rank ||
      myRank?.rank ||
      "—";
  }
}

// ======================================================
// HOME
// ======================================================

function homePage() {
  if (!currentUser) {
    return `
      <h2>❄️ GUBI Hub</h2>
      <p>Loading profile...</p>
    `;
  }

  const claimedToday =
    currentUser.last_checkin ===
    todayUTC();

  const rankValue =
    currentUser.rank ||
    myRank?.rank ||
    "—";

  return `
    <h2>❄️ GUBI Hub</h2>

    <p>
      GM,
      <b>
        ${escapeHtml(
          currentUser.first_name ||
          currentUser.username ||
          "GUBI"
        )}
      </b>
      👀
    </p>

    <div class="mission">
      <span>
        Level ${currentUser.level || 1}

        <small
          style="
            display:block;
            opacity:.65;
            margin-top:4px
          "
        >
          ${currentUser.level_xp || 0}
          / 100 XP
        </small>
      </span>

      <b class="xp">
        ${currentUser.xp || 0} XP
      </b>
    </div>

    <div class="mission">
      <span>
        🔥 Streak
      </span>

      <b>
        ${currentUser.streak || 0}
        days
      </b>
    </div>

    <div class="mission">
      <span>
        🏆 Rank
      </span>

      <b>
        ${
          rankValue === "—"
            ? "—"
            : `#${rankValue}`
        }
      </b>
    </div>

    <div class="mission">
      <span>
        👥 Referrals
      </span>

      <b>
        ${
          currentUser.referral_count ||
          0
        }
      </b>
    </div>

    <div style="height:12px"></div>

    <h2>
      ⚡ Today's Mission
    </h2>

    <div class="mission">
      <span>
        Daily check-in

        <small
          style="
            display:block;
            opacity:.65;
            margin-top:4px
          "
        >
          ${
            claimedToday
              ? "Completed ✓"
              : "Claim today's reward"
          }
        </small>
      </span>

      <b class="xp">
        +10 XP
      </b>
    </div>

    <button
      id="homeCheckinBtn"
      class="primary"
      ${
        claimedToday
          ? "disabled"
          : ""
      }
      style="
        width:100%;
        margin-top:12px
      "
    >
      ${
        claimedToday
          ? "✓ CLAIMED"
          : "CLAIM +10 XP"
      }
    </button>

    <button
      id="homeInviteBtn"
      class="primary"
      style="
        width:100%;
        margin-top:10px
      "
    >
      👥 INVITE FRIEND
    </button>
  `;
}

// ======================================================
// MISSIONS
// ======================================================

function missionsPage() {
  const claimedToday =
    currentUser?.last_checkin ===
    todayUTC();

  return `
    <h2>⚡ Missions</h2>

    <div class="mission">
      <span>
        Daily check-in

        <small
          style="
            display:block;
            opacity:.65
          "
        >
          Keep your streak alive
        </small>
      </span>

      <b class="xp">
        +10 XP
      </b>
    </div>

    <button
      id="missionCheckinBtn"
      class="primary"
      ${
        claimedToday
          ? "disabled"
          : ""
      }
      style="
        width:100%;
        margin:10px 0 18px
      "
    >
      ${
        claimedToday
          ? "✓ COMPLETED"
          : "CLAIM +10 XP"
      }
    </button>

    <div class="mission">
      <span>
        Visit GUBI on X
      </span>

      <button
        class="missionAction"
        data-url="https://x.com/ItsGubi"
      >
        GO →
      </button>
    </div>

    <div class="mission">
      <span>
        GUBI Community
      </span>

      <button
        class="missionAction"
        data-url="https://t.me/GUBIcomunity"
      >
        GO →
      </button>
    </div>

    <div class="mission">
      <span>
        Invite a friend

        <small
          style="
            display:block;
            opacity:.65;
            margin-top:4px
          "
        >
          Earn +50 XP
        </small>
      </span>

      <b class="xp">
        +50 XP
      </b>
    </div>

    <button
      id="missionInviteBtn"
      class="primary"
      style="
        width:100%;
        margin-top:10px
      "
    >
      👥 INVITE FRIEND
    </button>
  `;
}

// ======================================================
// RAIDS
// ======================================================

function raidsPage() {
  return `
    <h2>📣 Raids</h2>

    <p>
      Active GUBI raids will
      appear here.
    </p>

    <div class="mission">
      <span>
        GUBI on X

        <small
          style="
            display:block;
            opacity:.65
          "
        >
          View recent posts
        </small>
      </span>

      <button
        class="missionAction"
        data-url="https://x.com/ItsGubi"
      >
        OPEN →
      </button>
    </div>

    <div class="notice">
      Raid missions coming next.
    </div>
  `;
}

// ======================================================
// LEADERBOARD
// ======================================================

function getMedal(rank) {
  if (rank === 1) {
    return "🥇";
  }

  if (rank === 2) {
    return "🥈";
  }

  if (rank === 3) {
    return "🥉";
  }

  return `#${rank}`;
}

function leaderboardLoadingPage() {
  return `
    <h2>🏆 Leaderboard</h2>
    <p>Loading ranks...</p>
  `;
}

function leadersPage() {
  if (!leaderboardLoaded) {
    return leaderboardLoadingPage();
  }

  if (!leaderboard.length) {
    return `
      <h2>🏆 Leaderboard</h2>

      <div class="notice">
        No members yet.
      </div>
    `;
  }

  const rows =
    leaderboard
      .map(user => {

        const isMe =
          String(
            user.telegram_id
          ) ===
          String(
            currentUser?.telegram_id
          );

        return `
          <div
            class="mission"
            style="
              ${
                isMe
                  ? "border:2px solid #168cff;"
                  : ""
              }
            "
          >
            <span
              style="
                display:flex;
                gap:10px;
                align-items:center
              "
            >

              <b
                style="
                  min-width:32px
                "
              >
                ${getMedal(
                  user.rank
                )}
              </b>

              <span>
                <b>
                  ${escapeHtml(
                    displayName(
                      user
                    )
                  )}
                </b>

                <small
                  style="
                    display:block;
                    opacity:.6
                  "
                >
                  🔥 ${
                    user.streak ||
                    0
                  } day streak
                </small>
              </span>

            </span>

            <b class="xp">
              ${user.xp || 0}
              XP
            </b>

          </div>
        `;
      })
      .join("");

  return `
    <h2>🏆 Leaderboard</h2>

    <div
      class="mission"
      style="
        border:2px solid #168cff;
        margin-bottom:16px
      "
    >
      <span>
        Your position
      </span>

      <b>
        ${
          myRank?.rank
            ? `#${myRank.rank}`
            : "—"
        }
      </b>
    </div>

    ${rows}

    <button
      id="refreshRanksBtn"
      class="primary"
      style="
        width:100%;
        margin-top:14px
      "
    >
      ↻ REFRESH
    </button>
  `;
}

// ======================================================
// PROFILE
// ======================================================

function profilePage() {
  if (!currentUser) {
    return `
      <p>Loading profile...</p>
    `;
  }

  const rankValue =
    currentUser.rank ||
    myRank?.rank ||
    "—";

  const referralLink =
    getReferralLink();

  return `
    <h2>👤 Profile</h2>

    <p>
      <b>
        ${escapeHtml(
          displayName(
            currentUser
          )
        )}
      </b>
    </p>

    <div class="mission">
      <span>❄️ Level</span>

      <b>
        ${currentUser.level || 1}
      </b>
    </div>

    <div class="mission">
      <span>⚡ Total XP</span>

      <b class="xp">
        ${currentUser.xp || 0}
      </b>
    </div>

    <div class="mission">
      <span>🔥 Streak</span>

      <b>
        ${
          currentUser.streak ||
          0
        } days
      </b>
    </div>

    <div class="mission">
      <span>🏆 Rank</span>

      <b>
        ${
          rankValue === "—"
            ? "—"
            : `#${rankValue}`
        }
      </b>
    </div>

    <div class="mission">
      <span>
        👥 Friends invited

        <small
          style="
            display:block;
            opacity:.65
          "
        >
          +50 XP each
        </small>
      </span>

      <b>
        ${
          currentUser.referral_count ||
          0
        }
      </b>
    </div>

    ${
      referralLink
        ? `
          <div
            class="notice"
            style="
              margin-top:14px;
              word-break:break-all
            "
          >
            ${escapeHtml(
              referralLink
            )}
          </div>

          <button
            id="profileInviteBtn"
            class="primary"
            style="
              width:100%;
              margin-top:12px
            "
          >
            👥 INVITE FRIEND
          </button>

          <button
            id="copyReferralBtn"
            style="
              width:100%;
              margin-top:8px;
              padding:12px;
              border-radius:12px;
              border:1px solid #d7e7f8;
              background:white;
              font-weight:700
            "
          >
            COPY INVITE LINK
          </button>
        `
        : `
          <div class="notice">
            Invite link unavailable.
          </div>
        `
    }
  `;
}

// ======================================================
// RENDER PAGE
// ======================================================

function renderPage(
  page = activePage
) {
  activePage = page;

  const screen =
    document.querySelector(
      "#screen"
    );

  if (!screen) {
    return;
  }

  const pages = {
    home: homePage,
    missions: missionsPage,
    raids: raidsPage,
    leaders: leadersPage,
    profile: profilePage
  };

  screen.innerHTML =
    pages[page]?.() ||
    homePage();

  bindPageActions();
}

// ======================================================
// CHECK-IN
// ======================================================

async function claimCheckin(
  button
) {
  if (!button) {
    return;
  }

  button.disabled = true;
  button.textContent =
    "CLAIMING...";

  try {

    const data =
      await apiRequest(
        "/api/checkin"
      );

    currentUser =
      data.user;

    leaderboardLoaded =
      false;

    updateHeader();

    if (
      data.already_claimed
    ) {

      showMessage(
        "Already claimed today. ❄️"
      );

    } else {

      tg?.HapticFeedback
        ?.notificationOccurred(
          "success"
        );

      showMessage(
        `+${data.reward} XP! 🔥`
      );
    }

    renderPage(
      activePage
    );

  } catch (error) {

    button.disabled =
      false;

    button.textContent =
      "CLAIM +10 XP";

    showMessage(
      error.message
    );
  }
}

// ======================================================
// LEADERBOARD
// ======================================================

async function loadLeaderboard(
  force = false
) {

  if (
    leaderboardLoaded &&
    !force
  ) {
    return;
  }

  try {

    const data =
      await apiRequest(
        "/api/leaderboard"
      );

    leaderboard =
      data.leaderboard ||
      [];

    myRank =
      data.me ||
      null;

    leaderboardLoaded =
      true;

    if (
      currentUser &&
      myRank?.rank
    ) {

      currentUser.rank =
        myRank.rank;
    }

    updateHeader();

    if (
      activePage ===
      "leaders"
    ) {

      renderPage(
        "leaders"
      );
    }

  } catch (error) {

    console.error(
      error
    );

    showMessage(
      error.message
    );
  }
}

// ======================================================
// ACTIONS
// ======================================================

function bindPageActions() {

  const homeCheckin =
    document.querySelector(
      "#homeCheckinBtn"
    );

  const missionCheckin =
    document.querySelector(
      "#missionCheckinBtn"
    );

  homeCheckin
    ?.addEventListener(
      "click",
      () =>
        claimCheckin(
          homeCheckin
        )
    );

  missionCheckin
    ?.addEventListener(
      "click",
      () =>
        claimCheckin(
          missionCheckin
        )
    );

  document
    .querySelectorAll(
      ".missionAction"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const url =
            button.dataset.url;

          if (url) {
            openLink(url);
          }
        }
      );
    });

  document
    .querySelector(
      "#homeInviteBtn"
    )
    ?.addEventListener(
      "click",
      shareReferral
    );

  document
    .querySelector(
      "#missionInviteBtn"
    )
    ?.addEventListener(
      "click",
      shareReferral
    );

  document
    .querySelector(
      "#profileInviteBtn"
    )
    ?.addEventListener(
      "click",
      shareReferral
    );

  document
    .querySelector(
      "#copyReferralBtn"
    )
    ?.addEventListener(
      "click",
      copyReferralLink
    );

  document
    .querySelector(
      "#refreshRanksBtn"
    )
    ?.addEventListener(
      "click",
      async () => {

        leaderboardLoaded =
          false;

        await loadLeaderboard(
          true
        );
      }
    );
}

// ======================================================
// NAVIGATION
// ======================================================

document
  .querySelectorAll(
    "nav button"
  )
  .forEach(button => {

    button.addEventListener(
      "click",
      async () => {

        document
          .querySelectorAll(
            "nav button"
          )
          .forEach(item =>

            item.classList
              .remove(
                "active"
              )
          );

        button.classList
          .add(
            "active"
          );

        const page =
          button.dataset.page;

        renderPage(
          page
        );

        if (
          page ===
          "leaders"
        ) {

          await loadLeaderboard();
        }
      }
    );
  });

document
  .querySelector(
    '[data-page="home"]'
  )
  ?.classList
  .add(
    "active"
  );

// ======================================================
// INITIALIZE
// ======================================================

async function initializeGubi() {

  const screen =
    document.querySelector(
      "#screen"
    );

  if (screen) {

    screen.innerHTML = `
      <h2>
        ❄️ Entering the snow...
      </h2>

      <p>
        Loading your GUBI profile.
      </p>
    `;
  }

  try {

    const data =
      await apiRequest(
        "/api/me"
      );

    currentUser =
      data.user;

    updateHeader();

    renderPage(
      "home"
    );

    loadLeaderboard();

  } catch (error) {

    console.error(
      error
    );

    if (screen) {

      screen.innerHTML = `
        <h2>
          ❄️ GUBI Hub
        </h2>

        <p>
          ${escapeHtml(
            error.message
          )}
        </p>

        <div class="notice">
          Open GUBI Hub from
          @GubiCommunityBot.
        </div>
      `;
    }
  }
}

initializeGubi();
