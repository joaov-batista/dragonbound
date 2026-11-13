# HANDOFF — Dragonbound (para o próximo modelo/sessão)

Leia este arquivo e `docs/PROGRESS.md`; não é preciso reler o código inteiro. Caminhos são relativos à raiz do projeto.

## 1. Objetivo
RPG de ação e exploração 2D em pixel art, PWA, num arquipélago com dragões selvagens. O diferencial: **cada dragão é um indivíduo** (DNA, aparência, personalidade, medos, gostos, memórias) e precisa ser compreendido e conquistado — não é equipamento. Depois do vínculo: seguir, proteger, montar, voar, atravessar o mar.

## 2. Stack
Phaser 4.2.1 (WebGL, `pixelArt: true`), TypeScript 7 estrito, Vite 8, vite-plugin-pwa (Workbox), Vitest 5, Playwright (e2e), pngjs + opentype.js (ferramentas), PixelFx 0.3.1 (dependência opcional, só para reexportar VFX). Sem assets externos: arte e áudio são gerados por código.

## 3. Arquitetura real
Resolução lógica: **240 px de altura**, largura 320–560 conforme a proporção da tela (`src/main.ts`). Tiles de 16 px.

```
src/
  main.ts                 cria o Phaser.Game, resize, registro do service worker
  core/      constants, events (pub/sub tipado), settings (localStorage), state (GameState: save + caches), hud (quadro compartilhado cena→UI), world (interface World)
  art/       Pix (canvas de pixels sem DOM), themes, tiles, backdrops, props, hero, enemies, ui, runtime (Pix → textura Phaser)
  input/     actions (ações abstratas, bindings, conflitos, rótulos), InputManager (teclado + Gamepad API + toque virtual)
  physics/   TileGrid (colisão/líquidos), Body (AABB cinemático)
  player/    Player (máquina de estados do herói)
  dragons/   genetics/ (types, species, genome) · ai/DragonMind · taming/Bond · rendering/ (DragonPainter, DragonTextures, dragonAnims) · Dragon (entidade) · Flight (montaria) · DragonRecord (dados salvos)
  entities/  Enemy, Interactables (coleta, arbusto, pesca, fogueira, baú, placa, doca, ninho, cachoeira, respiro)
  combat/    Projectiles
  world/     islands/ (IslandBuilder + 3 ilhas autorais) · generation/ (proceduralIsland, archipelago) · ocean/islandTop · Backdrop, IslandView, WeatherFx
  vfx/       VfxManager (pool de sprites PixelFx + partículas)
  audio/     AudioManager (Web Audio sintetizado)
  ui/        kit, TouchControls, Menu
  save/      schema (SaveData, migrações), SaveManager (IndexedDB + fallback)
  scenes/    Boot → Title → Island ⇄ Ocean, com UI em paralelo por cima
tools/       gen-assets.ts, gen-font.ts, gen-vfx.mjs, png.ts, e2e.mjs
tests/       genetics, taming, world, save (+ input)
```
Regras de dependência: `art`, `utils`, `physics`, `dragons/genetics|ai|taming`, `save`, `world/islands|generation` **não importam Phaser** (rodam no Node/Vitest). Entidades recebem um `World` (interface em `core/world.ts`) em vez da cena. Cena → UI passa por `core/hud.ts` e `core/events.ts`.

## 4. Sistemas implementados
Ver a tabela de `docs/PROGRESS.md` (estado + evidência de teste).

## 5. Incompletos / não verificados
- Hardware real, gamepads físicos e áudio: **não testados**.
- Reprodução no jogo (ninho/ovo/filhote), ataque comandado, combo, resgate em queda: implementados, só a lógica de ovos tem teste.
- Sem chefes, narrativa, persistência de inimigos, posição real do barco, zoom de câmera no voo.

## 6. Problemas conhecidos
Lista numerada em `docs/PROGRESS.md`.

## 7. Sprites
- **Gerados no build** (`npm run assets` → `public/`): `sprites/{hero,props,enemies,ocean,ui}.png+json` (atlas JSON-hash do Phaser), `tilesets/<bioma>.png` (16 colunas) + `_sky/_clouds/_far/_mid`, `fonts/jersey.png+xml`, `icons/*`.
- Herói: quadro 48×48, pés em (22,44). Animações e contagens em `src/art/heroAnims.ts` (fonte única para gerador e runtime). Rig paramétrico em `src/art/hero.ts` (`heroPose`).
- Tileset: `MAT` = base de cada material (16 máscaras de vizinhança: UP=1,RIGHT=2,DOWN=4,LEFT=8); `VARIANT_BASE` = miolos; `SPECIAL` = plataformas, ponte, espinhos, doca (`src/art/tiles.ts`).
- **Gerados em runtime**: dragões (um atlas 960×440 por indivíduo, quadro 120×88, pés em (56,82)), ilhas vistas de cima, superfície de água/lava, cachoeira.
- Paleta: `ramp(cor)` cria 5 tons com desvio de matiz (sombra→violeta, luz→amarelo). Contorno escuro único `0x1a1424`.

## 8. Genética (`src/dragons/genetics/`)
- `Genotype`: 30 loci numéricos (alelos 0..1, dominância incompleta = média) + 9 categóricos (cabeça, chifres, asas, cauda, espinhos, padrão, escamas, olhos, morfo; dominância = ordem no pool da espécie; albino/melânico recessivos).
- `expressPhenotype(genes)` é **puro e determinístico**: cores, proporções, módulos, atributos, resistências, personalidade inata, medos, gostos, comidas. Nunca é salvo — é refeito do DNA.
- `createWild(espécie, seed, registry)`: reprodutível; repete com seed derivada se o genoma/UUID já existir ou se a assinatura visual colidir.
- `GeneticRegistry`: conjunto de genomas, ids e assinaturas visuais do save. `breed(mãe, pai, seed, registry)`: um alelo de cada genitor por locus + mutação; nunca clona.
- `stageForAge` / `growthScale`: ovo → filhote → jovem → adulto (dias de jogo; 1 dia = 720 s).
- 6 espécies em `species.ts`: cinzal (fogo), marulho (água), folhasca (natureza), trovisco (tempestade), pedrusco (terra), geadino (gelo).

## 9. IA (`src/dragons/ai/DragonMind.ts`)
Utility AI: a cada ~0,35 s pontua estados (rest, explore, sleep, forage, flee, investigate, defend, approach, play, attack, follow, stay, protect) com os traços efetivos (`inato + drift`), necessidades (fome, energia), medo, confiança e percepção (`Percept`). Há histerese e estados travados (eat, startled, bonding, trapped, downed). Saída: `Intent` (alvo, velocidade, voar?, animação, emote, golpe, vocalização). `Dragon.ts` executa o movimento (solo/ar) e detecta "preso". Dragões a >560 px do jogador só atualizam necessidades 1×/s.

## 10. Domesticação (`src/dragons/taming/Bond.ts`)
Confiança 0–100 e medo 0–100. Estágios: Arisco <15, Desconfiado <35, Curioso <60, Confiante <85, Vinculado. Fontes: presença (correr assusta, parado acalma), observar, comida (favorita/da espécie/neutra/odiada; erva cura), gesto de calma, carinho (cedo demais assusta), assobio (medo de barulho × gosta de música), concha brilhante, respeitar território, libertar da rede, ferir. Tudo passa por coragem, sensibilidade, sociabilidade etc. e vira `Memory` + `drift` de traço. Vínculo: confiança ≥85 e medo <25 → o dragão entra em `bonding`; o jogador fica parado segurando Interagir por 2,5 s (`IslandScene.completeBond`). `obeys()` decide obediência por lealdade, independência, treino, fome.

## 11. Mundo
- `IslandBuilder` (DSL): `profile` → `terrain` → `tunnel/chamber/shaft/blob/notch/pool` → `floodSea` → `dock/platform/bridge/prop/spawn/habitat/wind` → `decorate` → `build`. As 3 ilhas autorais e o gerador procedural usam a mesma DSL.
- `archipelago.ts`: mapa 6400×4400, 3 ilhas fixas + ilhotas determinísticas por chunk de 640 px (`isletInChunk`). `loadIsland(site)` constrói a ilha lateral (uma em memória por vez).
- `GameState.populate` cria a população de cada ilha na primeira visita (determinística por `worldSeed`).

### Camadas de profundidade
`withLanes`/`laneList` (`world/islands/lanes.ts`) geram Fundo/Frente por ilha; `IslandScene` mantém `lanes: Lane[]` (cada uma com grid, `World`, `VfxManager`, `Projectiles`, dragões, inimigos, interações, câmera, névoa e filtro) e `lane` ativa. Getters (`grid`, `dragons`, `enemies`, `vfx`…) apontam para a camada ativa. Objetos novos vão para a câmera em `tagCam`; ao mover algo de camada use `tagTo(obj, cam)`. Troca: `switchLane(±1)`.

## 12. Voo e combate
- `Flight.updateRide`: no chão anda; pulo decola. No ar (modelo "planeio arcade"): solto = mantém altitude/paira, direção = cruzeiro, cima = sobe com fôlego, baixo = mergulho que vira velocidade, inversão freia antes de virar, teto suave por relevo (`ceilingY`), batida de asas, dash reto com rastro e invencibilidade (sem pirueta, a pedido do usuário), mordida, sopro elemental (projétil), zonas de vento, turbulência em tempestade. Resposta aos comandos depende de treino, agilidade, independência.
- Sair pela borda da ilha voando → `OceanScene` em voo. No oceano o voo é top-down (direção + fôlego + vento de cauda).
- Combate do herói em `Player.ts` (retângulo de ataque por quadro, `attackId` evita acerto duplo). `IslandScene.strike` resolve dano entre lados. Hitstop e tremor em `IslandScene`.

Cavaleiro: `placeRider` (Flight.ts) põe o quadril do herói em `Dragon.saddle`, que usa `saddlePoint` com o quadro de animação atual do dragão. Minimapa: cenas escrevem `hud.minimap`; a ilha pinta a textura `mm-island`; `UIScene.drawMinimap` desenha.

## 13. PixelFx
`tools/gen-vfx.mjs` renderiza 44 efeitos para `public/vfx/<chave>.png` + `manifest.json` (quadros, fps, pivô), recortando ao bounding box, limitando a 26 quadros e reduzindo a 66 %. `VfxManager.play(chave, x, y, opts)` usa um pool de sprites ancorados no pivô; one-shots respeitam um orçamento ligado à qualidade. Para adicionar um efeito: inclua em `FX` no script, rode `npm run assets:vfx`, use a chave.

## 14. Controles
`InputManager` expõe `down/pressed/released(ação)` e `axisX/axisY`. Fontes: teclado (`event.code`), Gamepad API (botões/eixos com zona morta e sensibilidade), toque (`setVirtual`, `setVirtualAxis`). Toques e teclas mais curtos que um quadro são retidos. Bindings em `localStorage`. Remapeamento em `ui/Menu.ts` (aba Controles). `TouchControls` tem layout por modo (ground/flight/boat/oceanFlight), editor de arrastar, escala, opacidade e safe-area.

## 15. PWA
`vite.config.ts`: manifest (fullscreen, landscape, ícones), Workbox precache de todo o `dist`, `registerType: 'autoUpdate'` (skipWaiting + clientsClaim; `main.ts` confere a cada 20 min e ao voltar para a aba, salva e recarrega quando um worker novo assume). Saves: IndexedDB `dragonbound/saves/slot1` (fallback localStorage). `SAVE_VERSION` em `core/constants.ts`; migrações em `save/schema.ts`.

## 16. Executar e testar
`npm ci && npm run dev` · `npm run build` · `npm test` · `npm run e2e` (sobe `vite preview` na porta 4188, usa hooks `?debug=1`). Capturas do e2e: `tests/screenshots/`.

## 17. Próximas prioridades
Ver "Próximos passos" em `docs/PROGRESS.md`. Em resumo: aparelhos reais → áudio → arte dos dragões → balanceamento → persistência → conteúdo.
