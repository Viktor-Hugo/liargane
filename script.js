const WORDS = {
  food: ["피자", "김치찌개", "초밥", "햄버거", "비빔밥", "떡볶이", "라면", "치킨", "마카롱", "파스타"],
  job: ["소방관", "의사", "디자이너", "교사", "경찰", "요리사", "프로그래머", "변호사", "파일럿", "기자"],
  place: ["도서관", "공항", "해변", "카페", "학교", "놀이공원", "병원", "지하철", "박물관", "영화관"],
  object: ["우산", "이어폰", "노트북", "시계", "칫솔", "선풍기", "가방", "안경", "자전거", "카메라"],
  animal: ["고양이", "강아지", "기린", "펭귄", "호랑이", "코끼리", "돌고래", "부엉이", "거북이", "토끼"]
};

const CATEGORIES = ["food", "job", "place", "object", "animal"];

const appState = {
  me: { id: "", name: "" },
  roomId: "",
  isHost: false,
  hostConn: null,
  peer: null,
  connMap: new Map(),
  players: [],
  stage: "entry",
  settings: { category: "mix", timerEnabled: true },
  topic: "",
  liarId: "",
  votes: {},
  myVote: "",
  selectedVoteTarget: "",
  timerSeconds: 180,
  timerId: null
};

const entrySection = document.getElementById("entry-section");
const lobbySection = document.getElementById("lobby-section");
const roleSection = document.getElementById("role-section");
const discussionSection = document.getElementById("discussion-section");
const voteSection = document.getElementById("vote-section");
const liarGuessSection = document.getElementById("liar-guess-section");
const resultSection = document.getElementById("result-section");

const nicknameInput = document.getElementById("nickname");
const roomIdInput = document.getElementById("room-id");
const hostBtn = document.getElementById("host-btn");
const joinBtn = document.getElementById("join-btn");

const roomCodeText = document.getElementById("room-code-text");
const shareLinkText = document.getElementById("share-link-text");
const hostSettings = document.getElementById("host-settings");
const categorySelect = document.getElementById("category");
const timerToggle = document.getElementById("timer-toggle");
const playerList = document.getElementById("player-list");
const startBtn = document.getElementById("start-btn");

const myRoleBox = document.getElementById("my-role-box");
const timerText = document.getElementById("timer-text");
const discussionText = document.getElementById("discussion-text");
const goVoteBtn = document.getElementById("go-vote-btn");

const voteGrid = document.getElementById("vote-grid");
const submitVoteBtn = document.getElementById("submit-vote-btn");

const liarGuessHelp = document.getElementById("liar-guess-help");
const liarGuessInput = document.getElementById("liar-guess");
const submitGuessBtn = document.getElementById("submit-guess-btn");

const resultTitle = document.getElementById("result-title");
const resultTopic = document.getElementById("result-topic");
const resultLiar = document.getElementById("result-liar");
const resultVoted = document.getElementById("result-voted");
const restartBtn = document.getElementById("restart-btn");
const statusText = document.getElementById("status-text");

function setStatus(text) {
  statusText.textContent = text;
}

function hideAllSections() {
  [entrySection, lobbySection, roleSection, discussionSection, voteSection, liarGuessSection, resultSection].forEach((section) => {
    section.classList.add("hidden");
  });
}

function showSections(stage) {
  hideAllSections();
  if (stage === "entry") {
    entrySection.classList.remove("hidden");
    return;
  }
  lobbySection.classList.remove("hidden");
  roleSection.classList.remove("hidden");
  if (stage === "discussion") {
    discussionSection.classList.remove("hidden");
  }
  if (stage === "vote") {
    voteSection.classList.remove("hidden");
  }
  if (stage === "liar-guess") {
    liarGuessSection.classList.remove("hidden");
  }
  if (stage === "result") {
    resultSection.classList.remove("hidden");
  }
}

function sanitizeName(value) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.slice(0, 16);
}

function randomRoomId() {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `LIAR-${n}`;
}

function normalizeRoomId(value) {
  return value.trim().toUpperCase();
}

function chooseTopic(category) {
  const key = category === "mix" ? CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)] : category;
  const words = WORDS[key];
  return words[Math.floor(Math.random() * words.length)];
}

function renderPlayers() {
  playerList.innerHTML = "";
  appState.players.forEach((p) => {
    const el = document.createElement("div");
    el.className = "player-btn";
    el.textContent = p.name + (p.id === appState.me.id ? " (나)" : "");
    playerList.appendChild(el);
  });
}

function findPlayerNameById(id) {
  const p = appState.players.find((v) => v.id === id);
  return p ? p.name : "알 수 없음";
}

function showHostOnly() {
  document.querySelectorAll(".host-only").forEach((el) => {
    if (appState.isHost) {
      el.classList.remove("hidden");
    } else {
      el.classList.add("hidden");
    }
  });
}

function updateRoomLabels() {
  const url = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(appState.roomId)}`;
  roomCodeText.textContent = `방 코드: ${appState.roomId}`;
  shareLinkText.textContent = `공유 링크: ${url}`;
}

function broadcast(payload) {
  appState.connMap.forEach((conn) => {
    if (conn.open) {
      conn.send(payload);
    }
  });
}

function sendToHost(payload) {
  if (!appState.hostConn || !appState.hostConn.open) {
    setStatus("호스트 연결이 끊겼습니다.");
    return;
  }
  appState.hostConn.send(payload);
}

function applyStateSnapshot(snapshot) {
  appState.players = snapshot.players || [];
  appState.stage = snapshot.stage || "lobby";
  appState.settings = snapshot.settings || { category: "mix", timerEnabled: true };
  appState.topic = snapshot.topic || "";
  appState.liarId = snapshot.liarId || "";
  appState.votes = snapshot.votes || {};

  renderPlayers();
  renderStage();
}

function stageSnapshot() {
  return {
    players: appState.players,
    stage: appState.stage,
    settings: appState.settings,
    topic: appState.topic,
    liarId: appState.liarId,
    votes: appState.votes
  };
}

function pushState() {
  broadcast({ type: "state", snapshot: stageSnapshot() });
}

function renderMyRole() {
  if (!appState.topic || !appState.liarId) {
    myRoleBox.textContent = "호스트가 게임을 시작하면 표시됩니다.";
    return;
  }
  if (appState.me.id === appState.liarId) {
    myRoleBox.innerHTML = "<strong>당신은 라이어</strong><br>단서를 듣고 주제를 맞히세요.";
    return;
  }
  myRoleBox.innerHTML = `<strong>주제: ${appState.topic}</strong><br>자연스럽게 단서를 말해보세요.`;
}

function clearTimer() {
  if (appState.timerId) {
    clearInterval(appState.timerId);
  }
  appState.timerId = null;
}

function renderTimer() {
  const mm = String(Math.floor(appState.timerSeconds / 60)).padStart(2, "0");
  const ss = String(appState.timerSeconds % 60).padStart(2, "0");
  timerText.textContent = `${mm}:${ss}`;
}

function startDiscussionTimerIfHost() {
  clearTimer();
  if (!appState.isHost) {
    return;
  }
  if (!appState.settings.timerEnabled) {
    timerText.textContent = "타이머 OFF";
    return;
  }
  appState.timerSeconds = 180;
  renderTimer();
  appState.timerId = setInterval(() => {
    appState.timerSeconds -= 1;
    renderTimer();
    broadcast({ type: "timer", value: appState.timerSeconds });
    if (appState.timerSeconds <= 0) {
      clearTimer();
      timerText.textContent = "시간 종료";
      broadcast({ type: "timer-end" });
    }
  }, 1000);
}

function renderVoteTargets() {
  voteGrid.innerHTML = "";
  appState.selectedVoteTarget = "";
  submitVoteBtn.disabled = true;
  appState.players
    .filter((p) => p.id !== appState.me.id)
    .forEach((p) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "player-btn";
      button.textContent = p.name;
      button.addEventListener("click", () => {
        appState.selectedVoteTarget = p.id;
        submitVoteBtn.disabled = false;
        [...voteGrid.children].forEach((child) => child.classList.remove("selected"));
        button.classList.add("selected");
      });
      voteGrid.appendChild(button);
    });
}

function tallyMostVoted(votes) {
  const count = {};
  Object.values(votes).forEach((targetId) => {
    count[targetId] = (count[targetId] || 0) + 1;
  });
  let bestId = "";
  let best = -1;
  Object.keys(count).forEach((id) => {
    if (count[id] > best) {
      best = count[id];
      bestId = id;
    }
  });
  return bestId;
}

function normalizeText(value) {
  return value.replace(/\s+/g, "").toLowerCase();
}

function renderResult(payload) {
  resultTitle.textContent = payload.title;
  resultTopic.textContent = `정답 주제: ${payload.topic}`;
  resultLiar.textContent = `라이어: ${findPlayerNameById(payload.liarId)}`;
  resultVoted.textContent = `최다 득표: ${findPlayerNameById(payload.mostVotedId)}`;
}

function renderStage() {
  showHostOnly();
  showSections(appState.stage === "entry" ? "entry" : appState.stage);
  updateRoomLabels();
  renderMyRole();

  if (appState.stage === "discussion") {
    discussionText.textContent = appState.settings.timerEnabled ? "단서를 말하고 라이어를 추리하세요." : "타이머 없이 자유롭게 토론 후 투표하세요.";
    if (!appState.isHost && !appState.settings.timerEnabled) {
      timerText.textContent = "타이머 OFF";
    }
  }

  if (appState.stage === "vote") {
    renderVoteTargets();
  }

  if (appState.stage === "liar-guess") {
    liarGuessHelp.textContent = appState.me.id === appState.liarId ? "당신이 라이어입니다. 주제를 맞히면 승리합니다." : "라이어가 주제를 추리 중입니다.";
  }
}

function onHostData(data) {
  if (data.type === "state") {
    applyStateSnapshot(data.snapshot);
    return;
  }
  if (data.type === "timer") {
    appState.timerSeconds = data.value;
    renderTimer();
    return;
  }
  if (data.type === "timer-end") {
    timerText.textContent = "시간 종료";
    return;
  }
  if (data.type === "result") {
    appState.stage = "result";
    renderStage();
    renderResult(data.payload);
  }
}

function onGuestDataFromHost(data, conn) {
  if (data.type === "join") {
    const exists = appState.players.some((p) => p.id === data.id);
    if (!exists) {
      appState.players.push({ id: data.id, name: data.name });
      renderPlayers();
      pushState();
    }
    conn.send({ type: "joined", roomId: appState.roomId });
    return;
  }

  if (data.type === "vote") {
    appState.votes[data.from] = data.target;
    const everyoneVoted = Object.keys(appState.votes).length === appState.players.length;
    if (everyoneVoted) {
      const mostVotedId = tallyMostVoted(appState.votes);
      if (mostVotedId === appState.liarId) {
        appState.stage = "liar-guess";
        pushState();
      } else {
        const payload = {
          title: "시민 패배! 라이어를 찾지 못했습니다.",
          topic: appState.topic,
          liarId: appState.liarId,
          mostVotedId
        };
        appState.stage = "result";
        pushState();
        broadcast({ type: "result", payload });
        renderStage();
        renderResult(payload);
      }
    }
    return;
  }

  if (data.type === "liar-guess") {
    if (data.from !== appState.liarId) {
      return;
    }
    const liarWins = normalizeText(data.guess) === normalizeText(appState.topic);
    const payload = {
      title: liarWins ? "라이어 역전승! 주제를 맞혔습니다." : "시민 승리! 라이어가 주제를 못 맞혔습니다.",
      topic: appState.topic,
      liarId: appState.liarId,
      mostVotedId: appState.liarId
    };
    appState.stage = "result";
    pushState();
    broadcast({ type: "result", payload });
    renderStage();
    renderResult(payload);
  }
}

function setupHostConnectionHandlers(conn) {
  appState.connMap.set(conn.peer, conn);
  conn.on("data", (data) => onGuestDataFromHost(data, conn));
  conn.on("close", () => {
    appState.connMap.delete(conn.peer);
    appState.players = appState.players.filter((p) => p.id !== conn.peer);
    renderPlayers();
    pushState();
  });
}

function createPeer(peerId) {
  return new window.Peer(peerId);
}

function initHost(name) {
  appState.isHost = true;
  appState.me.name = name;
  appState.roomId = randomRoomId();
  appState.me.id = appState.roomId;
  appState.players = [{ id: appState.me.id, name: appState.me.name }];
  appState.stage = "lobby";
  appState.settings = { category: "mix", timerEnabled: true };

  appState.peer = createPeer(appState.roomId);
  appState.peer.on("open", () => {
    setStatus("방이 생성되었습니다.");
    renderPlayers();
    renderStage();
  });
  appState.peer.on("connection", (conn) => {
    setupHostConnectionHandlers(conn);
  });
  appState.peer.on("error", () => {
    setStatus("연결 오류가 발생했습니다. 새로고침 후 다시 시도하세요.");
  });
}

function initGuest(name, roomId) {
  appState.isHost = false;
  appState.roomId = roomId;
  appState.me.name = name;
  appState.me.id = `g-${Math.random().toString(36).slice(2, 10)}`;
  appState.players = [{ id: appState.me.id, name: appState.me.name }];
  appState.stage = "lobby";

  appState.peer = createPeer(appState.me.id);
  appState.peer.on("open", () => {
    appState.hostConn = appState.peer.connect(roomId);
    appState.hostConn.on("open", () => {
      appState.hostConn.send({ type: "join", id: appState.me.id, name: appState.me.name });
      setStatus("방에 연결되었습니다.");
    });
    appState.hostConn.on("data", onHostData);
    appState.hostConn.on("close", () => {
      setStatus("호스트 연결이 종료되었습니다.");
    });
  });
  appState.peer.on("error", () => {
    setStatus("방 참가에 실패했습니다. 방 코드 확인 후 다시 시도하세요.");
  });

  renderStage();
}

function startRoundAsHost() {
  if (!appState.isHost) {
    return;
  }
  if (appState.players.length < 3) {
    setStatus("3명 이상 필요합니다.");
    return;
  }

  appState.settings.category = categorySelect.value;
  appState.settings.timerEnabled = timerToggle.checked;
  appState.topic = chooseTopic(appState.settings.category);
  const liar = appState.players[Math.floor(Math.random() * appState.players.length)];
  appState.liarId = liar.id;
  appState.votes = {};
  appState.myVote = "";
  appState.stage = "discussion";

  renderStage();
  pushState();
  startDiscussionTimerIfHost();
}

function goVoteAsHost() {
  if (!appState.isHost || appState.stage !== "discussion") {
    return;
  }
  clearTimer();
  appState.stage = "vote";
  appState.votes = {};
  appState.myVote = "";
  renderStage();
  pushState();
}

function submitVote() {
  if (!appState.selectedVoteTarget) {
    return;
  }

  appState.myVote = appState.selectedVoteTarget;
  submitVoteBtn.disabled = true;
  setStatus("투표를 제출했습니다. 다른 플레이어를 기다리는 중...");

  if (appState.isHost) {
    onGuestDataFromHost({ type: "vote", from: appState.me.id, target: appState.selectedVoteTarget }, null);
  } else {
    sendToHost({ type: "vote", from: appState.me.id, target: appState.selectedVoteTarget });
  }
}

function submitLiarGuess() {
  const guess = liarGuessInput.value.trim();
  if (!guess) {
    liarGuessInput.focus();
    return;
  }
  if (appState.me.id !== appState.liarId) {
    setStatus("라이어만 정답을 제출할 수 있습니다.");
    return;
  }
  if (appState.isHost) {
    onGuestDataFromHost({ type: "liar-guess", from: appState.me.id, guess }, null);
  } else {
    sendToHost({ type: "liar-guess", from: appState.me.id, guess });
  }
}

function restartRoundAsHost() {
  if (!appState.isHost) {
    return;
  }
  clearTimer();
  appState.topic = "";
  appState.liarId = "";
  appState.votes = {};
  appState.stage = "lobby";
  renderStage();
  pushState();
}

function readRoomFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return normalizeRoomId(params.get("room") || "");
}

hostBtn.addEventListener("click", () => {
  const name = sanitizeName(nicknameInput.value || "호스트");
  nicknameInput.value = name;
  initHost(name);
});

joinBtn.addEventListener("click", () => {
  const name = sanitizeName(nicknameInput.value || "게스트");
  const roomId = normalizeRoomId(roomIdInput.value || readRoomFromQuery());
  nicknameInput.value = name;
  roomIdInput.value = roomId;
  if (!roomId) {
    setStatus("방 코드를 입력하세요.");
    return;
  }
  initGuest(name, roomId);
});

startBtn.addEventListener("click", startRoundAsHost);
goVoteBtn.addEventListener("click", goVoteAsHost);
submitVoteBtn.addEventListener("click", submitVote);
submitGuessBtn.addEventListener("click", submitLiarGuess);
restartBtn.addEventListener("click", restartRoundAsHost);

(function bootstrap() {
  const roomFromQuery = readRoomFromQuery();
  if (roomFromQuery) {
    roomIdInput.value = roomFromQuery;
  }
  setStatus("닉네임을 입력한 뒤 방을 만들거나 참가하세요.");
  showSections("entry");
})();
