# DRONEPOL SP — Central Operacional UAS

PWA estático pronto para GitHub Pages. Não requer Node, npm, banco de dados ou servidor próprio.

## Publicar no GitHub Pages

1. Crie/abra o repositório desejado no GitHub.
2. Envie **todos os arquivos e pastas deste pacote para a raiz do repositório**.
3. No GitHub: **Settings → Pages**.
4. Em **Build and deployment**, escolha **Deploy from a branch**.
5. Branch: **main** / pasta **/(root)** → **Save**.
6. Aguarde o GitHub publicar e abra o endereço informado em Pages.
7. No iPhone, abra o site no Safari → Compartilhar → **Adicionar à Tela de Início**.

## Funções incluídas

- PWA instalável.
- GPS do dispositivo com precisão informada pelo navegador.
- Condições meteorológicas atuais via Open-Meteo.
- Previsão horária e diária.
- Gráficos de vento, rajadas e precipitação.
- Índice Kp via NOAA SWPC (quando o navegador/serviço permitir).
- Análise meteorológica explicável baseada no perfil da aeronave.
- Perfil inicial DJI Matrice 4T e perfil genérico editável.
- Mapa OpenStreetMap/Leaflet.
- Busca informativa de aeródromos/helipontos no OpenStreetMap via Overpass.
- Separação clara entre mapa/geofence e autorização oficial.
- Atalhos oficiais para Portal DRONE/UAS/SARPAS, AISWEB e REDEMET.
- Atalho DJI FlySafe separado das fontes oficiais.
- Módulo METAR/TAF com armazenamento local e decodificação básica de METAR colado pelo usuário.
- Checklist operacional por grupos, salvo no aparelho.
- Modo de teste separado do modo operacional.
- Dados meteorológicos salvos localmente para exibição quando a conexão cair.

## Limitação importante do METAR/TAF automático

A API pública do Aviation Weather Center informa que **CORS não é permitido**. Por isso, um PWA 100% estático hospedado no GitHub Pages não pode chamar essa API diretamente do navegador com confiabilidade. Esta versão oferece consulta nas fontes aeronáuticas e decodificação local de METAR colado pelo usuário.

Se no futuro o projeto tiver um pequeno backend/proxy (Cloudflare Worker, Firebase Function, Cloud Run etc.), o METAR/TAF pode ser automatizado sem expor chaves e sem contornar as políticas do serviço.

## Fontes externas usadas em tempo real

- Open-Meteo: clima e previsão.
- NOAA Space Weather Prediction Center: Kp.
- OpenStreetMap + Overpass: pontos cartográficos de aeródromos/helipontos.
- DECEA: links oficiais para DRONE/UAS/SARPAS, AISWEB e REDEMET.
- DJI FlySafe: geofencing do fabricante (não é autorização oficial).

## Nota sobre Matrice 4T

O perfil inicial usa um valor operacional conservador para vento e deixa tudo editável. A DJI informa resistência máxima ao vento de 12 m/s (43,2 km/h) durante decolagem e pouso e informa que a Matrice 4 Series não é à prova d'água. O app não transforma especificação do fabricante em autorização de voo ou limite legal.

## Uso operacional

Ferramenta de apoio. Não substitui manual da aeronave, normas aplicáveis, autorização de acesso ao espaço aéreo, NOTAM, ARO, coordenação, briefing ou decisão do RPIC.
