import "./env";
import { runMigrations } from "./db/migrate";
import { createApp } from "./app";
import { purgeExpiredSessions, isConfigured } from "./services/auth";

runMigrations();
purgeExpiredSessions();

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
// Par défaut le serveur n'écoute que sur cet ordinateur. HOST=0.0.0.0 l'ouvre au réseau local (le mot de passe devient alors indispensable).
const HOST = process.env.HOST ?? "127.0.0.1";

createApp().listen(PORT, HOST, () => {
  console.log(`✅ Personal Life OS backend démarré sur http://localhost:${PORT}`);
  console.log(HOST === "127.0.0.1" ? "🔒 Accessible uniquement depuis cet ordinateur." : `⚠️  Écoute sur ${HOST} : accessible depuis le réseau.`);
  if (!isConfigured()) console.log("ℹ️  Aucun mot de passe défini : ouvre l'application pour le créer.");
});
