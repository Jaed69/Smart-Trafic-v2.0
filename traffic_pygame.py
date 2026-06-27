"""
Smart Traffic v2.0 — PC4 — Simulacion en tiempo real con pygame.

Ejecutar localmente (NO en Colab):
    pip install pygame numpy
    python traffic_pygame.py

Controles:
    ESPACIO  -> pausar / reanudar
    R        -> resetear simulacion
    T        -> reentrenar agentes
    M        -> cambiar modo (agentes entrenados / fases aleatorias)
    F1       -> mostrar/ocultar informacion
    ESC      -> salir
"""
import random
import sys
from collections import defaultdict, deque
from typing import List, Tuple, Dict, Optional

import numpy as np
import pygame

# ============================================================
# Configuracion
# ============================================================
SEED = 42
random.seed(SEED)
np.random.seed(SEED)

N_INTER_X = 2
N_INTER_Y = 2
CELLS_PER_ARTERY = 35
VMAX = 5
P_SLOW = 0.15
SPAWN_RATE = 0.25

MAX_STEPS = 600
N_EPISODES = 40
T_DECISION = 8
T_COORD = 16
YELLOW_STEPS = 3

ALPHA = 0.10
GAMMA = 0.90
EPSILON_START = 1.0
EPSILON_END = 0.05
EPSILON_DECAY = 0.95
ALIGNMENT_REWARD = 5.0

BUCKETS = [0, 2, 5, 999]

# Rendering
WIN_W, WIN_H = 900, 700
MARGIN_X = 120
MARGIN_Y_TOP = 90
MARGIN_Y_BOT = 90
DRAW_LEN = 1.5  # cuantas unidades dibujar fuera de interseccion (accesos)
FPS = 60
SIM_STEPS_PER_FRAME = 3  # pasos de simulacion por frame para mayor velocidad


# ============================================================
# Helpers
# ============================================================
def bucket(q: int) -> int:
    for i, b in enumerate(BUCKETS):
        if q <= b:
            return i
    return len(BUCKETS) - 1


def is_intersection(n: str) -> bool:
    return n.startswith("I")


def ij(node: str):
    return int(node[1]), int(node[2])


def dir_between(frm: str, to: str) -> str:
    if is_intersection(frm) and is_intersection(to):
        x1, y1 = ij(frm); x2, y2 = ij(to)
        if x2 == x1 + 1: return "E"
        if x2 == x1 - 1: return "W"
        if y2 == y1 + 1: return "S"
        if y2 == y1 - 1: return "N"
    if is_intersection(frm):
        return to[-1]
    return {"N": "S", "S": "N", "E": "W", "W": "E"}[frm[-1]]


# ============================================================
# Modelo
# ============================================================
class Road:
    def __init__(self, frm, to, direction, length):
        self.frm = frm
        self.to = to
        self.direction = direction
        self.length = length
        self.cells: List[Optional[Car]] = [None] * length

    def gap_ahead(self, pos):
        g = 0
        for k in range(pos + 1, self.length):
            if self.cells[k] is not None:
                break
            g += 1
        return g


class Car:
    _counter = 0

    def __init__(self, route):
        Car._counter += 1
        self.id = Car._counter
        self.route = route
        self.leg = 0
        self.pos = 0
        self.v = 0
        self.wait = 0
        self.moved = False
        self.done = False


class Intersection:
    def __init__(self, name):
        self.name = name
        self.phase = "H"
        self.yellow = 0

    def is_green(self, direction):
        if self.yellow > 0:
            return False
        return direction in ("E", "W") if self.phase == "H" else direction in ("N", "S")

    def apply_action(self, action):
        if self.yellow > 0:
            self.yellow -= 1
            if self.yellow == 0:
                self.phase = "V" if self.phase == "H" else "H"
            return
        if action == 1:
            self.yellow = YELLOW_STEPS


class Simulador:
    def __init__(self):
        self.intersections: Dict[str, Intersection] = {}
        self.roads: Dict[Tuple[str, str], Road] = {}
        self.cars: List[Car] = []
        self.sources: List[str] = []
        self.sinks: List[str] = []
        self.step_count = 0
        self.metrics = {"throughput": 0, "total_wait": 0}
        self._build_network()

    def _build_network(self):
        for i in range(N_INTER_X):
            for j in range(N_INTER_Y):
                name = f"I{i}{j}"
                self.intersections[name] = Intersection(name)
        for j in range(N_INTER_Y):
            for i in range(N_INTER_X - 1):
                a, b = f"I{i}{j}", f"I{i+1}{j}"
                self.roads[(a, b)] = Road(a, b, "E", CELLS_PER_ARTERY)
                self.roads[(b, a)] = Road(b, a, "W", CELLS_PER_ARTERY)
        for i in range(N_INTER_X):
            for j in range(N_INTER_Y - 1):
                a, b = f"I{i}{j}", f"I{i}{j+1}"
                self.roads[(a, b)] = Road(a, b, "S", CELLS_PER_ARTERY)
                self.roads[(b, a)] = Road(b, a, "N", CELLS_PER_ARTERY)
        for name in self.intersections:
            i, j = ij(name)
            for d in ["N", "S", "E", "W"]:
                ext = f"E{i}{j}_{d}"
                self.sources.append(ext)
                self.sinks.append(ext)
                inc_dir = {"N": "S", "S": "N", "E": "W", "W": "E"}[d]
                self.roads[(ext, name)] = Road(ext, name, inc_dir, CELLS_PER_ARTERY)
                self.roads[(name, ext)] = Road(name, ext, d, CELLS_PER_ARTERY)

    def reset(self):
        self.cars = []
        self.step_count = 0
        for r in self.roads.values():
            r.cells = [None] * r.length
        for inter in self.intersections.values():
            inter.phase = "H"
            inter.yellow = 0
        self.metrics = {"throughput": 0, "total_wait": 0}
        Car._counter = 0

    def shortest_path(self, src, dst):
        if src == dst:
            return [src]
        q = deque([(src, [src])])
        visited = {src}
        while q:
            node, path = q.popleft()
            for (a, b) in self.roads:
                if a == node and b not in visited:
                    visited.add(b)
                    npath = path + [b]
                    if b == dst:
                        return npath
                    q.append((b, npath))
        return [src, dst]

    def spawn(self):
        for src in self.sources:
            if random.random() >= SPAWN_RATE:
                continue
            dst = random.choice(self.sinks)
            if dst == src:
                continue
            route = self.shortest_path(src, dst)
            if len(route) < 2:
                continue
            road = self.roads[(route[0], route[1])]
            if road.cells[0] is not None:
                continue
            car = Car(route)
            road.cells[0] = car
            self.cars.append(car)

    def queues(self, inter):
        qH = qV = 0
        for (a, b), road in self.roads.items():
            if b != inter.name:
                continue
            for k in range(max(0, road.length - 3), road.length):
                car = road.cells[k]
                if car is not None and car.v == 0:
                    if road.direction in ("E", "W"):
                        qH += 1
                    else:
                        qV += 1
        return qH, qV

    def total_queue(self):
        return sum(qH + qV for inter in self.intersections.values()
                   for qH, qV in [self.queues(inter)])

    def neighbor_queues(self, inter):
        x, y = ij(inter.name)
        nH = nV = 0
        count = 0
        for name in self.intersections:
            if name == inter.name:
                continue
            x2, y2 = ij(name)
            if x2 == x or y2 == y:
                qh, qv = self.queues(self.intersections[name])
                nH += qh; nV += qv; count += 1
        if count == 0:
            return 0, 0
        return nH // count, nV // count

    def state_sub(self, inter, preferred):
        qH, qV = self.queues(inter)
        nH, nV = self.neighbor_queues(inter)
        return (bucket(qH), bucket(qV),
                0 if inter.phase == "H" else 1,
                bucket(nH), bucket(nV),
                0 if preferred == "H" else 1)

    def state_central(self):
        totalH = totalV = 0
        h_count = v_count = 0
        for inter in self.intersections.values():
            qh, qv = self.queues(inter)
            totalH += qh; totalV += qv
            if inter.phase == "H": h_count += 1
            else: v_count += 1
        majority = 0 if h_count >= v_count else 1
        return (bucket(totalH), bucket(totalV), majority)

    def apply_actions(self, actions):
        for name, inter in self.intersections.items():
            inter.apply_action(actions.get(name, 0))

    def _resolve_crossing(self, car, road):
        inter_name = road.to
        if not is_intersection(inter_name):
            road.cells[car.pos] = None
            car.done = True
            self.metrics["throughput"] += 1
            self.metrics["total_wait"] += car.wait
            return
        inter = self.intersections[inter_name]
        next_node = car.route[car.leg + 2]
        out_dir = dir_between(inter_name, next_node)
        if not inter.is_green(out_dir):
            car.v = 0
            return
        next_road = self.roads[(inter_name, next_node)]
        if next_road.cells[0] is not None:
            car.v = 0
            return
        road.cells[car.pos] = None
        next_road.cells[0] = car
        car.pos = 0
        car.leg += 1
        car.moved = True

    def step_physics(self):
        for car in self.cars:
            car.moved = False
        for road in self.roads.values():
            for pos in range(road.length - 1, -1, -1):
                car = road.cells[pos]
                if car is None or car.moved or car.done:
                    continue
                if car.pos == road.length - 1:
                    self._resolve_crossing(car, road)
                    if not car.moved:
                        car.v = 0
                        car.moved = True
                        car.wait += 1
                    continue
                car.v = min(car.v + 1, VMAX)
                gap = road.gap_ahead(car.pos)
                car.v = min(car.v, gap)
                if random.random() < P_SLOW and car.v > 0:
                    car.v -= 1
                new_pos = car.pos + car.v
                if new_pos >= road.length:
                    self._resolve_crossing(car, road)
                else:
                    road.cells[car.pos] = None
                    road.cells[new_pos] = car
                    car.pos = new_pos
                    car.moved = True
                if car.v == 0:
                    car.wait += 1
        self.cars = [c for c in self.cars if not c.done]
        self.step_count += 1


# ============================================================
# Agentes
# ============================================================
class QAgent:
    def __init__(self, actions, alpha=ALPHA, gamma=GAMMA, eps=EPSILON_START):
        self.Q = defaultdict(float)
        self.actions = actions
        self.alpha = alpha
        self.gamma = gamma
        self.epsilon = eps

    def act(self, state):
        if random.random() < self.epsilon:
            return random.choice(self.actions)
        qs = [self.Q[(state, a)] for a in self.actions]
        m = max(qs)
        best = [a for a, q in zip(self.actions, qs) if q == m]
        return random.choice(best)

    def update(self, state, action, reward, next_state, done):
        key = (state, action)
        if done:
            target = reward
        else:
            target = reward + self.gamma * max(self.Q[(next_state, a)] for a in self.actions)
        self.Q[key] += self.alpha * (target - self.Q[key])

    def decay(self, factor=EPSILON_DECAY):
        self.epsilon = max(EPSILON_END, self.epsilon * factor)


class SpacedQAgent(QAgent):
    def __init__(self, actions, period):
        super().__init__(actions)
        self.period = period
        self.pending = None
        self.acc_reward = 0.0

    def should_decide(self, step):
        return step % self.period == 0

    def decide(self, state):
        action = self.act(state)
        self.pending = (state, action)
        self.acc_reward = 0.0
        return action

    def finish_period(self, next_state, done):
        if self.pending is None:
            return
        s, a = self.pending
        self.update(s, a, self.acc_reward, next_state, done)
        self.pending = None

    def add_reward(self, r):
        self.acc_reward += r


def train_agents(sim, n_episodes=N_EPISODES, max_steps=MAX_STEPS, verbose=True):
    sub_agents = {name: SpacedQAgent([0, 1], T_DECISION) for name in sim.intersections}
    central = SpacedQAgent([0, 1], T_COORD)
    preferred_phase = "H"
    for ep in range(n_episodes):
        sim.reset()
        for step in range(max_steps):
            sim.spawn()
            if central.should_decide(step):
                if central.pending is not None:
                    ep_reward_central_tmp = central.acc_reward
                    central.finish_period(sim.state_central(), step == max_steps - 1)
                action_c = central.decide(sim.state_central())
                preferred_phase = "H" if action_c == 0 else "V"
            actions = {}
            for name, inter in sim.intersections.items():
                agent = sub_agents[name]
                if agent.should_decide(step):
                    if agent.pending is not None:
                        agent.finish_period(sim.state_sub(inter, preferred_phase),
                                           step == max_steps - 1)
                    actions[name] = agent.decide(sim.state_sub(inter, preferred_phase))
                else:
                    actions[name] = 0
            sim.apply_actions(actions)
            sim.step_physics()
            central.add_reward(-sim.total_queue())
            for name, inter in sim.intersections.items():
                qh, qv = sim.queues(inter)
                r = -(qh + qv)
                if inter.phase == preferred_phase:
                    r += ALIGNMENT_REWARD
                else:
                    r -= ALIGNMENT_REWARD
                sub_agents[name].add_reward(r)
        for name, inter in sim.intersections.items():
            agent = sub_agents[name]
            if agent.pending is not None:
                agent.finish_period(sim.state_sub(inter, preferred_phase), True)
        if central.pending is not None:
            central.finish_period(sim.state_central(), True)
        for agent in sub_agents.values():
            agent.decay(EPSILON_DECAY)
        central.decay(EPSILON_DECAY)
        if verbose and (ep + 1) % 5 == 0:
            print(f"  episodio {ep+1}/{n_episodes} entrenado", flush=True)
    return sub_agents, central


# ============================================================
# Coordenadas para dibujar
# ============================================================
def coords(node):
    if is_intersection(node):
        x, y = ij(node)
        return x * 2.0, y * 2.0
    x, y = ij(node[:-2])
    d = node[-1]
    if d == "N": return x * 2.0, y * 2.0 + 1.5
    if d == "S": return x * 2.0, y * 2.0 - 1.5
    if d == "E": return x * 2.0 + 1.5, y * 2.0
    if d == "W": return x * 2.0 - 1.5, y * 2.0


def to_screen(x, y):
    # rango de x,y: de -1.5..3.5 (4 unidades), y类似
    span_x = (N_INTER_X - 1) * 2 + 2 * DRAW_LEN  # 4
    span_y = (N_INTER_Y - 1) * 2 + 2 * DRAW_LEN  # 4
    min_x = -DRAW_LEN
    max_y = (N_INTER_Y - 1) * 2 + DRAW_LEN  # 3.5
    sx = MARGIN_X + (x - min_x) / span_x * (WIN_W - 2 * MARGIN_X)
    sy = MARGIN_Y_TOP + (max_y - y) / span_y * (WIN_H - MARGIN_Y_TOP - MARGIN_Y_BOT)
    return int(sx), int(sy)


# ============================================================
# Render
# ============================================================
def draw_world(sim, screen, fonts, paused, use_agents, show_info,
               sub_agents=None, central=None, preferred_phase="H"):
    screen.fill((24, 24, 28))

    # Arterias
    for road in sim.roads.values():
        x1, y1 = coords(road.frm)
        x2, y2 = coords(road.to)
        sx1, sy1 = to_screen(x1, y1)
        sx2, sy2 = to_screen(x2, y2)
        pygame.draw.line(screen, (60, 60, 66), (sx1, sy1), (sx2, sy2), 5)

    # Intersecciones + semaforos
    for name, inter in sim.intersections.items():
        x, y = coords(name)
        sx, sy = to_screen(x, y)
        pygame.draw.circle(screen, (180, 180, 185), (sx, sy), 22)
        # luz horizontal
        col_h = (34, 220, 60) if inter.is_green("E") else (220, 40, 40)
        pygame.draw.circle(screen, col_h, (sx + 9, sy), 6)
        # luz vertical
        col_v = (34, 220, 60) if inter.is_green("N") else (220, 40, 40)
        pygame.draw.circle(screen, col_v, (sx, sy - 9), 6)

    # Autos
    car_radius = 5
    for road in sim.roads.values():
        x1, y1 = coords(road.frm)
        x2, y2 = coords(road.to)
        sx1, sy1 = to_screen(x1, y1)
        sx2, sy2 = to_screen(x2, y2)
        for k, car in enumerate(road.cells):
            if car is None:
                continue
            t = k / max(1, road.length - 1)
            cx = x1 + t * (x2 - x1)
            cy = y1 + t * (y2 - y1)
            sx, sy = to_screen(cx, cy)
            col = (220, 90, 90) if road.direction in ("E", "W") else (90, 130, 240)
            pygame.draw.circle(screen, col, (sx, sy), car_radius)

    # HUD
    title = fonts["title"].render("Smart Traffic v2.0 — PC4 (tiempo real)", True, (230, 230, 230))
    screen.blit(title, (20, 20))

    info_lines = [
        f"Paso: {sim.step_count}",
        f"Autos activos: {len(sim.cars)}",
        f"Throughput: {sim.metrics['throughput']}",
        f"Cola total: {sim.total_queue()}",
        f"Modo: {'agentes Q-Learning' if use_agents else 'fases aleatorias'}",
        f"Preferencia central: {preferred_phase}",
        f"Pausado: {'SI' if paused else 'no'}",
    ]
    if show_info:
        y = 55
        for line in info_lines:
            txt = fonts["info"].render(line, True, (190, 190, 190))
            screen.blit(txt, (WIN_W - 260, y))
            y += 22

    help_txt = fonts["info"].render(
        "ESPACIO pausa | R reset | T reentrenar | M modo | F1 info | ESC salir",
        True, (140, 140, 140))
    screen.blit(help_txt, (20, WIN_H - 30))


# ============================================================
# Main loop
# ============================================================
def main():
    random.seed(SEED)
    np.random.seed(SEED)

    sim = Simulador()
    print("Entrenando agentes (puede tardar unos segundos)...", flush=True)
    sub_agents, central = train_agents(sim, n_episodes=N_EPISODES, max_steps=MAX_STEPS)
    print("Entrenamiento finalizado.", flush=True)

    sim.reset()
    paused = False
    use_agents = True
    show_info = True
    preferred_phase = "H"
    decision_counter = 0

    pygame.init()
    screen = pygame.display.set_mode((WIN_W, WIN_H))
    pygame.display.set_caption("Smart Traffic v2.0 — PC4")
    clock = pygame.time.Clock()
    fonts = {
        "title": pygame.font.SysFont("consolas", 22, bold=True),
        "info": pygame.font.SysFont("consolas", 16),
    }

    running = True
    while running:
        for ev in pygame.event.get():
            if ev.type == pygame.QUIT:
                running = False
            elif ev.type == pygame.KEYDOWN:
                if ev.key == pygame.K_ESCAPE:
                    running = False
                elif ev.key == pygame.K_SPACE:
                    paused = not paused
                elif ev.key == pygame.K_r:
                    sim.reset()
                    print("Simulacion reseteada.", flush=True)
                elif ev.key == pygame.K_t:
                    print("Reentrenando...", flush=True)
                    sub_agents, central = train_agents(sim, n_episodes=N_EPISODES,
                                                       max_steps=MAX_STEPS)
                    sim.reset()
                    print("Reentrenamiento finalizado.", flush=True)
                elif ev.key == pygame.K_m:
                    use_agents = not use_agents
                    print(f"Modo: {'agentes' if use_agents else 'aleatorio'}", flush=True)
                elif ev.key == pygame.K_F1:
                    show_info = not show_info

        if not paused:
            for _ in range(SIM_STEPS_PER_FRAME):
                sim.spawn()
                if use_agents:
                    if decision_counter % T_COORD == 0:
                        preferred_phase = "H" if central.act(sim.state_central()) == 0 else "V"
                    actions = {}
                    for name, inter in sim.intersections.items():
                        if decision_counter % T_DECISION == 0:
                            actions[name] = sub_agents[name].act(
                                sim.state_sub(inter, preferred_phase))
                        else:
                            actions[name] = 0
                    sim.apply_actions(actions)
                else:
                    # Modo aleatorio: cambiar fase con prob baja
                    actions = {}
                    for name, inter in sim.intersections.items():
                        actions[name] = 1 if random.random() < 0.01 else 0
                    sim.apply_actions(actions)
                sim.step_physics()
                decision_counter += 1

        draw_world(sim, screen, fonts, paused, use_agents, show_info,
                   sub_agents, central, preferred_phase)
        pygame.display.flip()
        clock.tick(FPS)

    pygame.quit()
    sys.exit(0)


if __name__ == "__main__":
    main()