# Informe PC4 — Smart Traffic v2.0: Sistema Multiagente para 4 Intersecciones

**Curso:** Sistemas Multiagente / Inteligencia Artificial Aplicada  
**Tema:** Control coordinado de semáforos en una malla 2×2 mediante Q-Learning  
**Entregable:** Notebook de Google Colab (`Smart_Trafic_v2_PC4.ipynb`)

---

## 1. Resumen ejecutivo

Este trabajo extiende el simulador Smart Traffic v2.0 a un escenario de **cuatro intersecciones conectadas en malla 2×2**. Se simplifica el modelo físico de los vehículos a un **autómata celular tipo Nagel–Schreckenberg**, eliminando colisiones por construcción: dos autos nunca pueden ocupar la misma celda. El control de cada semáforo se resuelve con un **sub-agente Q-Learning**, mientras que un **agente central** coordina las cuatro intersecciones mediante una preferencia de fase global que busca generar "olas verdes".

---

## 2. Objetivos

1. Modelar una red de tráfico con 4 intersecciones en malla 2×2.
2. Garantizar que los autos no se atraviesen ni colisionen.
3. Diseñar un sistema multiagente con 4 sub-agentes semáforo y 1 agente coordinador.
4. Entrenar los agentes con Q-Learning online y reportar métricas de desempeño.
5. Visualizar la simulación mediante gráficos estáticos y animación.

---

## 3. Arquitectura del sistema multiagente

### 3.1 Componentes

| Componente | Rol | Tipo de agente |
|---|---|---|
| `Simulador` | Mantiene la red, los autos, los semáforos y las métricas. | Entorno |
| `Intersection` | Semáforo de 2 fases (H = E/W, V = N/S) con tiempo de transición amarillo. | Actuador |
| `AgenteSemaforo` | Uno por intersección. Decide *mantener* o *cambiar* la fase. | Sub-agente Q-Learning |
| `AgenteCentral` | Observa el estado global y elige una preferencia de fase `{H, V}`. | Coordinador Q-Learning |

### 3.2 Coordinación MAPE

El ciclo **Monitor–Analyze–Plan–Execute (MAPE)** se implementa de la siguiente forma:

- **Monitor:** el simulador cuenta autos en cola por eje en cada intersección y a nivel global.
- **Analyze:** cada agente discretiza las colas en *buckets* y forma su estado.
- **Plan:** Q-Learning selecciona la acción con mayor valor Q (con exploración ε-greedy).
- **Execute:** se aplican las acciones a los semáforos y se avanza la física un paso.

El agente central introduce una **señal de coordinación**: cuando una intersección está alineada con la preferencia global, recibe un bono; si no, una penalidad. Esto incentiva que las intersecciones vecinas compartan fase en una misma arteria, reduciendo paradas en cadena.

---

## 4. Modelo de tráfico

### 4.1 Red 2×2

- Nodos de intersección: `I00, I10, I01, I11`.
- Cada intersección tiene 4 bordes externos (`Eij_N`, `Eij_S`, `Eij_E`, `Eij_W`) que sirven de entrada y salida.
- Aristas internas horizontales y verticales, cada una con `CELLS_PER_ARTERY = 35` celdas.
- Los autos nacen en un borde externo aleatorio y eligen un destino externo aleatorio; la ruta se calcula con BFS sobre el grafo no dirigido.

### 4.2 Autómata celular (Nagel–Schreckenberg)

Cada vehículo ocupa una celda y posee velocidad entera `v ∈ [0, VMAX]`. En cada paso se aplican cuatro reglas:

1. **Aceleración:** `v ← min(v + 1, VMAX)`.
2. **Desaceleración por gap:** `v ← min(v, gap)`.
3. **Frenado aleatorio:** con probabilidad `P_SLOW`, `v ← max(v − 1, 0)`.
4. **Movimiento:** `pos ← pos + v`.

Cuando un auto llega a la última celda de una arteria de aproximación, intenta cruzar la intersección. El cruce solo ocurre si:

- el semáforo permite la dirección de salida,
- la primera celda de la arteria siguiente está libre.

De lo contrario, el auto espera en la línea de parada. No existen estados de accidente.

---

## 5. Definición del proceso de decisión markoviano

### 5.1 Sub-agente semáforo

**Estado:**

```
s = (bucket(cola_H), bucket(cola_V),
     fase_actual,
     bucket(cola_vecina_H), bucket(cola_vecina_V),
     preferencia_central)
```

Cada componente se discretiza en 4 *buckets* para las colas y 2 valores para las variables binarias, generando un espacio manejable para Q-Learning tabular.

**Acciones:**

- `0` = mantener fase actual.
- `1` = iniciar cambio de fase (semaforo pasa por amarillo durante `YELLOW_STEPS` pasos).

**Recompensa:**

```
r = −(cola_H + cola_V)
if fase == preferencia_central:
    r += ALIGNMENT_REWARD
else:
    r -= ALIGNMENT_REWARD
```

### 5.2 Agente central

**Estado:**

```
s_c = (bucket(cola_total_H), bucket(cola_total_V), fase_mayoritaria)
```

**Acciones:**

- `0` = preferencia global H.
- `1` = preferencia global V.

**Recompensa:**

```
r_c = −(cola_total_H + cola_total_V)
```

El agente central decide cada `T_COORD = 16` pasos; los sub-agentes deciden cada `T_DECISION = 8` pasos.

### 5.3 Algoritmo Q-Learning

Para cada agente se mantiene una tabla `Q(s, a)` actualizada con:

```
Q(s, a) ← Q(s, a) + α [ r + γ max_a′ Q(s′, a′) − Q(s, a) ]
```

- `α = 0.10` (tasa de aprendizaje)
- `γ = 0.90` (factor de descuento)
- `ε` decae de `1.0` a `0.05` con factor `0.95` por episodio.

La exploración es ε-greedy: con probabilidad `ε` se elige una acción aleatoria.

---

## 6. Implementación en Google Colab

El notebook `Smart_Trafic_v2_PC4.ipynb` contiene todo el código en celdas independientes:

1. **Imports:** `numpy`, `matplotlib`, `IPython.display`.
2. **Configuración:** topología, hiperparámetros y buckets.
3. **Modelo:** clases `Road`, `Car`, `Intersection` y `Simulador`.
4. **Agentes:** `QAgent` y `SpacedQAgent` para decisiones periódicas.
5. **Entrenamiento:** `train_agents()` ejecuta `N_EPISODES = 40` episodios de `MAX_STEPS = 600`.
6. **Métricas:** gráficos de recompensa, throughput, espera promedio y decaimiento de `ε`.
7. **Visualización:** instantánea estática y animación GIF de la simulación.

Para ejecutar en Colab basta con subir el notebook y correr las celdas secuencialmente.

---

## 7. Resultados esperados

Con la semilla fija (`SEED = 42`) se observa:

- **Throughput** creciente a lo largo de los episodios, indicando que los semáforos aprenden a despejar las colas.
- **Recompensa promedio** de los sub-agentes se hace menos negativa conforme `ε` decrece.
- **Espera promedio** por auto se estabiliza; episodios finales muestran menor varianza que los primeros.
- **Decaimiento de ε:** la exploración pasa de 1.0 a valores cercanos a 0.05, permitiendo políticas cada vez más deterministas.

La coordinación central mejora la sincronía de fases en las arterias principales, reduciendo el número de paradas en cadena entre intersecciones adyacentes.

---

## 8. Conclusiones

1. El modelo celular simplifica drásticamente la física y garantiza la ausencia de accidentes, cumpliendo el requisito del trabajo.
2. La descomposición en 4 sub-agentes locales más un coordinador global es una arquitectura multiagente escalable y fácil de explicar.
3. Q-Learning tabular es suficiente para un espacio de estados reducido (buckets) y permite entrenar en minutos dentro de Colab.
4. La señal de alineación del agente central incentiva comportamientos emergentes tipo "ola verde" sin necesidad de programar la sincronía a mano.

---

## 9. Trabajo futuro

- Añadir fase amarillo-realista y tiempos mínimos de verde.
- Probar Deep Q-Network (DQN) para espacios de estado continuos.
- Extender la malla a 3×3 o corredores con más agentes.
- Incluir métricas de emisiones o consumo de combustible a partir de las paradas.

---

## Referencias

- Nagel, K., & Schreckenberg, M. (1992). A cellular automaton model for freeway traffic. *Journal de Physique I*, 2(12), 2221–2229.
- Watkins, C. J., & Dayan, P. (1992). Q-learning. *Machine Learning*, 8(3), 279–292.
- Smart Traffic v2.0 — repositorio base (TypeScript/Pixi.js).
