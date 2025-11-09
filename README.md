# Bravus Barbearia — Instruções para Cloud Functions, Stripe e Admin

Este README descreve como instalar, testar e fazer o deploy das Firebase Cloud Functions que foram adicionadas como exemplos para: expirar trials, endpoints de checkout (placeholder) e webhook (placeholder). Também contém orientações sobre como usar o painel admin e o gerenciador de trial no frontend.

IMPORTANTE: os endpoints de Stripe incluídos neste repositório são exemplos e placeholders — NÃO utilize em produção sem validar webhooks e proteger as rotas.

## Estrutura relevante

- `functions/` — código das Firebase Functions (Node 18). Contém `index.js` e `package.json`.
- `js/billing.js` — frontend para iniciar/encerrar trials e simular assinatura.
- `js/admin.js` — painel admin que lista trials ativos e permite promover ou encerrar trials.
- `js/firestore.js` — helpers `startTrial`, `endTrial`, `promoteToPremium`.

## Pré-requisitos

- Node 18+ (as Functions usam engine `node:18`).
- Firebase CLI instalado e logado (`npm install -g firebase-tools`).
- Projeto do Firebase criado e configurado (Firestore, Auth, Functions). 
- (Opcional) Stripe account para integração real.

## Instalar dependências (Functions)

Abra um terminal PowerShell no diretório do projeto e instale as dependências das Functions (se ainda não o fez):

```powershell
cd C:\Users\DELL\Desktop\bravus-barbearia\functions
npm install
```

Observação: o registro de terminal indica que `npm install` foi executado com sucesso neste diretório.

Se você ver o erro "The functions emulator is configured but there is no functions source directory", verifique:

1. Que existe uma pasta `functions` na raiz do projeto (neste repositório ela existe com `index.js` e `package.json`).
2. Que o `firebase.json` aponta para `functions` (o repositório agora inclui um `firebase.json`).
3. Que você tenha definido o Project ID: edite `.firebaserc` e substitua `<YOUR_PROJECT_ID>` pelo seu Project ID, ou execute:

```powershell
firebase use --add
```

Após configurar o projeto, execute novamente:

```powershell
firebase emulators:start --only functions
```

## Configurar variáveis sensíveis

Recomenda-se usar `firebase functions:config:set` para salvar chaves (ou o novo sistema de Secrets do Firebase). Exemplo com Stripe (substitua os valores):

```powershell
firebase functions:config:set stripe.secret="sk_test_..." stripe.webhook_secret="whsec_..."
```

Ou use as Secret Manager / `firebase functions:secrets:setup` para armazenar secrets com mais segurança.

## Testar localmente com Emulators

Você pode testar as functions localmente usando o emulator do Firebase.

```powershell
# a partir da raiz do projeto
firebase emulators:start --only functions
```

O emulador iniciará e exporá endpoints HTTP que você pode acessar localmente (URL mostrada no console). Para testar a função `expireTrials`, ela é uma função agendada — você pode invocá-la manualmente via emulador ou executar diretamente a lógica em um script de teste.

### Testando endpoints HTTP (exemplos)

1) Chamar `createCheckoutSession` (placeholder):

```powershell
$body = @{ userId = 'UID_DO_USUARIO'; priceId = 'price_abc123' } | ConvertTo-Json
curl -X POST "http://localhost:5001/YOUR_PROJECT/us-central1/createCheckoutSession" -H "Content-Type: application/json" -d $body
```

2) Simular webhook `checkout.session.completed` com curl (substitua URL pela do emulador):

```powershell
$event = @{ type = 'checkout.session.completed'; data = @{ object = @{ metadata = @{ userId = 'UID_DO_USUARIO' } } } } | ConvertTo-Json
curl -X POST "http://localhost:5001/YOUR_PROJECT/us-central1/stripeWebhook" -H "Content-Type: application/json" -d $event
```

Observação: em produção a validação deve usar `stripe-signature` e a secret do webhook.

## Deploy para Firebase

1) Faça login: `firebase login`
2) Selecione o projeto: `firebase use --add` (ou `firebase use <PROJECT_ID>`)
3) Faça o deploy das Functions:

```powershell
cd C:\Users\DELL\Desktop\bravus-barbearia
firebase deploy --only functions
```

Após o deploy, as URLs das funções serão exibidas no console.

## Segurança e melhores práticas

- Nunca exponha chaves secretas no frontend.
- Valide e verifique assinaturas de webhooks (por exemplo, `stripe-signature`) antes de confiar em eventos.
- Proteja endpoints administrativos (use Callable Functions que validem `context.auth.token` e claims customizadas ou realize checagens no backend usando uma chave administrativa).
- Para promover usuários via painel admin, prefira um endpoint protegido no backend que verifique a permissão do chamador.
- Automatize a verificação de trials expirados no backend (o `expireTrials` em `functions/index.js` é um exemplo de job agendado).

## Fluxo sugerido de produção (resumo)

1. Cliente inicia Checkout (frontend chama um endpoint seguro em Functions que cria uma Checkout Session no Stripe).
2. Stripe redireciona cliente para checkout e, ao pagar, emite um webhook `checkout.session.completed` para sua Function pública.
3. A Function valida a assinatura do webhook e, após verificar o evento, atualiza o perfil do barbeiro (`plan: 'premium'`) de forma segura via Admin SDK.
4. Cloud Scheduler/Function diária verifica e encerra trials expirados automaticamente.

## Observações específicas do frontend

- O painel admin (`js/admin.js`) só permite acesso quando o usuário atual tiver `isAdmin: true` no documento `/barbeiros/{uid}`. Você pode criar esse campo manualmente no Firestore para um usuário de teste.
- O painel de billing (`js/billing.js`) fornece botões para iniciar/encerrar trial e simular assinatura; em produção, remova a simulação e use o fluxo real descrito acima.

## Área Super Admin (painel restrito)

O repositório inclui um painel super-admin acessível pelo dashboard (`nav-admin`) que permite:

- Listar trials ativos e promover/encerrar trials;  
- Editar documentos do Firestore diretamente (editor simples);  
- Alternar a flag `stripeEnabled` em `platform/config` (usar para ativar/desativar integração Stripe).  

Como habilitar um usuário como admin (teste):

1. Vá até o console do Firestore.
2. Abra o documento `/barbeiros/{UID}` do seu usuário.
3. Adicione o campo booleano `isAdmin` com valor `true`.

Após isso, faça login com esse usuário no frontend. O botão `Abrir Painel Admin` (no dashboard) ficará acessível e mostrará o painel com controles.

Como habilitar/desabilitar Stripe (via painel):

1. No Painel Admin, clique em `Toggle Stripe Enabled` — isso muda `platform/config.stripeEnabled`.
2. Se `stripeEnabled` estiver `true`, o endpoint `createCheckoutSession` nas Functions aceitará requisições e o webhook Stripe será processado (desde que as chaves estejam configuradas nas variáveis do Functions).

Segurança: em produção use funções protegidas e regras de segurança; não deixe a edição de documentos abertamente disponível em frontend sem backend checks.

## Próximos passos que posso fazer por você

- Implementar a integração Stripe real (criar Checkout Session com `stripe` SDK e validar webhooks) — preciso do `priceId` ou planos para configurar um exemplo.
- Adicionar função Callable segura para promover usuários (apenas admins) e remover promoção direta do frontend.
- Configurar envio de notificações antes do término do trial (email ou in-app).

Se quiser que eu implemente a integração Stripe real agora, me passe: um `priceId` de teste (ou posso incluir um placeholder e documentar o local para substituição). Também posso converter `stripeWebhook` para validar assinatura usando `functions.config().stripe.webhook_secret`.
