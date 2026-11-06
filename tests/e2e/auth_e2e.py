"""Parcours navigateur de l'authentification + attaque depuis une page hostile. Prérequis : base NEUVE, backend :4000,
frontend :5173 (servi avec --host 0.0.0.0 pour tester aussi 127.0.0.1), serveur 'evil' sur :5999 (dossier tests/e2e/evil)."""
import json, pathlib, sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from common import BASE, PASSWORD, login, session_cookie, api_call

results = []
def check(name, ok, detail=""):
    results.append(ok); print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""))

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(timezone_id="Africa/Casablanca", locale="fr-FR")
    page = ctx.new_page()

    # --- première utilisation
    page.goto(BASE + "/"); page.wait_for_load_state("networkidle")
    check("Neuf: écran de création du mot de passe, application invisible", page.get_by_text("Bienvenue").is_visible() and page.get_by_text("Quitter").count() == 0)
    page.get_by_placeholder("Mot de passe (8 caractères minimum)").fill(PASSWORD)
    page.get_by_placeholder("Confirme le mot de passe").fill(PASSWORD + "x")
    page.get_by_role("button", name="Créer le mot de passe").click()
    check("Création: confirmation différente refusée", page.get_by_text("ne correspondent pas").is_visible())
    page.get_by_placeholder("Mot de passe (8 caractères minimum)").fill("azerty123")
    page.get_by_placeholder("Confirme le mot de passe").fill("azerty123")
    page.get_by_role("button", name="Créer le mot de passe").click()
    page.get_by_text("trop courant").wait_for(timeout=5000)
    check("Création: mot de passe trop courant refusé par le serveur", True)
    page.get_by_placeholder("Ton prénom (optionnel)").fill("Karim")
    page.get_by_placeholder("Mot de passe (8 caractères minimum)").fill(PASSWORD)
    page.get_by_placeholder("Confirme le mot de passe").fill(PASSWORD)
    page.get_by_role("button", name="Créer le mot de passe").click()
    page.get_by_text("Quitter").first.wait_for(timeout=10000)
    check("Création réussie: application affichée avec le prénom", page.get_by_text("Karim").first.is_visible())

    # --- cookie et session
    c = next(c for c in ctx.cookies() if c["name"] == "plos_session")
    check("Cookie de session: HttpOnly + SameSite=Lax", c["httpOnly"] and c["sameSite"] == "Lax", f"httpOnly={c['httpOnly']} sameSite={c['sameSite']}")
    check("Le JavaScript de la page ne peut pas lire le cookie (anti-vol XSS)", "plos_session" not in page.evaluate("document.cookie"))
    page.reload(); page.wait_for_load_state("networkidle")
    check("Rechargement: toujours connecté", page.get_by_text("Quitter").first.is_visible())

    # --- déconnexion / reconnexion
    page.get_by_text("Quitter").first.click()
    page.get_by_role("button", name="Se connecter").wait_for()
    check("Déconnexion: écran de connexion", page.get_by_text("Bonjour Karim").is_visible())
    page.goto(BASE + "/tasks"); page.wait_for_load_state("networkidle")
    check("Accès direct à /tasks sans session: connexion demandée, aucune donnée", page.get_by_role("button", name="Se connecter").is_visible() and page.get_by_text("Nouvelle tâche").count() == 0)
    page.get_by_placeholder("Mot de passe").fill("mauvais-mdp-123")
    page.get_by_role("button", name="Se connecter").click()
    page.get_by_text("Mot de passe incorrect").wait_for(timeout=5000)
    check("Mauvais mot de passe: message clair", True)
    page.get_by_placeholder("Mot de passe").fill(PASSWORD)
    page.get_by_role("button", name="Se connecter").click()
    page.get_by_text("Quitter").first.wait_for(timeout=10000)
    check("Bon mot de passe: application affichée", True)

    # --- session révoquée côté serveur pendant l'usage -> retour à la connexion
    cookie = session_cookie(ctx)
    api_call("POST", "/auth/logout-all", cookie)
    page.get_by_role("link", name="Notes").first.click()  # autre page que /tasks, pour forcer une requête
    page.get_by_role("button", name="Se connecter").wait_for(timeout=8000)
    check("Session révoquée: retour automatique à la connexion", True)
    page.get_by_placeholder("Mot de passe").fill(PASSWORD)
    page.get_by_role("button", name="Se connecter").click(); page.get_by_text("Quitter").first.wait_for(timeout=10000)
    cookie = session_cookie(ctx)

    # --- ATTAQUE : page hostile sur un autre port de localhost, avec la session ouverte
    api_call("POST", "/tasks", cookie, {"title": "Tâche légitime"})
    evil = ctx.new_page()
    evil.goto("http://localhost:5999/evil.html")
    evil.wait_for_function("window.__out && window.__out.done", timeout=15000)
    out = evil.evaluate("window.__out")
    print("   résultats de l'attaque:", json.dumps(out, ensure_ascii=False))
    check("Attaque: lecture des données depuis une autre origine BLOQUÉE", out["get"] == "blocked")
    check("Attaque: écriture JSON avec en-tête de sécurité BLOQUÉE", out["post_json"] == "blocked")
    titles = [t["title"] for t in api_call("GET", "/tasks", cookie)]
    check("Attaque: requête 'simple' et formulaire HTML n'ont rien créé", "EVIL" not in titles, f"{len(titles)} tâche(s)")
    check("Attaque: les données légitimes sont intactes", "Tâche légitime" in titles)
    evil.close()

    # --- accès via 127.0.0.1 (cookie lié au nom d'hôte : l'API doit suivre le même hôte)
    ctx2 = browser.new_context(timezone_id="Africa/Casablanca", locale="fr-FR")
    p2 = ctx2.new_page()
    login(p2, base="http://127.0.0.1:5173")
    check("Accès par 127.0.0.1: connexion et application OK", p2.get_by_text("Quitter").first.is_visible())
    ctx2.close()

    # --- changement de mot de passe par l'interface
    page.goto(BASE + "/parametres"); page.wait_for_load_state("networkidle")
    page.get_by_placeholder("Mot de passe actuel").fill("faux-faux-faux")
    page.get_by_placeholder("Nouveau mot de passe").fill("Nouveau-Mdp-2026")
    page.get_by_placeholder("Confirmer", exact=True).fill("Nouveau-Mdp-2026")
    page.get_by_role("button", name="Changer le mot de passe").click()
    page.get_by_text("actuel est incorrect").wait_for(timeout=5000)
    check("Changement: mot de passe actuel erroné refusé", True)
    page.get_by_placeholder("Mot de passe actuel").fill(PASSWORD)
    page.get_by_role("button", name="Changer le mot de passe").click(); page.wait_for_timeout(900)
    page.get_by_text("Mot de passe modifié").wait_for(timeout=5000)
    check("Changement: succès affiché", True)
    page.get_by_text("Quitter").first.click(); page.get_by_role("button", name="Se connecter").wait_for()
    page.get_by_placeholder("Mot de passe").fill(PASSWORD)
    page.get_by_role("button", name="Se connecter").click()
    page.get_by_text("Mot de passe incorrect").wait_for(timeout=5000)
    check("Changement: l'ancien mot de passe ne fonctionne plus", True)
    page.get_by_placeholder("Mot de passe").fill("Nouveau-Mdp-2026")
    page.get_by_role("button", name="Se connecter").click(); page.get_by_text("Quitter").first.wait_for(timeout=10000)
    check("Changement: le nouveau mot de passe fonctionne", True)
    # remet le mot de passe d'origine : les autres scripts (smoke, routines...) peuvent s'enchaîner derrière celui-ci
    api_call("POST", "/auth/change-password", session_cookie(ctx), {"currentPassword": "Nouveau-Mdp-2026", "newPassword": PASSWORD})
    browser.close()

print(f"\nRÉSUMÉ: {sum(results)}/{len(results)} OK")
