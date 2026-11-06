"""Aides communes aux parcours navigateur : création/connexion avec le mot de passe de test, appels API authentifiés."""
import json, urllib.request

BASE, API = "http://localhost:5173", "http://localhost:4000/api"
PASSWORD = "Test-Passw0rd-2026"

def login(page, base=BASE, name="Testeur"):
    """Crée le mot de passe si l'application est neuve, sinon se connecte. Attend que l'application soit affichée."""
    page.goto(base + "/"); page.wait_for_load_state("networkidle")
    if page.get_by_text("Bienvenue").count():
        page.get_by_placeholder("Ton prénom (optionnel)").fill(name)
        page.get_by_placeholder("Mot de passe (8 caractères minimum)").fill(PASSWORD)
        page.get_by_placeholder("Confirme le mot de passe").fill(PASSWORD)
        page.get_by_role("button", name="Créer le mot de passe").click()
    elif page.get_by_role("button", name="Se connecter").count():
        page.get_by_placeholder("Mot de passe").fill(PASSWORD)
        page.get_by_role("button", name="Se connecter").click()
    page.get_by_text("Quitter").first.wait_for(timeout=10000)

def session_cookie(ctx):
    for c in ctx.cookies():
        if c["name"] == "plos_session":
            return c["value"]
    return None

def api_call(method, path, cookie, body=None):
    headers = {"Content-Type": "application/json", "X-PLOS": "1", "Cookie": f"plos_session={cookie}"}
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=headers)
    with urllib.request.urlopen(req) as r:
        raw = r.read()
        return json.loads(raw) if raw else None
