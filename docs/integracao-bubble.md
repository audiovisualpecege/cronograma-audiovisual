# Integração com o sistema de pedidos (Bubble)

Ideia para depois da 1.2.0, combinada na revisão de 18/11/2026. Ainda não está no código.

## Por que

Muitos eventos da agenda começam com o número do pedido feito no outro sistema da empresa, que roda no Bubble:
"ID 20260911 Gravação: Cursos Solution 2026". Desde a 1.2.0, o app ignora esse número para achar o tipo pelo resto
do título. O pedido, porém, tem bem mais do que o título: o que foi pedido, o local, o tamanho e quem pediu. Com
isso, o app acertaria o tipo e o porte sem adivinhar.

## O que pedir a quem cuida do Bubble

1. Ligar a **Data API** do app: em **Settings > API**, marcar **Enable Data API** e, na lista que aparece, marcar só
   o tipo de dado dos pedidos (por exemplo, "Demanda").
2. Gerar uma **chave de API** (**Settings > API > Generate a new API token**) com um nome como
   `cronograma-audiovisual`. Ela vale só para leitura enquanto o app só fizer consultas.
3. Mandar três coisas, por um canal seguro (nunca por e-mail aberto nem pelo repositório):
   - o endereço do app no Bubble (algo como `https://app.exemplo.com.br`);
   - o nome do tipo de dado dos pedidos e o nome do campo com o número (o "ID 2026...");
   - a chave.
4. Dizer quais campos do pedido contam o que é a demanda: tipo de serviço, local, duração, quantidade de pessoas
   ou equipe pedida.

## Como o app usaria

- O serviço de fundo, ao ler a agenda, vê o número no começo do título e busca o pedido em
  `GET <app>/api/1.1/obj/<tipo>?constraints=[{"key":"<campo do número>","constraint_type":"equals","value":"20260911"}]`,
  com o cabeçalho `Authorization: Bearer <chave>`.
- Os campos do pedido entram antes das regras de título: tipo e porte do pedido valem mais que os adivinhados.
- A chave fica só no NAS, como a conta de serviço do Google, nunca no app nem no repositório.
- Sem resposta do Bubble, tudo continua como na 1.2.0.
