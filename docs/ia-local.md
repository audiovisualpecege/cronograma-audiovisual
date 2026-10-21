# IA local (MiniCPM5)

A IA do sistema faz duas coisas: classifica o tipo de serviço dos eventos pelo título e propõe a escala. Desde a
1.1.0 ela pode rodar num **modelo local**, na rede da empresa, em vez do Google Gemini. A escolha fica em
**Configurações > Geral > Inteligência artificial > Fornecedor**. Ou é um, ou é o outro; não há troca automática.

## Qual modelo

O recomendado é o **MiniCPM5-2B** da OpenBMB (setembro de 2026). Ele tem licença Apache 2.0, é só texto, tem
2,6 bilhões de parâmetros e roda com uns 2 a 3 GB de memória. É bem menor que o Gemini:

- **Classificar títulos**: deve ir bem.
- **Montar a escala**: pode errar mais. O sistema confere tudo o que a IA devolve. Resposta fora do formato
  vira "a IA não respondeu" e a vaga fica aberta, sem gravar nada errado.

Outro modelo serve do mesmo jeito; basta trocar o nome do modelo na configuração.

## Onde rodar

Qualquer máquina sempre ligada que o **serviço de fundo no NAS** consiga alcançar pela rede, com um servidor
que fale a API de chat no formato do OpenAI: **Ollama** (o mais simples), llama.cpp (`llama-server`),
LM Studio ou vLLM.

- **No NAS**, num container ao lado do serviço de fundo. Fica sempre ligado. Sem placa de vídeo, cada proposta
  pode levar alguns minutos, e o sistema espera até 10 minutos por chamada.
- **Num PC com placa de vídeo**. É bem mais rápido, mas só funciona com o PC ligado.

### Exemplo com Ollama no NAS

No `docker-compose.yml` da pasta `docker/cronograma-audiovisual`, ao lado do serviço de fundo:

```yaml
  ollama:
    image: ollama/ollama
    restart: unless-stopped
    ports:
      - "11434:11434"
    volumes:
      - ./ollama:/root/.ollama
```

Depois de `docker compose up -d`:

1. Baixe o modelo. Procure o GGUF oficial do MiniCPM5-2B na página da OpenBMB no Hugging Face
   (huggingface.co/openbmb). Confira o nome exato do repositório lá.
   ```
   docker compose exec ollama ollama pull hf.co/<repositório GGUF do MiniCPM5-2B>
   docker compose exec ollama ollama cp hf.co/<repositório GGUF do MiniCPM5-2B> minicpm5
   ```
   O `cp` dá o apelido `minicpm5`, que é o nome padrão na configuração do sistema.
2. Confira se o modelo aparece: `docker compose exec ollama ollama list`.

## Configurar no sistema

Em **Configurações > Geral > Inteligência artificial**:

1. **Fornecedor**: "Modelo local".
2. **Endereço do servidor**: o endereço visto pelo serviço de fundo. Com o Ollama no mesmo compose, use
   `http://ollama:11434`; em outra máquina, use o IP dela, por exemplo `http://172.16.52.30:11434`. Pode
   terminar com ou sem `/v1`.
3. **Modelo**: o nome que aparece no `ollama list` (padrão `minicpm5`).
4. **Testar conexão**: o serviço de fundo chama o servidor e confere se o modelo existe.

A pré-escala e a classificação pela IA continuam ligadas e desligadas nos mesmos interruptores de antes.

## Requisitos

- Migração `supabase/migrations/0014_local_ai.sql` aplicada (ver `docs/publicar-1.1.0.md`).
- Serviço de fundo atualizado no NAS (`docker compose pull && docker compose up -d`), porque o fornecedor local
  mora nele.
