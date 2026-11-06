import json, sys
from playwright.sync_api import sync_playwright
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from common import login, session_cookie, api_call, PASSWORD

BASE = "http://localhost:5173"
errors, bad_requests, results = [], [], []

def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""))

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(timezone_id="Africa/Casablanca", locale="fr-FR", viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("response", lambda r: bad_requests.append(f"{r.status} {r.request.method} {r.url}") if r.status >= 400 and "/api/" in r.url else None)

    login(page)

    # 1) toutes les pages se chargent avec leur titre
    pages = [("/", "Aujourd"), ("/planning", "Jour"), ("/tasks", "Tâches"), ("/etudes", "Études"),
             ("/bibliotheque", "Bibliothèque"), ("/media", "Films"), ("/sport", "Sport"), ("/notes", "Notebook"),
             ("/projets", "Projets"), ("/objectifs", "Objectifs"), ("/progression", "Progression"),
             ("/analytics", "Statistiques"), ("/inbox", "Inbox"), ("/assistant", "Assistant"), ("/parametres", "Paramètres")]
    for path, text in pages:
        page.goto(BASE + path); page.wait_for_load_state("networkidle")
        check(f"page {path}", page.get_by_text(text, exact=False).first.is_visible())

    # 2) import EDT PDF
    page.goto(BASE + "/planning/import"); page.wait_for_load_state("networkidle")
    page.set_input_files("input[type=file]", str(__import__("pathlib").Path(__file__).parent / "edt-exemple.pdf"))
    page.wait_for_selector("table tbody tr", timeout=15000)
    rows = page.locator("table tbody tr").count()
    check("EDT: brouillon extrait", rows == 5, f"{rows} lignes (attendu 5)")
    page.get_by_role("button", name="Valider et remplacer l'EDT actif").click()
    page.wait_for_timeout(1500)
    check("EDT: EDT actif affiché après validation", page.get_by_text("Programmation Avancee en Python").first.is_visible())

    # 3) tâche
    page.goto(BASE + "/tasks"); page.wait_for_load_state("networkidle")
    page.get_by_role("button", name="Nouvelle tâche").click()
    page.get_by_placeholder("Titre de la tâche").fill("Réviser Python")
    page.get_by_role("button", name="Créer la tâche").click()
    page.wait_for_timeout(800)
    check("Tâche créée et listée", page.get_by_text("Réviser Python").first.is_visible())

    # 4) planning: semaine + récupération + urgence
    page.goto(BASE + "/planning"); page.wait_for_load_state("networkidle")
    page.get_by_role("button", name="Semaine", exact=True).click(); page.wait_for_timeout(800)
    cols = page.locator("div.grid.grid-cols-7 > div").count()
    check("Vue semaine: 7 colonnes", cols == 7, f"{cols}")
    check("Vue semaine: l'EDT importé apparaît (lundi)", page.get_by_text("Programmation Avancee en Python").first.is_visible())
    page.screenshot(path="shot_week.png", full_page=True)
    page.get_by_role("button", name="Repas & sommeil").click(); page.wait_for_timeout(800)
    check("Récupération: Déjeuner listé", page.get_by_text("Déjeuner").first.is_visible())
    page.get_by_role("button", name="Tâche urgente").click()
    page.get_by_placeholder("Ex: Imprimer le dossier").fill("Imprimer dossier")
    page.get_by_role("button", name="Voir ce que ça change").click(); page.wait_for_timeout(1000)
    check("Urgence: proposition affichée", page.get_by_text("Valider", exact=True).is_visible() or page.get_by_text("verrouillé").first.is_visible())
    page.screenshot(path="shot_urgent.png")

    # 5) ajout rapide + inbox + recherche
    page.goto(BASE + "/"); page.wait_for_load_state("networkidle")
    page.get_by_role("button", name="Ajout rapide").click()
    page.get_by_placeholder("Qu'est-ce que tu veux capturer ?").fill("Chercher des formations IA")
    page.get_by_role("button", name="Ajouter", exact=True).click(); page.wait_for_timeout(1500)
    page.goto(BASE + "/inbox"); page.wait_for_load_state("networkidle")
    check("Inbox: élément capturé visible", page.get_by_text("Chercher des formations IA").first.is_visible())
    page.get_by_placeholder("Rechercher partout (tâches, notes, cours, livres…)").fill("formations")
    page.keyboard.press("Enter"); page.wait_for_timeout(1200)
    check("Recherche: résultat trouvé", page.get_by_text("formations", exact=False).first.is_visible() and "/search" in page.url)

    # 6) dashboard (capture)
    page.goto(BASE + "/"); page.wait_for_load_state("networkidle")
    import json as _json, urllib.request as _u
    today = api_call("GET", "/dashboard/today", session_cookie(ctx))
    txt = page.inner_text("body")
    if today["nextCourse"] and (not today["next"] or today["next"]["id"] != today["nextCourse"]["id"]):
        check("Dashboard: le prochain cours annoncé par l'API est affiché", "Prochain cours" in txt, today["nextCourse"]["label"])
    elif today["nextCourse"]:
        check("Dashboard: le prochain bloc (un cours) est affiché", today["nextCourse"]["startTime"] in txt)
    else:
        check("Dashboard: aucun cours à venir -> pas de 'Prochain cours' affiché", "Prochain cours" not in txt)
    page.screenshot(path="shot_dashboard.png", full_page=True)

    # 7) mobile: bottom nav + pas de débordement horizontal
    m = browser.new_context(viewport={"width": 390, "height": 800}, timezone_id="Africa/Casablanca").new_page()
    m.goto(BASE + "/"); m.wait_for_load_state("networkidle")
    m.get_by_placeholder("Mot de passe").fill(PASSWORD); m.get_by_role("button", name="Se connecter").click(); m.get_by_text("Aujourd").first.wait_for()
    overflow = m.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
    check("Mobile: pas de scroll horizontal (Dashboard)", not overflow)
    m.screenshot(path="shot_mobile.png")
    browser.close()

print("\n=== ERREURS CONSOLE/PAGE ===")
print("\n".join(sorted(set(errors))) or "aucune")
print("=== REQUÊTES API EN ÉCHEC (>=400) ===")
print("\n".join(sorted(set(bad_requests))) or "aucune")
fails = [r for r in results if not r[1]]
print(f"\nRÉSUMÉ: {len(results)-len(fails)}/{len(results)} vérifications OK")
