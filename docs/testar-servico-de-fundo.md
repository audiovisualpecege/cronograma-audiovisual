# Testar o serviço de fundo novo antes de publicar

O serviço de fundo é quem chama a IA (proposta de escala e classificação dos eventos) e relê as agendas. Ele roda
no NAS. Para testar uma versão nova sem publicar, ele roda num computador, apontado para o mesmo banco, **no
lugar** do NAS: os dois ao mesmo tempo disputam os mesmos pedidos, e o antigo pode pegar o seu.

O que fica fora do repositório (na pasta `- CRONOGRAM AUDIOVISUAL`, ao lado dele), porque guarda segredo:
- `teste-servico-de-fundo/worker-teste.env`: a configuração do teste, com a chave `service_role` do Supabase
  (a mesma do `.env` do NAS);
- `teste-servico-de-fundo/iniciar.ps1`: sobe o serviço de fundo com esse arquivo.

## Passo a passo

1. Na tela, deixe a IA pronta:
   - para o **Gemini**: Configurações > Geral > Inteligência artificial > Fornecedor **Google Gemini**;
   - para o **MiniCPM5**: rode o Ollama no computador com o modelo (ver `docs/ia-local.md`), descomente
     `AI_LOCAL_URL` e `AI_LOCAL_MODEL` no `worker-teste.env` e escolha o fornecedor **Modelo local**. Antes da
     migração 0014, o endereço vem do arquivo e não da tela.
2. Cole a `SUPABASE_SERVICE_ROLE_KEY` no `worker-teste.env`.
3. **Pare o serviço do NAS** (quem tem acesso a ele): na pasta `docker/cronograma-audiovisual`,
   `docker compose stop`.
4. Numa janela própria do PowerShell: `& "<pasta>\teste-servico-de-fundo\iniciar.ps1"`. Deixe a janela aberta;
   ela mostra o que o serviço faz. O Painel para de dizer "serviço de fundo parado" em até 1 minuto.
5. Teste no app (Propor escala > Pedir à IA, ou o passo 1 com a identificação dos tipos). As propostas da IA
   ficam pendentes até alguém aceitar, como sempre.
6. Ao terminar: `Ctrl+C` na janela, **suba o NAS de novo** (`docker compose start`) e apague a chave do
   `worker-teste.env`.

## O que este teste mostra e o que não mostra

- Mostra: o fornecedor local e o Gemini com lotes de 25 vagas, a resposta aproveitada item por item e o motivo
  exato da falha na tela.
- Não mostra o que depende de migração ainda não aplicada: as reuniões por setor (0015) e a identificação pelo
  serviço de fundo pedida pela tela (0012). Sem a 0015, a semana ainda tem as reuniões com a equipe inteira;
  marque a REUNIAO INTERNA como "não exige equipe" antes, para o teste ficar parecido com o que vai ao ar.
- Sem a conta do Google no arquivo, as agendas não são relidas enquanto o NAS estiver parado.
