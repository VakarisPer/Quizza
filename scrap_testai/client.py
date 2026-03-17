"""
QuizForge Multiplayer Client
Run: python client.py
Controls: Mouse clicks, keyboard typing
"""
import pygame
import asyncio
import json
import threading
import time
import sys
import os
import random
import math
import websockets
try:
    import PyPDF2
except ImportError:
    PyPDF2 = None
try:
    import tkinter as tk
    from tkinter import filedialog
except Exception:
    tk = None

# ─── SETTINGS ──────────────────────────────────────────────────────────────
SERVER = "ws://localhost:8765"
W, H = 1100, 720
FPS  = 60
FONT_PATH = None  # uses system fonts

# ─── COLORS (modern black & white theme) ───────────────────────────────────
# Minimalistinė juoda–balta schema su keliais pilkais tonais.
C = {
    "bg":       (245, 245, 245),   # šviesiai pilkas fonas
    "surface":  (255, 255, 255),   # kortelės / viršutinė juosta
    "surface2": (235, 235, 235),   # antrinis paviršius
    "border":   (210, 210, 210),
    "accent":   (20, 20, 20),      # pagrindinis akcentas – beveik juodas
    "accent2":  (80, 80, 80),      # antrinis akcentas
    "accent3":  (140, 140, 140),   # minkštas pilkas akcentas
    "yellow":   (50, 50, 50),      # naudojama tik ikonoms – išlaikom monohromę
    "red":      (40, 40, 40),
    "green":    (40, 40, 40),
    "text":     (10, 10, 10),
    "muted":    (140, 140, 140),
    "white":    (255, 255, 255),
    "black":    (0,   0,   0),
}

# Option colors
OPT_COLORS = [
    (255, 80,  80),   # A – red
    (80, 180, 255),   # B – blue
    (255, 200, 60),   # C – yellow
    (80, 220, 120),   # D – green
]
OPT_LABELS = ["A", "B", "C", "D"]

# ─── PYGAME HELPERS ────────────────────────────────────────────────────────
def load_font(size, bold=False):
    # Prefer fonts that render emojis properly on Windows
    names = ["Segoe UI Emoji", "Segoe UI", "SF Pro Display", "Helvetica Neue", "Arial"]
    for n in names:
        try:
            f = pygame.font.SysFont(n, size, bold=bold)
            if f:
                return f
        except Exception:
            pass
    return pygame.font.Font(None, size)

def draw_rect_rounded(surf, color, rect, radius=12, border=0, border_color=None):
    r = pygame.Rect(rect)
    pygame.draw.rect(surf, color, r, border_radius=radius)
    if border:
        pygame.draw.rect(surf, border_color or color, r, border, border_radius=radius)

def draw_text(surf, text, font, color, x, y, align="left", max_width=None):
    if max_width:
        words = text.split()
        lines, line = [], []
        for w in words:
            test = " ".join(line + [w])
            if font.size(test)[0] <= max_width:
                line.append(w)
            else:
                if line: lines.append(" ".join(line))
                line = [w]
        if line: lines.append(" ".join(line))
    else:
        lines = [text]

    total_h = len(lines) * (font.get_height() + 2)
    cy = y
    rects = []
    for line in lines:
        surf2 = font.render(line, True, color)
        w2 = surf2.get_width()
        if align == "center": rx = x - w2 // 2
        elif align == "right": rx = x - w2
        else: rx = x
        surf.blit(surf2, (rx, cy))
        rects.append(pygame.Rect(rx, cy, w2, font.get_height()))
        cy += font.get_height() + 2
    return total_h, rects

def lerp_color(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def clamp(v, lo, hi): return max(lo, min(hi, v))

# ─── INPUT BOX ─────────────────────────────────────────────────────────────
class InputBox:
    def __init__(self, x, y, w, h, placeholder="", secret=False):
        self.rect = pygame.Rect(x, y, w, h)
        self.text = ""
        self.placeholder = placeholder
        self.active = False
        self.secret = secret
        self.cursor_vis = True
        self.cursor_timer = 0

    def handle(self, event):
        if event.type == pygame.MOUSEBUTTONDOWN:
            self.active = self.rect.collidepoint(event.pos)
        if event.type == pygame.KEYDOWN and self.active:
            if event.key == pygame.K_BACKSPACE:
                self.text = self.text[:-1]
            elif event.key not in (pygame.K_RETURN, pygame.K_TAB, pygame.K_ESCAPE):
                if len(self.text) < 60:
                    self.text += event.unicode
            return event.key == pygame.K_RETURN
        return False

    def draw(self, surf, font):
        self.cursor_timer += 1
        if self.cursor_timer >= 30:
            self.cursor_vis = not self.cursor_vis
            self.cursor_timer = 0

        col = C["accent"] if self.active else C["border"]
        draw_rect_rounded(surf, C["surface2"], self.rect, radius=10)
        draw_rect_rounded(surf, (0,0,0,0), self.rect, radius=10, border=2, border_color=col)

        disp = ("•" * len(self.text)) if self.secret else self.text
        if disp:
            txt_s = font.render(disp, True, C["text"])
            surf.blit(txt_s, (self.rect.x + 14, self.rect.y + (self.rect.h - txt_s.get_height()) // 2))
            if self.active and self.cursor_vis:
                cx = self.rect.x + 14 + txt_s.get_width() + 2
                cy = self.rect.y + 8
                pygame.draw.line(surf, C["accent"], (cx, cy), (cx, self.rect.y + self.rect.h - 8), 2)
        else:
            ph = font.render(self.placeholder, True, C["muted"])
            surf.blit(ph, (self.rect.x + 14, self.rect.y + (self.rect.h - ph.get_height()) // 2))

# ─── BUTTON ────────────────────────────────────────────────────────────────
class Button:
    def __init__(self, x, y, w, h, text, color=None, text_color=None):
        self.rect = pygame.Rect(x, y, w, h)
        self.text = text
        self.color = color or C["accent"]
        self.text_color = text_color or C["white"]
        self.hover = False
        self.scale = 1.0

    def handle(self, event):
        if event.type == pygame.MOUSEMOTION:
            self.hover = self.rect.collidepoint(event.pos)
        if event.type == pygame.MOUSEBUTTONDOWN:
            if self.rect.collidepoint(event.pos):
                return True
        return False

    def draw(self, surf, font):
        t = 0.1 if self.hover else 0
        col = lerp_color(self.color, C["white"], t)
        r = self.rect.inflate(4 if self.hover else 0, 4 if self.hover else 0)
        draw_rect_rounded(surf, col, r, radius=12)
        txt = font.render(self.text, True, self.text_color)
        surf.blit(txt, (r.centerx - txt.get_width()//2, r.centery - txt.get_height()//2))

# ─── PARTICLES ─────────────────────────────────────────────────────────────
class Particle:
    def __init__(self, x, y, color):
        self.x, self.y = float(x), float(y)
        a = random.uniform(0, math.pi*2)
        s = random.uniform(2, 7)
        self.vx = math.cos(a) * s
        self.vy = math.sin(a) * s - 3
        self.color = color
        self.life = 1.0
        self.size = random.randint(4, 10)

    def update(self):
        self.x += self.vx
        self.y += self.vy
        self.vy += 0.2
        self.life -= 0.025
        return self.life > 0

    def draw(self, surf):
        a = int(self.life * 255)
        c = (*self.color[:3], a)
        s = pygame.Surface((self.size*2, self.size*2), pygame.SRCALPHA)
        pygame.draw.circle(s, c, (self.size, self.size), int(self.size * self.life))
        surf.blit(s, (int(self.x) - self.size, int(self.y) - self.size))

# ─── NOTIFICATION ──────────────────────────────────────────────────────────
class Notification:
    def __init__(self, text, color=None):
        self.text = text
        self.color = color or C["accent3"]
        self.life = 1.0
        self.y_off = 0

    def update(self):
        self.life -= 0.015
        self.y_off -= 0.8
        return self.life > 0

# ─── GAME CLIENT ───────────────────────────────────────────────────────────
class GameClient:
    def __init__(self):
        pygame.init()
        pygame.display.set_caption("⚡ QuizForge")
        self.screen = pygame.display.set_mode((W, H))
        self.clock = pygame.time.Clock()

        # Fonts
        self.f_huge  = load_font(72, bold=True)
        self.f_large = load_font(36, bold=True)
        self.f_med   = load_font(24, bold=True)
        self.f_body  = load_font(20)
        self.f_small = load_font(16)
        self.f_mono  = pygame.font.SysFont("Consolas", 18)

        # State
        self.scene = "menu"  # menu | lobby | game | results | chat_input
        self.pid = None
        self.room_code = None
        self.is_host = False
        self.players = []
        self.q_data = None
        self.q_total = 0
        self.q_index = 0
        self.timer_remaining = 20
        self.timer_max = 20
        self.selected_answer = -1
        self.answer_locked = False
        self.reveal_data = None
        self.leaderboard_data = []
        self.chat_msgs = []
        self.notifications = []
        self.particles = []
        self.has_context = False
        self.score = 0
        self.streak = 0
        self.last_result = None  # {"correct": bool, "points": int}
        self.last_result_timer = 0
        self.connecting = False
        self.error_msg = ""
        self.answered_count = 0

        # Menu inputs
        self.inp_name = InputBox(W//2-180, 300, 360, 50, "Tavo vardas...")
        self.inp_code = InputBox(W//2-180, 380, 360, 50, "Kambario kodas (ABCDE)...")
        self.btn_create = Button(W//2-190, 460, 180, 48, "Kurti room", C["accent"])
        self.btn_join   = Button(W//2+10,  460, 180, 48, "Prisijungti", (80, 160, 255))

        # Lobby button
        self.btn_start = Button(W//2-80, H-90, 190, 48, "Pradėti žaidimą", C["green"])
        self.btn_again = Button(W//2+20, H-90, 190, 48, "Naujas žaidimas", C["accent"])
        self.btn_leave = Button(W//2-210, H-90, 190, 48, "Išeiti iš kambario", C["red"])
        self.btn_load_pdf = Button(40, H-90, 220, 48, "Įkelti PDF turini", C["accent2"])

        # Chat
        self.chat_input = InputBox(20, H-54, W-120, 44, "Rašyk žinutę...")
        self.show_chat = False

        # WS
        self.ws = None
        self.ws_thread = None
        self.ws_loop = None
        self.msg_queue = []
        self.lock = threading.Lock()
        self.connected = False

        # Background - now black
        self.bg_stars = [(random.randint(0,W), random.randint(0,H),
                          random.uniform(0.3, 1.5)) for _ in range(80)]
        C["bg"] = (0, 0, 0)
        self.bg_t = 0

    # ─── WEBSOCKET ────────────────────────────────────────────────────────
    def connect_ws(self):
        """Run WS in background thread."""
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        self.ws_loop = loop
        loop.run_until_complete(self._ws_loop())

    async def _ws_loop(self):
        try:
            async with websockets.connect(SERVER, ping_interval=20, ping_timeout=10) as ws:
                self.ws = ws
                self.connected = True
                self.connecting = False
                async for raw in ws:
                    msg = json.loads(raw)
                    with self.lock:
                        self.msg_queue.append(msg)
        except Exception as e:
            with self.lock:
                self.msg_queue.append({"type": "error", "msg": f"Ryšio klaida: {e}"})
        finally:
            self.connected = False
            self.ws = None

    def send(self, data: dict):
        if not self.connected or not self.ws:
            return
        if not self.ws_loop:
            return
        asyncio.run_coroutine_threadsafe(
            self.ws.send(json.dumps(data)),
            self.ws_loop
        )

    def start_connection(self):
        if self.ws_thread and self.ws_thread.is_alive():
            return
        self.connecting = True
        self.ws_thread = threading.Thread(target=self.connect_ws, daemon=True)
        self.ws_thread.start()

    # ─── MESSAGE HANDLING ─────────────────────────────────────────────────
    def process_messages(self):
        with self.lock:
            msgs = self.msg_queue[:]
            self.msg_queue.clear()

        for msg in msgs:
            t = msg.get("type")

            if t == "connected":
                self.pid = msg["pid"]

            elif t in ("created", "joined"):
                self.room_code = msg["code"]
                self.is_host = (t == "created")
                self.scene = "lobby"
                self.error_msg = ""

            elif t == "room_state":
                self.players = msg["players"]
                self.has_context = msg.get("has_context", False)
                me = next((p for p in self.players if p["pid"] == self.pid), None)
                if me:
                    self.score = me["score"]
                    self.streak = me["streak"]

            elif t == "game_starting":
                self.scene = "game"
                self.notifications.append(Notification("🎮 Žaidimas prasideda!", C["accent3"]))

            elif t == "question":
                self.q_data = msg
                self.q_index = msg["index"]
                self.q_total = msg["total"]
                self.timer_remaining = msg["duration"]
                self.timer_max = msg["duration"]
                self.selected_answer = -1
                self.answer_locked = False
                self.reveal_data = None
                self.answered_count = 0
                self.last_result = None
                self.scene = "game"

            elif t == "timer":
                self.timer_remaining = msg["remaining"]

            elif t == "answer_result":
                self.last_result = msg
                self.last_result_timer = 120
                self.score = msg["score"]
                self.streak = msg["streak"]
                if msg["correct"]:
                    for _ in range(20):
                        self.particles.append(Particle(
                            random.randint(100, W-100), random.randint(200, 400),
                            random.choice([C["green"], C["accent3"], C["yellow"]])
                        ))
                    self.notifications.append(Notification(
                        f"✓ +{msg['points']} pts!" + (" 🔥×"+str(msg['streak']) if msg['streak']>1 else ""),
                        C["green"]
                    ))
                else:
                    self.notifications.append(Notification("✗ Neteisingai", C["red"]))

            elif t == "player_answered":
                self.answered_count = msg["answered_count"]

            elif t == "reveal":
                self.reveal_data = msg
                self.leaderboard_data = msg["leaderboard"]

            elif t == "game_over":
                self.scene = "results"
                self.leaderboard_data = msg["leaderboard"]
                winner = msg.get("winner")
                if winner and winner["pid"] == self.pid:
                    for _ in range(50):
                        self.particles.append(Particle(
                            random.randint(0, W), random.randint(0, H//2),
                            random.choice([C["yellow"], C["accent"], C["accent2"], C["accent3"]])
                        ))

            elif t == "lobby_reset":
                self.scene = "lobby"
                self.score = 0
                self.streak = 0
                self.q_data = None
                self.reveal_data = None

            elif t == "chat":
                self.chat_msgs.append(msg)
                if len(self.chat_msgs) > 30:
                    self.chat_msgs = self.chat_msgs[-30:]

            elif t == "player_joined":
                self.notifications.append(Notification(f"👤 {msg['name']} prisijungė!", C["accent"]))

            elif t == "player_left":
                self.notifications.append(Notification(f"👋 {msg['name']} išėjo", C["muted"]))

            elif t == "status":
                self.notifications.append(Notification(msg["msg"], C["accent"]))

            elif t == "error":
                self.error_msg = msg.get("msg", "Klaida")
                self.connecting = False
                self.notifications.append(Notification("❌ " + self.error_msg, C["red"]))

    # ─── DRAW HELPERS ─────────────────────────────────────────────────────
    def draw_bg(self):
        self.screen.fill(C["bg"])
        # Grid
        self.bg_t += 0.005
        for gx in range(0, W, 40):
            pygame.draw.line(self.screen, (20, 20, 35), (gx, 0), (gx, H))
        for gy in range(0, H, 40):
            pygame.draw.line(self.screen, (20, 20, 35), (0, gy), (W, gy))
        # Stars
        for sx, sy, sz in self.bg_stars:
            a = int(abs(math.sin(self.bg_t + sz)) * 180 + 40)
            r = int(sz * 1.5)
            if r > 0:
                s = pygame.Surface((r*2+2, r*2+2), pygame.SRCALPHA)
                pygame.draw.circle(s, (200, 180, 255, a), (r+1, r+1), r)
                self.screen.blit(s, (sx-r-1, sy-r-1))

    def draw_header(self, subtitle=""):
        pygame.draw.rect(self.screen, C["surface"], (0, 0, W, 60))
        pygame.draw.line(self.screen, C["border"], (0, 60), (W, 60))
        # Logo
        logo = self.f_med.render("⚡ QuizForge", True, C["text"])
        self.screen.blit(logo, (20, 18))
        # Subtitle
        if subtitle:
            sub = self.f_small.render(subtitle, True, C["muted"])
            self.screen.blit(sub, (W - sub.get_width() - 20, 22))

    def draw_notifications(self):
        alive = []
        y = H - 120
        for n in self.notifications:
            if n.update():
                a = int(n.life * 255)
                s = pygame.Surface((400, 36), pygame.SRCALPHA)
                pygame.draw.rect(s, (*C["surface"], a), (0,0,400,36), border_radius=8)
                pygame.draw.rect(s, (*n.color, a), (0,0,400,36), 1, border_radius=8)
                txt = self.f_body.render(n.text, True, (*n.color, a))
                s.blit(txt, (12, (36 - txt.get_height())//2))
                self.screen.blit(s, (W//2 - 200, y + int(n.y_off)))
                y -= 42
                alive.append(n)
        self.notifications = alive

    def draw_particles(self):
        alive = []
        for p in self.particles:
            if p.update():
                p.draw(self.screen)
                alive.append(p)
        self.particles = alive

    def draw_timer_bar(self, x, y, w, h, remaining, total):
        pct = remaining / total
        bg_r = pygame.Rect(x, y, w, h)
        draw_rect_rounded(self.screen, C["surface2"], bg_r, radius=h)
        if pct > 0:
            fill_col = C["green"] if pct > 0.5 else C["yellow"] if pct > 0.25 else C["red"]
            fw = max(h, int(w * pct))
            draw_rect_rounded(self.screen, fill_col, (x, y, fw, h), radius=h)

    # ─── SCENES ───────────────────────────────────────────────────────────
    def draw_menu(self):
        self.draw_bg()
        self.draw_header()

        # Title
        cy = 120
        t1 = self.f_huge.render("Quiz", True, C["text"])
        t2 = self.f_huge.render("Forge", True, C["accent"])
        total_w = t1.get_width() + t2.get_width() + 4
        self.screen.blit(t1, (W//2 - total_w//2, cy))
        self.screen.blit(t2, (W//2 - total_w//2 + t1.get_width() + 4, cy))

        sub = self.f_body.render("Multiplayer viktorina su AI klausimais", True, C["muted"])
        self.screen.blit(sub, (W//2 - sub.get_width()//2, cy + 82))

        if self.connecting:
            dot_t = time.time() * 2
            dots = "." * (int(dot_t) % 4)
            conn = self.f_body.render(f"Jungiamasi{dots}", True, C["accent"])
            self.screen.blit(conn, (W//2 - conn.get_width()//2, cy + 130))
        elif not self.connected:
            nc = self.f_small.render("⚠ Neprisijungta prie serverio", True, C["red"])
            self.screen.blit(nc, (W//2 - nc.get_width()//2, cy + 130))
            btn_c = Button(W//2-80, cy+158, 160, 36, "Jungtis", C["accent"])
            btn_c.draw(self.screen, self.f_small)
        else:
            ok = self.f_small.render("● Prisijungta", True, C["green"])
            self.screen.blit(ok, (W//2 - ok.get_width()//2, cy + 130))

        # Inputs
        name_l = self.f_small.render("Tavo vardas", True, C["muted"])
        self.screen.blit(name_l, (W//2-180, 278))
        self.inp_name.draw(self.screen, self.f_body)

        code_l = self.f_small.render("Kambario kodas (praleidžiama jei kuriamas)", True, C["muted"])
        self.screen.blit(code_l, (W//2-180, 358))
        self.inp_code.draw(self.screen, self.f_body)

        self.btn_create.draw(self.screen, self.f_body)
        self.btn_join.draw(self.screen, self.f_body)

        # Error
        if self.error_msg:
            er = self.f_small.render("❌ " + self.error_msg, True, C["red"])
            self.screen.blit(er, (W//2 - er.get_width()//2, 530))

        # Help
        tips = ["💡 Pirmiausia paleisk: python server.py",
                "🌐 AI klausimams: nustatyk DEEPSEEK_API_KEY"]
        for i, tip in enumerate(tips):
            t = self.f_small.render(tip, True, C["muted"])
            self.screen.blit(t, (W//2 - t.get_width()//2, H - 80 + i*22))

    def draw_lobby(self):
        self.draw_bg()
        self.draw_header(f"Kambarys: {self.room_code or ''}")

        # Room code BIG
        cy = 80
        code_txt = self.f_large.render(f"📌 {self.room_code}", True, C["accent"])
        self.screen.blit(code_txt, (W//2 - code_txt.get_width()//2, cy))

        hint = self.f_small.render("Kiti žaidėjai turi įvesti šį kodą", True, C["muted"])
        self.screen.blit(hint, (W//2 - hint.get_width()//2, cy + 46))

        if self.has_context:
            ctx = self.f_small.render("📚 AI generuos klausimus iš įkelto turinio", True, C["accent3"])
            self.screen.blit(ctx, (W//2 - ctx.get_width()//2, cy + 70))

        # Players
        py = cy + 110
        pl_title = self.f_med.render(f"Žaidėjai ({len(self.players)})", True, C["text"])
        self.screen.blit(pl_title, (W//2 - pl_title.get_width()//2, py))
        py += 36

        for i, p in enumerate(self.players):
            is_me = p["pid"] == self.pid
            px = W//2 - 220
            pw = 440
            bg_c = C["surface2"] if not is_me else (30, 25, 60)
            draw_rect_rounded(self.screen, bg_c, (px, py, pw, 44), radius=10)
            if is_me:
                draw_rect_rounded(self.screen, (0,0,0,0), (px, py, pw, 44), radius=10,
                                  border=2, border_color=C["accent"])

            rank = self.f_body.render(f"{i+1}.", True, C["muted"])
            self.screen.blit(rank, (px+12, py+12))
            name = self.f_body.render(p["name"] + (" (Tu)" if is_me else ""), True,
                                       C["accent"] if is_me else C["text"])
            self.screen.blit(name, (px+40, py+12))
            py += 52

        # Host controls
        if self.is_host:
            # Bottom action bar
            pygame.draw.rect(self.screen, C["surface"], (0, H-110, W, 110))
            pygame.draw.line(self.screen, C["border"], (0, H-110), (W, H-110))

            self.btn_leave.draw(self.screen, self.f_small)
            self.btn_load_pdf.draw(self.screen, self.f_small)
            self.btn_start.draw(self.screen, self.f_med)

            hint2 = self.f_small.render("Tik tu (host) gali įkelti turinį ir pradėti žaidimą", True, C["muted"])
            self.screen.blit(hint2, (W//2 - hint2.get_width()//2, H-40))

    def draw_game(self):
        self.draw_bg()

        if not self.q_data:
            wait = self.f_large.render("Laukiama klausimo...", True, C["muted"])
            self.screen.blit(wait, (W//2 - wait.get_width()//2, H//2 - 20))
            return

        # Header bar
        pygame.draw.rect(self.screen, C["surface"], (0, 0, W, 56))
        pygame.draw.line(self.screen, C["border"], (0, 56), (W, 56))

        # Question number
        qn = self.f_small.render(f"KLAUSIMAS {self.q_index+1} / {self.q_total}", True, C["muted"])
        self.screen.blit(qn, (20, 20))

        # Topic
        if self.q_data.get("topic"):
            tp = self.f_small.render(self.q_data["topic"], True, C["accent"])
            self.screen.blit(tp, (W//2 - tp.get_width()//2, 20))

        # Timer
        timer_s = self.f_large.render(str(self.timer_remaining), True,
                                       C["green"] if self.timer_remaining > 10
                                       else C["yellow"] if self.timer_remaining > 5 else C["red"])
        self.screen.blit(timer_s, (W - timer_s.get_width() - 20, 10))
        self.draw_timer_bar(W - 100, 40, 80, 6, self.timer_remaining, self.timer_max)

        # Score & streak
        sc = self.f_small.render(f"★ {self.score}", True, C["yellow"])
        self.screen.blit(sc, (160, 20))
        if self.streak >= 2:
            st = self.f_small.render(f"🔥 ×{self.streak}", True, C["accent2"])
            self.screen.blit(st, (220, 20))

        # Answered count
        ans_txt = self.f_small.render(f"✓ {self.answered_count}/{len(self.players)}", True, C["accent3"])
        self.screen.blit(ans_txt, (W//2 - ans_txt.get_width()//2 + 120, 20))

        # Question text
        qy = 80
        draw_rect_rounded(self.screen, C["surface"], (40, qy, W-80, 120), radius=14)
        draw_text(self.screen, self.q_data["question"], self.f_med, C["text"],
                  W//2, qy+20, align="center", max_width=W-120)

        # Answer options
        oy = 220
        ow = (W - 100) // 2 - 8
        oh = 100

        for i, opt in enumerate(self.q_data["options"]):
            col_x = 40 + (i % 2) * (ow + 16)
            col_y = oy + (i // 2) * (oh + 12)

            base_col = OPT_COLORS[i]
            bg_col = (30, 25, 45)
            border_col = base_col
            text_col = C["text"]

            if self.reveal_data:
                correct = self.reveal_data["correct_index"]
                if i == correct:
                    bg_col = (20, 80, 40)
                    border_col = C["green"]
                elif i == self.selected_answer and i != correct:
                    bg_col = (80, 20, 20)
                    border_col = C["red"]
                else:
                    border_col = C["border"]
                    text_col = C["muted"]
            elif i == self.selected_answer:
                bg_col = tuple(c//3 for c in base_col)
                border_col = base_col

            draw_rect_rounded(self.screen, bg_col, (col_x, col_y, ow, oh), radius=14)
            draw_rect_rounded(self.screen, (0,0,0,0), (col_x, col_y, ow, oh), radius=14,
                              border=2, border_color=border_col)

            # Label circle
            pygame.draw.circle(self.screen, base_col, (col_x+28, col_y+oh//2), 16)
            lbl = self.f_med.render(OPT_LABELS[i], True, C["black"])
            self.screen.blit(lbl, (col_x+28-lbl.get_width()//2, col_y+oh//2-lbl.get_height()//2))

            # Option text
            draw_text(self.screen, opt, self.f_body, text_col,
                      col_x+52, col_y+12, max_width=ow-60)

        # Reveal explanation
        if self.reveal_data:
            expl = self.reveal_data.get("explanation", "")
            if expl:
                ey = oy + 2*(oh+12) + 10
                draw_rect_rounded(self.screen, C["surface2"], (40, ey, W-80, 54), radius=10)
                draw_rect_rounded(self.screen, (0,0,0,0), (40, ey, W-80, 54), radius=10,
                                  border=1, border_color=C["border"])
                draw_text(self.screen, "💡 " + expl, self.f_small, C["muted"],
                          60, ey+10, max_width=W-120)

        # Result flash
        if self.last_result and self.last_result_timer > 0:
            self.last_result_timer -= 1
            alpha = min(255, self.last_result_timer * 5)
            s = pygame.Surface((300, 60), pygame.SRCALPHA)
            col = C["green"] if self.last_result["correct"] else C["red"]
            pygame.draw.rect(s, (*col, min(alpha, 120)), (0,0,300,60), border_radius=12)
            txt_s = self.f_med.render(
                f"{'✓ +' + str(self.last_result['points']) if self.last_result['correct'] else '✗ Neteisingai'}",
                True, (*col, alpha)
            )
            s.blit(txt_s, (150-txt_s.get_width()//2, 18))
            self.screen.blit(s, (W//2-150, 140))

        # Mini leaderboard
        if self.leaderboard_data and self.reveal_data:
            lx, ly = W-200, 80
            lb_bg = pygame.Surface((190, min(len(self.leaderboard_data)*28+20, 180)), pygame.SRCALPHA)
            pygame.draw.rect(lb_bg, (*C["surface"], 200), lb_bg.get_rect(), border_radius=10)
            self.screen.blit(lb_bg, (lx, ly))
            draw_text(self.screen, "🏆 Taip", self.f_small, C["muted"], lx+10, ly+4)
            for j, pl in enumerate(self.leaderboard_data[:5]):
                ply = ly + 24 + j*26
                n_col = C["accent"] if pl["pid"] == self.pid else C["text"]
                draw_text(self.screen, f"{j+1}. {pl['name'][:10]}", self.f_small, n_col, lx+10, ply)
                sc_t = self.f_small.render(str(pl["score"]), True, C["yellow"])
                self.screen.blit(sc_t, (lx+185-sc_t.get_width(), ply))

    def draw_results(self):
        self.draw_bg()
        self.draw_header("Žaidimas baigtas!")

        cy = 80
        title = self.f_large.render("🏆 Rezultatai", True, C["yellow"])
        self.screen.blit(title, (W//2 - title.get_width()//2, cy))
        cy += 60

        for i, pl in enumerate(self.leaderboard_data):
            is_me = pl["pid"] == self.pid
            medals = ["🥇", "🥈", "🥉"]
            medal = medals[i] if i < 3 else f"{i+1}."

            pw = 500
            px = W//2 - pw//2
            bg = (40, 35, 70) if is_me else C["surface"]
            draw_rect_rounded(self.screen, bg, (px, cy, pw, 52), radius=12)
            if is_me:
                draw_rect_rounded(self.screen, (0,0,0,0), (px, cy, pw, 52), radius=12,
                                  border=2, border_color=C["accent"])

            m = self.f_med.render(medal, True, C["yellow"])
            self.screen.blit(m, (px+12, cy+12))
            n_txt = self.f_med.render(pl["name"], True, C["accent"] if is_me else C["text"])
            self.screen.blit(n_txt, (px+60, cy+14))
            sc_t = self.f_large.render(str(pl["score"]), True, C["yellow"])
            self.screen.blit(sc_t, (px+pw-sc_t.get_width()-16, cy+10))
            cy += 64

        # Play again (host)
        if self.is_host:
            self.btn_again.draw(self.screen, self.f_med)

    def draw_chat_overlay(self):
        if not self.show_chat:
            ch = self.f_small.render("💬 C = chat", True, C["muted"])
            self.screen.blit(ch, (20, H-28))
            return

        # Chat panel
        cw, cy_start = 320, H//2
        cx = W - cw - 10
        s = pygame.Surface((cw, H//2+50), pygame.SRCALPHA)
        pygame.draw.rect(s, (*C["surface"], 220), s.get_rect(), border_radius=12)
        self.screen.blit(s, (cx, cy_start-20))

        draw_text(self.screen, "💬 Chat", self.f_small, C["muted"], cx+12, cy_start-14)

        # Messages
        msg_y = cy_start + 8
        for cm in self.chat_msgs[-8:]:
            is_me = cm.get("pid") == self.pid
            col = C["accent"] if is_me else C["text"]
            t = self.f_small.render(f"{cm['name']}: {cm['text'][:28]}", True, col)
            self.screen.blit(t, (cx+8, msg_y))
            msg_y += 20

        self.chat_input.draw(self.screen, self.f_small)

    # ─── EVENTS ───────────────────────────────────────────────────────────
    def handle_events(self):
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                return False
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    if self.show_chat:
                        self.show_chat = False
                    elif self.scene == "menu":
                        return False
                if event.key == pygame.K_c and self.scene in ("game", "lobby", "results"):
                    self.show_chat = not self.show_chat
                if event.key == pygame.K_RETURN and self.show_chat:
                    if self.chat_input.text.strip():
                        self.send({"type": "chat", "text": self.chat_input.text.strip()})
                        self.chat_input.text = ""

            # Input boxes
            if self.scene == "menu":
                self.inp_name.handle(event)
                self.inp_code.handle(event)
                if self.btn_create.handle(event):
                    self._do_create()
                if self.btn_join.handle(event):
                    self._do_join()
                # Connect button
                if event.type == pygame.MOUSEBUTTONDOWN and not self.connected and not self.connecting:
                    if pygame.Rect(W//2-80, 258, 160, 36).collidepoint(event.pos):
                        self.start_connection()

            elif self.scene == "lobby":
                if self.is_host:
                    if self.btn_start.handle(event):
                        self.send({"type": "start_game"})
                    if self.btn_load_pdf.handle(event):
                        self._choose_pdf_context()
                    if self.btn_leave.handle(event):
                        self._leave_room()

            elif self.scene == "game":
                if not self.answer_locked and not self.reveal_data and self.q_data:
                    # Keyboard 1-4
                    if event.type == pygame.KEYDOWN:
                        if event.key == pygame.K_1: self._submit_answer(0)
                        elif event.key == pygame.K_2: self._submit_answer(1)
                        elif event.key == pygame.K_3: self._submit_answer(2)
                        elif event.key == pygame.K_4: self._submit_answer(3)
                    # Mouse click on options
                    if event.type == pygame.MOUSEBUTTONDOWN:
                        oy = 220
                        ow = (W - 100) // 2 - 8
                        oh = 100
                        for i in range(4):
                            col_x = 40 + (i % 2) * (ow + 16)
                            col_y = oy + (i // 2) * (oh + 12)
                            if pygame.Rect(col_x, col_y, ow, oh).collidepoint(event.pos):
                                self._submit_answer(i)

            elif self.scene == "results":
                # Everyone can leave; only host can start again
                if self.btn_leave.handle(event):
                    self._leave_room()
                if self.is_host and self.btn_again.handle(event):
                    self.send({"type": "play_again"})

            if self.show_chat:
                self.chat_input.handle(event)

        return True

    def _do_create(self):
        name = self.inp_name.text.strip() or "Player"
        if not self.connected:
            if not self.connecting:
                self.start_connection()
                pygame.time.wait(500)
            self.error_msg = "Jungiamasi, bandyk dar kartą..."
            return
        print("[CLIENT] Kurti kambarį – sending create_room, connected =", self.connected)
        self.send({"type": "create_room", "name": name})

    def _do_join(self):
        name = self.inp_name.text.strip() or "Player"
        code = self.inp_code.text.strip().upper()
        if not code:
            self.error_msg = "Įvesk kambario kodą!"
            return
        if not self.connected:
            if not self.connecting:
                self.start_connection()
                pygame.time.wait(500)
            self.error_msg = "Jungiamasi, bandyk dar kartą..."
            return
        self.send({"type": "join_room", "code": code, "name": name})

    def _leave_room(self):
        # Inform server and reset local state back to main menu
        self.send({"type": "leave_room"})
        self.scene = "menu"
        self.room_code = None
        self.is_host = False
        self.players = []
        self.q_data = None
        self.reveal_data = None
        self.leaderboard_data = []

    def _choose_pdf_context(self):
        # Only host can set context; guard just in case
        if not self.is_host:
            return
        if not PyPDF2:
            self.notifications.append(Notification("⚠ Reikia įdiegti PyPDF2 (pip install PyPDF2)", C["red"]))
            return
        if tk is None:
            self.notifications.append(Notification("⚠ Failų dialogas nepalaikomas šiame režime", C["red"]))
            return

        # Open a minimal hidden Tk root just for file dialog
        try:
            root = tk.Tk()
            root.withdraw()
            root.attributes("-topmost", True)
            path = filedialog.askopenfilename(
                title="Pasirink PDF failą",
                filetypes=[("PDF files", "*.pdf")]
            )
            root.destroy()
        except Exception as e:
            self.notifications.append(Notification(f"⚠ Nepavyko atidaryti dialogo: {e}", C["red"]))
            return

        if not path:
            return

        try:
            with open(path, "rb") as f:
                reader = PyPDF2.PdfReader(f)
                pages = []
                # Limit length so we don't overflow the AI prompt
                for i, page in enumerate(reader.pages):
                    if i >= 20:  # up to ~20 pages
                        break
                    txt = page.extract_text() or ""
                    pages.append(txt)
                text = "\n\n".join(pages)
        except Exception as e:
            self.notifications.append(Notification(f"⚠ Nepavyko perskaityti PDF: {e}", C["red"]))
            return

        if not text.strip():
            self.notifications.append(Notification("⚠ PDF neturi perskaitomo teksto", C["red"]))
            return

        # Send to server as context
        preview = os.path.basename(path)
        self.notifications.append(Notification(f"📚 Įkelta: {preview}", C["accent3"]))
        self.send({"type": "set_context", "context": text})

    def _submit_answer(self, idx):
        if self.answer_locked or self.reveal_data:
            return
        self.selected_answer = idx
        self.answer_locked = True
        self.send({"type": "answer", "index": idx})

    # ─── MAIN LOOP ────────────────────────────────────────────────────────
    def run(self):
        # Auto-connect on start
        self.start_connection()

        running = True
        while running:
            self.process_messages()
            running = self.handle_events()

            # Draw
            if self.scene == "menu":
                self.draw_menu()
            elif self.scene == "lobby":
                self.draw_lobby()
            elif self.scene == "game":
                self.draw_game()
            elif self.scene == "results":
                self.draw_results()

            # Overlays always on top
            self.draw_particles()
            self.draw_notifications()
            self.draw_chat_overlay()

            pygame.display.flip()
            self.clock.tick(FPS)

        pygame.quit()

# ─── ENTRY ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    if len(sys.argv) > 1:
        SERVER = sys.argv[1]
    GameClient().run()
