# Personal Life OS

Organisateur personnel local-first pour étudiant : planning centré sur l'emploi
du temps universitaire, tâches, événements, pauses/repos, et notes — pensé
pour évoluer vers les modules Études avancées, Bibliothèque, Media, Sport,
Objectifs/XP/Trophées et Assistant IA.

Ce livrable correspond aux **MVP1 à MVP5** du cahier des charges
(Phases 1 à 19, hors Skills) : architecture, base de données, Dashboard, Planning (EDT
prioritaire et verrouillé), import EDT PDF avec brouillon validable, Tâches,
Événements, pauses/repas/sommeil, report/skip, proposition de placement des
tâches flexibles, **Habitudes avec séries (streaks) et protection**, **XP,
niveaux et divisions**, **trophées**, **Objectifs / Missions**, et le
**portail Études** complet : semestres, matières, **import de cours PDF
avec détection de chapitres et génération de tâches d'étude proposées**,
suivi de progression (lecture/maîtrise), examens, et **export PDF des
notes**, la **Bibliothèque** (catalogue général séparé de la bibliothèque
personnelle, langues, sessions de lecture, progression par page) et le
**Media Center** (Films / Séries / Anime : watchlist, progression
saison/épisode avec « prochain épisode », notes personnelles), des
**recommandations locales** (onglet « Pour toi »), le **Sport** (programmes,
séances avec exercices/séries/charges, progression), les **Projets** (Kanban
À faire / En cours / Terminé), l'**Inbox** de capture rapide, la **recherche
globale**, le bouton **Ajout rapide** et les **Statistiques**. Les portails
restants (Assistant IA...) sont présents dans la
navigation avec un état « à venir » explicite — rien n'est simulé avec de
fausses données.

## Architecture

```
personal-life-os/
├── frontend/        React + TypeScript + Vite + Tailwind CSS
├── backend/         Node.js + Express + TypeScript + SQLite (better-sqlite3) + Drizzle ORM
├── storage/         Fichiers (PDF d'EDT importés, futurs exports/notes/uploads)
└── docs/            Documentation d'architecture
```

Flux : **Frontend (React)** → requêtes REST → **Backend (Express)** →
**Services** (moteur de planning, parseur PDF d'EDT) → **Base SQLite** +
**Stockage fichiers**.

Principe central respecté : l'EDT universitaire est toujours la source
prioritaire et verrouillée du planning ; les pauses/repas/sommeil sont de
vrais blocs ; rien n'est modifié silencieusement (import EDT, placement de
tâches flexibles et détection de conflits passent toujours par une
proposition à valider).

## Installation

Prérequis : Node.js 18+ et npm.

### 1. Backend

```bash
cd backend
npm install
npm run dev       # démarre l'API sur http://localhost:4000 (rechargement à chaud)
```

Au premier démarrage, la base SQLite est créée automatiquement dans
`storage/personal-life-os.db` avec le schéma et quelques blocs de
récupération par défaut (sommeil, repas).

Scripts disponibles :
- `npm run dev` — développement avec rechargement automatique (ts-node-dev)
- `npm run build` — compile TypeScript vers `dist/`
- `npm start` — lance la version compilée (`node dist/index.js`)

### 2. Frontend

Dans un second terminal :

```bash
cd frontend
npm install
npm run dev        # démarre l'interface sur http://localhost:5173
```

Le frontend appelle l'API via la variable d'environnement `VITE_API_URL`
définie dans `frontend/.env` (par défaut `http://localhost:4000/api`).

Scripts disponibles :
- `npm run dev` — serveur de développement Vite
- `npm run build` — build de production dans `frontend/dist/`
- `npm run preview` — sert le build de production localement

### 3. Utilisation

1. Ouvrir `http://localhost:5173`. Au premier lancement, l'application te demande de **créer un mot de passe** (8 caractères minimum) ; ensuite elle te le demande à chaque nouvelle session
2. Aller dans **Planning → Importer mon EDT**, glisser un PDF d'emploi du
   temps universitaire
3. Vérifier/corriger le brouillon extrait (jour, horaires, matière, salle,
   enseignant, type de cours), puis valider — l'EDT devient la base
   verrouillée du planning
4. Créer des tâches dans **Tâches** (ponctuelles, flexibles, urgentes...)
5. Consulter **Planning** pour voir les créneaux libres et les propositions
   de placement automatique des tâches flexibles (à accepter manuellement)
6. Ajouter des notes dans **Notes**, suivre sa journée dans **Dashboard**

## Base de données

SQLite via `better-sqlite3`, schéma défini avec **Drizzle ORM**
(`backend/src/db/schema.ts`) et initialisé par un script SQL idempotent
(`backend/src/db/migrate.ts`, `CREATE TABLE IF NOT EXISTS`) pour rester
simple et robuste en local. Entités du MVP1 :

`users`, `subjects`, `semesters`, `schedule_imports`, `schedule_entries` (EDT
verrouillé), `tasks`, `events`, `recovery_blocks` (pauses/repas/sommeil),
`notes`, `habits`, `habit_logs`, `xp_events`, `achievements`,
`user_achievements`, `goals`, `missions`, `study_documents`, `exams`,
`files`, `books`, `user_books`, `reading_sessions`, `media_items`,
`user_media`.

Les prochaines phases ajouteront `books`/`user_books`,
`movies`/`series`/`anime`/`user_media`, `workout_programs`/`workout_sessions`,
`projects`, etc., **sans supprimer les tables existantes**.

## Stockage des fichiers

Les PDF d'EDT importés sont conservés dans `storage/pdf/` (historique
disponible via `GET /api/schedule-import/history`). Les futurs modules
(export PDF des notes, bibliothèque, media) utiliseront `storage/exports/`,
`storage/notes/`, `storage/study/`, `storage/books/`, `storage/media/`,
`storage/uploads/`.

## Variables d'environnement

Copier `backend/.env.example` en `backend/.env` pour modifier la configuration (facultatif).

| Fichier | Variable | Description |
|---|---|---|
| `backend/.env` | `PORT` | Port de l'API (défaut `4000`) |
| `backend/.env` | `HOST` | Interface d'écoute (défaut `127.0.0.1` = cet ordinateur uniquement ; `0.0.0.0` ouvre au réseau local) |
| `backend/.env` | `FRONTEND_ORIGINS` | Origines autorisées à appeler l'API depuis un navigateur (défaut : `localhost`/`127.0.0.1` ports 5173 et 4173) |
| `backend/.env` | `COOKIE_SECURE` | `true` uniquement si l'application est servie en HTTPS |
| `backend/.env` | `LOGIN_MAX_FAILS`, `LOGIN_LOCK_SECONDS` | Essais de connexion avant blocage (5) et durée du premier blocage (60 s, doublée à chaque récidive, 15 min max) |
| `frontend/.env` | `VITE_API_URL` | URL de l'API. Par défaut elle suit le nom d'hôte de la page (`localhost` ou `127.0.0.1`), port 4000 |

## API (aperçu)

Toutes les routes ci-dessous (sauf `/api/health` et `/api/auth/*`) exigent une session valide (cookie) ; les requêtes
qui modifient des données exigent aussi l'en-tête `X-PLOS: 1` (protection CSRF).

| Domaine | Endpoints principaux |
|---|---|
| Authentification | `GET /api/auth/status`, `POST /api/auth/setup` (première utilisation uniquement), `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/logout-all`, `POST /api/auth/change-password` |
| Dashboard | `GET /api/dashboard/today`, `GET/POST /api/dashboard/subjects` |
| Tâches | `GET/POST /api/tasks`, `PUT /api/tasks/:id`, `POST /api/tasks/:id/action` (complete/reschedule/skip/cancel/pause/resume), `DELETE /api/tasks/:id` |
| Événements | `GET/POST /api/events`, `PUT/DELETE /api/events/:id` |
| Notes | `GET/POST /api/notes`, `PUT/DELETE /api/notes/:id` |
| Import EDT | `POST /api/schedule-import/upload`, `GET /api/schedule-import/:id/diff`, `PUT/DELETE /api/schedule-import/:id/draft/:index`, `POST /api/schedule-import/:id/confirm`, `GET /api/schedule-import/current`, `GET /api/schedule-import/history` |
| Planning | `GET /api/planning/day/:date`, `GET /api/planning/week/:startDate`, `GET /api/planning/proposals`, `POST /api/planning/proposals/apply`, `POST /api/planning/conflicts` |
| Planning (urgences) | `POST /api/planning/urgent/propose` (ne modifie rien : conflits + plan de déplacement), `POST /api/planning/urgent/apply` (applique le plan validé, transaction) |
| Planning (repas, sommeil, pauses) | `GET/POST /api/planning/recovery`, `DELETE /api/planning/recovery/:id` |
| Routines (tâches récurrentes) | `GET/POST /api/recurring/rules`, `PUT/DELETE /api/recurring/rules/:id` (DELETE = désactivation, historique conservé), `GET /api/recurring/occurrences?from=&to=` (62 jours max), `GET /api/recurring/occurrences/hidden` (sautées/annulées), `POST /api/recurring/occurrences/action` (complete / skip / cancel / reschedule / reset) |
| Sauvegarde | `GET /api/backup/export` (ZIP : base + fichiers), `GET /api/backup/export-json`, `POST /api/backup/restore` (ZIP + champ `confirm=REMPLACER` ; copie de sécurité automatique) |
| Habitudes | `GET/POST /api/habits`, `PUT/DELETE /api/habits/:id`, `POST /api/habits/:id/log` (Completed/Skipped/Missed), `POST /api/habits/:id/freeze` (protection de série, limitée) |
| Objectifs | `GET/POST /api/goals`, `PUT/DELETE /api/goals/:id` (progression calculée depuis les tâches liées via `goalId`) |
| Missions | `GET/POST /api/missions`, `DELETE /api/missions/:id` (complétion automatique + XP bonus quand toutes les tâches liées via `missionId` sont terminées) |
| Progression | `GET /api/progression` (XP total, niveau, division, meilleure série, niveaux par domaine, trophées) |
| Études | `GET/POST /api/study/semesters`, `GET/POST /api/study/subjects`, `GET/POST/DELETE /api/study/exams`, `GET /api/study/documents` (progression lecture/maîtrise), `POST /api/study/documents/upload` → brouillon de chapitres/tâches, `PUT/DELETE /api/study/documents/:draftId/draft/:index`, `POST /api/study/documents/:draftId/confirm` |
| Notes (export) | `POST /api/notes/:id/export-pdf` → génère un PDF dans `storage/exports/`, l'enregistre dans `files`, et renvoie un lien de téléchargement |
| Fichiers | `GET /api/files`, `GET /api/files/:id/download` |
| Bibliothèque | `GET/POST /api/books` (catalogue, filtres `language`/`genre`/`search`), `GET/POST /api/books/my`, `PUT/DELETE /api/books/my/:id`, `POST /api/books/my/:id/sessions` |
| Media | `GET/POST /api/media` (catalogue, filtre `type`), `GET/POST /api/media/my`, `PUT/DELETE /api/media/my/:id` |
| Sport | `GET/POST/DELETE /api/sport/programs`, `GET/POST/DELETE /api/sport/sessions`, `GET /api/sport/progress` |
| Projets | `GET/POST /api/projects`, `DELETE /api/projects/:id`, `POST /api/projects/:id/tasks`, `PUT /api/projects/tasks/:taskId` (déplacement Kanban) |
| Hub | `GET/POST /api/hub/inbox`, `POST /api/hub/inbox/:id/convert` (task/note), `DELETE /api/hub/inbox/:id`, `GET /api/hub/search?q=`, `GET /api/hub/analytics`, `GET /api/hub/recommendations/media` |

## Tests réalisés pendant le développement

- Parsing d'un PDF d'EDT réaliste (créneaux `08H15-10H05` etc., matières,
  types Cours/TD/TP, salles, enseignants) → extraction correcte de 10
  créneaux sur 5 jours
- Import → comparaison (diff) → confirmation → EDT verrouillé actif
- Création d'une tâche flexible → proposition automatique d'un créneau libre
  cohérent avec l'EDT et les blocs de récupération
- Détection de conflit entre un créneau demandé et un cours verrouillé
  (`hasLockedConflict: true`, cours non déplaçable)
- CRUD complet tâches/événements/notes
- Habitude quotidienne journalisée sur 8 jours consécutifs → série (streak)
  correctement calculée (0→8), trophées "Premier élan" (3j) et "Une semaine
  solide" (7j) débloqués automatiquement au bon moment
- Tâche complétée → XP attribué selon la difficulté, niveau/division mis à
  jour dans `/api/progression`
- Objectif + tâches liées → progression calculée automatiquement
- Mission + 2 tâches liées → complétion automatique de la mission et XP
  bonus versé uniquement quand la dernière tâche liée est terminée
- Cours PDF synthétique (4 chapitres détectés : Variables, Conditions,
  Boucles, Fonctions) → 8 tâches d'étude proposées (lecture + révision par
  chapitre) → confirmation → document de cours avec suivi de
  lecture/maîtrise calculé automatiquement depuis les tâches liées
- Export d'une note (avec titres, listes, cases à cocher, citation) en PDF
  → fichier PDF valide généré, vérifié avec `pdftotext`, enregistré dans
  `files` et téléchargeable via `/api/files/:id/download`
- Livre : ajout au catalogue → bibliothèque perso → session de 50 pages sur
  200 → progression 25 % ; filtre par langue ; fin de livre → XP « Lecture »
- Série : S03E07 en cours → prochain épisode « S03E08 » ; média terminé → XP
- Build de production frontend (`vite build`) et backend (`tsc`) sans erreur
- Sport : programme + séance (Bench press 4x8 à 60 kg) → XP « Sport » et
  progression par exercice ; Projets : carte déplacée en DONE → progression
  100 % et XP ; Inbox → conversion en tâche → retrouvée par la recherche
  globale ; statistiques et recommandations locales renvoyées par `/api/hub`
- Non-régression complète MVP1 à MVP5 revérifiée ensemble après
  l'ajout du portail Études (tâches, événements, planning, habitudes,
  progression, études, notes)

## Tests automatisés

**Logique de planification** (Node, sans dépendance supplémentaire) :

```bash
cd backend
npm test        # compile puis lance tests/planner.test.js et tests/backup.test.js (base et dossier temporaires)
```

Couvre aussi la **sauvegarde / restauration** : aller-retour complet (base +
fichiers), chemins de fichiers Windows/Linux réécrits vers la machine
courante, copie de sécurité automatique, refus d'un faux ZIP / d'une archive
d'une autre application / d'une base invalide ou incomplète / d'une archive
piégée (zip-slip), restauration d'une ancienne base (colonnes manquantes),
export JSON. Et la **sécurité** (`tests/auth.test.js`, 12 tests d'intégration contre
le vrai serveur) : toutes les routes refusent l'accès sans session ou avec un faux
cookie, mots de passe faibles refusés, hash scrypt (rien en clair, jeton de session
stocké sous forme d'empreinte), cookie `HttpOnly` + `SameSite=Lax`, CSRF (en-tête et
origine), CORS fermé, blocage progressif après 5 échecs, expiration et prolongation
des sessions, déconnexion, changement de mot de passe (coupe les autres sessions),
faux PDF refusé (signature vérifiée, pas seulement le type MIME), sauvegarde sans
hash ni sessions. Chaque protection a été désactivée volontairement pour vérifier
que le test correspondant échoue.

Et les **routines** (`tests/recurring.test.js`, 13 tests) : expansion des jours
(bornes de début/fin incluses), l'exemple du cahier des charges (sauter le sport de
CE mercredi ne touche pas le suivant), XP versé une seule fois, occurrence terminée
protégée, report (jour d'origine libéré, nouveau bloc au bon horaire), urgence qui
déplace une seule occurrence sans modifier la routine, 400 jours de calendrier sans
trou en fuseau Casablanca, validation de l'API, sauvegarde/restauration des
exceptions. Six bugs réalistes ont été introduits un par un : tous détectés.
42 tests au total.

Couvre : date locale (pas de décalage UTC), urgence refusée sur un repas / un
cours de l'EDT / le sommeil qui passe minuit, « proposer ne modifie rien »,
« valider ne déplace que la tâche en conflit », absence de chevauchement entre
tâches déplacées, créneaux libres. Le fuseau est forcé sur `Africa/Casablanca`
dans le test pour détecter les bugs de fuseau horaire. Ces tests ont été
vérifiés en réintroduisant volontairement deux bugs : ils échouent bien.

**Parcours navigateur** (optionnel, nécessite Python + Playwright) :
`tests/e2e/smoke.py` ouvre toutes les pages, importe un EDT PDF d'exemple,
crée une tâche, teste la vue semaine, le flux d'urgence, l'Ajout rapide, l'Inbox
et la recherche, en desktop et en mobile, et signale toute erreur console ou
requête API en échec. Lancer backend (`npm run dev`) et frontend
(`npm run build && npx vite preview --port 5173`) puis
`python tests/e2e/smoke.py` (parcours général) et
`python tests/e2e/backup_pwa.py` (sauvegarde/restauration par l'interface,
PWA, bandeau « serveur injoignable »), `python tests/e2e/routines_e2e.py` (routines : création,
sauter/rétablir, terminer, Dashboard, urgence, report) et `python tests/e2e/auth_e2e.py`
(création du mot de passe, connexion, session révoquée, accès par `127.0.0.1`,
changement de mot de passe, et **attaque depuis une page hostile** : il faut
alors aussi servir `tests/e2e/evil` sur le port 5999 avec
`python -m http.server 5999`). Ces scripts attendent une **base neuve**
(`auth_e2e.py`) et le frontend servi avec `npx vite preview --host 0.0.0.0`.

## Routines (tâches récurrentes)

Onglet **Tâches → Routines**. Une routine (ex. « Sport, tous les mercredis à 18h, 60 min »)
se répète toute seule ; ses occurrences sont **calculées**, et seules les exceptions sont
enregistrées (terminée, sautée, annulée, reportée). Conséquences voulues :

- **Sauter ou reporter une occurrence ne modifie pas la routine** : la suivante reste prévue.
- Une occurrence avec horaire occupe un créneau du planning (blocs 🔁, vues jour et semaine) ;
  sans horaire, elle reste « à faire dans la journée ».
- La tâche urgente peut **déplacer une seule occurrence** (avec ta validation), jamais la règle.
- Terminer une occurrence verse l'XP de sa difficulté **une seule fois** et compte pour les
  trophées ; une occurrence terminée ne peut plus être modifiée.
- Arrêter une routine la désactive (l'historique est conservé).

Différence avec les **Habitudes** : une habitude suit une série (streak) sans horaire fixe ;
une routine est une tâche planifiée qui occupe le calendrier.

Limites actuelles : pas de modification d'une routine existante dans l'interface (l'API
`PUT` existe), pas de fréquence mensuelle, et les routines **sans horaire** ne sont pas
encore proposées automatiquement dans les créneaux libres.

## Sécurité

- **Mot de passe local** : haché avec scrypt, jamais stocké en clair. Sessions côté
  serveur (cookie `HttpOnly`, `SameSite=Lax`, 30 jours glissants) ; la base ne garde que
  l'empreinte du jeton.
- **Réseau** : le serveur n'écoute par défaut que sur `127.0.0.1`. CORS n'autorise que
  l'interface (`FRONTEND_ORIGINS`), et les écritures exigent l'en-tête `X-PLOS`
  plus une origine autorisée. Sans cela, n'importe quel site visité dans ton
  navigateur pouvait lire et modifier tes données (testé et démontré).
- **Fichiers** : seuls de vrais PDF (signature `%PDF-`) sont acceptés pour l'EDT et les
  cours ; les sauvegardes refusent les archives piégées.
- **Sauvegardes** : ne contiennent ni le hash du mot de passe ni les sessions ; une
  restauration ne touche pas au mot de passe actuel.
- **Mot de passe oublié** : arrêter le serveur puis `npm run reset-password` dans
  `backend/` efface le mot de passe (les données restent intactes) ; l'application
  en redemande un au prochain lancement. Toute personne ayant accès aux fichiers de ton
  ordinateur peut le faire : le mot de passe protège contre l'accès via le navigateur ou
  le réseau, pas contre l'accès au disque (utilise le chiffrement de disque du système).
- **Limites** : un seul utilisateur ; pas de HTTPS intégré (si tu ouvres l'application
  au réseau avec `HOST=0.0.0.0`, place-la derrière HTTPS et active `COOKIE_SECURE`) ;
  la validation des entrées est complète sur l'authentification, les EDT/cours, la
  sauvegarde et les urgences, mais plus légère sur certains modules plus anciens.

## Dépannage

**`npm install` échoue sur `better-sqlite3` avec une erreur `node-gyp` /
"Could not find any Visual Studio installation" (Windows)**

`better-sqlite3` est un module natif : npm essaie d'abord de télécharger un
binaire précompilé (`prebuild-install`), et ne compile depuis les sources
(`node-gyp`, qui nécessite Visual Studio Build Tools) que si aucun binaire
précompilé ne correspond à ta version de Node.

1. Vérifie ta version de Node (`node -v`) — Node 18/20/22 LTS sont les mieux
   couverts par les binaires précompilés.
2. Supprime `node_modules` et `package-lock.json` dans `backend/`, puis
   relance `npm install` (un réseau d'entreprise/VPN/antivirus qui bloque
   `github.com` peut aussi empêcher le téléchargement du binaire précompilé
   et forcer une compilation locale).
3. Si l'erreur persiste, installe les **Visual Studio Build Tools** avec le
   composant *"Desktop development with C++"* :
   `winget install Microsoft.VisualStudio.2022.BuildTools`
   puis relance `npm install`.

**`'ts-node-dev' n'est pas reconnu…`**

Cette erreur est presque toujours une conséquence de l'échec précédent :
si `better-sqlite3` ne s'installe pas, npm arrête l'installation avant
d'avoir posé les autres paquets (dont `ts-node-dev`). Une fois le problème
`better-sqlite3` résolu et `npm install` terminé sans erreur, `npm run dev`
fonctionne normalement.

## Suite du projet

Ce livrable correspond aux MVP1 à MVP5 (Skills non réalisés), plus la
sauvegarde/restauration, le PWA, l'authentification locale et les tâches
récurrentes. Les phases suivantes du cahier des charges (Skills, quêtes,
quiz/flashcards, Assistant IA, What-if, mode semaine chargée/vacances) peuvent être ajoutées de manière itérative sans casser
l'existant, comme le prévoit le cahier des charges d'origine.
