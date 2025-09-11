# twilio-account-migrate-cli

CLI para migrar Flows do Twilio Studio e preparar migração de outros serviços entre contas.

## Requisitos
- Node.js 18+
- Credenciais Twilio (origem e destino)

## Configuração
1. Copie `.env.example` para `.env` e preencha ou deixe a CLI solicitar.
2. Instale dependências:
   ```sh
   npm install
   ```

## Uso
- Build: `npm run build`
- Start: `npm start`
- Dev: `npm run dev`
- Lint: `npm run lint`
- Format: `npm run format`
- Test: `npm test`

Fluxo principal:
1. Valida/env solicita credenciais.
2. Busca dados das contas (TaskRouter, Serverless, Content Templates, Studio Flows) e salva em `data/`.
3. Gera de-para de SIDs em `data/mapping/sid-mapping.json`.
4. Pergunta quais Flows do Studio migrar.
5. Cria os inexistentes na conta destino e atualiza mapeamento.
6. Atualiza/cria os demais, fazendo replace de SIDs no JSON do flow.

## Observações
- O replace de SIDs considera TaskRouter (workflows, queues, activities, channels) e Serverless (services, environments, functions). Expanda conforme necessário.
