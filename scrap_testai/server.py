"""
Quizza Multiplayer Server
Run: python server.py [port]
"""
import asyncio
import json
import random
import time
import sys
import os
import requests
from dataclasses import dataclass, field, asdict
from typing import Optional
import websockets
from websockets.server import serve

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765

# ─── CONFIG ───────────────────────────────────────────────────────────────
# Read API key from environment variable "DEEPSEEK_API_KEY"
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
# Default seconds per question (more thinking time)
ROUND_DURATION = 35
LOBBY_WAIT    = 15        # seconds to wait before auto-start
MIN_PLAYERS   = 1         # allow solo for testing
MAX_PLAYERS   = 8
QUESTIONS_PER_GAME = 10

# ─── DATA CLASSES ─────────────────────────────────────────────────────────
@dataclass
class Player:
    ws: object
    pid: str
    name: str
    score: int = 0
    answered: bool = False
    answer_time: float = 0.0
    last_correct: bool = False
    streak: int = 0

@dataclass
class Room:
    code: str
    host_pid: str
    players: dict = field(default_factory=dict)  # pid → Player
    state: str = "lobby"   # lobby | starting | playing | results | ended
    questions: list = field(default_factory=list)
    current_q: int = 0
    q_start_time: float = 0.0
    topic_context: str = ""
    countdown: int = 0

# ─── GLOBAL STATE ─────────────────────────────────────────────────────────
rooms: dict[str, Room] = {}
pid_to_room: dict[str, str] = {}

def make_code():
    return "".join(random.choices("ABCDEFGHJKMNPQRSTUVWXYZ23456789", k=5))

def make_pid():
    return "p_" + "".join(random.choices("abcdefghijklmnopqrstuvwxyz0123456789", k=8))

# ─── AI QUESTION GENERATION ───────────────────────────────────────────────
def generate_questions_ai(topic_context: str, count: int = QUESTIONS_PER_GAME) -> list:
    """Call DeepSeek API to generate quiz questions."""
    if not DEEPSEEK_API_KEY:
        print("[AI] Nėra DEEPSEEK_API_KEY – naudojami integruoti klausimai")
        return generate_fallback_questions()

    system = (
        "Tu esi viktorinos klausimų generatorius. "
        "Grąžink TIKTAI JSON masyvą be markdown. "
        "Kiekvienas elementas: "
        '{"q":"klausimas","options":["A","B","C","D"],"correct":0,"topic":"tema","explanation":"paaiškinimas"} '
        "correct - teisingos opcijos indeksas (0-3). "
        "Klausimai turi būti įvairūs: faktai, sąvokos, pavyzdžiai, palyginimai."
    )
    user = (
        f"Sugeneruok {count} viktorinos klausimų su 4 atsakymų variantais "
        f"iš šios medžiagos:\n\n{topic_context[:6000]}\n\n"
        "Grąžink TIKTAI JSON masyvą."
    )

    try:
        # 1) Greita "ping" užklausa – patikrinti ar API veikia
        print("[AI] Greitas ping į DeepSeek API...")
        ping_resp = requests.post(
            "https://api.deepseek.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": "deepseek-chat",
                "messages": [
                    {"role": "system", "content": "You are a helpful assistant."},
                    {"role": "user", "content": "Reply with the word PONG."},
                ],
                "max_tokens": 8,
                "temperature": 0.0,
            },
            timeout=15,
        )
        if ping_resp.status_code != 200:
            print(f"[AI] Ping HTTP klaida: {ping_resp.status_code} {ping_resp.text[:200]}")
            return generate_fallback_questions()
        else:
            print("[AI] Ping pavyko, siunčiama pilna užklausa...")

        # 2) Tikroji didesnė užklausa su PDF / kontekstu
        resp = requests.post(
            "https://api.deepseek.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}", "Content-Type": "application/json"},
            json={"model": "deepseek-chat", "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user}
            ], "max_tokens": 4000, "temperature": 0.7},
            timeout=90
        )
        if resp.status_code != 200:
            print(f"[AI] HTTP klaida: {resp.status_code} {resp.text[:200]}")
            return generate_fallback_questions()

        data = resp.json()
        raw = data["choices"][0]["message"]["content"]
        raw = raw.replace("```json", "").replace("```", "").strip()
        questions = json.loads(raw)
        if isinstance(questions, list) and len(questions) > 0:
            print(f"[AI] Sugeneruota {len(questions)} klausimų")
            return questions[:count]
    except Exception as e:
        print(f"[AI] Klaida parsiduodant atsakymą: {e}")
        import traceback as _tb
        _tb.print_exc()

    return generate_fallback_questions()

def generate_fallback_questions() -> list:
    """Built-in questions when no API key / API fails."""
    return [
        {"q": "Koks yra pagrindinis skaitmeninės logikos komponentas?", "options": ["Tranzistorius","Kondensatorius","Rezistorius","Diodas"], "correct": 0, "topic": "Logika", "explanation": "Tranzistorius yra pagrindinis skaitmeninės elektronikos statybinis blokas."},
        {"q": "Kas yra MOSFET pagrindiniai išvadai?", "options": ["Emiteris, Bazė, Kolektorius","Santaka, Užtūra, Išteka","Anodas, Katodas, Valdiklis","Šaltinis, Droselė, Kanalas"], "correct": 1, "topic": "FET", "explanation": "MOSFET turi Santaką (Drain), Užtūrą (Gate) ir Išteką (Source)."},
        {"q": "Kokia Būlio operacija grąžina 1 tik kai ABU įėjimai yra 1?", "options": ["OR","NOT","AND","XOR"], "correct": 2, "topic": "Būlio algebra", "explanation": "AND (konjunkcija) – rezultatas 1 tik kai visi įėjimai 1."},
        {"q": "XOR operacija 1⊕1 = ?", "options": ["0","1","2","Nėra apibrėžta"], "correct": 0, "topic": "Būlio algebra", "explanation": "XOR grąžina 1 tik kai tik VIENAS įėjimas yra 1. Abu vienodi → 0."},
        {"q": "Kiek eilučių turi 3 įėjimų teisingumo lentelė?", "options": ["3","6","8","16"], "correct": 2, "topic": "Teisingumo lentelė", "explanation": "N įėjimų → 2^N eilučių. 2^3 = 8."},
        {"q": "Kas yra Half Adder išėjimai?", "options": ["Sum ir Carry","Sum ir Reset","Carry ir Enable","Data ir Clock"], "correct": 0, "topic": "Sumatorius", "explanation": "Pusinis sumatorius išveda Sum (XOR) ir Carry (AND)."},
        {"q": "Von Neumann architektūros pagrindinė savybė?", "options": ["Atskiros instrukcijų ir duomenų atmintys","Programa ir duomenys toje pačioje atmintyje","Tik RISC instrukcijų rinkinys","Nėra atminties hierarchijos"], "correct": 1, "topic": "Architektūra", "explanation": "Von Neumann: programa ir duomenys dalinasi ta pačia atmintimi."},
        {"q": "Koks yra Fetch-Execute ciklo pirmasis žingsnis?", "options": ["Execute","Decode","Fetch","Write Back"], "correct": 2, "topic": "CPU", "explanation": "Pirmiausia Fetch – gaunama instrukcija iš PC nurodytos vietos."},
        {"q": "8 bitų skaičius gali saugoti kiek reikšmių?", "options": ["128","255","256","512"], "correct": 2, "topic": "Duomenų vaizdavimas", "explanation": "2^8 = 256 galimų reikšmių (0-255)."},
        {"q": "RISC procesoriaus charakteristika?", "options": ["Daug kompleksinių instrukcijų","Kintamo ilgio instrukcijos","Mažas, fiksuotas instrukcijų rinkinys","Visi operandai iš atminties"], "correct": 2, "topic": "ISA", "explanation": "RISC – Reduced Instruction Set Computer: ~32 paprastos, fiksuoto dydžio instrukcijos."},
    ]

# ─── BROADCAST ────────────────────────────────────────────────────────────
async def broadcast(room: Room, msg: dict, exclude: str = None):
    dead = []
    for pid, player in room.players.items():
        if pid == exclude:
            continue
        try:
            await player.ws.send(json.dumps(msg))
        except Exception:
            dead.append(pid)
    for pid in dead:
        await remove_player(pid)

async def send_to(player: Player, msg: dict):
    try:
        await player.ws.send(json.dumps(msg))
    except Exception:
        pass

# ─── ROOM STATE ───────────────────────────────────────────────────────────
def room_snapshot(room: Room) -> dict:
    return {
        "type": "room_state",
        "code": room.code,
        "state": room.state,
        "players": [
            {"pid": p.pid, "name": p.name, "score": p.score,
             "answered": p.answered, "streak": p.streak}
            for p in sorted(room.players.values(), key=lambda x: -x.score)
        ],
        "current_q": room.current_q,
        "total_q": len(room.questions),
        "has_context": bool(room.topic_context)
    }

def leaderboard(room: Room) -> list:
    return sorted(
        [{"pid": p.pid, "name": p.name, "score": p.score, "streak": p.streak}
         for p in room.players.values()],
        key=lambda x: -x["score"]
    )

# ─── GAME LOOP ────────────────────────────────────────────────────────────
async def start_game(room: Room):
    room.state = "starting"
    await broadcast(room, {"type": "game_starting", "countdown": 3})

    # Generate questions if we have context
    if room.topic_context and DEEPSEEK_API_KEY:
        await broadcast(room, {"type": "status", "msg": "🤖 AI generuoja klausimus..."})
        loop = asyncio.get_event_loop()
        room.questions = await loop.run_in_executor(
            None, generate_questions_ai, room.topic_context, QUESTIONS_PER_GAME
        )
    else:
        room.questions = generate_fallback_questions()

    await asyncio.sleep(3)
    room.state = "playing"
    room.current_q = 0
    await run_question(room)

async def run_question(room: Room):
    if room.current_q >= len(room.questions):
        await end_game(room)
        return

    q = room.questions[room.current_q]
    room.q_start_time = time.time()

    # Reset answered flags
    for p in room.players.values():
        p.answered = False

    await broadcast(room, {
        "type": "question",
        "index": room.current_q,
        "total": len(room.questions),
        "question": q["q"],
        "options": q["options"],
        "topic": q.get("topic", ""),
        "duration": ROUND_DURATION
    })

    # Countdown timer
    for remaining in range(ROUND_DURATION, 0, -1):
        if room.state != "playing":
            return
        await asyncio.sleep(1)
        await broadcast(room, {"type": "timer", "remaining": remaining - 1})
        # Check if all answered
        if all(p.answered for p in room.players.values()):
            break

    await reveal_answer(room)

async def reveal_answer(room: Room):
    if room.current_q >= len(room.questions):
        return
    q = room.questions[room.current_q]
    correct_idx = q["correct"]

    results = []
    for p in room.players.values():
        results.append({
            "pid": p.pid, "name": p.name,
            "answered": p.answered, "correct": p.last_correct,
            "score": p.score, "streak": p.streak
        })

    await broadcast(room, {
        "type": "reveal",
        "correct_index": correct_idx,
        "explanation": q.get("explanation", ""),
        "results": results,
        "leaderboard": leaderboard(room)
    })

    # More time to read explanation / discuss
    await asyncio.sleep(10)
    room.current_q += 1
    if room.state == "playing":
        await run_question(room)

async def end_game(room: Room):
    room.state = "results"
    board = leaderboard(room)
    await broadcast(room, {
        "type": "game_over",
        "leaderboard": board,
        "winner": board[0] if board else None
    })

async def remove_player(pid: str):
    code = pid_to_room.get(pid)
    if not code or code not in rooms:
        return
    room = rooms[code]
    if pid in room.players:
        name = room.players[pid].name
        del room.players[pid]
        del pid_to_room[pid]
        await broadcast(room, {"type": "player_left", "pid": pid, "name": name})
        await broadcast(room, room_snapshot(room))

    # Clean empty rooms
    if not room.players:
        del rooms[code]
        print(f"[Room] {code} pašalintas (tuščias)")

# ─── MESSAGE HANDLER ──────────────────────────────────────────────────────
async def handle_message(ws, pid: str, msg: dict):
    action = msg.get("type")
    code = pid_to_room.get(pid)
    room = rooms.get(code) if code else None

    # ── CREATE ROOM ──
    if action == "create_room":
        name = str(msg.get("name", "Player"))[:20].strip() or "Player"
        code = make_code()
        while code in rooms:
            code = make_code()

        player = Player(ws=ws, pid=pid, name=name)
        room = Room(code=code, host_pid=pid)
        room.players[pid] = player
        rooms[code] = room
        pid_to_room[pid] = code

        print(f"[Room] {code} sukurta, host: {name}")
        await send_to(player, {"type": "created", "code": code, "pid": pid, "name": name})
        await send_to(player, room_snapshot(room))

    # ── JOIN ROOM ──
    elif action == "join_room":
        jcode = str(msg.get("code", "")).upper().strip()
        name = str(msg.get("name", "Player"))[:20].strip() or "Player"

        if jcode not in rooms:
            await ws.send(json.dumps({"type": "error", "msg": f"Kambarys '{jcode}' nerastas!"}))
            return
        jroom = rooms[jcode]
        if len(jroom.players) >= MAX_PLAYERS:
            await ws.send(json.dumps({"type": "error", "msg": "Kambarys pilnas!"}))
            return
        if jroom.state not in ("lobby",):
            await ws.send(json.dumps({"type": "error", "msg": "Žaidimas jau prasidėjo!"}))
            return

        player = Player(ws=ws, pid=pid, name=name)
        jroom.players[pid] = player
        pid_to_room[pid] = jcode

        print(f"[Room] {jcode} prisijungė: {name}")
        await send_to(player, {"type": "joined", "code": jcode, "pid": pid, "name": name})
        await broadcast(jroom, {"type": "player_joined", "pid": pid, "name": name}, exclude=pid)
        await broadcast(jroom, room_snapshot(jroom))

    # ── SET CONTEXT (topic from website / PDF) ──
    elif action == "set_context" and room:
        if pid == room.host_pid:
            room.topic_context = str(msg.get("context", ""))[:8000]
            await broadcast(room, {"type": "context_set", "msg": "📚 Turinys nustatytas! AI generuos klausimus."})
            await broadcast(room, room_snapshot(room))

    # ── START GAME ──
    elif action == "start_game" and room:
        if pid == room.host_pid and room.state == "lobby":
            if len(room.players) < MIN_PLAYERS:
                await send_to(room.players[pid], {"type": "error", "msg": f"Reikia bent {MIN_PLAYERS} žaidėjo!"})
                return
            asyncio.create_task(start_game(room))

    # ── SUBMIT ANSWER ──
    elif action == "answer" and room:
        player = room.players.get(pid)
        if not player or player.answered or room.state != "playing":
            return

        player.answered = True
        player.answer_time = time.time()
        chosen = int(msg.get("index", -1))

        if room.current_q < len(room.questions):
            correct_idx = room.questions[room.current_q]["correct"]
            elapsed = player.answer_time - room.q_start_time
            time_left = max(0, ROUND_DURATION - elapsed)

            if chosen == correct_idx:
                # Points: base 1000 + time bonus + streak bonus
                base = 1000
                time_bonus = int(time_left / ROUND_DURATION * 400)
                player.streak += 1
                streak_bonus = min(player.streak - 1, 5) * 100
                points = base + time_bonus + streak_bonus
                player.score += points
                player.last_correct = True
                await send_to(player, {"type": "answer_result", "correct": True,
                    "points": points, "streak": player.streak, "score": player.score})
            else:
                player.streak = 0
                player.last_correct = False
                await send_to(player, {"type": "answer_result", "correct": False,
                    "points": 0, "streak": 0, "score": player.score})

        # Notify others that this player answered (not which answer)
        await broadcast(room, {
            "type": "player_answered", "pid": pid,
            "answered_count": sum(1 for p in room.players.values() if p.answered),
            "total": len(room.players)
        }, exclude=pid)

    # ── LEAVE ROOM ──
    elif action == "leave_room" and room:
        await remove_player(pid)

    # ── CHAT ──
    elif action == "chat" and room:
        player = room.players.get(pid)
        if player:
            text = str(msg.get("text", ""))[:120].strip()
            if text:
                await broadcast(room, {"type": "chat", "pid": pid, "name": player.name, "text": text})

    # ── PLAY AGAIN ──
    elif action == "play_again" and room:
        if pid == room.host_pid and room.state in ("results", "ended"):
            for p in room.players.values():
                p.score = 0
                p.streak = 0
                p.answered = False
            room.state = "lobby"
            room.current_q = 0
            room.questions = []
            await broadcast(room, {"type": "lobby_reset"})
            await broadcast(room, room_snapshot(room))

    # ── PING ──
    elif action == "ping":
        await ws.send(json.dumps({"type": "pong", "ts": msg.get("ts")}))

# ─── CONNECTION HANDLER ───────────────────────────────────────────────────
async def handler(ws):
    pid = make_pid()
    print(f"[WS] Prisijungė: {pid}")
    await ws.send(json.dumps({"type": "connected", "pid": pid, "version": "1.0"}))

    try:
        async for raw in ws:
            try:
                msg = json.loads(raw)
                await handle_message(ws, pid, msg)
            except json.JSONDecodeError:
                await ws.send(json.dumps({"type": "error", "msg": "Netinkamas JSON"}))
            except Exception as e:
                print(f"[ERR] {pid}: {e}")
                await ws.send(json.dumps({"type": "error", "msg": str(e)}))
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        print(f"[WS] Atsijungė: {pid}")
        await remove_player(pid)

# ─── MAIN ─────────────────────────────────────────────────────────────────
async def main():
    print(f"""
╔══════════════════════════════════════════╗
║     Quizza Multiplayer Server         ║
║     WebSocket: ws://localhost:{PORT}        ║
║     AI: {'✓ DeepSeek' if DEEPSEEK_API_KEY else '✗ Nėra API rakto (fallback)'}{'                 ' if DEEPSEEK_API_KEY else '            '}║
╚══════════════════════════════════════════╝
    """)
    if not DEEPSEEK_API_KEY:
        print("  ⚠  Nustatyk: export DEEPSEEK_API_KEY=sk-xxx")
        print("  ℹ  Bus naudojami integruoti klausimai\n")

    async with serve(handler, "0.0.0.0", PORT):
        print(f"  ✓ Serveris veikia! ws://localhost:{PORT}")
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    asyncio.run(main())
