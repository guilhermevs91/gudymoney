# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [1.9.4] - 2026-04-27

### Adicionado
- Cartão de crédito: botão "Reabrir Fatura" — volta status de CLOSED para OPEN, permitindo novos lançamentos

### Corrigido
- Importação Bradesco: quando o extrato lista múltiplas parcelas do mesmo produto na mesma fatura (ex: 3/6, 4/6, 5/6, 6/6 como linhas separadas), agora processa apenas a de menor índice e ignora as demais — evitando criação de múltiplos grupos de parcelamento duplicados
- Importação: lançamentos e parcelas que cairiam em faturas CLOSED ou PAID são ignorados silenciosamente durante a importação

## [1.9.3] - 2026-04-27

### Adicionado
- Cartão de crédito: botão "Fechar Fatura" — muda status de OPEN para CLOSED e bloqueia novos lançamentos, parcelamentos e exclusões até que seja reaberta ou paga

### Alterado
- API: faturas com status CLOSED agora bloqueiam criação, edição e exclusão de lançamentos (anteriormente apenas PAID bloqueava)

### Corrigido
- Importação de fatura: dedup de parcelas e transações simples agora usa janela de ±1 dia na data para absorver diferenças de fuso (UTC vs horário local), evitando duplicação de lançamentos já cadastrados manualmente

## [1.9.2] - 2026-04-27

### Corrigido
- Importação de fatura: parcelas (ex: "PRODUTO 3/6") agora retroagem corretamente para a data real da parcela 1 e ignoram as parcelas já passadas — apenas as parcelas atuais e futuras são criadas
- Cartão de crédito: bloqueado adicionar, editar ou excluir lançamentos em faturas já pagas — é necessário estornar o pagamento primeiro

## [1.9.1] - 2026-04-15

### Adicionado
- Cartão de crédito: ao pagar fatura do cartão pai, opção para baixar também as faturas abertas dos cartões adicionais

### Corrigido
- API: estorno de pagamento de fatura agora usa `internal_account_id` direto do cartão, eliminando erro "conta interna não encontrada"
- Cartão de crédito: excluir lançamento agora abre modal de confirmação antes de deletar
- Transações: lançamentos de cartão de crédito (despesas de fatura) não aparecem mais na tela de transações — apenas os pagamentos de fatura são exibidos

## [1.9.0] - 2026-04-14

### Adicionado
- Dashboard: saldo projetado agora desconta o valor das faturas abertas/fechadas não pagas dos cartões de crédito
- CI/CD: versão do app (`package.json`) é injetada como `APP_VERSION` no build Docker e exibida corretamente na sidebar em produção

### Corrigido
- Mobile: zoom desativado via viewport (`maximum-scale=1, user-scalable=no`) — inputs não mais deslocam o layout
- Toasts: duração reduzida de ~16min para 3s
- Cartão de crédito: novas transações avulsas agora são criadas com status REALIZADO por padrão
- Cartão de crédito: modal "Pagar Fatura" agora exibe primeiro a seleção de conta (sem abrir teclado automaticamente) e usa `onOpenAutoFocus` desabilitado
- Cartão de crédito: confirmar realizado / reverter transação não mais retorna o scroll ao topo da página
- Transações: confirmar realizado / reverter para previsto não mais retorna o scroll ao topo da página
- Orçamento: botão "Salvar" no dialog de edição agora salva diretamente (sem abrir segundo dialog de replicação); opção "aplicar a meses futuros" disponível também ao editar
- API: pagamento de fatura com cartão adicional — usa `internal_account_id` direto do cartão, eliminando erro "conta interna não encontrada"

## [1.8.1] - 2026-04-14

### Corrigido
- API: pagamento de fatura não associa mais a transação de pagamento à fatura (`credit_card_invoice_id` removido), evitando que o lançamento apareça duplicado dentro da fatura
- API: estorno de pagamento agora localiza a transação por conta + valor + data, sem depender de `credit_card_invoice_id`

## [1.8.0] - 2026-04-07

### Adicionado
- PWA completo: manifest.webmanifest com ícones, start_url, display standalone e theme-color — agora todas as páginas funcionam como PWA ao adicionar à tela inicial
- Ícones PWA 192x192 e 512x512

### Alterado
- Modais mobile: agora sobem de baixo como bottom sheet (mais natural no celular) com botão fechar redondo e visível no canto superior direito

## [1.7.1] - 2026-04-07

### Corrigido
- Captcha deslizante: arraste no mobile agora funciona sem rolar a página — implementado touch events nativos com `passive: false` + `touch-action: none` no thumb; thumb aumentado para 52px para facilitar o toque

## [1.7.0] - 2026-04-07

### Adicionado
- Transações: botão "Alterar categorias" aparece ao selecionar lançamentos — aplica a categoria escolhida em todos os selecionados de uma vez
- Ao confirmar, exibe opções de escopo: somente selecionados / selecionados + mesmo nome / + regra automática futura

## [1.6.3] - 2026-04-07

### Corrigido
- PWA mobile: removido ícone do navegador ao navegar entre páginas — substituído por barra de progresso fina no topo usando `next-nprogress-bar`

## [1.6.2] - 2026-04-07

### Alterado
- Orçamento mobile: totais movidos para o topo da lista em formato compacto inline (Plan / Real / Saldo em uma única barra), em vez de cards grandes abaixo de tudo

## [1.6.1] - 2026-04-07

### Corrigido
- Mobile: botão "Nova Transação" movido para dentro do menu inferior (BottomNav), centralizado entre os ícones de navegação — não sobrepõe mais o menu
- BottomNav reorganizado em 2 itens + botão central + 2 itens para acomodar o botão sem sobreposição

## [1.6.0] - 2026-04-07

### Adicionado
- Botão "Nova Transação" global: flutuante redondo fixo no canto inferior direito no mobile (presente em todas as páginas), e botão fixo na topbar no desktop
- O modal abre com formulário completo (tipo, status, valor com máscara, data, categoria, conta/cartão, Pix, observações)
- Após criar, os dados da página são recarregados automaticamente

## [1.5.1] - 2026-04-07

### Corrigido
- Cartão de crédito: campo Valor no diálogo de editar lançamento agora exibe o valor formatado com máscara de moeda (campo desabilitado)

## [1.5.0] - 2026-04-07

### Adicionado
- Máscara de moeda em todos os campos de valor monetário: o usuário digita apenas números (ex: `8605`) e o campo exibe automaticamente `86,05` — sem precisar digitar vírgula
- Campos afetados: Transações, Recorrências, Contas (saldo inicial), Orçamento (valor planejado), Cartões (limite total), Fatura (valor pago, novo lançamento, valor total do parcelamento)

## [1.4.1] - 2026-04-07

### Adicionado
- Transações: descrição automática quando não preenchida — Transferência: "Trans X > Y - data", com categoria: "Categoria - data", sem categoria: "Despesa/Receita - data"

## [1.4.0] - 2026-04-07

### Corrigido
- Transações: tipo Transferência agora exibe campos "Conta origem" e "Conta destino" corretamente (antes mostrava apenas "Conta" sem destino)

## [1.3.9] - 2026-04-07

### Adicionado
- Sidebar desktop: botão de colapsar/expandir — recolhe para somente ícones, estado persistido no localStorage

## [1.3.8] - 2026-04-07

### Adicionado
- Fatura: listagem de pagamentos registrados com botão de estornar
- API: `GET /credit-cards/:id/invoices/:invoiceId/payments` — lista pagamentos da fatura
- API: `DELETE /credit-cards/:id/invoices/:invoiceId/payments/:paymentId` — estorna pagamento, cancela transação e ledger entries, recalcula status da fatura e re-bloqueia limite se necessário

## [1.3.7] - 2026-04-06

### Adicionado
- Login: captcha de arrastar para verificar antes de habilitar o botão Entrar (proteção contra bots)

### Corrigido
- Mobile: menu lateral não abria porque `onMobileClose` era recriado a cada render, fechando o drawer imediatamente após abrir
- API: `trust proxy` habilitado para o Nginx — resolvia crash `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` que derrubava o rate limiter e causava Bad Gateway

## [1.3.6] - 2026-04-06

### Adicionado
- Login: superadmin pode logar diretamente em `app.gudy.com.br/login` — se as credenciais não forem de usuário normal, tenta login como superadmin e redireciona para `/superadmin/metrics`

## [1.3.5] - 2026-04-06

### Adicionado
- SuperAdmin: página de Logs de Segurança (`/superadmin/security`) com resumo de eventos, top IPs por login, IPs suspeitos, filtros por período/ação/IP e tabela paginada

### Corrigido
- CI: adicionado `timeout-minutes: 15` no job de testes para evitar runs travados indefinidamente
- Testes: `forceExit: true` e `testTimeout: 30000` no jest para encerrar conexões pendentes

## [1.3.4] - 2026-04-06

### Adicionado
- SuperAdmin: novo endpoint `GET /superadmin/security-logs` com lista de eventos de auditoria, resumo dos IPs com mais logins e IPs suspeitos por período configurável (`hours`, padrão 24h)

### Alterado
- Rate limit global aumentado de 100 para 500 req/15min em produção (evita bloqueios em uso normal)
- Rate limit específico para `/auth/*`: 20 req/15min por IP em produção (proteção contra força bruta)

## [1.3.4] - 2026-04-06

### Corrigido
- Cartão adicional: pagamento de fatura agora usa a conta interna do cartão pai (resolvia erro "Conta interna do cartão não encontrada")
- Cartão adicional: inputs de data no dialog de edição de fatura com atributo `max` para melhor compatibilidade mobile

## [1.3.3] - 2026-04-06

### Corrigido
- Cartão adicional: botão de excluir fatura agora aparece normalmente; apenas o botão de editar permanece oculto (datas herdadas do cartão pai)

## [1.3.2] - 2026-04-05

### Corrigido
- Dashboard: removido scroll horizontal no card de Orçamento (`overflow-x-hidden` no container interno)

## [1.3.1] - 2026-04-05

### Alterado
- Orçamento: itens ordenados alfabeticamente pelo nome da categoria (locale pt-BR)

### Corrigido
- Orçamento: `calculateActualSpent` agora soma transações com status `REALIZADO` **e** `PREVISTO` — recorrências e lançamentos previstos com categoria passam a aparecer no valor realizado do orçamento
- Orçamento: `getSuggestions` também considera transações `PREVISTO` ao sugerir categorias para auto-inserção

## [1.3.0] - 2026-04-05

### Alterado
- Cartão de crédito: faturas agora ordenadas em ordem crescente (mais antigas à esquerda/topo → mais recentes à direita/baixo)
- Ao entrar na tela, scroll automático até a fatura do mês atual (a que cobre hoje), centralizando-a na lista

## [1.2.9] - 2026-04-05

### Corrigido
- Cartão de crédito: ao entrar na tela, a fatura selecionada agora é a que cobre a data de hoje (período_start ≤ hoje ≤ period_end), evitando selecionar faturas futuras de parcelas; fallback para fatura com vencimento mais próximo → OPEN → mais recente

## [1.2.8] - 2026-04-05

### Alterado
- Cartão de crédito / fatura: botões editar e excluir da fatura agora sempre visíveis no mobile (antes apareciam só no hover, que não funciona em touch); no desktop mantém comportamento hover

## [1.2.7] - 2026-04-05

### Alterado
- Cartão de crédito / detalhe: faturas já estavam ordenadas da mais recente para a mais antiga; ao entrar na tela agora seleciona automaticamente a fatura do mês corrente (prioridade 1), depois a OPEN (prioridade 2), depois a mais recente

## [1.2.6] - 2026-04-05

### Alterado
- Cartão de crédito / detalhe: cards de resumo (Limite/Utilizado/Disponível) agora em 3 colunas no mobile com texto e padding compactos
- Layout da página de detalhe: `flex-col` no mobile e grid no desktop para melhor empilhamento
- Header e conteúdo da fatura com padding responsivo (`p-3 md:p-6`)

## [1.2.5] - 2026-04-05

### Corrigido
- Cartão de crédito / fatura: layout mobile totalmente revisado — lista de faturas vira scroll horizontal no mobile (cards deslizáveis), header da fatura reorganizado com título/total em cima e botão Pagar ao lado, botões de ação (Lançamento, Parcelar, Conferir) em linha com quebra automática; lista de transações em cards com botões visíveis

## [1.2.4] - 2026-04-05

### Alterado
- Cartão de crédito / fatura: layout mobile com cards por transação — descrição (com parcela colorida), data, categoria, valor em vermelho, badge de status e botões editar, confirmar e excluir; rodapé com total fixo na base da lista; tabela mantida no desktop

## [1.2.3] - 2026-04-05

### Alterado
- Recorrências: layout mobile com cards — descrição, tipo, frequência, datas, conta, valor e botões Ativar/Desativar, editar e excluir visíveis por card
- Categorias: layout mobile com cards — nome, cor, badge de tipo e uso, botões editar e excluir por card
- Importações: layout mobile com cards — nome do arquivo, formato, linhas, conciliados, data, badge de status, botão excluir e botão "Ver Itens" em largura total

## [1.2.2] - 2026-04-05

### Alterado
- Contas: layout mobile com lista de cards — cada card exibe nome, tipo, banco, moeda, badge de status, saldo realizado e botões de editar/excluir visíveis diretamente; tabela mantida no desktop

## [1.2.1] - 2026-04-05

### Alterado
- Orçamento: layout mobile com lista de cards substituindo a tabela — cada card exibe nome da categoria com cor, badge de tipo, valor realizado / planejado, percentual e barra de progresso, com botões de editar e excluir visíveis diretamente no card

## [1.2.0] - 2026-04-05

### Adicionado
- Transações: layout mobile com barra de resumo horizontal no topo (Receitas / Despesas / Saldo), lista de cards substituindo a tabela em telas pequenas, ações compactas por card
- Transações: filtros reorganizados em grid 2 colunas no mobile

### Corrigido
- Orçamento: duplicação de categorias quando a mesma categoria possuía transações de RECEITA e DESPESA no mesmo mês — `getSuggestions` agora deduplica por `category_id`, mantendo apenas o tipo com maior valor realizado
- Orçamento: deduplicação também aplicada no frontend antes de inserir sugestões

## [1.1.1] - 2026-04-05

### Alterado
- Dashboard: quadro de orçamento com scroll interno (`max-h-300px`), ordenado do maior para o menor valor planejado
- Dashboard: cada item do orçamento exibe nome, valor realizado / planejado e percentual na mesma linha, com barra de progresso fina abaixo — layout compacto e legível em mobile

## [1.1.0] - 2026-04-05

### Adicionado
- Mobile: sidebar agora abre como drawer deslizante com backdrop ao clicar no botão hamburguer (≡) no topbar
- Mobile: bottom nav fixa com 5 atalhos principais (Início, Transações, Contas, Cartões, Orçamento)
- Mobile: drawer fecha automaticamente ao navegar para outra página ou clicar fora
- Layout: padding inferior ajustado em mobile para não sobrepor a bottom nav

## [1.0.5] - 2026-04-05

### Adicionado
- Dashboard: linha de Saldo Projetado (azul tracejada) no gráfico de projeção — acumula mês a mês partindo do saldo realizado atual (saldo anterior + receitas − despesas)

## [1.0.4] - 2026-04-05

### Adicionado
- Dashboard: gráfico de projeção de gastos mostrando receitas e despesas do mês atual + próximos 5 meses (inclui lançamentos previstos e realizados, exclui cancelados)
- API: endpoint `GET /transactions/projection?year=&month=` retorna totais agrupados por mês para os 6 meses a partir do período informado

## [1.0.3] - 2026-04-05

### Corrigido
- Categorização em massa: ao usar "Todos os iguais" ou "Todos os iguais + salvar regra", a atualização agora aplica apenas a partir do mês da transação de referência — transações de meses anteriores nunca são alteradas retroativamente

## [1.0.2] - 2026-04-05

### Adicionado
- Transações: filtro por Conta/Cartão — lista contas e cartões agrupados, filtra client-side sem nova requisição
- Transações: filtro por Categoria — exibe todas as categorias do tenant

## [1.0.1] - 2026-04-05

### Adicionado
- Orçamento: ao abrir o orçamento de um mês, categorias com lançamentos no período que ainda não estão no orçamento são inseridas automaticamente com valor planejado pendente (R$ 0,01 como placeholder)
- Orçamento: ao editar o valor planejado de um item, aparece dialog perguntando "Replicar para outros meses?" com campo para informar quantos meses à frente aplicar (0 = somente este mês)
- API: novo endpoint `GET /budgets/suggestions?year=&month=` retorna categorias com transações no mês que não estão no orçamento

## [1.0.0] - 2026-04-05

### Alterado
- Versão ajustada para `1.0.0` para seguir a nova convenção de overflow: segmentos vão de 0 a 9, ao atingir 9 o segmento à esquerda é incrementado e os à direita zerados

## [0.12.2] - 2026-04-05

### Corrigido
- Categorias: ao recriar uma categoria com mesmo nome e pai que foi soft-deletada anteriormente, o sistema restaura o registro existente com os novos atributos (cor, tipo, ícone) em vez de falhar com erro de constraint duplicada

### Adicionado
- Categorias: ao criar uma categoria sem informar cor, o sistema escolhe automaticamente uma cor da paleta que ainda não foi usada no tenant; se todas já foram usadas, recicla aleatoriamente
- Categorias: subcategorias criadas sem cor herdam automaticamente a cor da categoria pai (tanto no backend quanto no formulário — ao selecionar o pai, a cor é preenchida automaticamente no campo)
- Categorias: campo de cor mostra "automática" quando nenhuma cor foi escolhida — o backend decide a cor ideal

### Corrigido
- API: limite máximo de `pageSize` em transações aumentado de 100 para 2000, permitindo carregamento completo da listagem

### Adicionado
- Transações: ordenação por coluna (Data, Descrição, Valor, Status) com indicador asc/desc clicável no cabeçalho
- Transações: coluna de checkbox para seleção individual e "selecionar todos"
- Transações: painel de sumário lateral com total de receitas, despesas e saldo do mês visível; ao selecionar registros, exibe subtotal dos selecionados
- Transações: paginação removida — todos os lançamentos são carregados de uma vez (até 2000)

## [0.12.1] - 2026-04-05

### Corrigido
- Transações: lançamentos de cartão de crédito agora exibem os botões de editar e excluir na tela de transações, mesmo quando `is_reconciled = true` — o flag é apenas visual para cartão e não deve bloquear a edição

## [0.12.0] - 2026-04-05

### Adicionado
- Inteligência de categorização automática: ao alterar a categoria de um lançamento, pergunta se deseja aplicar apenas neste, em todos os lançamentos com o mesmo nome, ou em todos + salvar regra automática
- Regra de categorização (`category_rules`): ao salvar uma regra, novos lançamentos criados ou importados com o mesmo nome de descrição (sem sufixo de parcela) recebem a categoria automaticamente
- O padrão é extraído removendo o sufixo `(X/Y)` da descrição — "NCOPAY (3/3)" e "NCOPAY (1/3)" compartilham a mesma regra "NCOPAY"

## [0.11.4] - 2026-04-05

### Adicionado
- Transações recorrentes: ao editar um lançamento de recorrência, um dialog pergunta o escopo — "Somente este" ou "Este e os próximos"
- Transações recorrentes: "Este e os próximos" propaga `amount`, `description`, `category_id` e `notes` para todas as ocorrências futuras (índice maior que o atual), sem afetar as passadas
- Transações: `amount` agora pode ser alterado no update (antes era somente leitura após criação)

## [0.11.3] - 2026-04-05

### Corrigido
- Cartão sem faturas: estado vazio agora exibe botões de "Lançamento" e "Parcelar" com mensagem orientativa — ao criar o lançamento, a primeira fatura é gerada automaticamente pelo backend

## [0.11.2] - 2026-04-05

### Corrigido
- Listagem de cartões: `limit_used` e `limit_available` agora recalculados a partir das transações ativas das faturas abertas (não mais do valor desatualizado do banco)
- Listagem de cartões: fatura exibida no card agora é a mais próxima a vencer (menor `due_date`) e não a mais recente por `period_start`
- Listagem de cartões: `total_amount` da fatura exibida também recalculado a partir das transações

## [0.11.1] - 2026-04-04

### Corrigido
- Cartões: `limit_used` e `limit_available` agora são recalculados em tempo real a partir das faturas abertas (OPEN/PARTIAL) ao carregar o detalhe do cartão — elimina divergências causadas por acúmulo de increment/decrement incorretos ao longo do tempo

## [0.11.0] - 2026-04-04

### Adicionado
- Cartões adicionais/virtuais: edição de datas de fatura bloqueada no backend (erro 400) e os botões de editar/excluir fatura ficam ocultos no frontend — datas só podem ser alteradas no cartão pai

## [0.10.9] - 2026-04-03

### Corrigido
- Migration `20260403010000_sync_child_invoice_dates`: sincroniza as datas (`period_start`, `period_end`, `due_date`) de todas as faturas existentes de cartões adicionais/virtuais para bater com as datas do cartão pai correspondente

## [0.10.8] - 2026-04-03

### Alterado
- Cartões adicionais/virtuais: ao editar datas de uma fatura do cartão pai, as faturas dos filhos são localizadas por sobreposição de período (não mais por tolerância de ±1 dia) e têm suas datas e transações reprocessadas automaticamente

## [0.10.7] - 2026-04-03

### Corrigido
- Cartões com adicionais: listagem de faturas agora recalcula `total_amount` a partir das transações ativas em ambos os paths (cartão único e cartão com adicionais), eliminando exibição de valores desatualizados do banco

## [0.10.6] - 2026-04-03

### Corrigido
- Cartões: `total_amount` da fatura agora é recalculado no banco sempre que uma transação é editada ou excluída — o card da lista de faturas reflete o valor correto imediatamente após qualquer mutação

## [0.10.5] - 2026-04-03

### Corrigido
- Cartões: edição de fatura não explode mais com `Unique constraint failed on (credit_card_id, period_start)` ao ajustar datas — antes de mover o `period_start` da fatura seguinte (e das faturas de cartões filhos), verifica colisão e pula o ajuste caso já exista outra fatura naquele período

## [0.10.4] - 2026-04-03

### Alterado
- Cartões / conferência: tag `(X/Y)` na descrição colorida em azul (parcelas intermediárias) ou vermelho (última parcela); opacidade e texto muted removidos

## [0.10.3] - 2026-04-03

### Alterado
- Cartões: botões de editar e excluir fatura movidos para o card da lista de faturas (lado esquerdo), aparecendo no hover — evita necessidade de scroll para acessar essas ações

## [0.10.2] - 2026-04-03

### Alterado
- Cartões / conferência: parcelas ≥ 2 exibidas com opacidade reduzida e texto em muted, destacando visualmente as compras novas das continuações de parcelamento

## [0.10.1] - 2026-04-03

### Alterado
- Cartões / conferência: parcelas ≥ 2 (ex: "2/10") são agrupadas no final da lista, facilitando conferência manual das compras novas

## [0.10.0] - 2026-04-03

### Corrigido
- Cartões: valor exibido no card da lista de faturas agora é calculado dinamicamente a partir das transações ativas, corrigindo divergência com o total_amount armazenado no banco (que podia estar desatualizado após edições ou reimportações)

## [0.9.9] - 2026-04-03

### Corrigido
- Transações de cartão: ao alterar a data para uma fatura diferente, `is_reconciled` é resetado para `false` — a transação precisa ser conferida novamente na nova fatura

### Alterado
- Cartões / conferência: itens do modal "Conferir Fatura" ordenados por data decrescente (mais recentes no topo)

## [0.9.8] - 2026-04-03

### Corrigido
- Transações de cartão de crédito: `is_reconciled = true` não bloqueia mais edição nem exclusão — para cartão o flag é apenas visual ("conferido no extrato da fatura"), sem implicação contábil de lock. O bloqueio permanece apenas para transações de conta bancária (`credit_card_id = null`).

## [0.9.7] - 2026-04-03

### Corrigido
- Transações de cartão de crédito: ao alterar a data de uma transação, o `credit_card_invoice_id` é automaticamente recalculado via `findOrCreateInvoice` — criando a fatura do período destino se ainda não existir

## [0.9.6] - 2026-04-03

### Corrigido
- Importação: erro `tx.creditCardInvoice.create()` ao reimportar uma fatura após exclusão — substituído `create` por `upsert` no `findOrCreateInvoice`, usando a chave única `(credit_card_id, period_start)`. Faturas soft-deletadas são restauradas automaticamente em vez de causar violação de constraint.

## [0.9.5] - 2026-04-03

### Corrigido
- Parcelamentos: a transação-pai (valor total da compra) não aparece mais na fatura — `credit_card_id` definido como `null` no registro âncora, que serve apenas como referência interna do `Installment`
- Importação Bradesco: mesmo comportamento corrigido para parcelamentos detectados na importação
- Migration `20260403000000_fix_installment_parent_transactions`: limpa `credit_card_id` e `credit_card_invoice_id` dos registros-pai de parcelamentos já existentes no banco

## [0.9.4] - 2026-04-03

### Adicionado
- Cartões / fatura: botão de excluir fatura (ícone lixeira vermelho) no cabeçalho da fatura selecionada
- Cartões / fatura: dialog de confirmação exibe o mês da fatura e avisa que a ação é irreversível
- Backend: `DELETE /credit-cards/:id/invoices/:invoiceId` — soft-delete em cascata de todos os registros vinculados à fatura: `installment_items`, `ledger_entries`, `transaction_tags`, `transactions` e `invoice_payments`; libera o limite do cartão principal proporcional às transações ativas excluídas

## [0.9.3] - 2026-04-03

### Adicionado
- Cartões adicionais: faturas espelham **exatamente** as datas do cartão pai (`period_start`, `period_end`, `due_date`) — ao criar a fatura do adicional, o sistema resolve a fatura do pai para aquela data e copia as datas
- Cartões adicionais: ao editar as datas de uma fatura do cartão pai, as faturas correspondentes de todos os adicionais são atualizadas automaticamente com as mesmas datas

## [0.9.2] - 2026-04-03

### Adicionado
- Importação Bradesco: transações parceladas `(X/Y)` agora disparam criação automática de todas as Y parcelas como `Installment`
  - A data da parcela 1 é calculada retroativamente: `data_importada - (X-1) meses`
  - Parcelas 1…X (já cobradas) criadas como `REALIZADO` e `is_reconciled = true`
  - Parcelas X+1…Y (futuras) criadas como `PREVISTO` nas faturas corretas de cada mês
  - Limite bloqueado pelo valor total do parcelamento (não por parcela)
  - Deduplicação: se a transação da parcela importada já existe, o parcelamento inteiro é ignorado

## [0.9.1] - 2026-04-03

### Adicionado
- Cartões / fatura: nome da fatura (ex: "Março 2026") agora é determinado pelo **mês do encerramento** (`period_end`), não pelo início — período 26/02–24/03 exibe "Março 2026"
- Backend: `findOrCreateInvoice` agora determina `period_start` da nova fatura como `period_end da fatura anterior + 1 dia` (quando existe fatura anterior), garantindo continuidade de cobertura sem sobreposição
- Backend: `updateInvoice` — ao alterar `period_end`, ajusta automaticamente o `period_start` da fatura seguinte para `period_end + 1 dia`

## [0.9.0] - 2026-04-03

### Adicionado
- Cartões / fatura: botão de editar fatura (ícone lápis) no cabeçalho da fatura selecionada
- Cartões / fatura: dialog "Editar Fatura" com campos Data de início, Data de encerramento e Dia de vencimento
- Backend: `PATCH /credit-cards/:id/invoices/:invoiceId` — atualiza período/vencimento e reprocessa lançamentos (rebinda transações dentro do novo período e desanexa as de fora, recalcula `total_amount`)

### Corrigido
- Cartões / conferência: ao clicar em "Fechar" no modal de conferência, a tela é recarregada para exibir os ícones de conferido atualizados
- Global: `formatDate` corrigido para usar `getUTC*` — datas armazenadas como `T00:00:00Z` não são mais deslocadas um dia para trás pelo timezone local (UTC-3)
- Cartões / edição de fatura: pré-preenchimento dos campos `type="date"` usa UTC para evitar o mesmo shift de timezone

## [0.8.9] - 2026-04-03

### Adicionado
- Cartões / fatura: transações marcadas como conferidas exibem ícone de check verde na tabela
- Cartões / fatura: ao abrir o modal "Conferir", checkboxes já vêm marcados conforme `is_reconciled` salvo no banco
- Cartões / fatura: marcar/desmarcar checkbox no modal persiste `is_reconciled` via `PATCH /transactions/:id` imediatamente
- Cartões / fatura: "Selecionar todos" no modal persiste o estado para todas as transações em paralelo

### Corrigido
- Cartões / edição: campo "Limite total" não é mais exibido nem exigido ao editar cartão adicional (que compartilha limite do principal)
- Backend: `updateTransaction` agora aceita `is_reconciled` como campo atualizável; transação conciliada pode ser desconciliada sem restrição

## [0.8.8] - 2026-04-01

### Corrigido
- Cartões / fatura: total exibido no cabeçalho da fatura agora é calculado a partir das transações visíveis em vez do `total_amount` armazenado no banco (que podia estar desatualizado/duplicado)
- Cartões / fatura: valor pré-preenchido no dialog "Pagar Fatura" e breakdown de composição agora usam o total calculado das transações
- Migration `20260401010000_recalc_invoice_totals`: recalcula `total_amount` de todas as faturas a partir das transações reais para corrigir inconsistências anteriores

## [0.8.7] - 2026-04-01

### Adicionado
- Cartão pai: toggle "Adicionais incluídos / Só cartão principal" na seção de adicionais — filtra a tabela de transações e o modal de conferência para exibir apenas o cartão selecionado

## [0.8.6] - 2026-04-01

### Adicionado
- Cartão pai: seção "Cartões adicionais" abaixo dos cards de limite, exibindo nome, últimos 4 dígitos, valor utilizado e percentual de cada adicional
- Cartão pai: modal "Pagar Fatura" exibe breakdown da composição da fatura (cartão principal + adicionais) quando existem cartões filhos

## [0.8.5] - 2026-04-01

### Adicionado
- Cartões / fatura: botões Editar, Confirmar e Excluir agora aparecem diretamente na linha da tabela (sem menu ⋯)
- Cartões / fatura: sufixo de parcela `(X/Y)` colorido em azul; última parcela `(N/N)` em vermelho
- Cartões / fatura: quando o cartão possui adicionais, as transações de todos aparecem agrupadas na mesma fatura; o nome do cartão adicional é exibido abaixo da descrição
- Cartões / faturas: `listInvoices` do cartão pai agrega os totais das faturas dos adicionais por período
- Cartões / faturas: `listInvoiceTransactions` busca transações de todos os cartões do grupo (principal + adicionais)
- Backend: `getCard` retorna `child_cards` para cartões principais

## [0.8.4] - 2026-04-01

### Adicionado
- Cartões / fatura: botão **Editar** no menu ⋯ de cada transação — abre modal com descrição, data, status, categoria e observações editáveis (valor bloqueado após criação)
- Cartões / fatura: botão **Conferir** no cabeçalho da fatura — abre modal com lista de transações com checkbox; mostra total conferido vs total da fatura e destaca em verde quando os valores batem, ou a diferença em âmbar quando não

## [0.8.3] - 2026-04-01

### Adicionado
- Novo endpoint `GET /credit-cards/:id/invoices/:invoiceId/transactions` — busca transações por `credit_card_invoice_id` com fallback para `credit_card_id + data dentro do período`, garantindo que transações sem backfill também apareçam

### Alterado
- Frontend: tela de detalhe do cartão agora usa o novo endpoint dedicado ao invés de `/transactions?credit_card_invoice_id=...`

## [0.8.2] - 2026-04-01

### Corrigido
- Dashboard: "Saldo Projetado" estava sendo calculado no frontend somando `balance.projected` de cada conta (que usa todos os PREVISTO sem filtro de data) — agora usa `summary.total_projected` retornado pelo endpoint `/ledger/summary`, que já filtra PREVISTO pelo mês selecionado

## [0.8.1] - 2026-04-01

### Corrigido
- Dashboard: card "Saldo Projetado" considerava PREVISTO de todos os meses — agora soma apenas as entradas PREVISTO do mês filtrado sobre o saldo realizado acumulado

## [0.8.0] - 2026-04-01

### Alterado
- Cartões: tabela de transações da fatura redesenhada — borda arredondada, cabeçalho com fundo sutil, hover nas linhas, transações canceladas com opacidade reduzida e texto tachado, rodapé com total geral; quando há mix de Realizado+Previsto exibe subtotais separados

## [0.7.9] - 2026-04-01

### Corrigido
- Recorrências: transações geradas via `createRecurrence` e pelo cron `extendInfiniteRecurrences` não criavam `ledger_entries`, impedindo que afetassem o saldo das contas — `recurrencesRepository.createTransactions` agora retorna os registros criados e o service cria as ledger entries correspondentes para cada transação com `account_id`

## [0.7.8] - 2026-04-01

### Corrigido
- Importação Bradesco: `blockLimit` não era chamado ao importar transações — limite do cartão ficava zerado após import
- Importação Bradesco: duplicatas com `credit_card_invoice_id` apontando para fatura errada não eram corrigidas — agora repara sempre que o link diverge da fatura calculada por `findOrCreateInvoice`
- Importação Bradesco: `parent_card_id` adicionado ao select do cartão para garantir que `principalCardId` seja resolvido corretamente em cartões adicionais

## [0.7.7] - 2026-04-01

### Corrigido
- Faturas: transações existentes sem `credit_card_invoice_id` não apareciam — migration `20260401000000_backfill_transaction_invoice_id` preenche retroativamente o vínculo com base no período da fatura (`period_start` ≤ `date` ≤ `period_end`)

## [0.7.6] - 2026-04-01

### Corrigido
- Faturas: lançamentos de cartão não apareciam na fatura — `calculateInvoicePeriod` usava `getDate()`/`new Date(y,m,d)` (hora local) em vez de UTC, causando `period_start` com offset de 3h; faturas duplicadas eram criadas e a transação ia para a fatura "errada"
- `calculateInvoicePeriod`: migrado para `getUTCDate()` / `Date.UTC()` — datas de período são sempre UTC midnight, independente de timezone do servidor
- `findOrCreateInvoice`: busca de fatura existente agora usa range de 1 dia para `period_start` (tolerância a faturas gravadas com offset de timezone antes da correção)
- `nowInSaoPaulo()` e `parseDateLocal()`: ambos migrados para retornar UTC midnight, eliminando divergência entre cálculo de período e data gravada no banco

## [0.7.5] - 2026-04-01

### Adicionado
- Cartões: listagem agora exibe bloco "Fatura aberta" em cada card com valor total e data de vencimento
- Cartões: tela de detalhe exibe fatura em formato "Mês/Ano" (ex: "Março 2026") na lista lateral e no cabeçalho
- Cartões: tela de detalhe seleciona automaticamente a primeira fatura OPEN ao abrir; caso não haja OPEN, seleciona a mais recente
- Cartões: ações nas transações da fatura — confirmar como "Realizado" e excluir, via menu ⋯
- Cartões: categorias nos diálogos de lançamento e parcelamento filtradas por EXPENSE/BOTH

### Alterado
- Backend: `resolveInvoiceId` unificado com `findOrCreateInvoice` do repository — lógica de período centralizada em `calculateInvoicePeriod`
- Backend: `listCards` enriquecido com `current_invoice` (fatura OPEN mais recente de cada cartão) em query batch

### Corrigido
- Migration `20260331010000_recalc_credit_card_limits`: recalcula `limit_used`/`limit_available` retroativamente para todos os cartões
- Dashboard: cards de saldo sem valor — `ledger/summary` retorna objeto direto (sem wrapper `{ data }`), frontend estava lendo `.data`
- Dashboard: saldo das contas concatenando em vez de somar — `balance.realized/projected` chegava como string, adicionado `Number()` em todos os pontos de uso
- Dashboard: orçamento não mostrava receitas — `actual_amount` vinha zerado por divergência de fuso horário
- `calculateActualSpent`: range de datas migrado para UTC puro para capturar transações legadas e novas
- `getTenantSummary`: mesma correção de range UTC no ledger service
- `accounts.repository`: `calculateBalance` agora retorna `number` em vez de `string`
- Dashboard: adicionados cards **Receitas Projetadas** e **Despesas Projetadas**; projetados exibidos antes dos realizados

## [0.7.4] - 2026-03-31

### Corrigido
- Cartões: `limit_used` e `limit_available` não eram atualizados ao criar transação de cartão — `blockLimit` agora é chamado no `createTransaction` para despesas de cartão
- Cartões: ao deletar ou cancelar uma transação de cartão, `releaseLimit` é chamado para devolver o limite ao cartão principal
- Cartões: suporte a cartões adicionais — limite é sempre bloqueado/liberado no cartão principal (`parent_card_id ?? id`)

## [0.7.3] - 2026-03-31

### Corrigido
- Busca por valor em Transações trocada para substring matching: `650` agora encontra `1650,00`, `6500,00`, etc.
- Algoritmo anterior usava range (`650.00–650.99`) que não cobria valores maiores contendo os dígitos buscados

## [0.7.2] - 2026-03-31

### Corrigido
- Cartões: `NaN%` e limites zerados na listagem — valores `Prisma.Decimal` agora convertidos com `Number()` antes de operar
- Cartões: transações da fatura não apareciam na tela de detalhe — parâmetro `page=1` ausente na query de `/transactions`
- Cartões: valor pré-preenchido no modal "Pagar Fatura" também corrigido para `Decimal`

## [0.7.1] - 2026-03-31

### Corrigido
- Busca por valor em Transações não reconhecia formato brasileiro (ex: `1.500,00` era interpretado como `1,5`)
- Busca numérica sem casas decimais agora retorna todos os registros com aquele valor inteiro (ex: `150` encontra `150,00` até `150,99`)
- Detecção de busca numérica no frontend também corrigida para formato `1.500,00`

## [0.7.0] - 2026-03-31

### Adicionado
- Transações com status `REALIZADO` não reconciliadas exibem botão ↩ para reverter para `PREVISTO`
- Campo `type` (`INCOME` | `EXPENSE` | `BOTH`) no modelo `Category` — enum `CategoryType` + migration `20260331000000_add_type_to_categories`
- Página de Categorias: select de tipo (Receita / Despesa / Ambos) no modal de criar/editar; coluna "Uso" na tabela com badge colorido
- Select de categoria em Transações, Recorrências e Orçamento filtra automaticamente por tipo compatível com o tipo da transação/item
- Ao trocar o tipo em Transações, Recorrências e Orçamento, a categoria selecionada é limpa automaticamente
- Endpoint `GET /categories?type=INCOME|EXPENSE|BOTH` para filtrar categorias por tipo no backend
- `filterCategoriesByType()` em `utils.ts`: helper para filtrar `flatCategoryOptions` por tipo de transação

## [0.6.0] - 2026-03-31

### Adicionado
- Modal de adicionar categoria ao orçamento: checkbox **"Adicionar aos próximos meses"** replica o item em todos os orçamentos futuros já existentes do tenant
- Modal de editar orçamento: ao salvar, exibe confirmação com opções **"Só este mês"** ou **"Este e próximos meses"**
- Modal de remover categoria do orçamento: exibe confirmação com opções **"Cancelar"**, **"Só este mês"** ou **"Este e próximos meses"**
- Backend: campo `apply_to_future` (boolean) nos endpoints `POST /budgets/:id/items` e `PATCH /budgets/:id/items/:itemId`
- Backend: parâmetro de query `delete_future=true` no endpoint `DELETE /budgets/:id/items/:itemId`
- Service `applyItemToFutureMonths`: cria ou atualiza o item em todos os orçamentos futuros do tenant (até 24 meses à frente)
- Service `deleteBudgetItem`: quando `deleteFuture=true`, soft-deleta o mesmo item em todos os orçamentos futuros via `updateMany`
- Orçamento agora é criado automaticamente ao navegar para qualquer mês — botão "Criar Orçamento para Este Mês" removido
- Versão atual (`v0.6.0`) exibida no rodapé da sidebar, clicável
- Modal "Novidades" exibe as 3 últimas entradas do changelog com badges coloridos por categoria
- `public/changelog.txt` sincronizado automaticamente nos scripts `dev` e `build`

### Removido
- Botão manual "Criar Orçamento para Este Mês" e estado `creating` da página de orçamento

## [0.5.0] - 2026-03-29

### Adicionado
- Campo `type` (`INCOME` | `EXPENSE`, padrão `EXPENSE`) em `BudgetItem` — migração `20260330015647_add_type_to_budget_items`
- Itens de orçamento agora podem ser do tipo **Receita** ou **Despesa**
- Dialog de orçamento: novo Select de tipo antes da categoria
- Linha de item exibe badge colorido "Receita" (verde) ou "Despesa" (vermelho)
- Barra de progresso para receita: verde quando ≥ 100% do planejado, amarelo entre 80-99%
- Card de totais separado por tipo: "Total Despesas" e "Total Receitas"
- `calculateActualSpent` agora filtra pelo `type` do item (`INCOME` ou `EXPENSE`)

## [0.4.0] - 2026-03-29

### Adicionado
- Import Bradesco agora cria `import_items` para **todos** os lançamentos durante a importação:
  - `MATCHED`: transação criada ou reparada com sucesso
  - `IGNORED`: duplicata verdadeira (já estava vinculada à fatura correta)
  - `PENDING`: erro durante a criação
- Aba "Itens" das importações exibe coluna "Detalhe" com mensagem de erro para itens `PENDING` e contexto da ação (`Fatura vinculada`, `Duplicata ignorada`) para os demais
- Transações na tela de listagem agora incluem o cartão de crédito e conta vinculados (`credit_card`, `account`)
- Helper `flatCategoryOptions` em `utils.ts`: expande árvore de categorias em lista plana com labels `"Pai > Filho"` para subcategorias
- Selects de categoria nas telas de Transações, Cartões, Orçamento e Recorrências agora mostram subcategorias

### Corrigido
- Listagem e detalhe de transações não retornavam `credit_card` nem `account` — `include` adicionado em `findAll` e `findById`
- Lançamento direto em fatura de cartão não atualizava `total_amount` da fatura — `updateInvoiceAmount` agora é chamado no `createTransaction`
- Após criar lançamento em cartão, o frontend selecionava a fatura antiga em vez da fatura onde o lançamento foi criado — corrigido via `credit_card_invoice_id` da resposta da API
- Subcategorias criadas não apareciam nos Selects — todas as páginas de formulário agora usam `?flat=true` e expandem subcategorias

## [0.3.0] - 2026-03-30

### Adicionado
- Endpoint `GET /imports/:id/transactions` — retorna transações criadas pelo import Bradesco (via `import_id`)
- Tela de importações: aba "Itens" agora exibe transações para imports do tipo fatura (quando não há import_items)

### Corrigido
- `total_amount` das faturas agora é atualizado durante o import Bradesco
- Deduplicação corrigida: transações existentes sem vínculo de fatura (`credit_card_invoice_id = null`) são reparadas ao reimportar, vinculando-as à fatura correta e atualizando o `total_amount`
- Script `dev` da API executa `prisma generate` automaticamente ao iniciar, garantindo que o Prisma Client esteja atualizado após migrações

## [0.2.0] - 2026-03-30

### Adicionado
- Campo `import_id` no modelo `Transaction` (migração `20260330011130_add_import_id_to_transactions`) para rastrear transações criadas via importação
- Endpoint `DELETE /imports/:id` — exclui importação e todas as transações criadas por ela (ledger entries + reversão de `total_amount` das faturas)
- Botão "Excluir" na lista de importações (com confirmação)
- Importação Bradesco agora cria registro `Import` na tabela e aparece na lista de importações
- Deduplicação no import Bradesco: transações com mesmo cartão + data + valor + descrição são ignoradas em reimportações

### Corrigido
- Busca de transações não obedecia o filtro de texto (parâmetro enviado como `description` mas a API esperava `search`)
- Faturas criadas no import Bradesco tinham `total_amount = 0` (agora é incrementado a cada transação importada)

## [Não lançado]

### Fase 3 — Google OAuth, Testes de Integração, OCR Mobile, E2E, Prod Config

#### Google OAuth
- `apps/api/src/lib/google.ts` — verificação de ID token via `google-auth-library` (`OAuth2Client.verifyIdToken`)
- `apps/api/src/modules/auth/auth.schemas.ts` — schema `googleAuthSchema` (`{ id_token: string }`)
- `apps/api/src/modules/auth/auth.repository.ts` — `findUserByGoogleId`
- `apps/api/src/modules/auth/auth.service.ts` — `googleAuth`: verifica token, encontra-ou-cria usuário+tenant, retorna JWT pair
- `apps/api/src/modules/auth/auth.controller.ts` — handler `googleAuth`
- `apps/api/src/modules/auth/auth.routes.ts` — `POST /auth/google/verify` (substituiu stubs 501)
- `apps/api/src/config/env.ts` — variável `GOOGLE_CLIENT_ID` (opcional)
- `apps/api/package.json` — dependência `google-auth-library`
- `apps/web/src/components/providers.tsx` — `GoogleOAuthProvider` + `AuthProvider` + `Toaster` em um único client component
- `apps/web/src/app/layout.tsx` — usa `<Providers>` no lugar de `AuthProvider` direta
- `apps/web/src/contexts/auth-context.tsx` — método `googleLogin(idToken)`
- `apps/web/src/app/(auth)/login/page.tsx` — botão `<GoogleLogin>` com `@react-oauth/google`
- `apps/web/src/app/(auth)/register/page.tsx` — botão `<GoogleLogin>` no cadastro
- `apps/web/package.json` — dependência `@react-oauth/google`
- `apps/mobile/src/contexts/auth-context.tsx` — método `googleLogin(idToken)`, refatoração `hydrateUser`
- `apps/mobile/app/login.tsx` — botão "Entrar com Google" via `expo-auth-session` (PKCE + OpenID)
- `apps/mobile/package.json` — dependências `expo-auth-session`, `expo-crypto`, `expo-web-browser`

#### Testes de Integração — API
- `apps/api/src/tests/categories.test.ts` — CRUD + sub-categorias + isolamento de tenant + seed
- `apps/api/src/tests/credit-cards.test.ts` — CRUD + invoices + isolamento de tenant
- `apps/api/src/tests/budgets.test.ts` — CRUD + itens + filtro por mês + isolamento de tenant
- `apps/api/src/tests/recurrences.test.ts` — CRUD + ativar/desativar + isolamento de tenant
- Correção `jest.config.js`: `setupFilesAfterFramework` → `setupFilesAfterEnv`

#### OCR Mobile
- `apps/mobile/app/ocr-capture.tsx` — câmera + captura + envio base64 ao backend + revisão de itens + importação em bulk

#### E2E com Playwright
- `apps/web/playwright.config.ts` — configuração Playwright (Chromium, pt-BR, baseURL configurável)
- `apps/web/e2e/auth.spec.ts` — fluxo de cadastro, login, credenciais inválidas, guard de rota
- `apps/web/e2e/transactions.spec.ts` — navegação e listagem de transações
- `apps/web/package.json` — dependência `@playwright/test`, scripts `test:e2e` / `test:e2e:ui`

#### Configuração de Produção
- `.env.example` — atualizado com todas as variáveis: JWT, Google OAuth, Asaas, webhooks, Next.js, Expo, Redis (v2)



### Adicionado
- PRD v0.2 com decisões principais fechadas (`gudy_money_prd.md`)
- `CLAUDE.md` com arquitetura, regras de negócio e convenções do projeto
- `CHANGELOG.md` para rastreamento de mudanças
- Schema Prisma completo (todas as 6 camadas: Foundation → Infrastructure)
- Scaffolding do monorepo Turborepo (`apps/api`, `apps/web`, `packages/shared`)
- Módulos da API: auth, accounts, categories, tags, credit-cards, recurrences, budgets, transactions, imports, ledger, notifications, webhooks, billing, lgpd, superadmin
- Middleware: autenticação JWT, isolamento de tenant, validação Zod, tratamento de erros
- Jobs cron: recurrence-extender, webhook-sender, notification-generator
- `imports.routes.ts` com upload via multer (OFX/CSV/TXT, máx 10 MB)
- `billing.controller.ts` + `billing.routes.ts` (planos, assinatura Asaas, webhook)
- `lgpd.controller.ts` + `lgpd.routes.ts` (dados, exportação CSV, consentimentos, exclusão de conta)
- Registro de todas as rotas em `app.ts` (transactions, imports, ledger, notifications, webhooks, billing, lgpd, superadmin)
- Dependência `multer` adicionada ao `apps/api`

### Fase 2 — Frontend, Mobile, Testes e CI/CD

#### Frontend Next.js (`apps/web`)
- Configuração: `next.config.ts`, `tailwind.config.ts`, `postcss.config.js`
- Tema red/black, suporte dark/light mode via CSS custom properties
- Componentes UI (shadcn/ui): Button, Input, Label, Card, Badge, Dialog, Select, Table, Separator, Skeleton, Textarea, Switch, Tabs, DropdownMenu, Toast/Toaster
- Componentes compartilhados: PageHeader, EmptyState, ConfirmDialog, AmountBadge, Pagination
- Layout: Sidebar com navegação completa, Topbar com toggle de tema e menu do usuário
- Contexto de autenticação com JWT decode, refresh automático e logout
- Cliente HTTP tipado (`lib/api.ts`) com refresh token automático em 401
- Páginas de autenticação: Login, Cadastro
- Tela app protegida por auth guard (`(app)/layout.tsx`)
- Dashboard com saldo realizado/projetado, receitas/despesas do mês e progresso de orçamento
- Telas: Transações (filtros, paginação, confirmar PREVISTO), Contas, Cartões (com detalhe de faturas), Categorias, Orçamento, Recorrências, Importações, Notificações
- Configurações: Perfil, Equipe, Plano/Billing, LGPD, Webhooks
- SuperAdmin: Login, Métricas, Tenants, Features
- Dependências adicionadas: `recharts`, `@radix-ui/react-separator`, `@radix-ui/react-switch`, `@radix-ui/react-tabs`

#### Mobile Expo (`apps/mobile`)
- Scaffolding completo: `package.json`, `app.json`, `tsconfig.json`, `babel.config.js`
- Autenticação biométrica (`expo-local-authentication`) na tela de login
- Tokens armazenados com `expo-secure-store`
- Contexto de auth com refresh token
- Navegação por tabs: Dashboard, Transações, Contas, Cartões, Perfil
- Telas: Dashboard (saldo + contas), Transações (lista infinita, confirmar previsto), Contas, Cartões, Perfil/Logout

#### Testes da API (`apps/api`)
- Configuração Jest + ts-jest + Supertest
- Testes de integração: `auth.test.ts` (register, login, refresh, logout)
- Testes de integração: `accounts.test.ts` (CRUD completo + isolamento de tenant)
- Testes de integração: `transactions.test.ts` (CRUD + filtros + isolamento de tenant)
- Script `test`, `test:watch`, `test:coverage`

#### CI/CD (GitHub Actions)
- `.github/workflows/ci.yml`: lint + typecheck + testes com PostgreSQL + build
- `.github/workflows/deploy.yml`: build Docker images + push ao GHCR + deploy via SSH
- Turborepo pipeline atualizado com task `test`
