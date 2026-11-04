# Expedição Safra Goiás · app de coleta de campo

App de coleta de produtividade e custo de produção da soja da Expedição Safra Goiás (4ª edição, safra 2026/27), conduzida pelo IFAG.

- **Coleta de produtividade**: fazendas → visitas → amostragens (uma por cultivar/data de plantio) → pontos de 1 m linear, com fotos, GPS, ocorrências e observações por ponto. Cálculos da metodologia Expedição Safra.
- **Custo de produção**: entrevista no modelo do template de custo da soja (COE, COT, CT, margens, ponto de equilíbrio).
- **Painel** (administrador): produtividade por município e região SENAR, comercialização e logística, custos, metas da edição.
- **Funciona sem internet** depois do primeiro acesso: os dados ficam no aparelho e sobem quando houver sinal.

## Como está montado

| Arquivo | O que é |
|---|---|
| `index.html` | O app inteiro (telas, cálculos, sincronização). |
| `firebase.js` | Ligação com o Firebase: login (e-mail/senha), banco Firestore com sincronização incremental. |
| `firestore.rules` | Regras de segurança do banco por perfil. **Precisam ser publicadas no console do Firebase.** |
| `sw.js`, `manifest.webmanifest`, `icon-*.png` | Instalação no celular e abertura sem internet. |

Projeto Firebase: `expedicao-safra-goias` (plano gratuito **Spark**, sem cartão). Não usa Storage: as fotos vão comprimidas para dentro do Firestore.

## Perfis

| Perfil | Produtividade | Custos | Fazendas | Painel, Visitas, Usuários |
|---|---|---|---|---|
| Administrador (`admin`) | ✓ | ✓ | ✓ (importa e edita) | ✓ |
| Rota da expedição (`rota`) | ✓ | ✓ | consulta e cadastra | — |
| Técnico · Produtividade (`tec_prod`) | ✓ | — | consulta e cadastra | — |
| Técnico · Custo de produção (`tec_cus`) | — | ✓ | consulta e cadastra | — |

Cada pessoa abre o app, toca em **Primeiro acesso** e cria o próprio acesso (nome, e-mail e senha). Ela entra como Técnico · Produtividade; o administrador muda o perfil na aba **Usuários** quando quiser. Quem é removido não consegue entrar de novo. Administradores iniciais: `expedicao.safra@ifag.org.br` e `vilmarjr.agronomia@gmail.com`.

## Configuração (uma vez)

1. **Regras do banco**: console do Firebase → Firestore Database → Regras → colar o conteúdo de `firestore.rules` → Publicar.
2. **Domínio autorizado**: Authentication → Configurações → Domínios autorizados → adicionar o domínio onde o app estiver publicado.
3. **Publicação**: qualquer hospedagem de arquivos estáticos serve (GitHub Pages ou Firebase Hosting). Os arquivos já estão prontos, sem etapa de build.

## Dados

- Coleções: `usuarios` (id = e-mail), `config`, `propriedades`, `visitas`, `amostragens`, `pontos` (id = `amostragem-pN`), `fotos`, `fotosFull`, `custos`.
- Cada documento tem `_t` (horário do servidor da última alteração); exclusões são marcadas com `_del: true` para chegarem aos outros aparelhos.
- Exportação em CSV (amostragens, pontos com coordenadas, custos e itens de insumos) nas abas Visitas e Custos.
