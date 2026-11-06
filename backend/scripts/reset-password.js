// Récupération : efface le mot de passe et toutes les sessions. Les DONNÉES ne sont pas touchées.
// Au prochain lancement, l'application demandera de définir un nouveau mot de passe.
// Usage : npm run reset-password   (arrêter le serveur avant, ou le relancer ensuite)
const { runMigrations } = require("../dist/db/migrate");
const { sqlite } = require("../dist/db");

runMigrations();
sqlite.prepare("UPDATE users SET password_hash = NULL").run();
sqlite.prepare("DELETE FROM sessions").run();
console.log("Mot de passe effacé. Relance le serveur puis ouvre l'application pour en définir un nouveau.");
console.log("Tes données (tâches, notes, cours...) sont intactes.");
sqlite.close();
