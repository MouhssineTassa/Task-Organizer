"""Parcours navigateur : routines (tâches récurrentes). Prérequis : backend :4000, frontend (build) :5173."""
import sys, pathlib, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from common import BASE, login, session_cookie, api_call

results = []
def check(name, ok, detail=""):
    results.append(ok); print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""))

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(timezone_id="Africa/Casablanca", locale="fr-FR", viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    login(page)
    cookie = session_cookie(ctx)
    for r in api_call("GET", "/recurring/rules", cookie):   # rejouable : on repart sans routine active
        api_call("DELETE", f"/recurring/rules/{r['id']}", cookie)
    for t in api_call("GET", "/tasks", cookie):             # ...et sans tâche (une urgence appliquée laisse une tâche verrouillée)
        api_call("DELETE", f"/tasks/{t['id']}", cookie)
    today = page.evaluate("new Date().toLocaleDateString('sv-SE')")   # date locale du navigateur (Casablanca)
    def plus(n):
        return page.evaluate(f"(() => {{ const d = new Date(); d.setDate(d.getDate() + {n}); return d.toLocaleDateString('sv-SE'); }})()")
    tomorrow, after = plus(1), plus(2)
    occ = lambda a, b: api_call("GET", f"/recurring/occurrences?from={a}&to={b}", cookie)

    # --- création par l'interface
    page.goto(BASE + "/tasks"); page.wait_for_load_state("networkidle")
    page.get_by_role("button", name="Routines", exact=True).click()
    page.get_by_role("button", name="Nouvelle routine").click()
    page.get_by_placeholder("Ex: Sport, Réviser Python, Lire 20 pages…").fill("Sport")
    page.locator("form select").first.select_option("Daily")
    page.locator("form input[type=time]").first.fill("18:00")
    page.locator("form input[type=number]").first.fill("60")
    page.get_by_role("button", name="Créer la routine").click()
    page.get_by_text("Mes routines").wait_for()
    page.wait_for_timeout(800)
    rules = api_call("GET", "/recurring/rules", cookie)
    check("Création: routine enregistrée (quotidienne, 18:00, 60 min)", len(rules) == 1 and rules[0]["frequency"] == "Daily" and rules[0]["start_time"] == "18:00" and rules[0]["estimated_minutes"] == 60)
    check("Création: occurrence d'aujourd'hui affichée dans « Cette semaine »", page.get_by_text("18:00 · 60 min").first.is_visible())

    # --- sauter AUJOURD'HUI : demain reste prévu, la routine n'est pas modifiée
    page.get_by_title("Sauter cette occurrence (la routine continue)").first.click()
    page.get_by_text("sautée").first.wait_for(timeout=5000)
    ds = [o["date"] for o in occ(today, plus(3))]
    check("Sauter: aujourd'hui n'est plus prévu", today not in ds, str(ds))
    check("Sauter: demain et après-demain restent prévus (la routine continue)", tomorrow in ds and after in ds)
    check("Sauter: la routine elle-même est intacte", api_call("GET", "/recurring/rules", cookie)[0]["start_time"] == "18:00")
    page.get_by_text("Rétablir").first.click(); page.wait_for_timeout(800)
    check("Rétablir: l'occurrence d'aujourd'hui revient", today in [o["date"] for o in occ(today, today)])

    # --- terminer : XP, badge, dashboard
    page.get_by_title("Terminer").first.click()
    page.get_by_text("+15 XP").first.wait_for(timeout=5000)
    check("Terminer: +15 XP affiché (difficulté moyenne)", True)
    check("Terminer: occurrence marquée « faite »", page.get_by_text("faite").first.is_visible())
    page.goto(BASE + "/"); page.wait_for_load_state("networkidle")
    check("Dashboard: « Routines du jour » affiche la routine terminée", page.get_by_text("Routines du jour").is_visible() and page.get_by_text("🔁 Sport").first.is_visible())

    # --- vue semaine du planning : bloc de routine à venir
    page.goto(BASE + "/planning"); page.wait_for_load_state("networkidle")
    page.get_by_role("button", name="Semaine", exact=True).click(); page.wait_for_timeout(600)
    page.get_by_label("Semaine suivante").click()   # la semaine en cours peut ne plus contenir d'occurrence à faire
    try:
        page.get_by_text("🔁 Sport").first.wait_for(timeout=8000)   # vraie attente du chargement
        n = page.get_by_text("🔁 Sport").count()
    except Exception:
        n = 0
    check("Planning (semaine): les routines apparaissent comme blocs 🔁", n >= 1, f"{n} bloc(s)")
    page.screenshot(path="shot_routines_week.png", full_page=True)

    # --- URGENCE sur demain 18:20-18:40 : déplace UNE occurrence, pas la routine
    page.get_by_role("button", name="Tâche urgente").click()
    page.get_by_placeholder("Ex: Imprimer le dossier").fill("Imprimer dossier")
    page.locator("div.fixed input[type=date]").fill(tomorrow)
    page.locator("div.fixed input[type=time]").nth(0).fill("18:20")
    page.locator("div.fixed input[type=time]").nth(1).fill("18:40")
    page.get_by_role("button", name="Voir ce que ça change").click()
    page.get_by_text("routine : seule cette occurrence est déplacée").wait_for(timeout=5000)
    check("Urgence: la proposition annonce que seule cette occurrence est déplacée", True)
    check("Urgence: proposer n'a rien modifié", [o["time"] for o in occ(tomorrow, after)] == ["18:00", "18:00"])
    page.screenshot(path="shot_routines_urgent.png")
    page.get_by_role("button", name="Valider", exact=True).click(); page.wait_for_timeout(1000)
    t = {o["date"]: o["time"] for o in occ(tomorrow, after)}
    check("Urgence validée: l'occurrence de demain est déplacée", t[tomorrow] != "18:00", t[tomorrow])
    check("Urgence validée: après-demain reste à 18:00", t[after] == "18:00")
    check("Urgence validée: la règle est inchangée", api_call("GET", "/recurring/rules", cookie)[0]["start_time"] == "18:00")

    # --- reporter une occurrence par l'interface
    page.goto(BASE + "/tasks"); page.wait_for_load_state("networkidle")
    page.get_by_role("button", name="Routines", exact=True).click(); page.wait_for_timeout(600)
    page.get_by_label("Semaine suivante").click(); page.wait_for_timeout(900)   # indépendant du jour de la semaine
    page.get_by_title("Reporter cette occurrence").nth(0).click()
    d = page.locator("input[type=date]").last
    d.fill(plus(4)); page.locator("input[type=time]").last.fill("20:00")
    page.get_by_role("button", name="Confirmer le report").click(); page.wait_for_timeout(1000)
    moved = [o for o in occ(today, plus(6)) if o["rescheduled"]]
    check("Reporter: une occurrence apparaît au nouveau jour/heure", any(o["date"] == plus(4) and o["time"] == "20:00" for o in moved), str([(o["date"], o["time"]) for o in moved]))

    browser.close()
print("ERREURS JS:", errors or "aucune")
print(f"RÉSUMÉ: {sum(results)}/{len(results)} OK")
