# 🛡️ CiberHeróis - Plataforma Educativa de Cibersegurança

O **CiberHeróis** é uma plataforma web interativa desenvolvida para ensinar conceitos fundamentais de cibersegurança de forma divertida e gamificada. Através de quizzes, jogos e recursos educativos, os utilizadores aprendem a proteger-se no mundo digital, ganham pontos, sobem de nível e interagem numa comunidade escolar segura.

## 🚀 Funcionalidades Principais

- **Sistema de Gamificação e Leaderboard:** Ganho de pontos, subida de nível, conquista de medalhas (ex: "Guardião da Web") e uma *Leaderboard Global (Hall of Fame)* competitiva. Inclui sistema de "Ofensiva" (Streak de dias em chamas) para premiar a consistência diária.
- **Motor de Privacidade (Privacy by Design):** Controlo granular e absoluto sobre a pegada digital do utilizador. Permite ativar um **"Modo Anónimo"** (invisibilidade total na pesquisa e acessos) ou um Perfil Público com ocultação seletiva de estatísticas, medalhas, turmas e histórico.
- **Pesquisa de Utilizadores:** Sistema de pesquisa global e visualização de perfis públicos, censurados dinamicamente consoante as definições de privacidade do utilizador alvo.
- **Esquadrões Táticos (Turmas e Roles):** Sistema de códigos de convite para os alunos se juntarem a turmas. Arquitetura baseada em papéis (RBAC) com painéis distintos para **Alunos**, **Professores** e **Administradores**.
- **Personalização de Identidade:** Upload de avatares personalizados ou escolha de heróis pré-definidos.
- **Quizzes Dinâmicos com IA:** Questionários sobre HTTPS, Passwords, Redes, entre outros, com **dicas geradas em tempo real pela Google Gemini AI** para apoiar a aprendizagem.
- **Simulador de Phishing:** Jogo interativo onde o utilizador analisa emails reais e classifica ameaças de phishing.
- **CiberTermo:** Jogo de adivinhar palavras (estilo Wordle) com vocabulário temático de cibersegurança, com suporte a Dark Mode.
- **Loja de Recompensas:** Sistema de loja onde os utilizadores podem gastar os pontos ganhos em recompensas e itens virtuais, com modal de confirmação de compra personalizado.
- **Histórico de Atividade:** Registo detalhado de toda a atividade do utilizador.
- **Recursos Educativos:** Artigos e guias sobre Passwords Seguras, Phishing e outros tópicos relevantes de cibersegurança com exportação para **PDF** gerado no servidor (via Puppeteer).
- **Painel Administrativo:** Interface completa para gestão de utilizadores, turmas, escolas e monitorização global da plataforma.
- **Painel do Professor:** Monitorização de turmas, estatísticas individuais por aluno e exportação de relatórios em PDF.
- **Autenticação Google OAuth:** Login alternativo via conta Google para maior comodidade e segurança.
- **Interface Moderna:** Dark Mode persistente, UI responsiva, modais de confirmação personalizados e animações suaves em toda a aplicação.

## 🛠️ Tecnologias Utilizadas

### Frontend
- **HTML5 & CSS3:** Estrutura e estilização avançada com variáveis CSS globais, suporte a Dark Mode, Flexbox e Grid Layout.
- **JavaScript:** Lógica de interatividade e consumo de APIs REST (Fetch).
- **Lucide Icons:** Biblioteca de ícones vetoriais modernos e consistentes.

### Backend
- **Node.js & Express 5:** Servidor robusto com gestão de rotas API modulares e middlewares encadeados.
- **Supabase (PostgreSQL):** Base de dados relacional e escalável (BaaS) para armazenamento de utilizadores, progresso, medalhas, turmas e permissões.
- **Express-Session:** Gestão de sessões seguras e persistentes no lado do servidor.
- **Multer:** Processamento e gestão de uploads de ficheiros de imagem (avatares).
- **Puppeteer:** Geração de ficheiros PDF no servidor (relatórios e histórico de atividade).
- **Winston & Morgan:** Sistema de logging estruturado para monitorização e diagnóstico da aplicação.

### Integrações Externas
- **Google Gemini AI (`@google/generative-ai`):** Geração de dicas contextuais e personalizadas nos quizzes.
- **Google OAuth 2.0 (`google-auth-library`):** Autenticação via conta Google como alternativa ao registo manual.
- **Supabase Storage:** Armazenamento de avatares e ficheiros de utilizadores na cloud.

## 📂 Estrutura do Projeto

```
/
├── server.js                   # Ponto de entrada: Express, middlewares, Socket.io
├── package.json
│
├── /pages                      # Ficheiros HTML da interface
│   ├── index.html              # Página inicial / Landing page
│   ├── login.html              # Autenticação (email + Google OAuth)
│   ├── register.html           # Registo de nova conta
│   ├── profile.html            # Perfil público e privado do utilizador
│   ├── settings.html           # Definições de conta e privacidade
│   ├── search.html             # Pesquisa global de utilizadores
│   ├── leaderboard.html        # Hall of Fame / Rankings globais
│   ├── quizzes.html            # Listagem de todos os quizzes
│   ├── quiz.html               # Motor de quiz interativo com dicas por IA
│   ├── phishing.html           # Simulador de deteção de phishing
│   ├── cibertermo.html         # Jogo CiberTermo (Wordle de cibersegurança)
│   ├── shop.html               # Loja de recompensas com pontos
│   ├── historico.html          # Histórico de atividade com exportação PDF
│   ├── resources.html          # Listagem de recursos educativos
│   ├── gestao.html             # Painel Administrativo completo
│   ├── professor.html          # Painel do Professor
│   ├── professor-stats.html    # Estatísticas detalhadas por turma/aluno
│   └── ...
│
├── /routes                     # API Backend (Express Routers)
│   ├── auth.js                 # Autenticação, registo, Google OAuth
│   ├── profile.js              # Perfil, avatar, definições de privacidade
│   ├── stats.js                # Estatísticas e progresso do utilizador
│   ├── leaderboard.js          # Rankings e Hall of Fame
│   ├── quiz.js                 # Lógica de quizzes e dicas IA (Gemini)
│   ├── phishing.js             # Simulador de phishing
│   ├── termo.js                # Jogo CiberTermo
│   ├── shop.js                 # Loja de recompensas
│   ├── medals.js               # Sistema de medalhas e conquistas
│   ├── gestao.js               # Rotas de administração (utilizadores, escolas, turmas)
│   ├── professor.js            # Rotas do professor (turmas, alunos, estatísticas)
│   └── pdf.js                  # Geração de PDFs com Puppeteer
│
├── /js                         # Scripts globais de cliente
│   ├── global-init.js          # Inicialização global (sessão, header, notificações)
│   ├── theme.js                # Gestão e persistência do Dark Mode
│   └── cibertermo.js           # Lógica do jogo CiberTermo (cliente)
│
├── /css                        # Folhas de estilo
│   ├── style.css               # Estilo principal da aplicação
│   ├── dark-mode.css           # Overrides completos para o modo escuro
│   ├── popup_modal.css         # Modais de confirmação personalizados
│   ├── cibertermo.css          # Estilos específicos do jogo CiberTermo
│   ├── gestao.css              # Estilos do painel administrativo
│   ├── shop.css                # Estilos da loja de recompensas
│   └── preloader.css           # Animação de carregamento inicial
│
└── /utils
    └── logger.js               # Configuração do Winston (logging estruturado)
```

## 🛡️ Segurança e Privacidade

- **Privacy by Design:** O backend filtra agressivamente os dados enviados ao cliente. Se um perfil está em modo "Invisível", a API devolve um `404 Not Found` propositado, protegendo a identidade do utilizador contra enumeração e acessos diretos.
- **Controlo de Acesso por Roles (RBAC):** Middlewares de autenticação verificam a sessão e as permissões (`admin`, `professor`, `aluno`) antes de qualquer operação de leitura ou escrita. Rotas administrativas são inacessíveis a utilizadores sem privilégios.
- **Proteção de Sessão:** Sessões geridas com `express-session`, com segredos configurados exclusivamente via variáveis de ambiente.
- **Logging e Auditoria:** Todas as operações sensíveis são registadas via `Winston` para diagnóstico e rastreabilidade.
