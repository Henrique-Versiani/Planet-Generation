# Planeta Low Poly Procedural em WebGL

Este repositório contém um projeto de Computação Gráfica focado na geração procedural de um planeta tridimensional estilizado (Low Poly). O projeto foi desenvolvido utilizando WebGL puro, aplicando conceitos matemáticos avançados de geometria e renderização em tempo real sem a dependência de engines de alto nível (como Three.js).

<img width="783" height="566" alt="image" src="https://github.com/user-attachments/assets/a7d1a559-1d93-4f3a-be21-9a14ca91f082" />

## Implementação

O projeto foi estruturado para atender aos seguintes requisitos propostos:

* **Geração Procedural:** O terreno do planeta é construído a partir de uma `IcoSphere` subdividida, cujos vértices são deformados por funções de ruído matemático (Simplex, Perlin ou Value Noise). O modelo suporta o uso de Oitavas (FBM - *Fractal Brownian Motion*) para detalhamento complexo da erosão.
* **Interface de Parâmetros:** Um painel lateral em HTML/CSS flutua sobre o canvas. Ele permite configurar a geração em tempo real, alterando a semente (seed), resolução da malha, intensidade e frequência do relevo, oitavas, nível da água e a paleta completa de cores de cada bioma.
* **Sistema Interativo:** Implementação de *Raycasting* manual iterando sobre a geometria do planeta. O utilizador pode clicar na superfície para interagir com o ambiente e plantar árvores de forma pontual.
* **Sistema de Animação:** O planeta, as nuvens e um modelo de avião mantêm uma animação de órbita e rotação contínua. Ao plantar uma árvore, o sistema aciona uma animação de "crescimento" calculada através de uma função trigonométrica de amortecimento (*Ease Out Elastic*), proporcionando um efeito orgânico.
* **Sombras Dinâmicas:** Implementação de *Shadow Mapping* (renderização em duas passadas) com um mapa de profundidade de 1024x1024. Todos os objetos projetam e recebem sombras corretamente, com tratamento avançado de *Normal Bias* no *Vertex Shader* para mitigação de *Shadow Acne*.

## Arquitetura do Código

A base de código foi dividida logicamente para separar a matemática abstrata da lógica de renderização da GPU:

* **`index.html`:** Estrutura da interface do utilizador (painel de controlos), folha de estilos integrada e inicialização do canvas WebGL.
* **`main.js`:** O controlador principal. Gere o contexto WebGL, compila os shaders GLSL (Blinn-Phong lighting e Shadow Mapping), mantém o *Render Loop*, lida com o *input* do rato (Raycasting) e o estado global da aplicação.
* **`geometry.js`:** Focado inteiramente na construção de dados 3D. Contém a classe `IcoSphere`, algoritmos de subdivisão espacial, pintura de vértices baseada em altitude e geradores de geometria de objetos instanciados (árvores) otimizados para recálculo durante as animações.
* **`utils.js`:** Biblioteca de utilitários matemáticos. Contém geradores de números pseudoaleatórios com semente, algoritmos de ruído construídos do zero (`PerlinNoise3D` e `ValueNoise3D`), um *parser* de ficheiros `.obj` e funções de interpolação/easing.

## Tecnologias Utilizadas

* **Linguagem:** JavaScript (ES6)
* **API Gráfica:** WebGL 1.0 (GLSL)
* **Bibliotecas Externas:**
    * `gl-matrix-min.js`: Para cálculos matriciais rápidos e operações vetoriais.
    * `simplex-noise.min.js`: Para acesso rápido ao algoritmo de ruído Simplex otimizado.

## Como Executar

Por utilizar requisições assíncronas (como o carregamento do `aviao.obj` e `nuvem.obj` via `fetch`), o projeto requer um servidor local para contornar políticas de CORS do navegador.

1. Clone este repositório.
2. Abra a pasta do projeto utilizando uma extensão como o **Live Server** do VS Code, ou utilize o Python no terminal:
   ```bash
   python -m http.server 8000

3. Acesse a http://localhost:8000 no seu navegador.

4. Utilize o painel lateral para gerar novas sementes ou clique na superfície do planeta para plantar árvores.
