# Architecture — Personal Life OS (MVP1)

## Vue d'ensemble

```
FRONTEND (React/TS/Vite/Tailwind)
        │  REST (axios)
        ▼
BACKEND (Express/TS)
        │
   ┌────┴─────┐
   ▼          ▼
SERVICES   BASE SQLite (better-sqlite3 + Drizzle ORM)
(plannerEngine,
 edtParser)
   │
   ▼
STORAGE (fichiers : PDF d'EDT, futurs exports/notes/media)
```

## Principe central : priorité de l'EDT universitaire

Le moteur de planning (`backend/src/services/plannerEngine.ts`) construit,
pour une date donnée, la liste des blocs occupés dans cet ordre strict :

1. **EDT universitaire** (`schedule_entries`, toujours `locked = true`)
2. **Événements fixes** du jour (`events`)
3. **Blocs de récupération** (`recovery_blocks` : sommeil, repas, pauses —
   récurrents par jour de semaine ou ponctuels)
4. **Tâches déjà placées** (`tasks` avec `date` + `start_time`)

Les créneaux libres (`getFreeSlots`) sont calculés en soustrayant ces blocs
d'une fenêtre de journée (07:00–23:00 par défaut). Le moteur ne modifie
jamais l'EDT ni ne déplace un cours automatiquement.

## Import EDT PDF : pipeline en 4 étapes contrôlées

`backend/src/services/edtParser.ts` + `backend/src/routes/scheduleImport.ts`

1. **Upload** (`POST /schedule-import/upload`) : le PDF est stocké dans
   `storage/pdf/`, puis analysé avec `pdf-parse` (texte linéaire). Un
   parseur heuristique détecte : en-têtes de jour, plages horaires
   (`08H15-10H05` et variantes), type de cours (Cours/TD/TP/Examen), salle,
   enseignant, et déduit le nom de la matière par élimination. Le résultat
   est un **brouillon en mémoire**, rien n'est encore en base de planning.
2. **Diff** (`GET /schedule-import/:id/diff`) : comparaison du brouillon
   avec l'EDT actuellement actif (ajouts/suppressions détectés par clé
   matière+jour+heure).
3. **Édition** (`PUT/DELETE /schedule-import/:id/draft/:index`) :
   l'utilisateur corrige ou retire des lignes mal extraites avant validation.
4. **Confirmation** (`POST /schedule-import/:id/confirm`) : remplace l'EDT
   actif par le brouillon validé, dans une transaction SQLite. L'historique
   des fichiers importés (`schedule_imports`) et le fichier PDF d'origine
   sont conservés.

Limite connue : l'extraction se base sur le texte linéaire du PDF, pas sur
les coordonnées visuelles exactes des cellules d'un tableau. Pour des EDT
visuellement complexes, une amélioration future peut utiliser `pdfjs-dist`
en mode positionnement de texte pour reconstruire précisément les colonnes.

## Tâches et actions

`backend/src/routes/tasks.ts` — statuts `Pending / Completed / Rescheduled /
Skipped / Cancelled / Failed / Paused`, jamais de suppression silencieuse
d'une routine : toute transition passe par `POST /tasks/:id/action` avec une
action explicite (`complete`, `reschedule`, `skip`, `cancel`, `pause`,
`resume`).

## Propositions de placement (tâches flexibles)

`proposeFlexiblePlacements()` cherche, pour chaque tâche `Flexible` sans
horaire, le premier créneau libre suffisant sur un horizon de 7 jours (en
respectant la deadline si définie). Le résultat est renvoyé au frontend
comme **proposition** (`GET /planning/proposals`) ; l'utilisateur doit
explicitement accepter (`POST /planning/proposals/apply`) pour que la tâche
soit réellement planifiée.

## Détection de conflit (urgences)

`POST /planning/conflicts` renvoie les blocs qui chevauchent un créneau
demandé, avec un indicateur `movable` (`true` seulement pour les blocs non
verrouillés). Le frontend peut ainsi proposer un déplacement, jamais
l'appliquer seul.

## Frontend

- `layout/AppLayout.tsx` : sidebar desktop + drawer/bottom nav mobile,
  liste des portails du menu final (certains en `ComingSoon` explicite).
- `api/client.ts` : client axios unique, typé, un point d'entrée par
  ressource.
- `pages/Dashboard.tsx`, `Planning.tsx`, `EdtImport.tsx`, `Tasks.tsx`,
  `Notes.tsx` : les portails fonctionnels du MVP1.
- `pages/Placeholders.tsx` : portails prévus mais pas encore développés,
  affichés honnêtement comme tels (pas de fausses données).

## Base de données

Schéma déclaré avec Drizzle ORM (`backend/src/db/schema.ts`) à titre de
référence typée ; l'initialisation réelle utilise un script SQL idempotent
(`backend/src/db/migrate.ts`, `CREATE TABLE IF NOT EXISTS`) pour rester
simple et fiable dans un contexte local, sans système de migrations versionné
pour ce MVP1. Les phases suivantes pourront introduire `drizzle-kit` pour des
migrations versionnées si le schéma se complexifie.

## MVP2 — Habitudes, XP, Streaks, Trophées, Objectifs, Missions

### Habitudes et séries (`services/streakEngine.ts`)

Une habitude a une fréquence `Daily` ou `Weekly` (jours précis via
`days_of_week`). Chaque jour est journalisé dans `habit_logs` avec un statut
`Completed | Skipped | Missed | Protected`. Le calcul de série
(`computeStreak`) remonte jour par jour depuis aujourd'hui et ne compte que
les jours réellement attendus par l'habitude :
- `Completed`/`Protected` → prolonge la série ;
- `Skipped` → ne casse pas la série mais ne l'incrémente pas (conforme à la
  section 13 : le skip ne concerne qu'une occurrence, jamais toute la
  routine) ;
- `Missed`, ou absence de log pour un jour déjà passé → rompt la série.

La **protection de série** (`applyStreakFreeze`) transforme un jour en
`Protected`, limitée à 3 utilisations par habitude sur 30 jours glissants,
pour respecter la consigne "ne pas encourager les abus" (section 14).

### XP et niveaux (`services/xpEngine.ts`)

Chaque événement d'XP (`xp_events`) est horodaté et catégorisé (pour le
niveau par domaine). Montants fixes : tâche Easy/Medium/Hard/VeryHard →
5/15/30/50 XP, habitude complétée → 10 XP, mission → XP défini à la
création. Formule de niveau volontairement simple et prévisible : 100 XP
par niveau. La division (Bronze → Legend) est dérivée du niveau global.
L'XP n'est jamais attribué à la création d'un élément, seulement à sa
réalisation effective (section 17).

### Trophées (`services/achievementsEngine.ts`)

Catalogue seedé au démarrage (`migrate.ts`, idempotent par `code` unique) :
séries (3/7/14/30/60/100/365 jours), quantité de tâches terminées
(10/50/100/500/1000), spéciaux (Early Bird, Night Owl), domaine (études).
`evaluateAchievements()` recalcule la progression de chaque trophée et
débloque ceux dont la condition est atteinte — jamais de retrait d'un
trophée déjà obtenu, même si la condition redescend ensuite (ex : perte de
série). Appelé après chaque tâche terminée et chaque habitude complétée.

### Objectifs et missions (`routes/goals.ts`, `routes/missions.ts`, `services/missionEngine.ts`)

Un objectif (`goals`) ou une mission (`missions`) ne stocke pas sa propre
progression : elle est calculée à la volée depuis les tâches qui lui sont
liées (`tasks.goal_id` / `tasks.mission_id`). Une mission passe
automatiquement à `Completed` et verse son XP bonus **une seule fois**, au
moment exact où sa dernière tâche liée est terminée
(`checkMissionCompletion`, appelé depuis `POST /tasks/:id/action`).

## MVP3 — Portail Études, cours PDF → tâches, export PDF des notes

### Semestres, matières, examens (`routes/study.ts`)

Un semestre (`semesters`) regroupe des matières (`subjects.semester_id`).
Chaque matière peut avoir des examens (`exams`) et des documents de cours
(`study_documents`). Ces entités restent indépendantes du moteur de
planning/tâches : un examen n'est pas automatiquement transformé en tâche,
conformément au principe "proposer avant de modifier" du cahier des charges.

### Cours PDF → chapitres → tâches proposées (`services/courseParser.ts`)

Même logique de brouillon que l'import EDT (section précédente) : le PDF est
analysé avec `pdf-parse`, les titres de chapitres sont détectés par un jeu
de motifs heuristiques (`Chapitre N`, `Partie N`, numérotation `1.`/`I.`),
puis une tâche de lecture (Easy, 30 min) et une tâche de révision (Medium,
45 min) sont proposées par chapitre détecté. Le résultat est un **brouillon
en mémoire** (`draftCache`, comme pour l'EDT) : l'utilisateur peut éditer ou
supprimer chaque tâche proposée avant la confirmation
(`POST /study/documents/:draftId/confirm`), qui crée alors le
`StudyDocument` et les tâches réelles (liées à `subject_id` et
`study_document_id`).

### Progression lecture/maîtrise

Un `StudyDocument` ne stocke pas de pourcentage : la progression de lecture
est le ratio de tâches "Lire : …" terminées parmi celles liées au document,
et la maîtrise est le ratio de **toutes** les tâches liées (lecture +
révision) terminées. "PDF ouvert" n'est jamais confondu avec "cours
maîtrisé" (section 25) : seule la complétion réelle des tâches fait
progresser ces indicateurs.

### Export PDF des notes (`services/pdfExport.ts`)

Utilise `pdfkit`, une librairie 100% JavaScript sans étape de compilation
native (contrairement à des alternatives nécessitant node-gyp), pour éviter
tout risque d'échec d'installation côté utilisateur. Le rendu interprète un
sous-ensemble de Markdown ligne par ligne (`#`/`##`/`###`, `-`/`*`, cases à
cocher `- [ ]`/`- [x]`, citations `>`) ; les marqueurs inline `**gras**` et
`*italique*` sont retirés du texte plutôt que stylisés caractère par
caractère, pour un rendu simple et fiable. Le fichier généré est stocké dans
`storage/exports/` et référencé dans la table `files` (métadonnées
uniquement — jamais de contenu binaire en base), avec un lien de
téléchargement (`GET /files/:id/download`), conformément à la section 59 du
cahier des charges (ne pas stocker de gros fichiers directement dans
SQLite).


## MVP4 — Bibliothèque et Media Center

### Séparation catalogue général / données personnelles

Conformément à la section 58 du cahier des charges, les tables de catalogue
(`books`, `media_items`) sont distinctes des tables personnelles
(`user_books`, `user_media`). Le catalogue décrit l'œuvre ; la table
personnelle porte le statut, la progression, la note et les dates propres à
l'utilisateur. Aucune donnée n'est présentée comme venant d'une API externe :
le catalogue ne contient que ce que l'utilisateur y ajoute.

### Lecture (`routes/books.ts`)

Statuts : `ToRead / Reading / Completed / Abandoned`. Une session de lecture
(`reading_sessions`) incrémente `current_page`, passe automatiquement un
livre `ToRead` en `Reading`, et la progression est calculée
(`current_page / pages`). Terminer un livre verse 40 XP (catégorie
« Lecture ») une seule fois ; une session verse 5 XP.

### Media (`routes/media.ts`)

Films, séries et anime partagent une même table de catalogue avec un champ
`type` (`Movie | Series | Anime`) pour éviter la duplication. Pour les
séries/anime, `current_season` et `current_episode` désignent la position
dans la saison en cours, ce qui permet d'afficher « prochain épisode :
S03E08 » (exemple de la section 36). Terminer un média verse 20 XP
(catégorie « Media ») une seule fois.

## MVP4 — Bibliothèque et Media Center

### Séparation catalogue / données personnelles (section 31 et 58)

`books` et `media_items` sont des **catalogues généraux** ; `user_books` et
`user_media` contiennent uniquement ce que l'utilisateur a ajouté (statut,
progression, note, favori, dates). Ajouter un livre depuis le formulaire crée
l'entrée catalogue puis l'entrée personnelle ; l'onglet « Catalogue général »
permet d'ajouter à sa bibliothèque un élément déjà connu sans le recréer.
Aucune donnée n'est présentée comme venant d'une API externe : le catalogue
ne contient que ce que l'utilisateur y saisit.

### Lecture (`routes/books.ts`)

Le statut passe automatiquement de `ToRead` à `Reading` à la première
session de lecture (`reading_sessions`), la page courante s'incrémente, et la
progression est `current_page / pages`. Terminer un livre verse 40 XP
(domaine « Lecture »), une session 5 XP, une seule fois par transition
d'état. Les filtres par langue (العربية, Français, English, Español...)
s'appliquent à la langue d'origine ou d'édition.

### Films / Séries / Anime (`routes/media.ts`)

Un seul modèle unifié (`media_items.type` = Movie | Series | Anime) évite la
duplication. Pour séries et anime, `current_season` / `current_episode`
désignent la position **dans la saison** (« Saison 3, épisode 7 »), d'où le
calcul du prochain épisode `S03E08`. Terminer un média verse 20 XP (domaine
« Media »). Les recommandations sont volontairement absentes à ce stade
(MVP5) pour ne pas simuler de source externe.

## MVP5 — Sport, Projets, Inbox, recherche, statistiques, recommandations

- **Sport** (`routes/sport.ts`) : programmes (jour → intitulé), séances avec
  journal d'exercices (séries, répétitions, charge), progression (charge max
  par exercice, séances par semaine). Une séance enregistrée verse de l'XP
  (domaine « Sport ») ; créer un programme n'en verse jamais.
- **Projets** (`routes/projects.ts`) : cartes Kanban `TODO` / `DOING` / `DONE`,
  progression = cartes terminées / total. Terminer une carte verse de l'XP.
- **Hub** (`routes/hub.ts`) : Inbox (capture sans catégorie, conversion
  explicite en tâche ou note), recherche globale (tâches, notes, événements,
  matières, cours, livres, médias, projets, objectifs), statistiques
  descriptives sans jugement, et recommandations média **locales** : seuls les
  éléments du catalogue saisi par l'utilisateur sont proposés, classés par
  genres des éléments bien notés (≥ 4) + note publique saisie. La réponse
  contient `source: "catalogue local uniquement"` et l'interface l'affiche.
- **Frontend** : barre de recherche globale (desktop) vers `/search` avec
  filtre par type ; bouton flottant **Ajout rapide** (Inbox / Tâche / Note) ;
  pages Inbox, Statistiques, Projets, Sport ; onglet « Pour toi » dans Media.

Non réalisé à ce stade : **Skills** (compétences avec progression), saisie en
langage naturel du Quick Add, revue hebdomadaire dédiée, et Quick Add direct
pour livre/film/événement/workout/objectif (seuls Inbox, Tâche et Note sont
proposés ; le reste passe par l'Inbox puis les portails).

## Planning avancé : urgences, repas/sommeil, vue semaine, fuseau horaire

### Flux d'urgence (`services/urgentPlanner.ts`)
`proposeUrgent` calcule, sans rien écrire, les blocs en conflit avec le créneau
demandé. Tout bloc **verrouillé** (cours/TD/TP de l'EDT, événements,
repas/sommeil/pauses, tâches `Fixed` ou `Urgent`) bloque la demande avec une
explication : il n'est jamais déplacé automatiquement. Les tâches déplaçables
en conflit reçoivent un nouvel emplacement (même jour après l'urgence, sinon
les 7 jours suivants), en tenant compte des déplacements déjà proposés pour
éviter les chevauchements ; si rien ne tient, la tâche est remise « à placer »
(sans horaire), jamais supprimée. `applyUrgent` n'est appelé qu'après
validation, revérifie les blocs verrouillés et applique tout dans une
transaction SQLite. Les blocs qui passent minuit (sommeil 23:00 → 07:00) sont
découpés en deux segments pour la détection de chevauchement.

### Repas, sommeil, pauses
Modifiables (`/planning/recovery`, onglet « Repas & sommeil ») : ce sont de
vrais blocs du planning, par jours de la semaine.

### Fuseau horaire
`Date.toISOString()` renvoie la date en UTC : au Maroc (UTC+1), minuit local
tombe sur la veille, ce qui décalait la vue semaine, les séries d'habitudes et
« aujourd'hui » entre 00:00 et 01:00. Toute date métier passe désormais par
`localDateString` (`backend/src/services/dateUtils.ts`,
`frontend/src/lib/date.ts`). Un test automatique l'empêche de revenir.

## Sauvegarde, restauration, PWA

### Format de sauvegarde (`services/backupService.ts`)
ZIP contenant `manifest.json` (application, version du format, date),
`personal-life-os.db` (instantané cohérent obtenu avec l'API de sauvegarde
SQLite, donc fiable même en mode WAL) et `files/<dossier>/<fichier>` pour les
dossiers de `storage/` (`.gitkeep` exclus). `archiver` et `adm-zip` sont
100 % JavaScript (aucune compilation native).

### Restauration
Remplace les données **dans la connexion ouverte** (ATTACH de la base de
l'archive, DELETE + INSERT dans une transaction, clés étrangères suspendues
puis réactivées) au lieu d'écraser le fichier de base ouvert. Garde-fous :
1. refus d'une archive dont une entrée est absolue ou contient `..`
   (zip-slip), sans manifest de la bonne application, de version future, ou dont
   la base n'est pas une vraie base SQLite avec les tables de base ;
2. **copie de sécurité automatique** de l'état actuel dans
   `storage/exports/avant-restauration-<date>.db` avant tout remplacement ;
3. champ `confirm=REMPLACER` exigé par le serveur, et saisie du mot dans
   l'interface ;
4. seuls les fichiers `files/<dossier autorisé>/<nom simple>` sont extraits.
Les chemins de fichiers stockés en base sont absolus : ils sont réécrits vers
le dossier `storage/` de la machine courante (chemins Windows et Linux gérés).
Les colonnes absentes d'une ancienne sauvegarde reçoivent une valeur de repli
si elles sont obligatoires, puis `runMigrations()` met le schéma à niveau et
reconstitue les catalogues (trophées).

### PWA (`frontend/public/`)
`manifest.webmanifest`, icônes 192/512/maskable, et `sw.js` : cache de
l'**interface** (navigation réseau d'abord, assets hachés cache d'abord). Les
appels API ne sont jamais interceptés. Le service worker n'est enregistré
qu'en production. L'application hors ligne affiche l'interface mais **pas les
données** : le backend local reste nécessaire ; un bandeau l'indique quand le
serveur ne répond pas.

### Limites connues
Pas d'authentification : toute personne pouvant joindre `localhost:4000`
peut exporter ou restaurer les données. Acceptable pour un usage local
mono-utilisateur, à traiter dans la phase authentification avant tout accès
réseau.

## Authentification et sécurité du serveur

`src/app.ts` construit l'application Express (`createApp()`, testable sans
écouter sur un port) ; `src/index.ts` migre la base puis écoute sur `HOST`
(défaut `127.0.0.1`). Ordre des middlewares : en-têtes de sécurité → CORS
restreint (`ALLOWED_ORIGINS`, cookies acceptés) → JSON → `/api/health` (public)
→ `csrfGuard` → `/api/auth/*` → `requireAuth` → routes métier.

- **Mot de passe** (`services/auth.ts`) : scrypt (module `crypto` de Node, aucune
  dépendance native), sel aléatoire, comparaison à temps constant. Politique :
  8 à 128 caractères, liste de mots de passe courants, pas le prénom.
- **Sessions** : jeton aléatoire de 32 octets dans un cookie `HttpOnly;
  SameSite=Lax`, table `sessions` avec uniquement le SHA-256 du jeton, expiration
  glissante (30 jours, rafraîchie au plus une fois par heure), purge à l'expiration.
- **CSRF / CORS** : `SameSite=Lax` ne suffit pas, car deux ports de `localhost`
  sont le même « site » pour les cookies. Une page hostile servie sur un autre port
  de `localhost` envoie donc la session ; elle est arrêtée par CORS (lecture
  impossible), par l'en-tête `X-PLOS` (écriture JSON : pré-vérification refusée) et
  par `csrfGuard` (requêtes « simples » et formulaires : 403).
- **Force brute** : blocage en mémoire par IP après `LOGIN_MAX_FAILS` échecs, durée
  doublée à chaque récidive ; le message d'erreur reste générique.
- **Uploads** : signature réelle du fichier (`utils/fileCheck.ts`) en plus du type
  MIME, fichier supprimé s'il est refusé ; erreurs d'upload renvoyées en 400.
- **Sauvegarde** : le hash du mot de passe et les sessions sont retirés de
  l'instantané ; la restauration ne remplace ni `users.password_hash` ni `sessions`.
- **Récupération** : `scripts/reset-password.js` (`npm run reset-password`).
- **Frontend** : `AuthGate` (création / connexion / écran « serveur injoignable »)
  entoure toute l'application ; un 401 en cours d'usage ramène à la connexion ;
  l'adresse de l'API suit le nom d'hôte de la page pour ne pas perdre le cookie
  entre `localhost` et `127.0.0.1`.

## Tâches récurrentes (`services/recurring.ts`, `routes/recurring.ts`)

**Modèle.** `recurring_rules` décrit la routine (fréquence `Daily`/`Weekly` + jours ISO
1-7, horaire facultatif, durée, difficulté, bornes de dates incluses, `active`).
`task_occurrences` ne contient que les **écarts** à la règle, clé unique `(rule_id, date)` :
`status` (Pending/Completed/Skipped/Cancelled), `moved_to_date`, `time_override`
(`NULL` = horaire de la règle, `""` = pas d'horaire ce jour-là), `completed_at`.
Les occurrences sont calculées à la demande (`occurrencesForRange`) : aucune occurrence
future n'est stockée, donc modifier ou arrêter une règle ne laisse pas de lignes orphelines
et sauter une occurrence ne peut pas affecter les suivantes.

**Résolution d'un jour.** Occurrences de la règle ce jour-là, sauf sautées/annulées ou
reportées ailleurs ; plus celles reportées vers ce jour depuis une autre date.

**Intégrations.**
- Planificateur : les occurrences `Pending` avec horaire deviennent des blocs `Task`
  (non verrouillés) → créneaux libres, vue jour/semaine, détection de conflit.
- Urgence : `ProposedMove` porte soit `taskId`, soit `occurrence {ruleId, date}` ;
  `moveOccurrence` n'écrit qu'une exception (jamais la règle). Une occurrence qui ne tient
  nulle part perd son horaire ce jour-là (`time_override = ""`) sans être supprimée.
- XP/trophées : l'action « terminer » est idempotente (une seule attribution) ; les
  occurrences terminées comptent dans « tâches terminées » et Early Bird/Night Owl.
- Dashboard, statistiques et recherche incluent les routines ; sauvegarde/restauration
  les couvrent (tables génériques).

**Validation.** Dates `YYYY-MM-DD`, heures `HH:MM`, durée 5-600 min, jours 1-7 non vides
pour `Weekly`, fin ≥ début, période de consultation ≤ 62 jours, action refusée si la date
n'est pas une vraie occurrence ou si l'occurrence est déjà terminée.

**Calendrier.** Toute arithmétique de dates passe par `addDays`/`isoWeekday`
(`dateUtils.ts`, calendrier local) ; un test parcourt 400 jours en fuseau Casablanca.
