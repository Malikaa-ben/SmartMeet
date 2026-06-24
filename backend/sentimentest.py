from sentiment import SentimentAnalyzer

# Initialisation
analyzer = SentimentAnalyzer()

# Test avec différentes phrases
phrases = [
    "C'est un excellent travail, bravo !", 
    "Je suis très déçu par ce résultat, c'est une catastrophe.",
    "La réunion se déroulera dans la salle B."
]

for p in phrases:
    result = analyzer.analyze(p)
    print(f"Phrase : {p}")
    print(f"Résultat : {result['label_fr']} ({result['emoji']}) - Score : {result['score']}")
    print("-" * 30)