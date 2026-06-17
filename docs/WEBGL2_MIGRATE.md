# Estratégia de Migração: Canvas 2D para WebGL2 (OpenCreate Forge)

## 1. Motivação

Atualmente, o `ForgeEngine` utiliza `canvas.getContext("2d")`. A renderização tornou-se _CPU-bound_, causando engasgos (stuttering) em projetos grandes. O objetivo é mover a renderização para a GPU com `WebGL2`, utilizando uma arquitetura baseada em `Tiles`, `Mipmaps` e `Resource Management`.

## 2. Arquitetura Proposta: O Fluxo de Dados

A arquitetura deve priorizar a gestão de recursos da GPU para suportar documentos gigantes.

```text
React (UI)
 ↓
Zustand (Estado do Documento & Viewport)
 ↓
ForgeEngine (Orquestrador)
 ↓
Render Scheduler (Debounce via requestAnimationFrame)
 ↓
Tile Manager (Divisão da imagem em pedaços)
 ↓
Texture Manager (LRU Cache: RAM vs VRAM)
 ↓
WebGL2 Renderer (Desenho final)
 ↓
GPU

           ↑
     wasm-vips (Processamento pesado)
     Workers (Offloading)
```

### 2.1. Documento vs Viewport

É crucial que o modelo de dados não dependa do Renderer.

- **Documento:** Camadas, objetos, máscaras, metadados (Independente de WebGL).
- **Viewport:** Zoom, Pan, seleção visual, guias, overlays (Consumido pelo Renderer).

## 3. Plano de Ação em Fases

### Fase 0: Instrumentação e Benchmark

Antes da migração, estabelecer uma linha de base:

- Medir FPS médio e tempo de renderização por frame.
- Medir uso de RAM/VRAM.
- Identificar gargalos (Chrome DevTools Performance/Memory).

### Fase 1: Abstração e Estado (Zustand)

- **Refatorar `ForgeEngine.ts`:** Criar a interface de `Renderer`.
- **Zustand:** Garantir que o estado das camadas e transformações (zoom/pan) esteja totalmente desacoplado da UI.

### Fase 2: Gestão de Recursos (Tiles & Mipmaps)

- **Tile Manager:** Quebrar imagens grandes em tiles (ex: 512x512).
- **Texture Manager:** Implementar política **LRU (Least Recently Used)**. Tiles visíveis ficam na VRAM; distantes na RAM ou descartados.
- **Estratégia de Mipmaps:** Avaliar `gl.generateMipmap()` vs geração manual via `wasm-vips` (qualidade vs memória).

### Fase 3: Implementação WebGL2 (Renderer Puro)

- **Render Loop:** Implementar o padrão `invalidate()` com `requestAnimationFrame` para evitar renderizações redundantes.
- **Sistema de Shaders:** Cada filtro (Brilho, Contraste, Blur) deve ser um shader independente e encadeável.
- **OffscreenCanvas:** Usar para renderização fora da Main Thread e geração de thumbnails.

### Fase 4: Otimização e Workers

- **Offloading:** Mover upload de texturas e manipulação de tiles para Web Workers para garantir 60 FPS na UI.

## 4. Gestão de VRAM e Limites Técnicos

| Recurso              | Estratégia / Limite                                                        |
| :------------------- | :------------------------------------------------------------------------- |
| **VRAM Management**  | Tiles visíveis -> VRAM; Próximos -> Cache quente; Longe -> RAM.            |
| **MAX_TEXTURE_SIZE** | Respeitar o limite da GPU (`gl.getParameter(gl.MAX_TEXTURE_SIZE)`).        |
| **Context Loss**     | Implementar handlers para `webglcontextlost` e recarregar texturas da RAM. |

## 5. Mapeamento para o OpenCreate Forge

| Componente         | Ação                                                       |
| :----------------- | :--------------------------------------------------------- |
| `ForgeEngine`      | Aceitar instâncias de `Renderer`.                          |
| `Render Scheduler` | Controlar o tempo de renderização (evitar jank).           |
| `wasm-vips`        | Redimensionamento, filtros pesados e pré-geração de tiles. |
| `WebGL2`           | Desenho via Quads + Texturas + Shaders Modulares.          |

---

_Nota: A estratégia foca na **gestão de recursos** (Texture/Tile Manager) como o coração da performance, mais do que a simples troca do contexto de desenho._
