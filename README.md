# 🛡️ CiberHeróis - Plataforma Educativa de Cibersegurança

O **CiberHeróis** é uma plataforma web interativa desenvolvida para ensinar conceitos fundamentais de cibersegurança de forma divertida e gamificada. Através de quizzes, jogos e recursos educativos, os utilizadores podem aprender a proteger-se no mundo digital, ganhar pontos, subir de nível e interagir numa comunidade escolar segura.

## 🚀 Funcionalidades Principais

- **Sistema de Gamificação e Leaderboard:** Ganho de pontos, subida de nível, conquista de medalhas (ex: "Guardião da Web") e uma *Leaderboard Global (Hall of Fame)* competitiva. Conta ainda com um sistema de "Ofensiva" (Dias em Chamas) para premiar a consistência.
- **Motor de Privacidade (Privacy by Design):** Controlo granular e absoluto sobre a pegada digital do utilizador. Permite ativar um **"Modo Anónimo"** (invisibilidade total na pesquisa e acessos) ou um Perfil Público com ocultação seletiva de estatísticas, medalhas, turmas e histórico.
- **Pesquisa de utilizadores:** Sistema de pesquisa global de utilizadores e visualização de perfis públicos interativos, censurados dinamicamente consoante as definições de privacidade do alvo.
- **Esquadrões Táticos (Turmas e Roles):** Sistema de códigos de convite para os alunos se juntarem a turmas. Arquitetura baseada em papéis (RBAC) com painéis distintos para **Alunos** e **Professores** (monitorização de turmas).
- **Personalização de Identidade:** Upload de avatares personalizados ou escolha de heróis pré-definidos.
- **Quizzes Dinâmicos e Simuladores:** Questionários sobre HTTPS, Passwords, Redes, entre outros e um Jogo "Detetor de Phishing" onde o utilizador analisa emails reais para identificar ameaças.
- **Interface Moderna:** Modo Escuro (Dark Mode) adaptável, UI responsiva com modais inteligentes e interativos.

## 🛠️ Tecnologias Utilizadas

### Frontend
- **HTML5 & CSS3:** Estrutura e estilização avançada (incluindo variáveis globais para Dark Mode e Flexbox/Grid).
- **JavaScript:** Lógica de interatividade, consumo de APIs (Fetch) e manipulação dinâmica do DOM.
- **Lucide Icons:** Biblioteca de ícones vetoriais modernos.

### Backend
- **Node.js & Express:** Servidor robusto e gestão de rotas API modulares.
- **Supabase (PostgreSQL):** Base de dados relacional e escalável (BaaS) para armazenamento do progresso, utilizadores e permissões.
- **Express-Session:** Gestão de sessões seguras no lado do servidor.
- **Multer:** Processamento e gestão de uploads de imagens (Avatares).

## 📋 Pré-requisitos

Antes de começar,será necessário ter instalado/configurado na máquina:
- [Node.js](https://nodejs.org/) (Versão 16+ recomendada)
- Conta e Projeto configurado no [Supabase](https://supabase.com/)

## 🔧 Instalação e Configuração

1. **Clonar o repositório:**
   ```bash
   git clone https://github.com/gamerPT5/CiberHerois.git
   cd ciberherois
   ```

2. **Instalar dependências:**
   ```bash
   npm install
   ```

3. **Configurar a Base de Dados (Supabase):**
   * Criar um novo projeto no Supabase.
   * Executar os scripts SQL necessários para criar as tabelas (`utilizador`, `progresso`, `atividade`, `turma`, `escola`, `utilizador_medalha`).

4. **Configurar variáveis de ambiente:**
   Criar um ficheiro `.env` na raiz do projeto com o seguinte conteúdo (ajusta os valores para o teu projeto):
   ```env
   PORT=3000
   SUPABASE_URL=https://projeto.supabase.co
   SUPABASE_KEY=chave_anon_ou_service_role
   SESSION_SECRET=uma_chave_secreta_muito_longa_e_segura
   ```

5. **Iniciar o servidor:**
   ```bash
   npm start / node server.js
   ```

O projeto estará disponível no browser em `http://localhost:3000`.

## 📂 Estrutura do Projeto

* **`/pages`**: Ficheiros HTML da interface da aplicação (`profile.html`, `search.html`, `leaderboard.html`, `settings.html`, etc.).
* **`/css`**: Folhas de estilo modulares (`style.css`, `dark-mode.css`, `popup_modal.css`).
* **`/js`**: Scripts de cliente globais (`theme.js`, `global-init.js`).
* **`/routes`**: API Backend dividida por domínio funcional (`auth.js`, `profile.js`, `stats.js`, `leaderboard.js`, `gestao.js`).
* **`/utils`**: Utilitários do backend (ex: `logger.js`).
* **`server.js`**: Ponto de entrada da aplicação, onde os middlewares e o Express são instanciados.

## 🛡️ Segurança e Privacidade Implementadas

* **Privacy by Design e APIs Seguras:** O backend filtra agressivamente os dados enviados. Se um perfil está no modo "Invisível", a API devolve um erro `404 Not Found` propositado, protegendo a identidade do utilizador contra acessos diretos.
* **Proteção de Rotas (Middlewares):** As rotas de API verificam a validade da sessão e as permissões do utilizador (Admin/Professor/Aluno) antes de qualquer operação de leitura ou escrita.
