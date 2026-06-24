from agent import ask_agent

# Liste de tests : (Description, Question, Réponse attendue - mot clé)
tests = [
    ("Comptage simple", "Combien de réunions y a-t-il au total ?", "86"),
    ("Filtrage par date", "Quelles réunions ont eu lieu récemment ?", "juin"),
    ("Croisement de données", "Quel est le sentiment dominant de la réunion d'id 1 ?", "positif"),
    ("Test d'échec (donnée inexistante)", "Quel est le budget du projet ?", "pas d'information")
]

def run_evaluation():
    print(f"{'TYPE':<25} | {'RÉUSSI'}")
    print("-" * 40)
    
    for desc, q, expected in tests:
        response = ask_agent(q)
        success = expected.lower() in response.lower()
        print(f"{desc:<25} | {'✅' if success else '❌'}")
        if not success:
            print(f"   -> Réponse reçue : {response}")

if __name__ == "__main__":
    run_evaluation()