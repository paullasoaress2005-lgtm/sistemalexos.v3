# Plano De Reconstrucao - Sistema LEX.OS V3

## Direcao

O V3 deve reaproveitar o conceito funcional do sistema anterior, mas nao deve reaproveitar a composicao visual antiga. A prioridade e reduzir ruido, excesso de texto, excesso de botoes e excesso de animacoes.

## Principios

- Primeira tela sempre objetiva.
- Detalhes aparecem sob demanda.
- Cada modulo deve ter uma acao primaria clara.
- Listas devem mostrar somente identificacao, status e prazo/valor principal.
- Informacoes longas devem abrir em painel lateral, modal ou bloco expansivel.
- Cores LEX.OS devem ser mantidas: navy/ink, dourado, cyan, prata e estados semanticos.
- Evitar hero grande, glow excessivo, blur desnecessario e dashboard generico.

## Etapas

1. Criar shell novo com sidebar, topbar, mobile tabs e area util ampla.
2. Criar dashboard operacional enxuto.
3. Criar modelo de modulo com metricas, busca, lista e painel de detalhe.
4. Validar a experiencia com dados demonstrativos.
5. Migrar CRUD real de clientes.
6. Migrar CRUD real de processos.
7. Migrar tarefas, agenda e financeiro.
8. Migrar Central LEX.OS, relatorios, socios e configuracoes.
9. Conectar Supabase e permissoes.
10. Validar desktop, notebook e mobile antes do deploy final.

## Primeira Entrega

A primeira entrega deste repositorio implementa:

- shell V3 novo;
- navegacao entre modulos;
- metricas demonstrativas;
- busca local;
- fila operacional;
- painel lateral de detalhes;
- acoes primarias;
- responsividade base.

Ainda nao implementa banco real, autenticacao real ou CRUD persistente.
