# PROGRESS

Última atualização: sessão 3 (Vigiamar, história, chefes, atualização automática, grupo de dragões e imersão de voo).

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

## Grupo de dragões (sessão 3)
- Vários dragões vinculados podem seguir o jogador ao mesmo tempo. O limite vai de 1 a 6 (padrão 3) e fica em **Opções → Dragões seguindo (máx.)**. Se o limite baixar, os excedentes ficam guardados onde estão.
- **Menu Dragões:** confirmar num dragão vinculado abre as ações:
  - **Principal:** vira a montaria e passa a viajar ao seu lado.
  - **Seguir / Chamar:** um dragão guardado em outra ilha "ouve o chamado" e chega voando.
  - **Esperar:** fica parado até você assobiar.
  - **Guardar:** para de seguir e vive a própria vida (come, explora, dorme) onde está, ainda vinculado.
  - **Libertar:** desfaz o vínculo (pede confirmação). O dragão volta ao modo selvagem, com confiança 45 e a lembrança de ter sido libertado.
- O grupo viaja junto: troca de camada, saída para o mar, chegada em outra ilha (chega voando ao lado da montaria), atende ao assobio e ataca quando você manda. No mar aberto, os companheiros voam em **formação em V** atrás da montaria; de barco, circulam no alto.
- Quando um vínculo novo passa do limite, o dragão fica guardado e um aviso explica.
- Dados: `DragonRecord.kept`; helpers em `GameState` (`party`, `callBack`, `keep`, `release`, `enforceParty`); evento `partyChanged`. Testes em `tests/party.test.ts`.

## Imersão de voo (sessão 3)
- A câmera afasta com a velocidade (até ~13%, mais no mergulho e no dash), trepida no voo rasante e no mergulho rápido, e sobe um pouco a cada batida de asa.
- Vinheta escura nas bordas em alta velocidade.
- **Atravessar nuvens** enche a tela de névoa e deixa um rastro de gotículas.
- **Voo rasante** (perto do chão ou da água, rápido) levanta poeira, ou spray e respingos na água, com som de vento.
- No mar, a câmera aproxima das ondas no mergulho, com vinheta em velocidade máxima.
- **Opções → Câmera de voo dinâmica** (0/50/100%) desliga ou suaviza tudo isso. O tremor também respeita a opção "Tremor de tela".

## Combate com dragões (sessão 3)
Os golpes ficam em `src/dragons/DragonCombat.ts` e valem para a montaria e para os dragões vinculados que lutam sozinhos.
- **Atacar (J):** combo de garra, depois corte, depois um golpe final. No chão o final é uma **rabada** (onda de choque dos dois lados, arremessa). No ar é um **tapa voando**: o dragão gira e acerta tudo em volta. O dragão avança sozinho até o inimigo mais próximo, então é fácil acertar.
- **Habilidade (I):**
  - Toque rápido: **tiro elemental** com rastro, que mira sozinho no inimigo mais próximo à frente.
  - Segurar e soltar: **bola de poder**. A energia converge para a boca e, ao soltar, a bola explode em área com o efeito do elemento (explosão de fogo, onda de água, folhas, trovão, espinhos de terra, nova de gelo). O tamanho e o dano crescem com a carga.
- **Impacto:** cada acerto tem pausa de impacto, tremor, faíscas na cor do elemento e repulsão forte. A bola de poder ainda dá um clarão na tela.
- **Dragões do grupo:** além do combo corpo a corpo, atiram enquanto se aproximam e às vezes soltam bolas de poder.

## Tela mais limpa (sessão 3)
- A missão mostra só o título. O detalhe aparece por alguns segundos quando a missão muda, e o rastreador some durante voo e chefes.
- As moedas só aparecem quando mudam e na loja.
- O painel do dragão em foco some quando você está montado.
- No máximo dois avisos na tela, mais curtos e sem repetição. O aviso de troca de camada saiu (o minimapa já mostra a camada).
- Saques viram texto flutuante no lugar, em vez de aviso.
- Os moradores falam bem menos.

## Batalhas aéreas e mecânicas únicas (sessão 3)
- **Força aérea dos Caçadores** (`src/entities/AirForce.ts`, arte em `src/art/airforce.ts`):
  - **Planadores:** caçadores pendurados em asas de couro e osso. Mantêm distância, disparam arpões e às vezes mergulham em rasante. Abatidos, caem em espiral soltando fumaça e explodem.
  - **Balão de Guerra:** fortaleza voadora com barra de chefe. Dispara bolas de canhão em arco, solta bombas em quem passa por baixo e lança planadores. Abatido, explode em cadeia, cai em chamas e a câmera acompanha a queda. Rende 40 a 60 moedas e não volta naquele dia.
  - Aparece em Alvamar (só depois do Bruto), Brasaviva e Trovão, sempre que você voa por perto. Só luta contra quem está no ar.
- **Esquadrões:** em voos longos, grupos de 2 ou 3 planadores atacam (com intervalo de 26 a 44 s).
- **Montado, você leva dano:** tiros e investidas atingem a montaria e tiram corações.
- **Esquiva perfeita:** dar o dash no último instante faz o golpe errar. Ativa câmera lenta, um clarão ciano e um **contra-ataque** de 1,8 s com dano em dobro, além de encher a Fúria.
- **Reações elementais:** um acerto de elemento marca o inimigo. Um segundo elemento diferente, em até 4 s, dispara uma reação com explosão em área e o nome flutuando:
  - fogo + natureza: Incêndio
  - fogo + água: Vapor (atordoa)
  - fogo + gelo: Choque térmico
  - água + tempestade: Eletrocução (em cadeia)
  - água + gelo: Congelado
  - fogo + tempestade: Plasma
  - gelo + tempestade: Granizo
  - água + natureza: Florescer (cura)
  - terra + qualquer outro: Estilhaços (arremessa)

  O ambiente também marca: inimigo jogado no mar fica molhado, e na lava fica em chamas. Funciona melhor com um bando de elementos variados.
- **Fúria do Vínculo:** uma barra no HUD (na cor do elemento, sem texto) que enche com acertos, abates, reações, esquivas perfeitas e balões derrubados. Cheia e montado, **Aparar (L)** solta o golpe final do elemento: pausa de impacto, câmera lenta e zoom, varredura que cobre a tela inteira e golpes em todos os inimigos à vista.
  - Fogo: chuva de meteoros
  - Água: maremoto
  - Tempestade: raios em cadeia
  - Gelo: nevasca que congela
  - Terra: cataclismo que arremessa
  - Natureza: ira da floresta, que também cura
- Inimigos abatidos por dragões explodem.

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
- `npm test`: 39/39 (sessão 3).
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
