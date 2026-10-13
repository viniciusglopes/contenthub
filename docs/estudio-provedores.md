# Estúdio ContentHub: provedores de IA (texto, voz, imagem, vídeo, música)

Data da leitura: 12/10/2026. Todos os dados abaixo foram lidos nas páginas oficiais nessa data (URLs na seção Fontes). Nenhuma API de provedor foi chamada e nenhuma chave foi usada: é só leitura de documentação e de página de preço. O que não foi visto em página oficial está escrito como "não confirmado".

Dólar usado: PTAX de venda R$ 4,9892, cotação de 09/10/2026 13:07 (última disponível na API do Banco Central; 10 e 11/10 foram fim de semana e 12/10 é feriado nacional, sem cotação).

Resumo em uma linha por finalidade:

- Texto: `claude-haiku-5-5` (US$ 0,10 / 0,50 por 1M) é o mais barato confirmado entre os atuais; `claude-sonnet-5-5` e `gemini-3.8-flash` são os intermediários.
- Voz: ElevenLabs é o único dos três que devolve marcação de tempo (por caractere) na doc; Gemini TTS e OpenAI TTS são bem mais baratos, sem marcação de tempo documentada.
- Imagem: Gemini (`gemini-nano-banana-2.1` ou `gemini-3.1-flash-lite-image`) a US$ 0,0336 por imagem 1K, com 9:16 e 4:5 nativos.
- Vídeo: Veo 3.1 Lite (US$ 0,05/s em 720p, com áudio) e Luma Ray 3.2 (US$ 0,30 por 5 s em 720p) são os mais baratos; Sora foi desligado em 24/09/2026.
- Música: existe API (ElevenLabs Music, Google Lyria), mas os termos comerciais dependem de plano ou não estão na página técnica. Recomendação: sem trilha por padrão.

## 1. Texto (roteiro, legendas, carrossel)

Preço em US$ por 1 milhão de tokens (entrada / saída), camada padrão.

| Provedor | Modelo (ID na API) | Entrada / Saída | Como se paga | Limites | Assíncrono? | Uso comercial | Fonte |
|---|---|---|---|---|---|---|---|
| Anthropic | `claude-haiku-5-5` (mais barato) | 0,10 / 0,50 (prompt até 100 mil tokens; acima disso 0,50 / 2,50) | Pré-pago: créditos comprados no Console, expiram em 1 ano, recarga automática opcional. Fatura mensal só com acordo | Contexto 1M, saída até 128 mil | Não (síncrono; há Batch com 50% de desconto) | Permitido pelos termos comerciais (texto dos termos não lido nesta pesquisa: não confirmado) | F1, F2, F4 |
| Anthropic | `claude-sonnet-5-5` (intermediário) | 2 / 10 | idem | idem | Não | idem | F1, F2 |
| Anthropic | `claude-opus-5-5` | 4 / 20 | idem | idem | Não | idem | F1, F2 |
| Google | `gemini-3.1-flash-lite` (mais barato entre os estáveis da linha 3) | 0,25 / 1,50 | Pré-pago (mínimo US$ 5, créditos expiram em 12 meses) ou pós-pago mensal no Cloud Billing. Tem camada gratuita com limites | não confirmado | Não | "Google won't claim ownership over that content"; em camada gratuita o conteúdo é usado para melhorar produtos, na paga não | F5, F6, F7, F8 |
| Google | `gemini-3.5-flash-lite` | 0,30 / 2,50 | idem | não confirmado | Não | idem | F5, F6 |
| Google | `gemini-3.8-flash` (intermediário) | 0,75 / 3,75 em 2026; 1,50 / 7,50 a partir de 01/01/2027 | idem | não confirmado | Não | idem | F5, F6 |
| Google | `gemini-3.1-pro-preview` | 2 / 12 (até 200 mil tokens) | idem, sem camada gratuita | não confirmado | Não | idem | F5, F6 |
| Google | `gemini-2.5-flash-lite` (legado, ainda disponível) | 0,10 / 0,40 | idem | não confirmado | Não | idem | F5, F6 |
| OpenAI (opcional) | `gpt-6-luna` (mais barato) | 0,10 / 0,50 | não confirmado (página de cobrança devolveu erro 403) | não confirmado | Não | não confirmado | F9, F10 |
| OpenAI (opcional) | `gpt-6.1-sol` (intermediário) | 2 / 10 | não confirmado | não confirmado | Não | não confirmado | F9, F10 |

Observações:

- Nos modelos Claude atuais o "pensamento" é adaptativo e os tokens de pensamento são cobrados como saída. O custo real de saída pode passar da estimativa.
- Gemini e Brasil: o Brasil está na lista de regiões disponíveis da API Gemini e do AI Studio (F11).

## 2. Voz (narração em português do Brasil)

| Provedor | Modelo (ID) | pt-BR? | Preço | Formato de saída | Marcação de tempo | Como se paga | Uso comercial | Fonte |
|---|---|---|---|---|---|---|---|---|
| ElevenLabs | `eleven_v4` | Sim: "Portuguese, Brazil (por)" | US$ 0,08 por 1.000 caracteres (promoção de US$ 0,022 anunciada até 12/10) | MP3 (padrão `mp3_44100_128`), Opus, PCM, WAV, u-law, A-law. MP3 192 kbps exige plano Creator; PCM/WAV 44,1 kHz exige Pro | Sim, endpoint `/with-timestamps` devolve início e fim POR CARACTERE (agrupar em palavras no código). Modelos que suportam: não confirmado | Assinatura mensal com cota (Starter US$ 6, Creator US$ 22, Pro US$ 99) ou uso avulso pela API cobrado em dólar | Só em plano pago: "commercial usage rights are only available with paid plans". Plano gratuito não tem licença comercial | F12, F13, F14, F15, F16, F17 |
| ElevenLabs | `eleven_v4_turbo` | Sim | US$ 0,04 por 1.000 caracteres (promoção 0,011) | idem | idem | idem | idem | F12, F16 |
| ElevenLabs | `eleven_multilingual_v2` (padrão da API) | Sim: "Portuguese (Brazil, Portugal)" | US$ 0,08 por 1.000 caracteres | idem | idem (é o modelo padrão do endpoint) | idem | idem | F12, F14, F16 |
| ElevenLabs | `eleven_flash_v2_5` | Sim | US$ 0,04 por 1.000 caracteres | idem | idem | idem | idem | F12, F16 |
| OpenAI | `gpt-4o-mini-tts` | Sim (português listado; vozes otimizadas para inglês) | US$ 0,60 por 1M tokens de texto + US$ 12 por 1M tokens de áudio. Valor por minuto ou por caractere: não confirmado | mp3 (padrão), opus, aac, flac, wav, pcm | Não mencionada na doc (não confirmado; tratar como "não tem") | não confirmado | Exige avisar o usuário final de que a voz é gerada por IA | F9, F18, F19 |
| OpenAI | `tts-1` / `tts-1-hd` | Sim | US$ 15 / US$ 30 por 1M caracteres (US$ 0,015 / 0,030 por 1.000) | idem | idem | não confirmado | idem | F9, F18, F19 |
| Google | `gemini-3.8-flash-tts` | "Portuguese" listado, sem distinguir pt-BR (variante brasileira: não confirmado). Idioma é detectado sozinho | Texto US$ 0,50 + áudio US$ 9 por 1M tokens (dobra em 01/01/2027). A página dá cerca de US$ 0,00225 por 10 s de áudio | WAV 24 kHz mono 16 bits (padrão); também `audio/l16`, `audio/mulaw`, `audio/alaw` | Não mencionada (não confirmado) | Pré-pago ou pós-pago Google; tem camada gratuita | "Google won't claim ownership"; áudio sai sem marca d'água mencionada (não confirmado) | F5, F8, F20 |
| Google | `gemini-3.8-flash-lite-tts` | idem | Texto US$ 0,50 + áudio US$ 6 por 1M tokens (dobra em 2027) | idem | idem | idem | idem | F5, F20 |

Limites lidos: OpenAI aceita no máximo 4.096 caracteres por chamada (F19). ElevenLabs: 10.000 caracteres em `eleven_v4` e `eleven_multilingual_v2`, 40.000 em `eleven_flash_v2_5` (F16). Gemini TTS: limite não informado na página.

Google Cloud Text-to-Speech (produto separado do Gemini): não levantado nesta pesquisa.

## 3. Imagem

| Provedor | Modelo (ID) | Preço por imagem | 9:16 e 4:5 | Como se paga | Uso comercial / marca | Fonte |
|---|---|---|---|---|---|---|
| Google | `gemini-nano-banana-2.1` (recomendado na doc) | US$ 0,0336 (1K), 0,0504 (2K), 0,113 (4K) | Sim: 9:16 = 768x1376 (1K); 4:5 = 928x1152 (1K) | Pré-pago ou pós-pago Google. Sem camada gratuita | Toda imagem leva marca d'água invisível SynthID. Google não reivindica a propriedade | F5, F8, F21 |
| Google | `gemini-3.1-flash-lite-image` | US$ 0,0336 (só 1K) | Sim (lista inclui 4:5 e 9:16) | idem | idem | F5, F21 |
| Google | `gemini-3.1-flash-image` | US$ 0,045 (0,5K), 0,067 (1K), 0,101 (2K), 0,151 (4K) | Sim: 9:16 = 768x1376; 4:5 = 928x1152 | idem | idem | F5, F21 |
| Google | `gemini-3-pro-image` | US$ 0,134 (1K/2K), 0,24 (4K) | Sim | idem | idem | F5, F21 |
| OpenAI | `gpt-image-2.5-flare` e `gpt-image-2.5-sunburst` | Por token (imagem: US$ 8 entrada / US$ 30 saída por 1M). Preço por imagem só na calculadora interativa: não confirmado. Referência do modelo anterior `gpt-image-2`: 1024x1536 a US$ 0,005 (low), 0,041 (medium), 0,165 (high) | Tamanhos recomendados 1024x1024, 1536x1024, 1024x1536 (2:3). Aceita `LARGURAxALTURA` livre com lados múltiplos de 16, proporção até 3:1 e 655.360 a 8.294.400 pixels; logo 720x1280 (9:16) e 1024x1280 (4:5) cabem na regra. Não testado | não confirmado. Exige verificação da organização na OpenAI | não confirmado | F9, F22 |
| Black Forest Labs (opcional) | FLUX 3 Image | US$ 0,041 (768x768), 0,048 (cerca de 1 MP), 0,100 (cerca de 4 MP) | não confirmado | Créditos pré-pagos, 1 crédito = US$ 0,01 | não confirmado | F23 |
| Black Forest Labs (opcional) | FLUX.2 [pro] / FLUX.2 [klein] 4B | a partir de US$ 0,03 / a partir de US$ 0,014 | não confirmado | idem | não confirmado | F23 |

Imagen (Google) aparece como desligado na página de modelos; não usar.

## 4. Vídeo generativo

| Provedor | Modelo (ID) | Custo por segundo | Duração por geração | 9:16 | Resolução | Tempo de geração | Assíncrono? | Áudio | Restrições | Como se paga | Fonte |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Google (API Gemini) | `veo-3.1-lite-generate-preview` | US$ 0,05 (720p), 0,08 (1080p) | 4, 6 ou 8 s (1080p exige 8 s) | Sim (`16:9` ou `9:16`) | 720p, 1080p | 11 s no mínimo, até 6 min em pico | Sim: operação longa + consulta (polling). Webhook: não confirmado | Sempre incluso | Marca SynthID. Vídeo fica 2 dias no servidor. Inglês é o idioma plenamente suportado para o prompt. Restrição de pessoas vale para UE, Reino Unido, Suíça e Oriente Médio; Brasil não é citado. Só cobra se gerar | Pré-pago ou pós-pago Google. Sem camada gratuita | F5, F24 |
| Google (API Gemini) | `veo-3.1-fast-generate-preview` | US$ 0,10 (720p), 0,12 (1080p), 0,30 (4K) | 4, 6 ou 8 s | Sim | 720p, 1080p, 4K | idem | idem | Sempre incluso | idem | idem | F5, F24 |
| Google (API Gemini) | `veo-3.1-generate-preview` | US$ 0,40 (720p e 1080p), 0,60 (4K) | 4, 6 ou 8 s | Sim | 720p, 1080p, 4K | idem | idem | Sempre incluso | idem | idem | F5, F24 |
| Google (API Gemini) | `gemini-omni-1.1-flash` | cerca de US$ 0,10 por segundo em 720p (saída de vídeo a US$ 17,50 por 1M tokens) | não confirmado na doc do Google (extensão soma até 40 s no total; a Runway lista 3 a 10 s para o mesmo modelo) | Sim (`9:16` ou `16:9`) | 360p, 720p (padrão), 1080p e 4K por ampliação | não informado | Chamada pode ser síncrona; com `delivery: "uri"` consulta-se o arquivo até `ACTIVE` | Incluso | Marca SynthID. Sem camada gratuita | idem | F5, F25 |
| Runway | `gen4.5` | US$ 0,12 (12 créditos) | 2 a 10 s | Sim (`720:1280`) | 720p | não informado (SDK espera até 10 min) | Sim: tarefa + consulta. Webhook: não confirmado | Sem campo de áudio no modelo (não confirmado que saia mudo) | URLs de saída expiram em 24 a 48 h. Camada 1: 1 a 2 simultâneos, 50 a 200 gerações por dia, até US$ 100 por mês | Créditos pré-pagos, US$ 0,01 por crédito. Mínimo de compra e validade: não confirmado | F26, F27, F28 |
| Runway | `gen4_turbo` (só imagem para vídeo) | US$ 0,05 (5 créditos) | 2 a 10 s | Sim (`720:1280`) | 720p | idem | idem | Sem campo de áudio | idem | idem | F26, F27 |
| Runway | `veo3.1_fast` / `veo3.1` (revenda do Veo) | US$ 0,15 / 0,40 com áudio; 0,10 / 0,20 sem áudio | 4, 6 ou 8 s | Sim (`720:1280`, `1080:1920`) | 720p, 1080p | idem | idem | Opcional (`audio`, padrão ligado) | idem | idem | F26, F27 |
| Luma | `ray-3.2` | 5 s: US$ 0,06 (360p), 0,15 (540p), 0,30 (720p), 1,20 (1080p). 10 s: 0,18 / 0,45 / 0,90 / 3,60. Em 720p dá US$ 0,06/s (5 s) ou 0,09/s (10 s) | `5s` ou `10s` | Sim (`9:16`, `3:4`, `1:1`, `4:3`, `16:9`, `21:9`) | 360p, 540p, 720p (padrão), 1080p | 5 s em 720p: "bem menos de dois minutos" | Sim: geração + consulta. Webhook: não confirmado | Não mencionado (não confirmado) | URL de saída expira em 1 h (consultar de novo gera outra). Falha por moderação é reembolsada. Marca d'água e termos comerciais: não confirmado | Pós-uso por geração em dólar, "No minimum spend, no contract" | F29, F30, F31 |
| Kling | Kling 3.0 Turbo (caminho `/text-to-video/kling-3.0-turbo`) | US$ 0,112 (720p), 0,14 (1080p), com áudio nativo | 3 a 15 s | Sim (`16:9`, `9:16`, `1:1`) | 720p, 1080p | não informado | Sim: tarefa + consulta, e `callback_url` (webhook) | Incluso (áudio nativo) | Resultado apagado em 30 dias. Marca d'água só se pedir. Termos: "use of the AI-generated content for commercial purposes is not restricted". Domínio para fora da China: api-singapore.klingai.com. Brasil: não citado | Saldo pré-pago ou pacotes de unidades com validade; sem reembolso | F32, F33, F34, F35 |
| Kling | Kling 3.0 | US$ 0,084 (720p) / 0,112 (1080p) sem áudio; 0,126 / 0,168 com áudio | não confirmado | não confirmado | 720p, 1080p, 4K | não informado | idem | Opcional | idem | idem | F34 |
| Kling | Kling 2.5 Turbo | US$ 0,042 (720p) / 0,07 (1080p), sem áudio | não confirmado | não confirmado | 720p, 1080p | não informado | idem | Não | idem | idem | F34 |
| OpenAI | Sora 2 (`sora-2`, `sora-2-pro`) | INDISPONÍVEL | | | | | | | "The Sora 2 models and Videos API were shut down on September 24, 2026"; sem substituto direto | | F36 |

Outros modelos com API pública pela Runway (lidos na especificação, preço não levantado): `seedance2`, `seedance2_5`, `hailuo3`, `wan3`, `grok_imagine_1_5`, `happyhorse_1_0`, `h3_max`.

## 5. Trilha / música

| Provedor | Modelo (ID) | Preço | Duração | Como se paga | Uso comercial | Fonte |
|---|---|---|---|---|---|---|
| ElevenLabs Music | `music_v2_5` (também `music_v2`, `music_v1`) | US$ 0,15 por minuto | 3 s a 5 min pela página de preço (a referência da API aceita `music_length_ms` de 3000 a 600000) | Só para assinantes pagos | "cleared for nearly all commercial uses" (filme, TV, podcast, redes sociais, anúncio, jogos), mas o uso permitido varia por plano conforme os termos de música (texto dos termos por plano: não confirmado). Licença comercial de música a partir do Starter | F12, F37, F38 |
| Google Lyria | `lyria-3.5` | US$ 0,08 por música | "cerca de dois minutos" | Pré-pago ou pós-pago Google. Sem camada gratuita | Página técnica não trata de uso comercial (não confirmado). Áudio leva marca SynthID. Bloqueia pedido de voz de artista e letra protegida | F5, F39 |
| Google Lyria | `lyria-3-clip-preview` (legado) | US$ 0,04 por clipe | 30 s fixos | idem | idem | F5, F39 |
| Kling | Text to Audio | US$ 0,035 por chamada | não confirmado | Saldo Kling | não confirmado para áudio | F34 |

Recomendação: **sem trilha por padrão**. Os termos comerciais de música não estão claros o bastante nas páginas lidas (ElevenLabs depende do plano e de um documento de termos não lido; Lyria não fala de uso comercial na página técnica). Além disso, o Instagram oferece trilha licenciada na hora de publicar. Se o cliente pedir trilha gerada, a opção de menor custo é um clipe instrumental de 30 s no Lyria (US$ 0,04) ou 20 s no ElevenLabs (US$ 0,05), depois de ler os termos do plano contratado.

## 6. Custo estimado

Câmbio: R$ 4,9892 por dólar (PTAX venda de 09/10/2026).

### 6.1 Carrossel de 7 slides (2.000 tokens de entrada + 1.500 de saída)

| Modelo | Conta | US$ | R$ |
|---|---|---|---|
| `claude-haiku-5-5` | 2.000 x 0,10 + 1.500 x 0,50, por 1M | 0,00095 | 0,0047 |
| `gpt-6-luna` | 2.000 x 0,10 + 1.500 x 0,50 | 0,00095 | 0,0047 |
| `gemini-2.5-flash-lite` (legado) | 2.000 x 0,10 + 1.500 x 0,40 | 0,00080 | 0,0040 |
| `gemini-3.1-flash-lite` | 2.000 x 0,25 + 1.500 x 1,50 | 0,00275 | 0,0137 |
| `gemini-3.5-flash-lite` | 2.000 x 0,30 + 1.500 x 2,50 | 0,00435 | 0,0217 |
| `gemini-3.8-flash` | 2.000 x 0,75 + 1.500 x 3,75 | 0,00713 | 0,0355 |
| `claude-sonnet-5-5` | 2.000 x 2 + 1.500 x 10 | 0,01900 | 0,0948 |
| `gpt-6.1-sol` | 2.000 x 2 + 1.500 x 10 | 0,01900 | 0,0948 |
| `gemini-3.1-pro-preview` | 2.000 x 2 + 1.500 x 12 | 0,02200 | 0,1098 |
| `claude-opus-5-5` | 2.000 x 4 + 1.500 x 20 | 0,03800 | 0,1896 |

Em todos, o texto de um carrossel custa menos de R$ 0,20. Tokens de pensamento entram como saída e podem aumentar esse valor.

### 6.2 Reel de 20 s, nível 1 "montado"

Composição: roteiro por texto (mesma conta do carrossel, usada como teto) + narração de cerca de 300 caracteres + 4 imagens de IA opcionais. A montagem em si (ffmpeg ou similar) não tem custo de API.

Narração de 300 caracteres:

| Voz | Conta | US$ | R$ |
|---|---|---|---|
| `gemini-3.8-flash-lite-tts` | cerca de 20 s de áudio a US$ 0,0015 por 10 s (proporcional ao valor da página para o modelo de US$ 9) | 0,0030 | 0,015 |
| `gemini-3.8-flash-tts` | cerca de 20 s a US$ 0,00225 por 10 s | 0,0045 | 0,022 |
| OpenAI `tts-1` | 300 x US$ 15 por 1M caracteres | 0,0045 | 0,022 |
| ElevenLabs `eleven_flash_v2_5` | 300 x US$ 0,04 por 1.000 | 0,0120 | 0,060 |
| ElevenLabs `eleven_v4` ou `eleven_multilingual_v2` | 300 x US$ 0,08 por 1.000 | 0,0240 | 0,120 |

A duração de 20 s para 300 caracteres é uma suposição (cerca de 15 caracteres por segundo), não vem da documentação.

4 imagens:

| Imagem | Conta | US$ | R$ |
|---|---|---|---|
| `gemini-nano-banana-2.1` ou `gemini-3.1-flash-lite-image` (1K) | 4 x 0,0336 | 0,1344 | 0,67 |
| `gemini-3.1-flash-image` (1K) | 4 x 0,067 | 0,2680 | 1,34 |
| `gpt-image-2` medium 1024x1536 (referência; 2.5 não confirmado) | 4 x 0,041 | 0,1640 | 0,82 |
| FLUX.2 [pro] | 4 x 0,03 (a partir de) | 0,1200 | 0,60 |

Totais de exemplo do nível montado:

| Combinação | US$ | R$ |
|---|---|---|
| Haiku + Gemini Flash-Lite TTS, sem imagens de IA | 0,0040 | 0,02 |
| Haiku + Gemini Flash-Lite TTS + 4 imagens Nano Banana 2.1 | 0,1384 | 0,69 |
| Haiku + ElevenLabs v4 (com marcação de tempo) + 4 imagens Nano Banana 2.1 | 0,1594 | 0,80 |

### 6.3 Reel de 20 s, nível 2 "vídeo de IA"

20 s de vídeo gerado em 9:16 e 720p, mais roteiro (US$ 0,001) e narração ElevenLabs (US$ 0,024), ou seja, US$ 0,025 (R$ 0,12) somados ao vídeo.

| Provedor / modelo | Cenas | Vídeo US$ | Vídeo R$ | Total com roteiro e narração (US$ / R$) |
|---|---|---|---|---|
| Luma `ray-3.2` 540p | 4 x 5 s a 0,15 | 0,60 | 2,99 | 0,625 / 3,12 |
| Kling 2.5 Turbo 720p sem áudio (durações não confirmadas) | 20 s a 0,042 | 0,84 | 4,19 | 0,865 / 4,32 |
| Google `veo-3.1-lite-generate-preview` 720p | 8 + 6 + 6 s a 0,05 | 1,00 | 4,99 | 1,025 / 5,11 |
| Luma `ray-3.2` 720p | 4 x 5 s a 0,30 | 1,20 | 5,99 | 1,225 / 6,11 |
| Luma `ray-3.2` 720p | 2 x 10 s a 0,90 | 1,80 | 8,98 | 1,825 / 9,11 |
| Google `veo-3.1-fast-generate-preview` 720p | 8 + 6 + 6 s a 0,10 | 2,00 | 9,98 | 2,025 / 10,10 |
| Google `gemini-omni-1.1-flash` 720p (valor aproximado) | 20 s a cerca de 0,10 | 2,00 | 9,98 | 2,025 / 10,10 |
| Kling 3.0 Turbo 720p com áudio | 2 x 10 s a 0,112 | 2,24 | 11,18 | 2,265 / 11,30 |
| Runway `gen4.5` | 2 x 10 s a 0,12 | 2,40 | 11,97 | 2,425 / 12,10 |
| Runway `veo3.1_fast` com áudio | 8 + 6 + 6 s a 0,15 | 3,00 | 14,97 | 3,025 / 15,09 |
| Google `veo-3.1-generate-preview` 720p | 8 + 6 + 6 s a 0,40 | 8,00 | 39,91 | 8,025 / 40,04 |
| OpenAI Sora | indisponível desde 24/09/2026 | | | |

Leitura prática: o Reel "montado" custa centavos (até cerca de R$ 0,80 com 4 imagens). O Reel com vídeo de IA custa de R$ 3 a R$ 15 nos modelos econômicos e R$ 40 no Veo padrão, por tentativa. Cada cena refeita cobra de novo.

## 7. Não confirmado

- OpenAI: forma de pagamento da API (pré-pago, mínimo, validade); a página de ajuda devolveu erro 403.
- OpenAI: preço por imagem dos modelos `gpt-image-2.5-*` (só em calculadora interativa) e nome exato do parâmetro de formato de saída na API de imagens.
- OpenAI `gpt-4o-mini-tts`: preço por minuto ou por caractere (a página só dá preço por token).
- OpenAI e Gemini TTS: marcação de tempo por palavra não aparece na documentação.
- Gemini TTS: pt-BR como variante separada (a tabela só diz "Portuguese"), limite de texto por chamada.
- Gemini texto: nome REST do limite de saída (`max_output_tokens` aparece na referência da Interactions; `temperature` aparece no guia mas não na parte lida da referência).
- Gemini Omni Flash: duração máxima por geração e parâmetro de duração.
- Veo: webhook; limites de requisição por minuto.
- Runway: mínimo de compra de créditos, validade dos créditos, webhook, se `gen4.5` sai com ou sem áudio, preço dos modelos de terceiros.
- Luma: áudio no vídeo, marca d'água, termos de uso comercial, webhook, chamada gratuita para testar a chave, estados intermediários além de `queued`.
- Kling: duração e proporção dos modelos 3.0 e 2.5 Turbo (só o 3.0 Turbo foi lido), disponibilidade formal no Brasil, validade dos pacotes.
- ElevenLabs: quais modelos aceitam `/with-timestamps`; termos de música por plano; preço de excedente por plano.
- Black Forest Labs: proporções aceitas e termos comerciais.
- Anthropic: texto dos termos comerciais sobre propriedade da saída; valor mínimo de compra de créditos.
- Google Cloud Text-to-Speech: não levantado.
- Disponibilidade no Brasil de Runway, Luma, ElevenLabs e OpenAI: nenhuma página lida trata do assunto.

## 8. Fontes

Todas lidas em 12/10/2026.

- F1: https://platform.claude.com/docs/en/about-claude/pricing
- F2: https://platform.claude.com/docs/en/about-claude/models/overview
- F3: https://platform.claude.com/docs/en/api/messages/create e https://platform.claude.com/docs/en/api/models/list
- F4: https://support.claude.com/en/articles/8977456-how-do-i-pay-for-my-claude-api-usage
- F5: https://ai.google.dev/gemini-api/docs/pricing
- F6: https://ai.google.dev/gemini-api/docs/models
- F7: https://ai.google.dev/gemini-api/docs/billing
- F8: https://ai.google.dev/gemini-api/terms
- F9: https://developers.openai.com/api/docs/pricing
- F10: https://developers.openai.com/api/docs/models e https://developers.openai.com/api/docs/guides/text
- F11: https://ai.google.dev/gemini-api/docs/available-regions
- F12: https://elevenlabs.io/pricing/api
- F13: https://elevenlabs.io/pricing
- F14: https://elevenlabs.io/docs/api-reference/text-to-speech/convert
- F15: https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps
- F16: https://elevenlabs.io/docs/overview/models
- F17: https://elevenlabs.io/docs/overview/capabilities/text-to-speech e https://elevenlabs.io/docs/api-reference/authentication e https://elevenlabs.io/docs/api-reference/user/subscription/get
- F18: https://developers.openai.com/api/docs/guides/text-to-speech
- F19: https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create
- F20: https://ai.google.dev/gemini-api/docs/speech-generation
- F21: https://ai.google.dev/gemini-api/docs/image-generation
- F22: https://developers.openai.com/api/docs/guides/image-generation
- F23: https://docs.bfl.ai/quick_start/pricing
- F24: https://ai.google.dev/gemini-api/docs/veo
- F25: https://ai.google.dev/gemini-api/docs/omni e https://ai.google.dev/api/interactions-api
- F26: https://docs.dev.runwayml.com/guides/pricing/
- F27: https://docs.dev.runwayml.com/api/ e https://docs.dev.runwayml.com/guides/using-the-api/
- F28: https://docs.dev.runwayml.com/usage/tiers/
- F29: https://docs.agents.lumalabs.ai
- F30: https://docs.agents.lumalabs.ai/guides/pricing/
- F31: https://docs.agents.lumalabs.ai/guides/videos/generation e https://docs.agents.lumalabs.ai/api/
- F32: https://kling.ai/document-api/api/get-started/authentication.md
- F33: https://kling.ai/document-api/api/video/3-0-turbo/text-to-video.md
- F34: https://kling.ai/document-api/pricing/base/video.md
- F35: https://kling.ai/document-api/guides/protocols/paid-service.md e https://kling.ai/document-api/api/assets/account-usage.md
- F36: https://developers.openai.com/api/docs/guides/video-generation
- F37: https://elevenlabs.io/docs/overview/capabilities/music
- F38: https://elevenlabs.io/docs/api-reference/music/compose
- F39: https://ai.google.dev/gemini-api/docs/music-generation
- PTAX: https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/ (recurso CotacaoDolarPeriodo, de 05/10 a 12/10/2026; última cotação 09/10/2026, venda 4,9892)
