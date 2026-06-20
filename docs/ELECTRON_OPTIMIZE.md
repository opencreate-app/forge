# Por que meu `app.asar` tem ~960 MB e como corrigir isso?

O tamanho elevado do seu `app.asar` ocorre quase certamente porque você está incluindo dependências que **não deveriam estar lá**.

No ecossistema Electron, o `app.asar` deve conter apenas o código da sua aplicação (o que foi compilado pelo Vite) e as dependências listadas em `dependencies` no seu `package.json` que são necessárias em tempo de execução.

Aqui está o diagnóstico do porquê o seu arquivo está com ~960 MB e como corrigir:

### 1. O Principal Suspeito: `node_modules`

Embora você tenha configurado a seção `files` no `electron-builder`, o comportamento padrão de muitos setups de Electron com Vite/Electron-Builder é acabar empacotando a pasta `node_modules` inteira ou partes dela dentro do ASAR.

- **O problema:** `wasm-vips` e `react` são pesados, mas não chegam a 900MB. Se você estiver incluindo `node_modules` desnecessariamente ou se o `electron-builder` estiver entendendo mal o que é "código da aplicação", ele pode estar copiando bibliotecas de desenvolvimento ou artefatos de build.

### 2. Como diagnosticar (O passo mais importante)

Não adivinhe. O Electron fornece uma ferramenta para "espiar" dentro do arquivo ASAR e ver exatamente o que está ocupando espaço.

1. Instale o explorador ASAR globalmente:
   `npm install -g @electron/asar`
2. Liste o conteúdo do seu arquivo:
   `asar list caminho/para/seu/app.asar`
3. **O que procurar:** Procure por pastas como `node_modules`, arquivos de testes, `.map` (source maps), ou pastas de bibliotecas que você não usa em produção.

### 3. Como corrigir o `package.json`

O seu `electron-builder` está configurado para incluir `dist//*` e `dist-electron//*`. Isso está correto, mas o problema pode ser a redundância.

Verifique se você não está com uma estrutura onde o `dist` ou `dist-electron` está clonando a pasta `node_modules` para dentro de si.

**Ajuste recomendado na seção `build`:**

```json
"files": [
  "dist/**/*",
  "dist-electron/**/*",
  "node_modules/**/*",
  "package.json"
],

```

_Nota:_ Se você listar `node_modules` explicitamente, o `electron-builder` tentará incluir todos eles. **O ideal é que o seu bundler (Vite) resolva as dependências e as coloque dentro do `dist`.** Se o Vite estiver configurado corretamente para "bundlear" o código, você **não deve** precisar de `node_modules` no `files`.

### 4. Dicas de Ouro para reduzir o tamanho

- **Source Maps:** Você já tem `!/*.map` no seu `files`, o que é ótimo. Mantenha isso.
- **Wasm-vips:** Bibliotecas WebAssembly (como `wasm-vips`) costumam ser muito grandes. Se elas estiverem sendo copiadas múltiplas vezes ou se as pastas de teste/documentação delas estiverem indo junto, o tamanho explode.
- **Dependências de Desenvolvimento:** Verifique se nenhuma dependência listada em `devDependencies` está sendo importada no seu código `main` ou `preload`. Se for importada, o builder a incluirá obrigatoriamente.
- **Estrutura do Build:** Certifique-se de que o seu `vite.config.ts` está configurado para fazer o _bundle_ das dependências. Se ele estiver configurado como `external`, o Electron tentará puxar a pasta inteira do `node_modules` de cada biblioteca.

### Próximo passo sugerido

Para que eu possa ser mais específico: **Você poderia rodar o comando `asar list` no seu arquivo e me dizer quais são as 3 ou 4 pastas/arquivos que ocupam mais espaço no topo da lista?** Isso vai nos dar o culpado imediato.

---

O problema do seu `app.asar` ser tão grande é que o `electron-builder` está empacotando **a pasta `node_modules` inteira** dentro do seu pacote final.

Pela lista do seu arquivo `asar-list.txt`, podemos ver claramente que milhares de arquivos individuais da biblioteca `lucide-react` (e provavelmente de outras dependências) estão sendo incluídos. Em um build otimizado para produção, o Vite deveria realizar o "tree-shaking" e bundlear apenas o que é estritamente necessário no seu código, sem a necessidade de manter a estrutura de `node_modules` intacta no ASAR.

### Como resolver

#### 1. Ajuste a configuração do `electron-builder`

O seu arquivo `package.json` está instruindo o builder a incluir `dist` e `dist-electron`. Se o seu processo de build já gera os arquivos finais nesses diretórios, você **não deve** incluir a pasta `node_modules` em `files`.

Altere a seção `build` no seu `package.json`:

```json
"build": {
  // ...
  "files": [
    "dist/**/*",
    "dist-electron/**/*",
    "package.json"
    // REMOVA OU COMENTE QUALQUER REFERÊNCIA A node_modules AQUI
  ],
  // ...
}

```

#### 2. Garanta que o Vite bundleie as dependências

Se você remover a pasta `node_modules` do ASAR e o app parar de funcionar, isso significa que seu código não está importando as dependências corretamente ou que elas estão marcadas como "external" no seu bundler.

- No seu `vite.config.ts`, verifique se você não está excluindo dependências importantes do bundle (configuração `rollupOptions.external`).
- O objetivo é que o Vite pegue o código do `lucide-react`, por exemplo, e integre-o diretamente dentro dos seus arquivos `.js` gerados na pasta `dist/`.

#### 3. Verifique dependências de desenvolvimento

O Electron às vezes confunde dependências que você instalou em `devDependencies` mas que estão sendo importadas em arquivos que acabam indo para o `dist` (como o `main.js`).

- Se uma biblioteca estiver em `devDependencies` mas você a usa no código, mova-a para `dependencies` (ou garanta que ela seja incluída no bundle pelo Vite).
- Se algo estiver em `dependencies` mas não for necessário em tempo de execução, mova para `devDependencies` para que o builder não a tente empacotar.

### Resumo do que está acontecendo

O `electron-builder` está agindo de forma "preguiçosa": como a pasta `node_modules` está presente na raiz, ele a copia quase inteira para o ASAR. Como você usa bibliotecas com muitos arquivos pequenos (como ícones individuais em `lucide-react`), isso gera um overhead de sistema de arquivos que aumenta drasticamente o tamanho final, mesmo que o código seja simples.

**Próximo passo:** Remova a `node_modules` da lista de `files` no `package.json` e faça um novo build (`npm run build`). Se o app abrir corretamente, você reduziu o tamanho do seu instalador significativamente.
