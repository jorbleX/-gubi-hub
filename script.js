const tg = window.Telegram?.WebApp;

const API_URL = "https://gubi-hub.onrender.com";

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

function openLink(url) {
  if (tg?.openLink) {
    tg.openLink(url);
  } else {
    window.open(
      url,
      "_blank"
    );
  }
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

            ...(options.body ||
              {})
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
      <p>Loading your profile...</p>
    `;
  }

  const progress =
    currentUser.level_xp ||
    0;

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
          ${progress} / 100 XP
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
              ? "Completed for today ✓"
              : "Claim your daily reward"
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

    <div
      class="notice"
      style="margin-top:16px"
    >
      ❄️ GUBI eats the market.
    </div>
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
        Visit official GUBI on X
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
        Join GUBI Community
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
      </span>

      <b class="xp">
        +50 XP
      </b>
    </div>

    <p
      style="
        opacity:.6;
        font-size:13px;
        margin-top:16px
      "
    >
      More missions coming soon.
    </p>
  `;
}

// ======================================================
// RAIDS
// ======================================================

function raidsPage() {
  return `
    <h2>📣 Raids</h2>

    <p>
      Active GUBI community raids
      will appear here.
    </p>

    <div class="mission">
      <span>
        Official GUBI X

        <small
          style="
            display:block;
            opacity:.65
          "
        >
          Check the latest posts
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
      Raid XP verification
      comes next.
    </div>
  `;
}

// ======================================================
// LEADERBOARD
// ======================================================

function leaderboardLoadingPage() {
  return `
    <h2>🏆 Leaderboard</h2>

    <p>
      Loading GUBI ranks...
    </p>
  `;
}

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

function leadersPage() {
  if (!leaderboardLoaded) {
    return leaderboardLoadingPage();
  }

  if (
    !leaderboard ||
    leaderboard.length === 0
  ) {
    return `
      <h2>🏆 Leaderboard</h2>

      <div class="notice">
        No GUBI members yet.
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
                  min-width:32px;
                  font-size:17px
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
                    opacity:.6;
                    margin-top:3px
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

  const myPosition =
    myRank?.rank
      ? `#${myRank.rank}`
      : "—";

  return `
    <h2>🏆 Leaderboard</h2>

    <p>
      Top GUBI community members.
    </p>

    <div
      class="mission"
      style="
        margin-bottom:16px;
        border:2px solid #168cff
      "
    >
      <span>
        Your position
      </span>

      <b>
        ${myPosition}
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
      ↻ REFRESH RANKS
    </button>
  `;
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

  const name =
    currentUser.username
      ? `@${currentUser.username}`
      : currentUser.first_name;

  const rankValue =
    currentUser.rank ||
    myRank?.rank ||
    "—";

  return `
    <h2>👤 Profile</h2>

    <p>
      <b>
        ${escapeHtml(
          name ||
          "GUBI Member"
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
        👥 Friends invited
      </span>

      <b>
        ${
          currentUser.referral_count ||
          0
        }
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
// CHECK-IN
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

    updateHeader();

    if (
      data.already_claimed
    ) {
      tg?.showAlert?.(
        "You already claimed today's XP. ❄️"
      );
    } else {
      tg?.HapticFeedback
        ?.notificationOccurred(
          "success"
        );

      tg?.showAlert?.(
        `+${data.reward} XP! 🔥\nStreak: ${currentUser.streak} day(s)`
      );
    }

    renderPage(
      activePage
    );

  } catch (error) {

    console.error(
      error
    );

    button.disabled =
      false;

    button.textContent =
      "CLAIM +10 XP";

    if (tg?.showAlert) {
      tg.showAlert(
        error.message
      );
    } else {
      alert(
        error.message
      );
    }
  }
}

// ======================================================
// LOAD LEADERBOARD
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

  const screen =
    document.querySelector(
      "#screen"
    );

  if (
    activePage ===
      "leaders" &&
    screen
  ) {
    screen.innerHTML =
      leaderboardLoadingPage();
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

    if (
      activePage ===
        "leaders" &&
      screen
    ) {
      screen.innerHTML = `
        <h2>
          🏆 Leaderboard
        </h2>

        <div class="notice">
          ${escapeHtml(
            error.message
          )}
        </div>

        <button
          id="retryRanksBtn"
          class="primary"
          style="
            width:100%;
            margin-top:14px
          "
        >
          TRY AGAIN
        </button>
      `;

      document
        .querySelector(
          "#retryRanksBtn"
        )
        ?.addEventListener(
          "click",
          () =>
            loadLeaderboard(
              true
            )
        );
    }
  }
}

// ======================================================
// PAGE ACTIONS
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
    .forEach(
      button => {
        button.addEventListener(
          "click",
          () => {
            const url =
              button.dataset
                .url;

            if (url) {
              openLink(
                url
              );
            }
          }
        );
      }
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
                item
                  .classList
                  .remove(
                    "active"
                  )
            );

          button
            .classList
            .add(
              "active"
            );

          const page =
            button.dataset
              .page;

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
// INITIAL LOAD
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

    // Load rank quietly
    // after home opens.
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
          Open this Mini App
          directly from
          @GubiCommunityBot.
        </div>
      `;
    }
  }
}

initializeGubi();
