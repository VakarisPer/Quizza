// quiz.iio — Node.js WebSocket server
// Run: node server-node.js

const http = require("http");
const path = require("path");
const fs = require("fs");
const WebSocket = require("ws");
require("dotenv").config();

const PORT = process.env.PORT || 3000;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";

// ============================================================
//  STRUCTURED LOGGER
// ============================================================
const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const LOG_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;

function ts() {
  return new Date().toISOString().replace("T", " ").slice(0, 23);
}

const log = {
  debug: (cat, ...args) => {
    if (LOG_LEVEL <= LOG_LEVELS.DEBUG)
      console.log(`\x1b[90m[${ts()}] [DEBUG] [${cat}]\x1b[0m`, ...args);
  },
  info: (cat, ...args) => {
    if (LOG_LEVEL <= LOG_LEVELS.INFO)
      console.log(`\x1b[36m[${ts()}] [INFO]  [${cat}]\x1b[0m`, ...args);
  },
  warn: (cat, ...args) => {
    if (LOG_LEVEL <= LOG_LEVELS.WARN)
      console.warn(`\x1b[33m[${ts()}] [WARN]  [${cat}]\x1b[0m`, ...args);
  },
  error: (cat, ...args) => {
    if (LOG_LEVEL <= LOG_LEVELS.ERROR)
      console.error(`\x1b[31m[${ts()}] [ERROR] [${cat}]\x1b[0m`, ...args);
  },
};

// ============================================================
//  DATA STRUCTURES & HELPERS
// ============================================================
function makeCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 5; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function makePid() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "p_";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

const rooms = new Map(); // code  -> room
const pidToRoom = new Map(); // pid   -> code

// Default game config (can be overridden per room by host)
const DEFAULTS = {
  ROUND_DURATION: 35,
  QUESTIONS_PER_GAME: 10,
  MIN_PLAYERS: 1,
  REVEAL_WAIT: 10_000, // ms between reveal and next question
};

// ============================================================
//  FALLBACK QUESTIONS
// ============================================================
function generateFallbackQuestions() {
  log.warn("AI", "No API key or AI failed — using built-in fallback questions");
  return [
    {
      q: "What is the main building block of digital logic circuits?",
      options: ["Transistor", "Capacitor", "Resistor", "Diode"],
      correct: 0,
      topic: "Electronics",
      explanation: "Transistors act as electronic switches and are the fundamental building block of all digital circuits.",
    },
    {
      q: "Which data structure operates on a Last-In-First-Out (LIFO) principle?",
      options: ["Queue", "Stack", "Linked List", "Tree"],
      correct: 1,
      topic: "Data Structures",
      explanation: "A stack is a LIFO structure — the last item pushed is the first one popped.",
    },
    {
      q: "What does HTTP stand for?",
      options: [
        "HyperText Transfer Protocol",
        "High Traffic Text Protocol",
        "HyperText Transmission Process",
        "Hosted Text Transfer Protocol",
      ],
      correct: 0,
      topic: "Networking",
      explanation: "HTTP (HyperText Transfer Protocol) is the foundation of data communication on the web.",
    },
    {
      q: "Which sorting algorithm has the best average-case time complexity?",
      options: ["Bubble Sort", "Insertion Sort", "Merge Sort", "Selection Sort"],
      correct: 2,
      topic: "Algorithms",
      explanation: "Merge Sort achieves O(n log n) average-case performance, outperforming O(n²) algorithms on large datasets.",
    },
    {
      q: "What does RAM stand for?",
      options: [
        "Random Access Memory",
        "Read And Modify",
        "Rapid Array Management",
        "Runtime Allocation Module",
      ],
      correct: 0,
      topic: "Hardware",
      explanation: "RAM (Random Access Memory) is volatile short-term memory used by a computer while it is running.",
    },
  ];
}

// ============================================================
//  AI QUESTION GENERATION
// ============================================================
async function generateQuestionsAI(topicContext, count) {
  if (!DEEPSEEK_API_KEY) {
    return generateFallbackQuestions().slice(0, count);
  }

  const contextChars = String(topicContext || "").slice(0, 6000);
  log.info("AI", `Requesting ${count} questions from DeepSeek (context: ${contextChars.length} chars)`);

  const system =
    "You are a quiz question generator. " +
    "Return ONLY a raw JSON array with no markdown fences or extra text. " +
    'Each element: {"q":"question","options":["A","B","C","D"],"correct":0,"topic":"topic","explanation":"explanation"}. ' +
    '"correct" is the 0-based index of the correct option. Generate varied, clear questions.';

  const user =
    `Generate ${count} multiple-choice quiz questions with 4 answer options ` +
    "based on this material:\n\n" + contextChars +
    "\n\nReturn ONLY a JSON array.";

  const url = "https://api.deepseek.com/v1/chat/completions";

  // --- Connectivity ping ---
  try {
    log.debug("AI", "Pinging DeepSeek API...");
    const pingResp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "Reply with the single word PONG." },
        ],
        max_tokens: 8,
        temperature: 0,
      }),
    });

    if (!pingResp.ok) {
      const body = await pingResp.text();
      log.error("AI", `Ping failed — HTTP ${pingResp.status}: ${body.slice(0, 200)}`);
      return generateFallbackQuestions().slice(0, count);
    }
    log.debug("AI", "Ping OK — sending full question request");
  } catch (pingErr) {
    log.error("AI", "Ping threw exception:", pingErr.message);
    return generateFallbackQuestions().slice(0, count);
  }

  // --- Full request ---
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: 4000,
        temperature: 0.7,
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      log.error("AI", `Question request failed — HTTP ${resp.status}: ${body.slice(0, 300)}`);
      return generateFallbackQuestions().slice(0, count);
    }

    const data = await resp.json();
    let raw = data.choices?.[0]?.message?.content || "";
    // Strip any accidental markdown fences
    raw = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

    const questions = JSON.parse(raw);
    if (!Array.isArray(questions) || questions.length === 0) {
      log.error("AI", "Parsed response is not a valid array:", raw.slice(0, 200));
      return generateFallbackQuestions().slice(0, count);
    }

    log.info("AI", `Successfully generated ${questions.length} questions`);
    return questions.slice(0, count);
  } catch (err) {
    log.error("AI", "Question request exception:", err.message);
    return generateFallbackQuestions().slice(0, count);
  }
}

// ============================================================
//  ROOM HELPERS
// ============================================================
function leaderboard(room) {
  return Array.from(room.players.values())
    .map((p) => ({ pid: p.pid, name: p.name, score: p.score, streak: p.streak }))
    .sort((a, b) => b.score - a.score);
}

function roomSnapshot(room) {
  return {
    type: "room_state",
    code: room.code,
    state: room.state,
    players: Array.from(room.players.values())
      .sort((a, b) => b.score - a.score)
      .map((p) => ({
        pid: p.pid, name: p.name, score: p.score,
        answered: p.answered, streak: p.streak,
      })),
    current_q: room.currentQ,
    total_q: room.questions.length,
    has_context: !!room.topicContext,
  };
}

function broadcast(room, msg, excludePid = null) {
  const data = JSON.stringify(msg);
  const dead = [];
  for (const [pid, p] of room.players.entries()) {
    if (pid === excludePid) continue;
    try { p.ws.send(data); } catch { dead.push(pid); }
  }
  dead.forEach(removePlayer);
}

function sendTo(player, msg) {
  try { player.ws.send(JSON.stringify(msg)); } catch { /* ignore dead socket */ }
}

function removePlayer(pid) {
  const code = pidToRoom.get(pid);
  if (!code) return;
  const room = rooms.get(code);
  if (!room) return;

  if (room.players.has(pid)) {
    const name = room.players.get(pid).name;
    room.players.delete(pid);
    pidToRoom.delete(pid);
    log.info("Room", `${code} — player left: ${name} (${pid}), ${room.players.size} remaining`);
    broadcast(room, { type: "player_left", pid, name });
    broadcast(room, roomSnapshot(room));
  }

  if (room.players.size === 0) {
    // Clean up any running timers
    if (room._revealTimeout) clearTimeout(room._revealTimeout);
    rooms.delete(code);
    log.info("Room", `${code} deleted (empty)`);
  }
}

// ============================================================
//  GAME LOOP
// ============================================================
async function startGame(room) {
  const count = room.config.questionsPerGame;
  const hasCtx = !!(room.topicContext && DEEPSEEK_API_KEY);

  log.info("Game", `Room ${room.code} — starting game: ${count} questions, ${room.config.roundDuration}s/q, AI: ${hasCtx}`);

  room.state = "starting";
  broadcast(room, { type: "game_starting", countdown: 3 });

  if (hasCtx) {
    broadcast(room, { type: "status", msg: "AI is generating questions from your content..." });
    room.questions = await generateQuestionsAI(room.topicContext, count);
  } else {
    room.questions = generateFallbackQuestions().slice(0, count);
    if (room.topicContext && !DEEPSEEK_API_KEY) {
      log.warn("Game", `Room ${room.code} — context set but DEEPSEEK_API_KEY is missing; using fallback questions`);
    }
  }

  log.info("Game", `Room ${room.code} — ${room.questions.length} questions ready`);

  await new Promise((r) => setTimeout(r, 3000));
  room.state = "playing";
  room.currentQ = 0;
  runQuestion(room);
}

function runQuestion(room) {
  if (room.currentQ >= room.questions.length) {
    endGame(room);
    return;
  }

  const q = room.questions[room.currentQ];
  const dur = room.config.roundDuration;

  log.info("Game", `Room ${room.code} — Q${room.currentQ + 1}/${room.questions.length}: "${q.q.slice(0, 60)}..."`);

  room.qStartTime = Date.now();
  for (const p of room.players.values()) p.answered = false;

  broadcast(room, {
    type: "question",
    index: room.currentQ,
    total: room.questions.length,
    question: q.q,
    options: q.options,
    topic: q.topic || "",
    duration: dur,
  });

  // Server-side timer: send ticks + auto-reveal on timeout
  let remaining = dur;
  room._timerInterval = setInterval(() => {
    if (room.state !== "playing") {
      clearInterval(room._timerInterval);
      return;
    }
    remaining -= 1;
    broadcast(room, { type: "timer", remaining });

    const allAnswered = Array.from(room.players.values()).every((p) => p.answered);
    if (remaining <= 0 || allAnswered) {
      clearInterval(room._timerInterval);
      if (allAnswered) log.debug("Game", `Room ${room.code} — all players answered early (${dur - remaining}s elapsed)`);
      else log.debug("Game", `Room ${room.code} — time up on Q${room.currentQ + 1}`);
      revealAnswer(room);
    }
  }, 1000);
}

function revealAnswer(room) {
  if (room.currentQ >= room.questions.length) return;

  const q = room.questions[room.currentQ];
  const correctIdx = q.correct;
  const results = [];

  for (const p of room.players.values()) {
    results.push({
      pid: p.pid, name: p.name, answered: p.answered,
      correct: p.lastCorrect, score: p.score, streak: p.streak,
    });
  }

  log.debug("Game", `Room ${room.code} — reveal Q${room.currentQ + 1}, correct: option ${correctIdx} (${q.options[correctIdx]})`);

  broadcast(room, {
    type: "reveal",
    correct_index: correctIdx,
    explanation: q.explanation || "",
    results,
    leaderboard: leaderboard(room),
  });

  room._revealTimeout = setTimeout(() => {
    room.currentQ += 1;
    if (room.state === "playing") runQuestion(room);
  }, DEFAULTS.REVEAL_WAIT);
}

function endGame(room) {
  room.state = "results";
  const board = leaderboard(room);
  log.info("Game", `Room ${room.code} — game over. Winner: ${board[0]?.name ?? "none"} (${board[0]?.score ?? 0} pts)`);
  broadcast(room, {
    type: "game_over",
    leaderboard: board,
    winner: board[0] || null,
  });
}

// ============================================================
//  HTTP + STATIC FILES
// ============================================================
const publicDir = path.join(__dirname, "web");

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
};

const server = http.createServer((req, res) => {
  let urlPath = req.url === "/" ? "/index.html" : req.url;
  // Strip query strings
  urlPath = urlPath.split("?")[0];
  const filePath = path.join(publicDir, urlPath);

  // Prevent directory traversal
  if (!filePath.startsWith(publicDir)) {
    log.warn("HTTP", `Path traversal attempt: ${req.url}`);
    res.writeHead(403); res.end("Forbidden"); return;
  }

  const ext = path.extname(filePath);
  const mime = MIME[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      log.debug("HTTP", `404: ${urlPath}`);
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    log.debug("HTTP", `200: ${urlPath}`);
    res.writeHead(200, { "Content-Type": mime });
    res.end(data);
  });
});

// ============================================================
//  WEBSOCKET
// ============================================================
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws, req) => {
  const pid = makePid();
  const ip = req.socket.remoteAddress;
  log.info("WS", `New connection: ${pid} from ${ip}`);

  ws.send(JSON.stringify({ type: "connected", pid, version: "node-2.0" }));

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      log.warn("WS", `${pid} sent invalid JSON: ${String(raw).slice(0, 80)}`);
      ws.send(JSON.stringify({ type: "error", msg: "Invalid JSON received." }));
      return;
    }
    log.debug("WS", `${pid} -> type="${msg.type}"`);
    handleMessage(ws, pid, msg);
  });

  ws.on("close", (code, reason) => {
    log.info("WS", `Disconnected: ${pid} (code ${code})`);
    removePlayer(pid);
  });

  ws.on("error", (err) => {
    log.error("WS", `Socket error for ${pid}:`, err.message);
  });
});

// ============================================================
//  MESSAGE HANDLER
// ============================================================
function handleMessage(ws, pid, msg) {
  const action = msg.type;
  const code = pidToRoom.get(pid);
  const room = code ? rooms.get(code) : null;

  // ---- CREATE ROOM ----
  if (action === "create_room") {
    const name = String(msg.name || "Player").slice(0, 20).trim() || "Player";

    let newCode = makeCode();
    while (rooms.has(newCode)) newCode = makeCode();

    const player = makePlayer(ws, pid, name);
    const newRoom = {
      code: newCode,
      hostPid: pid,
      players: new Map([[pid, player]]),
      state: "lobby",
      questions: [],
      currentQ: 0,
      qStartTime: 0,
      topicContext: "",
      config: {
        roundDuration: DEFAULTS.ROUND_DURATION,
        questionsPerGame: DEFAULTS.QUESTIONS_PER_GAME,
      },
      _timerInterval: null,
      _revealTimeout: null,
    };

    rooms.set(newCode, newRoom);
    pidToRoom.set(pid, newCode);
    log.info("Room", `${newCode} created by ${name} (${pid})`);

    sendTo(player, { type: "created", code: newCode, pid, name });
    sendTo(player, roomSnapshot(newRoom));
    return;
  }

  // ---- JOIN ROOM ----
  if (action === "join_room") {
    const jCode = String(msg.code || "").toUpperCase().trim();
    const name = String(msg.name || "Player").slice(0, 20).trim() || "Player";
    const jRoom = rooms.get(jCode);

    if (!jRoom) {
      log.warn("Room", `Join failed — room "${jCode}" not found (requested by ${pid})`);
      ws.send(JSON.stringify({ type: "error", msg: `Room "${jCode}" was not found. Check the code and try again.` }));
      return;
    }
    if (jRoom.state !== "lobby") {
      log.warn("Room", `Join failed — room "${jCode}" already in state "${jRoom.state}" (requested by ${pid})`);
      ws.send(JSON.stringify({ type: "error", msg: "That game has already started. Ask the host to start a new one." }));
      return;
    }

    const player = makePlayer(ws, pid, name);
    jRoom.players.set(pid, player);
    pidToRoom.set(pid, jCode);
    log.info("Room", `${jCode} — ${name} (${pid}) joined (${jRoom.players.size} total)`);

    sendTo(player, { type: "joined", code: jCode, pid, name });
    broadcast(jRoom, { type: "player_joined", pid, name }, pid);
    broadcast(jRoom, roomSnapshot(jRoom));
    return;
  }

  // All actions below require an active room
  if (!room) {
    log.warn("WS", `${pid} sent "${action}" but has no room — ignoring`);
    ws.send(JSON.stringify({ type: "error", msg: "You are not in a room. Please create or join one." }));
    return;
  }

  // ---- SET CONTEXT ----
  if (action === "set_context") {
    if (pid !== room.hostPid) {
      log.warn("Room", `${code} — non-host ${pid} tried to set context`);
      return;
    }
    room.topicContext = String(msg.context || "").slice(0, 8000);
    log.info("Room", `${code} — AI context set by host (${room.topicContext.length} chars)`);
    broadcast(room, { type: "context_set", msg: "AI source saved." });
    broadcast(room, roomSnapshot(room));
    return;
  }

  // ---- START GAME ----
  if (action === "start_game") {
    if (pid !== room.hostPid) {
      log.warn("Room", `${code} — non-host ${pid} tried to start game`);
      return;
    }
    if (room.state !== "lobby") {
      log.warn("Room", `${code} — start_game ignored, current state="${room.state}"`);
      return;
    }

    const minPlayers = DEFAULTS.MIN_PLAYERS;
    if (room.players.size < minPlayers) {
      const host = room.players.get(pid);
      if (host) sendTo(host, { type: "error", msg: `Need at least ${minPlayers} player to start.` });
      return;
    }

    // Apply host-configured settings (validated)
    const rawQ = parseInt(msg.questions);
    const rawT = parseInt(msg.timer);
    room.config.questionsPerGame = Number.isFinite(rawQ) ? Math.min(Math.max(rawQ, 1), 50) : DEFAULTS.QUESTIONS_PER_GAME;
    room.config.roundDuration = Number.isFinite(rawT) ? Math.min(Math.max(rawT, 5), 120) : DEFAULTS.ROUND_DURATION;

    log.info("Room", `${code} — host configured: ${room.config.questionsPerGame} questions, ${room.config.roundDuration}s each`);
    startGame(room);
    return;
  }

  // ---- ANSWER ----
  if (action === "answer") {
    const player = room.players.get(pid);
    if (!player) {
      log.warn("Game", `${code} — answer from unknown pid ${pid}`);
      return;
    }
    if (player.answered) {
      log.debug("Game", `${code} — duplicate answer from ${player.name} (${pid}), ignored`);
      return;
    }
    if (room.state !== "playing") {
      log.debug("Game", `${code} — answer from ${player.name} outside playing state ("${room.state}"), ignored`);
      return;
    }
    if (room.currentQ >= room.questions.length) {
      log.warn("Game", `${code} — answer but currentQ (${room.currentQ}) >= questions.length (${room.questions.length})`);
      return;
    }

    player.answered = true;
    player.answerTime = Date.now();

    const chosen = Number.isFinite(msg.index) ? msg.index : parseInt(msg.index, 10);
    const correctIdx = room.questions[room.currentQ].correct;
    const elapsed = (player.answerTime - room.qStartTime) / 1000;
    const timeLeft = Math.max(0, room.config.roundDuration - elapsed);

    if (chosen === correctIdx) {
      const base = 1000;
      const timeBonus = Math.floor((timeLeft / room.config.roundDuration) * 400);
      player.streak += 1;
      const streakBonus = Math.min(player.streak - 1, 5) * 100;
      const points = base + timeBonus + streakBonus;
      player.score += points;
      player.lastCorrect = true;

      log.debug("Game", `${code} — ${player.name} answered CORRECT (+${points}, streak ${player.streak})`);
      sendTo(player, {
        type: "answer_result", correct: true,
        points, streak: player.streak, score: player.score,
      });
    } else {
      player.streak = 0;
      player.lastCorrect = false;
      log.debug("Game", `${code} — ${player.name} answered WRONG (chose ${chosen}, correct ${correctIdx})`);
      sendTo(player, {
        type: "answer_result", correct: false,
        points: 0, streak: 0, score: player.score,
      });
    }

    const answeredCount = Array.from(room.players.values()).filter((p) => p.answered).length;
    broadcast(room, {
      type: "player_answered", pid,
      answered_count: answeredCount,
      total: room.players.size,
    }, pid);
    return;
  }

  // ---- CHAT ----
  if (action === "chat") {
    const player = room.players.get(pid);
    if (!player) return;
    const text = String(msg.text || "").slice(0, 120).trim();
    if (!text) return;
    log.debug("Chat", `${code} — ${player.name}: ${text}`);
    broadcast(room, { type: "chat", pid, name: player.name, text });
    return;
  }

  // ---- PLAY AGAIN ----
  if (action === "play_again") {
    if (pid !== room.hostPid) return;
    if (room.state !== "results" && room.state !== "ended") {
      log.warn("Room", `${code} — play_again in unexpected state "${room.state}"`);
      return;
    }

    // Clear timers
    clearInterval(room._timerInterval);
    clearTimeout(room._revealTimeout);

    // Reset player state
    for (const p of room.players.values()) {
      p.score = 0; p.streak = 0; p.answered = false;
      p.answerTime = 0; p.lastCorrect = false;
    }
    room.state = "lobby";
    room.currentQ = 0;
    room.questions = [];

    log.info("Room", `${code} — lobby reset by host, ${room.players.size} players`);
    broadcast(room, { type: "lobby_reset" });
    broadcast(room, roomSnapshot(room));
    return;
  }

  // ---- LEAVE ROOM ----
  if (action === "leave_room") {
    log.info("Room", `${code} — ${pid} requested leave`);
    removePlayer(pid);
    return;
  }

  // Unknown action
  log.warn("WS", `${pid} sent unknown action type="${action}"`);
}

// ============================================================
//  PLAYER FACTORY
// ============================================================
function makePlayer(ws, pid, name) {
  return {
    ws, pid, name,
    score: 0, streak: 0,
    answered: false, answerTime: 0, lastCorrect: false,
  };
}

// ============================================================
//  STARTUP
// ============================================================
server.listen(PORT, () => {
  log.info("Server", `QuizForge listening on http://localhost:${PORT}`);
  log.info("Server", `DeepSeek AI: ${DEEPSEEK_API_KEY ? "ENABLED (key present)" : "DISABLED (set DEEPSEEK_API_KEY in .env)"}`);
  log.info("Server", `Log level: ${process.env.LOG_LEVEL || "INFO"} (set LOG_LEVEL=DEBUG for verbose output)`);
});

// Graceful shutdown
process.on("SIGINT", () => { log.info("Server", "Shutting down..."); process.exit(0); });
process.on("SIGTERM", () => { log.info("Server", "Shutting down..."); process.exit(0); });

// Catch unhandled promise rejections so the server doesn't crash silently
process.on("unhandledRejection", (reason, promise) => {
  log.error("Process", "Unhandled rejection at:", promise, "reason:", reason);
});