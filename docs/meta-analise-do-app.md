# Análise do app pela Meta (acesso avançado ao Instagram)

Conferido na documentação oficial da Meta em 12/10/2026. Este documento só descreve o que
é preciso; nada foi submetido.

## Por que precisamos

Hoje o app "Soluções de IA - APP-IG" tem **acesso padrão**: só funciona para contas do
Instagram que têm função no app (as que o administrador cadastra como testadoras). É por
isso que o cliente ainda conecta colando um token.

Para o cliente clicar em **Conectar com o Instagram** e autorizar sozinho, a Meta exige:

1. **Acesso avançado** em cada permissão (App Review).
2. **Verificação da empresa** (Business Verification).
3. **Verificação de acesso como Tech Provider**, porque o app é de uma empresa e é usado por
   outras empresas. Sem ela, as chamadas de contas de fora devolvem erro código 100, mesmo
   com a permissão aprovada. É um processo separado do App Review (cerca de 5 dias).

No ContentHub isso corresponde a ligar `IG_OAUTH_ENABLED=true` depois da aprovação.

## Checklist antes de submeter

| Item | Situação | O que fazer |
|---|---|---|
| Verificação da empresa | pendente | Portfólio empresarial da Meta > Central de segurança. CNPJ, endereço e telefone da empresa dona do app |
| Verificação de acesso (Tech Provider) | pendente | Só abre depois da verificação da empresa. Descrever que prestamos serviço de gestão de conteúdo para outras empresas |
| Política de privacidade publicada | pendente | URL pública (https) dizendo quais dados do Instagram lemos, para quê, por quanto tempo e como pedir a exclusão |
| Exclusão de dados | pendente | URL de instruções (basta uma página) **ou** callback https que recebe `signed_request` e devolve `{ url, confirmation_code }`. O ContentHub ainda não tem o callback: começar pela página de instruções |
| Ícone do app 1024x1024 | pendente | Sem marcas da Meta ou do Instagram |
| Categoria e e-mail de contato | pendente | O resultado da análise chega nesse e-mail |
| Finalidade do app | pendente | Marcar que o app atende **clientes** (não só a própria empresa) |
| Perguntas de tratamento de dados | pendente | Aparecem depois da verificação da empresa |
| 1 chamada bem-sucedida por permissão nos últimos 30 dias | parcial | `basic` e `manage_insights` já foram usadas com conta testadora; refazer perto da data. `content_publish` só se formos pedir (ver abaixo) |
| Acesso para o revisor | pendente | Usuário de teste no ContentHub (dono de um cliente de demonstração) + passo a passo de login. Nunca credenciais pessoais da Meta |
| Vídeo por permissão | pendente | Ver roteiro abaixo |
| Redirect do login cadastrado | pendente | Painel > Instagram > Configuração da API com login do Instagram > Configurações do login da empresa: `https://contenthub.vinculodigital.com.br/api/instagram/oauth/callback` (tem de ser idêntico a `APP_URL` + caminho) |

Regras do vídeo (uma gravação por permissão, senão a permissão é recusada): tela em 1080p,
interface em inglês quando possível, sem áudio (o revisor não ouve), legendas no que não for
óbvio, mostrar a pessoa **concedendo** a permissão na tela do Instagram e o app **usando** o
dado. Só o fluxo web é aceito. Terminar o desenvolvimento antes: mudar a configuração depois
pode exigir nova análise. Prazo informado pela Meta: decisão em cerca de uma semana.

## Permissões e justificativas

Enviar em inglês. Cada texto tem de ser próprio da permissão (a Meta recusa copiar e colar).
As dependentes vão na mesma submissão.

### instagram_business_basic

Para que serve: ler o perfil e as mídias da conta profissional. Não depende de outra.

> ContentHub is a content management tool used by businesses and agencies to plan and review
> their Instagram content. After the account owner logs in with Instagram, we read the
> account's username, ID, account type, follower count and its list of media (caption,
> type, permalink, timestamp, thumbnail). We show the connected account name inside the
> customer's workspace and list their recent posts next to the content calendar, so they can
> match each planned post with what was published. Data is only shown to users of the
> workspace that connected the account.

Vídeo: login no ContentHub > Conectar com o Instagram > tela de autorização > volta com
"Conectada como @conta" > lista de posts na tela Instagram.

### instagram_business_manage_insights

Para que serve: métricas da conta e de cada mídia. Depende de `instagram_business_basic`.

> We use insights to give the account owner a performance dashboard for their own account:
> daily reach and views, follower growth, and per-post reach, views, likes, comments, saves,
> shares and reels watch time. The dashboard ranks the last 30 days of posts by saves and
> shares and builds a weekly summary report for the account owner. Insights are fetched once
> a day, stored per customer workspace, and never shared with other customers or used for
> advertising.

Vídeo: depois de conectar, clicar em Sincronizar agora > cartões de seguidores, alcance e
views > tabela de posts com as métricas > Ver relatório.

### instagram_business_content_publish (só quando formos ligar a publicação)

Para que serve: publicar posts orgânicos em nome da conta. Depende de
`instagram_business_basic`. **Hoje a publicação está desligada (`IG_PUBLISH_ENABLED`) e o
botão Conectar não pede essa permissão.** Pedir permissão que o vídeo não mostra em uso é
motivo de recusa: submeter esta só quando a publicação estiver pronta e gravável.

> Customers plan posts in the ContentHub calendar (caption, media, date). When a post is
> approved, the customer can publish it to their own Instagram professional account from
> ContentHub instead of copying it by hand. We create the media container and publish it
> only after an explicit action by the account owner; nothing is posted automatically
> without their approval.

## O que a documentação não deixou claro

- Se o callback de exclusão de dados, no login do Instagram, é assinado com a chave secreta
  do app do Instagram ou do app da Meta.
- O texto oficial de "uso permitido" de `instagram_business_manage_insights` (não aparece na
  referência de permissões; a descrição acima vem das páginas de insights).
- Prazo da verificação da empresa.
