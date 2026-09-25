const tg = window.Telegram?.WebApp;

const API_URL = "https://gubi-hub.onrender.com";

let currentUser = null;
let activePage = "home";

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
  return new Date().toISOString().slice(0, 10);
}

function openLink(url) {
  if (tg?.openLink) {
    tg.openLink(url);
  } else {
    window.open(url, "_blank");
  }
}

async function apiRequest(path, options = {}) {
  if (!tg?.initData) {
    throw new Error("Open GUBI Hub from Telegram.");
  }

  const response = await fetch(`${API_URL}${path}`, {
    method: options.method || "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      initData: tg.initData,
      ...(options.body || {})
    })
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Something went wrong");
  }

  return data;
}

// ======================================================
// HEADER
// ======================================================

function updateHeader() {
  if (!currentUser) return;

  const firstName =
    currentUser.first_name ||
    currentUser.username ||
    "GUBI";

  document.querySelector("#hello").textContent =
    `Welcome, ${firstName} 👀`;

  document.querySelector("#level").textContent =
    currentUser.level ?? 1;

  document.querySelector("#xp").textContent =
    currentUser.xp ?? 0;

  document.querySelector("#rank").textContent =
    currentUser.rank ?? "—";
}

// ======================================================
// PAGE TEMPLATES
// ======================================================

function homePage() {
  if (!currentUser) {
    return `
      <h2>❄️ GUBI Hub</h2>
      <p>Loading your profile...</p>
    `;
  }

  const progress =
    currentUser.level_xp ?? 0;

  const claimedToday =
    currentUser.last_checkin === todayUTC();

  return `
    <h2>❄️ GUBI Hub</h2>

    <p>
      GM, <b>${escapeHtml(
        currentUser.first_name ||
        currentUser.username ||
        "GUBI"
      )}</b> 👀
    </p>

    <div class="mission">
      <span>
        Level ${currentUser.level}
        <small style="display:block;opacity:.65;margin-top:4px">
          ${progress} / 100 XP
        </small>
      </span>

      <b class="xp">
        ${currentUser.xp} XP
      </b>
    </div>

    <div class="mission">
      <span>🔥 Streak</span>
      <b>${currentUser.streak || 0} days</b>
    </div>

    <div class="mission">
      <span>👥 Referrals</span>
      <b>${currentUser.referral_count || 0}</b>
    </div>

    <div style="height:12px"></div>

    <h2>⚡ Today's Mission</h2>

    <div class="mission">
      <span>
        Daily check-in
        <small style="display:block;opacity:.65;margin-top:4px">
          ${claimedToday
            ? "Completed for today ✓"
            : "Claim your daily reward"}
        </small>
      </span>

      <b class="xp">
        +10 XP
      </b>
    </div>

    <button
      id="homeCheckinBtn"
      class="primary"
      ${claimedToday ? "disabled" : ""}
      style="width:100%;margin-top:12px"
    >
      ${
        claimedToday
          ? "✓ CLAIMED"
          : "CLAIM +10 XP"
      }
    </button>

    <div class="notice" style="margin-top:16px">
      ❄️ GUBI eats the market.
    </div>
  `;
}

function missionsPage() {
  const claimedToday =
    currentUser?.last_checkin === todayUTC();

  return `
    <h2>⚡ Missions</h2>

    <div class="mission">
      <span>
        Daily check-in
        <small style="display:block;opacity:.65">
          Keep your streak alive
        </small>
      </span>

      <b class="xp">+10 XP</b>
    </div>

    <button
      id="missionCheckinBtn"
      class="primary"
      ${claimedToday ? "disabled" : ""}
      style="width:100%;margin:10px 0 18px"
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
      <b class="xp">+50 XP</b>
    </div>

    <p style="opacity:.6;font-size:13px;margin-top:16px">
      More mission verification is coming next.
    </p>
  `;
}

function raidsPage() {
  return `
    <h2>📣 Raids</h2>

    <p>
      Active GUBI community missions will appear here.
    </p>

    <div class="mission">
      <span>
        Official X
        <small style="display:block;opacity:.65">
          Check the latest GUBI post
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
      No XP is awarded automatically for social actions yet.
    </div>
  `;
}

function leadersPage() {
  return `
    <h2>🏆 Leaderboard</h2>

    <p>
      Global GUBI rankings are being connected.
    </p>

    <div class="mission">
      <span>Your XP</span>
      <b class="xp">
        ${currentUser?.xp || 0} XP
      </b>
    </div>

    <div class="mission">
      <span>Your Level</span>
      <b>
        ${currentUser?.level || 1}
      </b>
    </div>

    <div class="notice">
      Leaderboard database comes next.
    </div>
  `;
}

function profilePage() {
  if (!currentUser) {
    return `<p>Loading profile...</p>`;
  }

  const name =
    currentUser.username
      ? `@${currentUser.username}`
      : currentUser.first_name;

  return `
    <h2>👤 Profile</h2>

    <p>
      <b>${escapeHtml(name || "GUBI Member")}</b>
    </p>

    <div class="mission">
      <span>❄️ Level</span>
      <b>${currentUser.level}</b>
    </div>

    <div class="mission">
      <span>⚡ Total XP</span>
      <b class="xp">${currentUser.xp}</b>
    </div>

    <div class="mission">
      <span>🔥 Streak</span>
      <b>${currentUser.streak || 0} days</b>
    </div>

    <div class="mission">
      <span>👥 Friends invited</span>
      <b>${currentUser.referral_count || 0}</b>
    </div>

    <div class="mission">
      <span>🏆 Rank</span>
      <b>${currentUser.rank || "—"}</b>
    </div>
  `;
}

// ======================================================
// RENDER
// ======================================================

function renderPage(page = activePage) {
  activePage = page;

  const screen =
    document.querySelector("#screen");

  const pages = {
    home: homePage,
    missions: missionsPage,
    raids: raidsPage,
    leaders: leadersPage,
    profile: profilePage
  };

  screen.innerHTML =
    pages[page]?.() || homePage();

  bindPageActions();
}

// ======================================================
// CHECK-IN
// ======================================================

async function claimCheckin(button) {
  if (!button) return;

  button.disabled = true;
  button.textContent = "CLAIMING...";

  try {
    const data =
      await apiRequest("/api/checkin");

    currentUser = data.user;

    updateHeader();

    if (data.already_claimed) {
      tg?.showAlert?.(
        "You already claimed today's XP. ❄️"
      );
    } else {
      tg?.HapticFeedback?.notificationOccurred(
        "success"
      );

      tg?.showAlert?.(
        `+${data.reward} XP! 🔥\nStreak: ${currentUser.streak} day(s)`
      );
    }

    renderPage(activePage);
  } catch (error) {
    console.error(error);

    button.disabled = false;
    button.textContent = "CLAIM +10 XP";

    if (tg?.showAlert) {
      tg.showAlert(error.message);
    } else {
      alert(error.message);
    }
  }
}

// ======================================================
// ACTIONS
// ======================================================

function bindPageActions() {
  const homeCheckin =
    document.querySelector("#homeCheckinBtn");

  const missionCheckin =
    document.querySelector("#missionCheckinBtn");

  homeCheckin?.addEventListener(
    "click",
    () => claimCheckin(homeCheckin)
  );

  missionCheckin?.addEventListener(
    "click",
    () => claimCheckin(missionCheckin)
  );

  document
    .querySelectorAll(".missionAction")
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
}

// ======================================================
// NAVIGATION
// ======================================================

document
  .querySelectorAll("nav button")
  .forEach(button => {
    button.addEventListener(
      "click",
      () => {
        document
          .querySelectorAll("nav button")
          .forEach(item =>
            item.classList.remove("active")
          );

        button.classList.add("active");

        renderPage(
          button.dataset.page
        );
      }
    );
  });

document
  .querySelector(
    '[data-page="home"]'
  )
  ?.classList.add("active");

// ======================================================
// INITIAL LOAD
// ======================================================

async function initializeGubi() {
  const screen =
    document.querySelector("#screen");

  screen.innerHTML = `
    <h2>❄️ Entering the snow...</h2>
    <p>Loading your GUBI profile.</p>
  `;

  try {
    const data =
      await apiRequest("/api/me");

    currentUser =
      data.user;

    updateHeader();
    renderPage("home");
  } catch (error) {
    console.error(error);

    screen.innerHTML = `
      <h2>❄️ GUBI Hub</h2>

      <p>
        ${escapeHtml(error.message)}
      </p>

      <div class="notice">
        Open this Mini App directly from
        @GubiCommunityBot.
      </div>
    `;
  }
}

initializeGubi();
