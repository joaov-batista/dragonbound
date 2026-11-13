# Dragonbound (beta)

> **Versão beta 0.2.** Jogável de ponta a ponta, mas conteúdo, equilíbrio e desempenho em aparelhos reais ainda estão em desenvolvimento.

RPG de ação e exploração 2D em pixel art, feito com **Phaser 4 + TypeScript + Vite**, instalável como **PWA**.
Explore um arquipélago, observe dragões selvagens, conquiste a confiança deles, monte e voe sobre o mar.
Nenhum dragão nasce igual a outro: cada indivíduo tem DNA, aparência, personalidade e memórias próprias.

```bash
npm ci            # instala (Node 20+)
npm run dev       # desenvolvimento em http://localhost:5173
npm run build     # typecheck + build de produção em dist/
npm run preview   # serve dist/
npm test          # testes unitários (vitest)
npm run e2e       # teste de ponta a ponta no Chromium (requer build + Playwright)
npm run assets    # regenera sprites, tilesets, ícones e fonte (public/)
npm run assets:vfx  # reexporta as folhas de efeitos do PixelFx (public/vfx)
```

Adicione `?debug=1` à URL para expor `__game`, `__state`, `__scene`, `__ocean` e `__input` no console.

## Controles padrão

| Ação | Teclado | Controle (padrão Xbox) |
|---|---|---|
| Mover | WASD / setas | analógico esquerdo |
| Pular / bater asas | Espaço | A |
| Atacar | J | X |
| Dash / esquiva | K | B |
| Aparar | L | LB |
| Interagir / acariciar | E | Y |
| Montar / desmontar | R | RT |
| Habilidade do dragão | I | RB |
| Assobiar / chamar | C | D-cima |
| Andar devagar | Shift | LT |
| Oferecer / usar item (segure) | F | D-direita |
| Próximo item | G | D-esquerda |
| Gesto de calma (segure) | H | D-baixo |
| Pausa / mapa | Esc / M | Start / Select |

Tudo é remapeável em **Pausa → Controles**. No celular os controles aparecem ao primeiro toque e podem ser movidos em **Opções**.

## Deploy

Projeto estático: qualquer host serve a pasta `dist/`. `vercel.json` já configura a Vercel (framework Vite, saída `dist`).
Na Cloudflare Pages use build `npm run build` e diretório `dist`.

## Créditos e licenças

- Motor: [Phaser 4](https://phaser.io) (MIT).
- Efeitos visuais: [PixelFx](https://github.com/patch-gg/pixelfx) (MIT, © Patch, © Hugo Duprez) — folhas pré-renderizadas em `public/vfx`.
- Fonte: Jersey 10 (SIL OFL 1.1), rasterizada para bitmap em `public/fonts`.
- Toda a arte restante e todo o áudio são gerados por código neste repositório.

Documentação de desenvolvimento: `docs/PROGRESS.md` e `docs/HANDOFF_OPUS.md`.
