# PROGRESS

Última atualização: sessão 1 (construção da base).

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
| PWA: manifest, service worker, precache, offline, aviso de atualização | pronto | e2e (registro, cache, boot offline) |
| Áudio sintetizado (SFX, vozes, ambiente, música generativa) com 5 volumes | implementado | **não verificado por ouvido** (headless não tem áudio) |
| Ovos e filhotes (ninho → ovo → eclosão) | implementado | lógica em unit; fluxo no jogo não exercitado no e2e |

## Deploy
- Produção: https://dragonbound-bice.vercel.app (projeto Vercel `dragonbound`, equipe joaov-batistas-projects).
- O app GitHub da Vercel ainda **não tem acesso** a este repositório, então pushes não disparam build sozinhos.
  O deploy atual foi feito enviando `dist/` pela API da Vercel. Para ativar deploy automático: Vercel → Settings → Git
  (ou GitHub → Settings → Applications → Vercel → incluir `dragonbound`). O `vercel.json` já configura o build.

## Resultados de teste (sessão 1)
- `npm test`: 34/34.
- `npm run e2e`: 39/39. Capturas em `tests/screenshots/` (geradas a cada execução; não versionadas).
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
10. Chefes e narrativa não existem ainda.

## Próximos passos (ordem sugerida)
1. Testar em iPhone/Android reais e com gamepads; ajustar toque, safe-area e desempenho.
2. Ouvir e balancear o áudio.
3. Melhorar a arte dos dragões (poses, asas, mais quadros) e dos props fracos.
4. Balancear domesticação e combate jogando do início ao fim.
5. Persistir estado de inimigos/recursos por ilha; barco com posição real.
6. Conteúdo: chefes, narrativa dos Fragmentos, mais espécies e habilidades combinadas.
