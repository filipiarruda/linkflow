# LinkFlow

> CRM local para organizar contatos, oportunidades e follow-ups durante sua navegação no LinkedIn.

LinkFlow é uma extensão Chrome focada em preservar o contexto profissional de cada contato. Os dados permanecem no navegador do usuário: não há backend, analytics ou telemetria.

## Recursos

- Captura assistida do perfil aberto, com preenchimento de nome, cargo, empresa e URL.
- Cadastro, edição, busca e filtros de contatos.
- Status de relacionamento, contexto e histórico de interações.
- Oportunidades vinculadas aos contatos, dashboard e quadro Kanban.
- Follow-ups por data.
- Exportação e importação de backup em JSON.
- Registro local de uma conexão confirmada, sem enviar convites, mensagens ou executar automações.

## Privacidade e uso responsável

LinkFlow não lê cookies, tokens ou mensagens privadas, e não coleta nem transmite dados para servidores próprios. As informações são armazenadas somente no IndexedDB do navegador.

O usuário é responsável por utilizar a extensão em conformidade com os termos do LinkedIn, a legislação aplicável e os direitos das pessoas cujos dados registra. LinkFlow não é afiliado, endossado ou patrocinado pelo LinkedIn.

## Desenvolvimento

Requisitos: Node.js 20 ou superior e npm.

```bash
npm install
npm run dev
```

## Build e instalação local

```bash
npm run build
```

1. Abra `chrome://extensions`.
2. Ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta `dist` gerada pelo build.
5. Abra um perfil em `linkedin.com/in/...` e use o ícone do LinkFlow.

Depois de alterar o código, execute o build novamente e clique em **Recarregar** no cartão da extensão.

## Estrutura

```text
src/pages/       Interface do popup e dashboard
src/linkedin/    Integração local com a página de perfil
src/db/          Persistência IndexedDB com Dexie
public/          Manifesto e ícones da extensão
```

## Licença

O código é distribuído sob a licença [Apache-2.0](LICENSE). A marca LinkFlow, seus nomes e elementos de identidade visual não são concedidos por essa licença.
