# AGENTS.md — Smart Traffic v2.0

Guía rápida para la próxima sesión. Documenta arquitectura, decisiones y comandos.

## Stack
- **Runtime**: Vite + TypeScript (strict) + Pixi.js v8 + D3.js v7 + Web Workers (ES modules)
- **Sin framework UI**: MVC puro, sin React/Vue. DOM directo para dashboard/controles.
- **Build**: `npm run build` (ejecuta `tsc && vite build`)
- **Dev**: `npm run dev`
- **Type-check**: `npm run typecheck` (=`tsc --noEmit`)
- **Tests**: no hay. `npm test` solo hace echo.

## Arquitectura (MVC)
```
src/
├── main.ts                      # Entry point
├── types.ts                     # Interfaces: SimParams, OBB, SnapshotSim, Direccion, Path, EstadoCarro, FaseSemaforo, Metricas, DebugSnapshot...
├── model/
│   ├── SimuladorModel.ts        # Spawn, física IDM, colisiones SAT, semáforo, métricas, grúa
│   └── Carro.ts                 # Clase Carro + CURVAS_BEZIER (8) + LARGO_CURVAS
├── mdp/
│   ├── AgenteMDP.ts             # Solver MDP Value Iteration + memoización (288 estados)
│   └── mdp.worker.ts            # Web Worker entry
├── view/
│   ├── RenderPixi.ts            # Renderer Pixi: asfalto, líneas, flechas, semáforos, autos, grúa
│   ├── DebugOverlay.ts          # Capas de debug (rutas, OBB, trayectorias, grid, gaps, etc.)
│   ├── Dashboard.ts             # Métricas DOM en vivo
│   └── GraficoD3.ts             # Gráfico SVG del historial de espera
├── controller/
│   └── Controller.ts            # Loop rAF, bindings UI, worker, grúa cooldown, velocidades
└── utils/
    ├── sat.ts                   # SAT con margen 2px
    ├── spatialGrid.ts           # Grilla 60×60 para vecinos
    ├── math.ts                  # distancia(), calcularBinomial()
    └── debounce.ts              # Debounce 250ms para recálculo MDP
```

## Geometría derivada (no en el resumen original — ajustable)
Constantes centralizadas en `src/model/Carro.ts` o `src/types.ts`:
- Canvas 800×800, centro de intersección (400,400)
- Ancho de carril: 30px → calzada total 120px
- Caja de intersección: [340, 460] × [340, 460]
- Tránsito por la derecha (Perú):
  - Eastbound (+x): carril 0 y=415 (giro izq), carril 1 y=445 (giro der)
  - Westbound (−x): carril 0 y=385 (giro izq), carril 1 y=355 (giro der)
  - Northbound (−y): carril 0 x=415 (giro izq), carril 1 x=445 (giro der)
  - Southbound (+y): carril 0 x=385 (giro izq), carril 1 x=355 (giro der)
- Líneas de parada: 340 (E-bound y S-bound), 460 (W-bound y N-bound) — donde el centro del auto debe detenerse
- OBB auto: 24×12 px
- SpatialGrid: celdas 60×60
- SAT margen: 2 px

## Parámetros por defecto (sección 8 del resumen)
- spawnH=0.05, spawnV=0.02, turnProb=0.3, promReaccion=0.8, friccion=0.1, imprudencia=0.15
- permitirGiroIzquierda=true, isMDPMode=true
- IDM: aMax=0.08, bDecel=0.15, gapMin=18, tiempoCabeza=0.8, delta=4, maxVel=2.0
- MDP: GAMMA=0.95, COSTO_CAMBIO=6, PENALIZACION_ESPERA=25, PENALIZACION_ACCIDENTE=80, T_DECISION=180

## Reglas del semáforo
- 4 fases: 0=verde-H, 1=amarillo-H, 2=verde-V, 3=amarillo-V
- Amarillo normal: 120 frames (2s @ 60fps)
- **Amarillo inteligente**: el amarillo se **extiende** mientras haya autos (`crossing` o `turning`) dentro de la caja de intersección; tope máximo `AMARILLO_MAX_DURACION=360` frames (6s) para evitar deadlock
- Verde→amarillo: bloqueado si hay autos en la caja (`hayAutosEnCaja` reemplazó a `hayAutosGirandoEnEje`, que solo protegía giros)
- Amarillo→verde-perpendicular: solo cambia si la caja está vacía o expiró el tope máximo
- Giros izquierda ceden al tráfico oncoming (`hayConflictoInterseccion`)

## Estado del MDP
- Tupla (bh, bv, fase, eh, ev): 6 buckets × 6 × 2 × 2 × 2 = 288 estados
- Acciones: mantener / cambiar
- Reward: −25×espera − 6×cambio − 80×accidente
- Memoización: 24 entradas vs 70k recálculos
- Cálculo en Web Worker con debounce 250ms

## Modo debug (NUEVO en esta build)
Toggle en UI con capas individuales:
- Rutas/Bézier, OBB, Trayectoria activa, SpatialGrid, Líneas de parada + zonas conflicto, Vectores velocidad, Gap+líder, Estado semáforo/MDP

## Fixes incluidos en esta build (issues #1-3 del resumen)
1. `buscarLiderCruzado`: proyecta sobre eje de viaje del auto para distinguir delante/detrás (no euclidiana pura)
2. Spawn stagger: pequeño delay aleatorio entre las 4 direcciones para evitar bursts
3. Distracción: además de resetear `timerReaccion`, multiplica `gapPercibido × 1.5` durante 30 frames

## Fixes incluidos en esta build (issue #4 — amarillo inteligente)
1. Nueva función `hayAutosEnCaja(eje)` que verifica autos en estado `crossing` O `turning` dentro de la caja
2. `actualizarSemaforo()` extiende el amarillo hasta despejar la caja (tope 360 frames = 6s)
3. `aplicarAccionSemaforo()` ahora usa `hayAutosEnCaja` en vez de `hayAutosGirandoEnEje` (protege también autos rectos)
4. Constante `AMARILLO_MAX_DURACION = 360` en `types.ts`
5. Fix de cache en `hayConflictoInterseccion()`: los `return true` ahora guardan `cacheConflicto = true`

## Fuera de esta build (próximas sesiones)
- Cambio de carril (sección 5 del resumen)
- Tests unitarios (IDM, SAT, AgenteMDP)
- Peatones, multi-carril 3+, modo debug ampliado, semáforo adaptativo online

## Notas para edición
- **NO agregar comentarios** salvo que se pida explícitamente
- Estilo: sin React/Vue, DOM directo, Pixi v8 (WebGL), D3 v7 (SVG)
- `buscarLider` usa array ordenado por pos descendente → líder = autos[i-1]
- `ultimoAngulo` se preserva al chocar (los autos no rotan al accidentarse)
