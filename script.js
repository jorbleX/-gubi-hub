const tg = window.Telegram?.WebApp;

const API_URL = "https://gubi-hub.onrender.com";
const BOT_USERNAME = "GubiCommunityBot";

let currentUser = null;
let activePage = "home";

let leaderboard = [];
let myRank = null;
let leaderboardLoaded = false;

let missions = [];
let missionsLoaded = false;

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

  return (
    user.first_name ||
    "GUBI Member"
  );
}

function showMessage(message) {
  if (tg?.showAlert) {
    tg.showAlert(message);
  } else {
    alert(message);
  }
}

function openLink(url) {
  if (!url) {
    return;
  }

  if (
    url.includes("t.me/") &&
    tg?.openTelegramLink
  ) {
    tg.openTelegramLink(url);
    return;
  }

  if (tg?.openLink) {
    tg.openLink(url);
  } else {
    window.open(
      url,
      "_blank"
    );
  }
}

// ======================================================
// API
// ======================================================

async function apiRequest(
  path,
  options = {}
) {
  if (!tg?.initData) {
    throw new Error(
      "Open GUBI Hub from Telegram."
    );
  }

  const response =
    await fetch(
      `${API_URL}${path}`,
      {
        method:
          options.method ||
          "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            initData:
              tg.initData,

            ...(options.body || {})
          })
      }
    );

  let data;

  try {
    data =
      await response.json();
  } catch {
    throw new Error(
      "Invalid server response"
    );
  }

  if (
    !response.ok ||
    !data.ok
  ) {
    throw new Error(
      data.error ||
      "Something went wrong"
    );
  }

  return data;
}

// ======================================================
// REFERRALS
// ======================================================

function getReferralLink() {
  if (
    !currentUser?.telegram_id
  ) {
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

    textarea.value =
      link;

    document.body
      .appendChild(
        textarea
      );

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

  const text =
    "Join me in the GUBI Community Hub. ❄️👀";

  const shareUrl =
    "https://t.me/share/url" +
    `?url=${encodeURIComponent(
      link
    )}` +
    `&text=${encodeURIComponent(
      text
    )}`;

  if (
    tg?.openTelegramLink
  ) {
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
      currentUser.level ||
      1;
  }

  if (xp) {
    xp.textContent =
      currentUser.xp ||
      0;
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
        Level
        ${currentUser.level || 1}

        <small
          style="
            display:block;
            opacity:.65;
            margin-top:4px
          "
        >
          ${
            currentUser.level_xp ||
            0
          } / 100 XP
        </small>
      </span>

      <b class="xp">
        ${
          currentUser.xp ||
          0
        } XP
      </b>
    </div>

    <div class="mission">
      <span>
        🔥 Streak
      </span>

      <b>
        ${
          currentUser.streak ||
          0
        } days
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
// MISSION LOCAL STATE
// ======================================================

function missionOpenedKey(
  missionId
) {
  return (
    `gubi_mission_opened_` +
    `${currentUser?.telegram_id || "user"}_` +
    `${missionId}`
  );
}

function missionWasOpened(
  missionId
) {
  return (
    localStorage.getItem(
      missionOpenedKey(
        missionId
      )
    ) === "1"
  );
}

function markMissionOpened(
  missionId
) {
  localStorage.setItem(
    missionOpenedKey(
      missionId
    ),
    "1"
  );
}

// ======================================================
// MISSIONS
// ======================================================

function missionsLoadingPage() {
  return `
    <h2>⚡ Missions</h2>

    <p>
      Loading missions...
    </p>
  `;
}

function missionButton(
  mission
) {
  if (
    mission.status ===
      "completed" ||
    mission.claimed
  ) {
    return `
      <button
        disabled
        style="
          padding:10px 14px;
          border:0;
          border-radius:12px;
          font-weight:800;
          opacity:.7
        "
      >
        ✓ COMPLETED
      </button>
    `;
  }

  if (
    mission.id ===
    "daily_checkin"
  ) {
    return `
      <button
        id="dailyMissionCheckin"
        class="primary"
        style="
          padding:10px 14px
        "
      >
        CLAIM
      </button>
    `;
  }

  if (
    mission.id ===
    "invite_friend"
  ) {
    return `
      <button
        id="missionInviteBtn"
        class="primary"
        style="
          padding:10px 14px
        "
      >
        INVITE
      </button>
    `;
  }

  const opened =
    missionWasOpened(
      mission.id
    );

  if (
    opened
  ) {
    return `
      <button
        class="claimMissionBtn primary"
        data-mission-id="${escapeHtml(
          mission.id
        )}"
        style="
          padding:10px 14px
        "
      >
        CLAIM
      </button>
    `;
  }

  return `
    <button
      class="goMissionBtn"
      data-mission-id="${escapeHtml(
        mission.id
      )}"
      data-url="${escapeHtml(
        mission.action_url ||
        ""
      )}"
      style="
        padding:10px 14px;
        border-radius:12px;
        border:1px solid #d7e7f8;
        background:white;
        font-weight:800
      "
    >
      GO →
    </button>
  `;
}

function missionsPage() {
  if (!missionsLoaded) {
    return missionsLoadingPage();
  }

  if (!missions.length) {
    return `
      <h2>⚡ Missions</h2>

      <div class="notice">
        No active missions right now.
      </div>
    `;
  }

  const rows =
    missions
      .map(
        mission => `
          <div
            class="mission"
            style="
              align-items:center;
            "
          >
            <span>
              <b>
                ${escapeHtml(
                  mission.title
                )}
              </b>

              <small
                style="
                  display:block;
                  opacity:.65;
                  margin-top:4px;
                  max-width:220px
                "
              >
                ${escapeHtml(
                  mission.description ||
                  ""
                )}
              </small>

              <small
                style="
                  display:block;
                  color:#168cff;
                  font-weight:800;
                  margin-top:5px
                "
              >
                +${
                  mission.xp_reward ||
                  0
                } XP
              </small>
            </span>

            ${missionButton(
              mission
            )}
          </div>
        `
      )
      .join("");

  return `
    <h2>⚡ Missions</h2>

    <p>
      Complete missions.
      Earn XP.
      Climb the ranks. ❄️
    </p>

    ${rows}

    <div
      class="notice"
      style="
        margin-top:16px
      "
    >
      Social missions currently use
      GO → CLAIM.
      Automated verification will
      be added later.
    </div>
  `;
}

// ======================================================
// LOAD MISSIONS
// ======================================================

async function loadMissions(
  force = false
) {
  if (
    missionsLoaded &&
    !force
  ) {
    return;
  }

  if (
    activePage ===
    "missions"
  ) {
    const screen =
      document.querySelector(
        "#screen"
      );

    if (screen) {
      screen.innerHTML =
        missionsLoadingPage();
    }
  }

  try {

    const data =
      await apiRequest(
        "/api/missions"
      );

    missions =
      data.missions ||
      [];

    missionsLoaded =
      true;

    if (
      data.user
    ) {
      currentUser =
        data.user;

      updateHeader();
    }

    if (
      activePage ===
      "missions"
    ) {
      renderPage(
        "missions"
      );
    }

  } catch (error) {

    console.error(
      "Missions:",
      error
    );

    showMessage(
      error.message
    );
  }
}

// ======================================================
// OPEN MISSION
// ======================================================

function openMission(
  missionId,
  url
) {
  markMissionOpened(
    missionId
  );

  const mission =
    missions.find(
      item =>
        item.id ===
        missionId
    );

  if (
    mission
  ) {
    renderPage(
      "missions"
    );
  }

  if (url) {
    openLink(
      url
    );
  }
}

// ======================================================
// CLAIM MISSION
// ======================================================

async function claimMission(
  missionId,
  button
) {
  if (!missionId) {
    return;
  }

  if (button) {
    button.disabled =
      true;

    button.textContent =
      "CLAIMING...";
  }

  try {

    const data =
      await apiRequest(
        "/api/claim-mission",
        {
          body: {
            missionId
          }
        }
      );

    if (
      data.user
    ) {
      currentUser =
        data.user;
    }

    leaderboardLoaded =
      false;

    updateHeader();

    if (
      data.already_claimed
    ) {
      showMessage(
        "Mission already completed. ❄️"
      );
    } else {

      tg?.HapticFeedback
        ?.notificationOccurred(
          "success"
        );

      showMessage(
        `Mission complete! +${data.reward} XP 🔥`
      );
    }

    missionsLoaded =
      false;

    await loadMissions(
      true
    );

  } catch (error) {

    console.error(
      error
    );

    if (button) {
      button.disabled =
        false;

      button.textContent =
        "CLAIM";
    }

    showMessage(
      error.message
    );
  }
}

// ======================================================
// DAILY CHECK-IN
// ======================================================

async function claimCheckin(
  button
) {
  if (!button) {
    return;
  }

  button.disabled =
    true;

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

    missionsLoaded =
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

    if (
      activePage ===
      "missions"
    ) {
      await loadMissions(
        true
      );
    } else {
      renderPage(
        activePage
      );
    }

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
// RAIDS
// ======================================================

function raidsPage() {
  return `
    <h2>📣 Raids</h2>

    <p>
      Active GUBI raids
      will appear here.
    </p>

    <div class="mission">
      <span>
        Official GUBI on X

        <small
          style="
            display:block;
            opacity:.65
          "
        >
          Check the latest posts.
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
      Real raid system comes next.
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
      .map(
        user => {

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
                ${
                  user.xp ||
                  0
                } XP
              </b>
            </div>
          `;
        }
      )
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
      "Leaderboard:",
      error
    );

    showMessage(
      error.message
    );
  }
}

// ======================================================
// PROFILE
// ======================================================

function profilePage() {
  if (!currentUser) {
    return `
      <p>
        Loading profile...
      </p>
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
      <span>
        ❄️ Level
      </span>

      <b>
        ${currentUser.level || 1}
      </b>
    </div>

    <div class="mission">
      <span>
        ⚡ Total XP
      </span>

      <b class="xp">
        ${currentUser.xp || 0}
      </b>
    </div>

    <div class="mission">
      <span>
        🔥 Streak
      </span>

      <b>
        ${
          currentUser.streak ||
          0
        } days
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
        : ""
    }
  `;
}

// ======================================================
// RENDER
// ======================================================

function renderPage(
  page = activePage
) {
  activePage =
    page;

  const screen =
    document.querySelector(
      "#screen"
    );

  if (!screen) {
    return;
  }

  const pages = {

    home:
      homePage,

    missions:
      missionsPage,

    raids:
      raidsPage,

    leaders:
      leadersPage,

    profile:
      profilePage
  };

  screen.innerHTML =
    pages[page]?.() ||
    homePage();

  bindPageActions();
}

// ======================================================
// ACTIONS
// ======================================================

function bindPageActions() {

  const homeCheckin =
    document.querySelector(
      "#homeCheckinBtn"
    );

  homeCheckin
    ?.addEventListener(
      "click",
      () =>
        claimCheckin(
          homeCheckin
        )
    );

  document
    .querySelector(
      "#dailyMissionCheckin"
    )
    ?.addEventListener(
      "click",
      event =>
        claimCheckin(
          event.currentTarget
        )
    );

  document
    .querySelectorAll(
      ".goMissionBtn"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            openMission(
              button.dataset
                .missionId,

              button.dataset
                .url
            );
          }
        );
      }
    );

  document
    .querySelectorAll(
      ".claimMissionBtn"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            claimMission(
              button.dataset
                .missionId,

              button
            );
          }
        );
      }
    );

  document
    .querySelectorAll(
      ".missionAction"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            openLink(
              button.dataset
                .url
            );
          }
        );
      }
    );

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
      () =>
        loadLeaderboard(
          true
        )
    );
}

// ======================================================
// NAVIGATION
// ======================================================

document
  .querySelectorAll(
    "nav button"
  )
  .forEach(
    button => {

      button.addEventListener(
        "click",
        async () => {

          document
            .querySelectorAll(
              "nav button"
            )
            .forEach(
              item =>

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
            "missions"
          ) {
            await loadMissions();
          }

          if (
            page ===
            "leaders"
          ) {
            await loadLeaderboard();
          }
        }
      );
    }
  );

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

    // Background loading
    loadLeaderboard();
    loadMissions();

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
