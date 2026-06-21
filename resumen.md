Smart Traffic — Resumen completo del proyecto (actualizado)

1. Visión general
Simulador 2D de una intersección real (Av. Javier Prado × Arequipa, Lima) con:
- Control semafórico inteligente basado en MDP (Markov Decision Process) con Value Iteration
- Física de autos realista con IDM (Intelligent Driver Model)
- Detección de colisiones con SAT (Separating Axis Theorem) + SpatialGrid
- Renderizado con Pixi.js v8 (WebGL) y gráfico de métricas con D3.js v7
- Cálculo del MDP en Web Worker para no bloquear la UI
- Arquitectura MVC en TypeScript + Vite, sin React/Vue

Intersección de 800×800px, 4 direcciones (E/W/N/S), 2 carriles por sentido, con giros a izquierda/derecha vía curvas Bézier.

2. Arquitectura
src/
├── main.ts                    # Entry point, instancia todo
├── types.ts                   # Interfaces: SimParams, OBB, SnapshotSim, Direccion, Path, etc.
├── model/
│   ├── SimuladorModel.ts      # Modelo principal: spawn, física, colisiones, semáforo, métricas
│   └── Carro.ts               # Clase Carro + CURVAS_BEZIER (8 curvas) + LARGO_CURVAS (precomputado)
├── mdp/
│   ├── AgenteMDP.ts           # Solver MDP con Value Iteration + memoización
│   └── mdp.worker.ts          # Web Worker entry
├── view/
│   ├── RenderPixi.ts          # Renderer Pixi.js: asfalto, líneas, flechas de giro, semáforos, autos, grúa
│   ├── Dashboard.ts           # Métricas DOM en vivo
│   └── GraficoD3.ts           # Gráfico SVG del historial de espera
├── controller/
│   └── Controller.ts          # Loop principal, bindings UI, worker, grúa con cooldown
└── utils/
    ├── sat.ts                 # SAT con margen 2px
    ├── spatialGrid.ts         # Grilla 60×60 para vecinos
    ├── math.ts                # distancia(), calcularBinomial()
    └── debounce.ts            # Debounce 250ms para recálculo MDP

3. Características actuales

Semáforo y control
- 4 fases: 0=verde-H, 1=amarillo-H, 2=verde-V, 3=amarillo-V
- Duración amarillo: 120 frames (2s)
- MDP con estado (bh, bv, fase, eh, ev) — 6 buckets × 6 × 2 × 2 × 2 = 288 estados
- Acciones: mantener / cambiar
- Recompensa: penaliza espera (25), cambio de fase (6), accidentes (80)
- Modo alternativo: heurística por umbrales (colaV > colaH + 3)
- No cambia de fase si hay autos girando en el eje verde (fix Fase 1)

Física de autos (IDM)
- aMax=0.08, bDecel=0.15, gapMin=18, tiempoCabeza=0.8, delta=4, maxVelocidad=2.0
- Ruido por imprudencia: gapPercibido = gap × (1 ± imprudencia×0.3)
- Líder inmediatamente delante (fix crítico: ahora autos[i-1] en vez de "el más adelantado del carril")
- Semáforo amarillo = deceleración progresiva (no solo parar/continuar)
- Dilema amarillo: si está a <30px y va rápido, continúa
- Línea de parada: centro del auto en la línea → termina recorrido
- Frenado de emergencia: P = 0.70 + (1-imprudencia)×0.30, accel -0.5 (vs -0.3 normal), puede fallar
- Hard stop: 5px contra autos móviles, 8px contra accidentados
- Reset de reacción cuando líder frena (lider.velocidad < c.velocidad - 0.3)
- Reacción humana: latenciaReaccion = promReaccion × 60 ± desvío individual

Carriles y giros
- 2 carriles por sentido, fijos desde el spawn (sin lane change todavía — ver sección 5)
- Carril 0 → giro izquierda (si permitirGiroIzquierda) o straight
- Carril 1 → giro derecha o straight
- 8 curvas Bézier predefinidas (left ~160px, right ~16px)
- Toggle para deshabilitar giros a la izquierda (checkbox en UI)
- Detección de sentido contrario para giros izquierda (oncoming traffic cede)
- Resolución de deadlock: prioridadGiro 50/50 al entrar a turning
- Flechas de giro pintadas en el asfalto (recta + curva)

Colisiones
- OBB (Oriented Bounding Box) 24×12px por auto
- SAT con margen 2px, 4 ejes a probar
- SpatialGrid 60×60 compartido por frame
- Accidente: ambos autos → accidentado, velocidad=0, bloquean la vía hasta Reset o grúa
- ultimoAngulo preservado (no rotan al chocar)

Conducción defensiva / errores humanos
- Distracciones fortuitas: prob imprudencia × 0.001 por frame, 30 frames sin reaccionar + gap percibido ×1.5
- Imprudencia contabilizada: cruzar en amarillo/rojo con velocidad > 0.5 → métrica totalImprudencias++
- correLuzDecidido: decisión de pasarse el rojo se toma una sola vez por auto

Grúa (remover accidentados)
- Click sobre auto accidentado → removerAccidentado(id)
- Cooldown de 2s entre remociones
- Métrica totalRemovidosGrua en dashboard

UI y métricas
- Sliders: spawn H/V, probabilidad de giro, tiempo de reacción, fricción, imprudencia
- Toggle: permitir giros a la izquierda
- Botones: Pausar, Reiniciar, Step, Forzar Semáforo, Reset Métricas
- Velocidad de simulación: 0.5x / 1x / 2x / 5x
- Modo: MDP vs Heurística
- Métricas en vivo: autos salientes, espera total/promedio, cola máxima, accidentes, removidos por grúa, imprudencias
- Estado del agente MDP: tupla (bh, bv, fase, eh, ev) y acción actual
- Gráfico D3 del historial de espera acumulada (50 puntos)
- Overlay "Recalculando..." durante recálculo del MDP

4. Mejoras implementadas (historial)

Antes de esta sesión
- Refactor Nivel C: MVC + Web Worker + Pixi.js + D3.js
- Fix de 8 curvas Bézier (endpoints incorrectos causaban conducción en sentido contrario y teleporting)
- Sistema de colisiones SAT + SpatialGrid
- Memoización del MDP (24 entradas vs 70k recálculos)
- Debounce 250ms en sliders que disparan recálculo
- Flecha direccional triangular en el techo (naranja, parpadeante)

En la sesión anterior
 1. Toggle giros izquierda: permitirGiroIzquierda en SimParams + checkbox + binding
 2. Fix semáforo no cambia con autos girando: hayAutosGirandoEnEje()
 3. Fix conflicto sentido contrario para giros izquierda en hayConflictoInterseccion
 4. Fix bug buscarLider: líder inmediatamente delante (O(1) con array ordenado)
 5. Semáforo amarillo = deceleración progresiva (antes solo pasaba/paraba)
 6. Línea de parada con centro del auto + contabilización de imprudencias
 7. Frenado de emergencia con probabilidad híbrida 0.70 + (1-imprudencia)×0.30
 8. Reset timerReaccion cuando líder frena
 9. Hard stop contra accidentados (umbral 8px vs 5px)
10. Spawn check con longitud (pos < 35 + longitud)
11. Flechas de giro en el asfalto (RenderPixi)
12. Grúa con click + cooldown 2s (RenderPixi + Controller + Dashboard)
13. Métricas nuevas: removidos por grúa, imprudencias
14. Resolución de deadlock en giros izquierda: prioridadGiro 50/50
15. Errores fortuitos: distracciones con probabilidad baja
16. Optimización: caché de autos cercanos a intersección por frame, SpatialGrid compartido
17. Fix regresivo: límite superior < 80 en reacción al semáforo (había causado que no spawneen autos con rojo)

5. Próxima mejora priorizada: Cambio de carril

Por qué esta es la siguiente
De todas las mejoras sugeridas (cambio de carril, peatones, multi-carril, tipos de vehículo, lluvia/niebla, RL online, modo debug, coordinación de red), cambio de carril tiene la mejor relación esfuerzo/impacto:

- **Infraestructura ya existe**: los autos tienen `pos`, carril fijo, SpatialGrid para detectar vecinos en ambos carriles, e IDM para calcular gaps — no hay que construir sistemas nuevos.
- **Contenida en 2 archivos**: la lógica vive casi enteramente en `Carro.ts` (transición lateral) y `SimuladorModel.ts` (criterio de decisión + chequeo de gap en destino), sin tocar Pixi, D3, ni el MDP.
- **Alto impacto en realismo**: agrega comportamiento emergente (autos esquivando autos lentos) que cambia visiblemente la dinámica del tráfico, a diferencia de features como lluvia/niebla que son solo multiplicadores de parámetros existentes.
- **Bajo riesgo**: no toca geometría base (curvas Bézier, intersección) como sí lo haría multi-carril, ni requiere un subsistema nuevo como peatones.

Comparación rápida con las alternativas
| Mejora | Esfuerzo | Impacto | Riesgo de romper algo |
|---|---|---|---|
| Cambio de carril | Bajo-medio | Alto | Bajo |
| Peatones | Alto | Alto | Medio |
| Multi-carril (3+) | Alto | Medio | Alto (toca geometría) |
| RL online | Muy alto | Incierto | Medio |
| Tipos de vehículo | Bajo | Bajo-medio | Bajo |
| Lluvia/niebla | Muy bajo | Bajo | Muy bajo |

Esbozo de implementación sugerido
1. Criterio de decisión: durante `approaching` (no en `turning` ni cerca de la intersección), si el carril vecino tiene mayor gap libre adelante (calculado con SpatialGrid) que el carril actual, marcar intención de cambio.
2. Chequeo de seguridad: verificar gap suficiente también detrás en el carril destino (no cortar a otro auto).
3. Transición lateral: en vez de una curva Bézier nueva, usar un lerp del offset lateral (perpendicular a la dirección de viaje) durante N frames, similar a como ya se maneja el offset de carril actual.
4. Cooldown por auto: evitar que el mismo auto cambie de carril repetidamente (zigzag) — similar al cooldown que ya tiene la grúa.
5. Métrica nueva opcional: totalCambiosDeCarril en el dashboard.

6. Mejoras sugeridas (resto, sin priorizar aún)

Física y conducción
- Pare/Yield: semáforos con reglas de 4 vías (stop signs) como modo alternativo
- Peatones: cruces peatonales que bloquean giros cuando hay peatones
- Carril de giro dedicado: separar carril 0 solo para izquierda, carril 1 solo para derecha/recto
- Multi-carril (3+): agregar tercer carril para avenidas más anchas
- Tipos de vehículo: buses/camiones con mayor longitud y menor aceleración
- Lluvia/niebla: reducir maxVelocidad y aumentar tiempoCabeza globalmente

Semáforo y MDP
- Semáforo adaptativo en tiempo real: recalcular política MDP cada N segundos con estado actual
- Detector de presencia: sensores inductivos que alimentan el estado del MDP
- Prioridad de transporte público: dar verde prolongado si hay un bus acercándose
- Coordinación de red: múltiples intersecciones con MDP jerárquico
- Aprendizaje por refuerzo online: Q-learning en vez de Value Iteration offline

UI y visualización
- Modo debug: mostrar OBBs, gaps, vectores de velocidad, zonas de conflicto
- Heatmap de accidentes: registrar dónde ocurren más accidentes
- Replay / grabación: guardar y reproducir simulaciones
- Comparación lado a lado: MDP vs heurística en simultáneo
- Gráfico de throughput: autos/minuto además de espera
- Tema claro/oscuro: toggle de estilo

Robustez
- Tests unitarios: no hay tests actualmente (npm test solo hace echo) — recomendado priorizar funciones puras (IDM, SAT, AgenteMDP) antes de agregar cambio de carril, para tener red de seguridad ante el nuevo código
- AGENTS.md / README actualizado: documentar arquitectura y decisiones
- Validación de parámetros: clampear valores extremos en sliders
- Persistencia: guardar configuración en localStorage

7. Posibles mejoras técnicas (optimización)
| Área | Estado actual |
|---|---|
| buscarLiderCruzado | O(vecinos) con SpatialGrid |
| hayConflictoInterseccion | Caché por frame |
| MDP Value Iteration | Memoización + Worker |
| Render Pixi | Batched Graphics |
| actualizarVehiculos | O(N) por dirección |
| Snapshot serialization | Copia manual de campos |

Issues conocidos pendientes (por prioridad)
1. **buscarLiderCruzado distancia euclidiana**: no distingue "delante" vs "detrás" dentro de la intersección — un auto detrás también cuenta como líder cruzado. Bug real, no mejora futura — recomendado arreglar antes de sumar cambio de carril, ya que ambos tocan lógica de detección de vecinos.
2. **Spawn en el mismo frame**: los 4 crearVehiculo pueden spawnear todos a la vez si dan Math.random() bajo, generando un burst. Fix simple: stagger con pequeño delay aleatorio entre direcciones.
3. **Distracción no afecta gapPercibido en IDM**: solo resetea timerReaccion, no multiplica el gap (el plan original lo incluía pero la implementación actual solo resetea el timer).
4. **Accidentados acumulados**: sin grúa, bloquean para siempre hasta Reset (intencional, pero la grúa ya lo mitiga).

8. Cómo transferir a otra sesión

Información esencial
1. Stack: Vite + TypeScript + Pixi.js v8 + D3.js v7 + Web Workers (sin React/Vue)
2. Comando de build: npm run build (ejecuta tsc && vite build)
3. Comando de dev: npm run dev
4. Type-check: npx tsc --noEmit
5. No hay tests: npm test solo hace echo
6. Arquitectura MVC: model/ (SimuladorModel, Carro), view/ (RenderPixi, Dashboard, GraficoD3), controller/ (Controller), mdp/ (AgenteMDP + worker), utils/ (sat, spatialGrid, math, debounce)

Archivos clave para leer primero
- src/types.ts — todas las interfaces y tipos
- src/model/SimuladorModel.ts — el corazón de la simulación (~740 líneas)
- src/model/Carro.ts — clase Carro + curvas Bézier
- src/mdp/AgenteMDP.ts — solver MDP
- src/controller/Controller.ts — loop principal y bindings

Decisiones de diseño importantes
- Los accidentes no se previenen artificialmente: el MDP aprende a minimizarlos vía penalización
- imprudencia controla errores humanos (pasarse rojo, no ceder, distracciones)
- El semáforo espera a los autos que están girando antes de cambiar de fase
- Los giros izquierda ceden el paso al tráfico opuesto (oncoming)
- La grúa tiene cooldown de 2s para evitar remociones accidentales
- buscarLider usa el array ordenado por pos descendente → líder = autos[i-1]

Parámetros por defecto
- spawnH=0.05, spawnV=0.02, turnProb=0.3, promReaccion=0.8, friccion=0.1, imprudencia=0.15
- permitirGiroIzquierda=true, isMDPMode=true
- IDM: aMax=0.08, bDecel=0.15, gapMin=18, tiempoCabeza=0.8, delta=4, maxVel=2.0
- MDP: GAMMA=0.95, COSTO_CAMBIO=6, PENALIZACION_ESPERA=25, PENALIZACION_ACCIDENTE=80, T_DECISION=180

Resumen del handoff
Proyecto: simulador de intersección con MDP + IDM + colisiones SAT. MVC en TypeScript/Vite/Pixi.js. Recientemente se añadieron: toggle de giros izquierda, frenado de emergencia, semáforo amarillo progresivo, grúa para remover accidentados, flechas de giro en asfalto, resolución de deadlock en giros, distracciones fortuitas, optimización con SpatialGrid compartido y caché de intersección.

Build OK con npm run build.

Próximo paso priorizado: **cambio de carril** (mejor relación esfuerzo/impacto de las mejoras sugeridas — ver sección 5 para esbozo de implementación). Antes de eso, conviene arreglar buscarLiderCruzado (issue #1 de la sección 7) ya que comparte lógica de detección de vecinos con el cambio de carril.

Pasos sugeridos después: tests unitarios de funciones puras (IDM, SAT, AgenteMDP), peatones, modo debug visual, semáforo adaptativo online.