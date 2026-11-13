# PROGRESS

Última atualização: sessão 3 (Vigiamar, história, chefes e atualização automática).

## Versão 0.2 beta (sessão 2)
- Voo: a pirueta foi removida; **dash** em linha reta (ilha e mar) com rastro, invencibilidade breve e custo de fôlego.
- **Minimapa** no canto superior direito: arquipélago no mar (ilhas descobertas; principais não visitadas como "?"; seta com rumo) e perfil do terreno na ilha (docas, fogueiras, posição).
- **Cavaleiro**: pose sentada nova, sela no dragão e encaixe calculado pelo rig de cada indivíduo (`saddlePoint` em `DragonPainter.ts`); cavaleiro detalhado na vista de cima.
- **Tela inicial** refeita: interface fixa (a câmera andava e empurrava os botões para fora), fundo só com céu, nuvens e dragões gerados na hora voando em três profundidades.
- Rótulos de **beta** no título, menu Sistema, página e README.
- **Voo lateral refeito** (`Flight.updateRide`): direcional solto = mantém altitude e paira; direção = cruzeiro; cima = sobe (fôlego); baixo = mergulho que vira velocidade; inverter a direção freia até zero antes de virar. Batida de asa acompanha o esforço (rápida ao subir/pairar, lenta planando, recolhida no mergulho), inclinação segue a trajetória. **Teto suave relativo ao relevo** (`ceilingY(w, x)`: ~10 tiles acima do chão mais alto num raio de 18 tiles) para o chão nunca sumir da tela. Nuvens no céu da ilha (algumas na frente) e rastros de vento dão sensação de velocidade.
- **Voo no mar**: sprite de cima maior (células 80 px), 6 quadros de batida + quadro de asas recolhidas; inclinação nas curvas; altitude com sombra que se afasta/aproxima; dash vira rasante com respingos e esteira; nuvens altas com parallax passando por cima do dragão; rastros na direção do voo.

## Camadas de profundidade (sessão 2)
- Cada ilha tem 3 camadas no mesmo lugar: **Fundo** (-1), **Trilha** (0, a ilha autoral) e **Frente** (+1). Fundo e Frente são gerados de forma determinística a partir do relevo da Trilha (`src/world/islands/lanes.ts`): mesma costa e nível do mar, relevo próprio (planaltos/caverna e ruínas no fundo; praia, brejo com poças e plataformas na frente), recursos, baú, relíquia, fogueira, inimigos e **habitats de outras espécies**.
- Navegação: **Q** (fundo) / **Z** (frente), analógico direito no controle, dois botões no toque. Funciona a pé e montado; o dragão montado e o companheiro que segue vão junto. Se a outra camada tiver rocha no ponto, a troca é bloqueada (procura até 4 tiles acima).
- Render: uma câmera por camada (+ céu atrás e sobreposição à frente). Cada objeto pertence a uma câmera via `cameraFilter` (`IslandScene.tagTo`; novos objetos herdam a camada em `tagCam`). Profundidade relativa `d` → zoom `1.6^d`, deslocamento vertical, névoa e `ColorMatrix` por câmera (fundo dessaturado, frente em silhueta escura). Transição animada.
- Simulação: os dragões das outras camadas continuam vivos (andam, dormem, comem), mas não percebem o jogador; inimigos fora da camada ativa ficam parados. Dano nunca atravessa camadas.
- Save: `player.lane`, `checkpoint.lane`, `DragonRecord.lane` (opcionais; ausente = 0). HUD: indicador de camada sob o minimapa; minimapa por camada.
- Custo: 5 câmeras e 2 filtros ativos. ~54 fps no Chromium headless com GL por software; **não medido em celular**.

## Vigiamar e a história (sessão 3)
- **Vila de Vigiamar** em Alvamar: Salão Principal no alto da praça, ferraria, estábulo, cais e mercado com bancas. NPCs com rigs próprios (`src/art/people.ts`, `src/entities/Npc.ts`) e diálogos por página.
- **Missões** (`src/story/story.ts`): principais *Boas-vindas a Vigiamar*, *O dragão na rede*, *Rastros dos Caçadores* e *O Gigante Acorrentado*; secundárias *Brasa para a forja*, *Peixe para o mercado*, *Os três segredos de Vigiamar* e *Cuidar de um dragão*. Missão rastreada no HUD; flags salvas em `save.story`.
- **Mercado** (`src/ui/Shop.ts`): comprar e vender itens com moedas.
- **Vilões:** os Caçadores de Escama da Capitã Varga Ferro-Rubro. **Chefes** (`src/entities/Boss.ts`): Bruto Garra-de-Ferro (duas fases, com reforços) e o Gigante Acorrentado (correntes presas em âncoras que precisam ser quebradas antes de libertar o alfa), com a arena fechada durante a luta. Varga aparece em cena.
- Abertura com o Velho Tor; três segredos escondidos pela vila.
- Camadas laterais ignoram ilhotas flutuantes ao copiar o relevo (antes, viravam paredes altas no Fundo e na Frente); ganchos por ilha (`laneHooks`) reservam espaço para o conteúdo autoral.

## Atualização automática (sessão 3)
- O service worker usa `registerType: 'autoUpdate'` com `skipWaiting` e `clientsClaim`. Depois de um deploy, o app instalado (celular ou desktop) baixa a versão nova em segundo plano. Ele confere ao abrir, ao voltar para a aba e a cada 20 min, salva o jogo e recarrega uma vez. **Não é preciso reinstalar o app.**
- `vercel.json` manda `sw.js`, `index.html`, o manifest e `registerSW.js` sem cache, para a checagem sempre ver o deploy novo. Os assets com hash continuam com cache imutável.
- No primeiro acesso a página não recarrega: só quando um worker novo substitui um antigo.

## Fase atual
Fases 1–8 do plano têm implementação jogável. O projeto está em **polimento e aprofundamento** (ver "Próximos passos").

## Concluído e testado
Testado = coberto por `npm test` (34 testes unitários) e/ou `npm run e2e` (39 verificações no Chromium headless).

| Sistema | Estado | Evidência |
|---|---|---|
| Stack Phaser 4.2.1 + TS estrito + Vite 8 + PWA | pronto | build, e2e |
| Pipeline de arte procedural (herói, tiles ×3 biomas, fundos, props, inimigos, UI, ícones, fonte) | pronto | `npm run assets` |
| Protagonista: correr, pular (coyote/buffer/altura variável), parede, dash, combo de 3, ataque aéreo, aparar, nado, dano/morte | pronto | e2e |
| Física própria em grade (AABB, plataformas de mão única, degraus, líquidos, perigos) | pronto | unit + e2e |
| 3 ilhas autorais (Alvamar, Monte Brasaviva, Agulhas do Trovão) | pronto | unit + e2e |
| Ilhotas procedurais por seed + arquipélago em chunks | pronto | unit + e2e |
| DNA diplóide, fenótipo, unicidade, reprodução com mutação, crescimento | pronto | unit |
| Pintor modular de dragões a partir do DNA (lado e topo) | pronto | e2e (capturas) |
| IA por utilidade com personalidade, necessidades, memória e deriva de traços | pronto | unit + e2e |
| Domesticação (observar, alimentar, gesto, carinho, território, libertar, ritual de vínculo) | pronto | unit + e2e |
| Companheiro: seguir/esperar, proteger, ataque comandado, combo, resgate em queda | implementado | seguir testado no e2e; o resto só manualmente no headless |
| Montaria e voo lateral (decolar, planar, mergulhar, bater asas, rolar, sopro, vento) | pronto | e2e |
| Oceano top-down: barco, correntes, vento, tempestade, criaturas, recifes, caixotes, voo | pronto | e2e (navegação, desembarque, voo) |
| Inimigos (5 tipos) e projéteis | pronto | e2e (combate) |
| PixelFx: 44 efeitos pré-renderizados, pool, orçamento por qualidade | pronto | e2e (sem erros) |
| Entrada: teclado, Gamepad API, toque multitouch; remapeamento com conflitos | pronto | unit + e2e (teclado/toque). **Gamepad físico não testado** |
| HUD, menus (itens, dragões, mapa, opções, controles, sistema), título | pronto | e2e |
| Save em IndexedDB com versão + migração, exportar/importar | pronto | unit + e2e |
| PWA: manifest, service worker, precache, offline, atualização automática | pronto | e2e (registro, cache, boot offline) |
| Áudio sintetizado (SFX, vozes, ambiente, música generativa) com 5 volumes | implementado | **não verificado por ouvido** (headless não tem áudio) |
| Ovos e filhotes (ninho → ovo → eclosão) | implementado | lógica em unit; fluxo no jogo não exercitado no e2e |

## Deploy
- Produção: https://dragonbound-bice.vercel.app (projeto Vercel `dragonbound`, equipe joaov-batistas-projects).
- O app GitHub da Vercel ainda **não tem acesso** a este repositório, então pushes não disparam build sozinhos.
  O deploy atual foi feito enviando `dist/` pela API da Vercel. Para ativar deploy automático: Vercel → Settings → Git
  (ou GitHub → Settings → Applications → Vercel → incluir `dragonbound`). O `vercel.json` já configura o build.

## Resultados de teste (sessão 1)
- `npm test`: 38/38 (sessão 3).
- `npm run e2e`: 43/43 (sessão 3; inclui altitude em voo e troca de camadas; a abertura do Tor é pulada no teste). Capturas em `tests/screenshots/` (geradas a cada execução; não versionadas).
- Desempenho: ~57 fps no Chromium headless com GL por software, 7 entidades. **Isso não representa aparelhos reais**; nenhum dispositivo físico foi medido.

## Problemas conhecidos
1. Nada foi testado em hardware real (iPhone, Android, controles físicos). Safe-area e toque foram validados só por emulação.
2. Áudio nunca foi ouvido: volumes e timbres precisam de ajuste humano.
3. A arte dos dragões é funcional e variada, mas pequena e com silhueta simples; asas dobradas parecem uma "tenda". É o maior ganho visual disponível.
4. Palmeiras e pinheiros procedurais são os props mais fracos.
5. Inimigos reaparecem ao reentrar na ilha (não há persistência de mortes).
6. O barco "acompanha" o jogador de forma abstrata: toda doca oferece um barco.
7. Zoom de câmera no voo foi desativado (objetos com scrollFactor 0 não acompanham o zoom).
8. Limite de 30 fps usa `game.loop.setFPSLimit`; não medido em aparelho.
9. Efeitos do PixelFx foram reduzidos a 66% com vizinho-mais-próximo para casar com a densidade de pixels do jogo; alguns perdem detalhe fino.
10. A narrativa cobre só Vigiamar e o Monte Brasaviva; as outras ilhas ainda não têm história.
11. Atualização automática validada só no build local (registro e precache); a troca de versão depois de um deploy real na Vercel não foi observada em aparelho.

## Próximos passos (ordem sugerida)
1. Testar em iPhone/Android reais e com gamepads; ajustar toque, safe-area e desempenho.
2. Ouvir e balancear o áudio.
3. Melhorar a arte dos dragões (poses, asas, mais quadros) e dos props fracos.
4. Balancear domesticação e combate jogando do início ao fim.
5. Persistir estado de inimigos/recursos por ilha; barco com posição real.
6. Conteúdo: chefes, narrativa dos Fragmentos, mais espécies e habilidades combinadas.
