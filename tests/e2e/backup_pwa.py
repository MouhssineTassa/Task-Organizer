"""Parcours navigateur : sauvegarde / restauration (UI) + PWA. Prérequis : backend sur :4000, frontend (build) sur :5173."""
import json, tempfile, zipfile, pathlib, urllib.request
from playwright.sync_api import sync_playwright
import sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from common import login, session_cookie, api_call

BASE, API = "http://localhost:5173", "http://localhost:4000/api"
results, errors = [], []

def check(name, ok, detail=""):
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""))

COOKIE = {"v": None}
def api(method, path, body=None):
    return api_call(method, path, COOKIE["v"], body)

tmp = pathlib.Path(tempfile.mkdtemp())

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(timezone_id="Africa/Casablanca", locale="fr-FR", accept_downloads=True)
    page = ctx.new_page()
    login(page)
    COOKIE["v"] = session_cookie(ctx)
    task = api("POST", "/tasks", {"title": "Tâche à sauvegarder"})
    api("POST", "/notes", {"title": "Note à sauvegarder", "content": "contenu"})
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: errors.append(f"console: {m.text}") if m.type == "error" and "offline" not in m.text.lower() and "Failed to load resource" not in m.text and "ERR_INTERNET_DISCONNECTED" not in m.text else None)

    # --- sauvegarde : vrai téléchargement
    page.goto(BASE + "/parametres"); page.wait_for_load_state("networkidle")
    with page.expect_download() as dl:
        page.get_by_text("Sauvegarde complète (.zip)").click()
    zpath = tmp / "sauvegarde.zip"; dl.value.save_as(zpath)
    names = zipfile.ZipFile(zpath).namelist()
    check("Sauvegarde: ZIP téléchargé avec manifest + base", "manifest.json" in names and "personal-life-os.db" in names, f"{len(names)} entrées")
    check("Sauvegarde: nom de fichier daté", dl.value.suggested_filename.startswith("personal-life-os-sauvegarde-"), dl.value.suggested_filename)
    with page.expect_download() as dl2:
        page.get_by_text("Exporter les données (JSON)").click()
    j = json.loads(pathlib.Path(dl2.value.path()).read_text(encoding="utf-8"))
    check("Export JSON: contient la tâche", any(t["title"] == "Tâche à sauvegarder" for t in j["tables"]["tasks"]))

    # --- catastrophe
    for t in api("GET", "/tasks"):
        if t["title"] == "Tâche à sauvegarder":
            api("DELETE", f"/tasks/{t['id']}")
    check("Perte simulée: tâche supprimée", not any(t["title"] == "Tâche à sauvegarder" for t in api("GET", "/tasks")))

    # --- restauration par l'interface, avec garde-fou
    page.goto(BASE + "/parametres"); page.wait_for_load_state("networkidle")
    page.set_input_files("input[type=file]", str(zpath))
    btn = page.get_by_role("button", name="Restaurer et remplacer mes données")
    check("Restauration: bouton désactivé sans confirmation", btn.is_disabled())
    page.get_by_placeholder("REMPLACER").fill("remplacer")
    check("Restauration: casse incorrecte = toujours désactivé", btn.is_disabled())
    page.get_by_placeholder("REMPLACER").fill("REMPLACER")
    check("Restauration: activé après saisie exacte", btn.is_enabled())
    btn.click(); page.get_by_text("Restauration terminée.").wait_for(timeout=15000)
    check("Restauration: message de succès", True)
    check("Restauration: la tâche est revenue", any(t["title"] == "Tâche à sauvegarder" for t in api("GET", "/tasks")))
    check("Restauration: la note est revenue", any(n["title"] == "Note à sauvegarder" for n in api("GET", "/notes")))

    # --- fichier invalide : message d'erreur clair, données intactes
    bad = tmp / "faux.zip"; bad.write_text("pas un zip")
    page.goto(BASE + "/parametres"); page.wait_for_load_state("networkidle")
    page.set_input_files("input[type=file]", str(bad))
    page.get_by_placeholder("REMPLACER").fill("REMPLACER")
    page.get_by_role("button", name="Restaurer et remplacer mes données").click()
    page.get_by_text("n'est pas une archive ZIP valide").wait_for(timeout=10000)
    check("Fichier invalide: erreur claire affichée", True)
    check("Fichier invalide: données intactes", any(t["title"] == "Tâche à sauvegarder" for t in api("GET", "/tasks")))

    # --- PWA
    m = json.loads(urllib.request.urlopen(BASE + "/manifest.webmanifest").read())
    check("PWA: manifeste valide", m["display"] == "standalone" and any(i["sizes"] == "512x512" for i in m["icons"]) and any(i["sizes"] == "192x192" for i in m["icons"]))
    check("PWA: icônes accessibles", all(urllib.request.urlopen(BASE + i["src"]).status == 200 for i in m["icons"]))
    page.goto(BASE + "/"); page.wait_for_load_state("networkidle")
    registered = page.evaluate("navigator.serviceWorker.ready.then(r => !!r.active)")
    check("PWA: service worker actif", registered)
    page.reload(); page.wait_for_load_state("networkidle")
    check("PWA: la page est contrôlée par le service worker", page.evaluate("!!navigator.serviceWorker.controller"))
    # Le serveur tombe PENDANT l'usage : bandeau dans l'application
    page.goto(BASE + "/"); page.wait_for_load_state("networkidle")
    ctx.set_offline(True)
    page.get_by_role("link", name="Notes").first.click()
    page.get_by_role("alert").filter(has_text="Le serveur local ne répond pas").wait_for(timeout=8000)
    check("Serveur injoignable pendant l'usage: bandeau explicatif affiché", True)
    ctx.set_offline(False)
    page.get_by_role("link", name="Tâches").first.click(); page.wait_for_timeout(1200)
    check("Serveur rétabli: bandeau disparu", page.get_by_role("alert").count() == 0)

    # Démarrage hors ligne : l'interface vient du cache, écran explicite "serveur injoignable"
    ctx.set_offline(True)
    page.reload(); page.get_by_text("Le serveur local ne répond pas").wait_for(timeout=8000)
    check("PWA hors ligne: l'interface se charge depuis le cache et explique la situation", page.get_by_text("Personal Life OS").first.is_visible())
    ctx.set_offline(False)
    page.get_by_role("button", name="Réessayer").click(); page.get_by_text("Quitter").first.wait_for(timeout=10000)
    check("Réessayer une fois le serveur rétabli: retour dans l'application", True)
    browser.close()

print("\nERREURS (hors réseau coupé volontairement):", "\n".join(sorted(set(errors))) or "aucune")
print(f"RÉSUMÉ: {sum(results)}/{len(results)} OK")
