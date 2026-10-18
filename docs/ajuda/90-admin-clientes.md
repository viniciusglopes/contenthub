---
id: admin-clientes
titulo: "Admin: clientes, convites e chaves"
resumo: Criar cliente, convidar o dono, entrar como cliente e ligar ou desligar recursos.
ordem: 90
admin: true
tags: admin, clientes, convite, publicação, teto
---
# Clientes (administrador)

## Criar cliente

1. No menu, clique em **Clientes** e em **Novo cliente**.
2. Preencha o nome e salve.
3. Gere o **link de convite para o dono** e mande para ele. O link vale 7 dias e funciona uma vez.

## Entrar como cliente

Use **entrar como** para ver a tela do cliente. Uma faixa avisa que você está vendo como ele; tudo fica registrado.

## Chaves por cliente (desligadas por padrão)

- **Publicação automática no Instagram**: só funciona se a chave geral da plataforma também estiver ligada.
- **Responder comentários pelo ContentHub**.
- **Ações em anúncios** (Tráfego).
- **Teto de IA do mês** e imagem/vídeo de IA em setor regulado.

## Chaves da casa

YouTube e Pexels da plataforma são cadastrados pela rota de integrações do administrador (`/api/admin/integracoes`, ações `youtube` e `pexels`). As chaves de IA da casa ficam em `/api/admin/estudio`. Nenhuma chave volta para a tela depois de salva.
