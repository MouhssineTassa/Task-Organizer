// À importer en PREMIER : charge backend/.env avant que les autres modules lisent process.env (PORT, HOST, DB_PATH...).
import dotenv from "dotenv";
dotenv.config({ quiet: true });
