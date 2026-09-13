# Bande-son

Le site joue le fichier **`audio/theme.mp3`** au clic sur « Entrer dans le
corps ». Aucun lecteur n'est affiché : seul un petit bouton coupe-son
apparaît dans l'en-tête, et uniquement si une piste a pu être chargée.

## Installer ta piste

Dépose ton fichier ici et nomme-le exactement `theme.mp3` :

```
audio/theme.mp3
```

C'est tout. Si le fichier est absent, le site fonctionne normalement, en
silence, sans erreur ni bouton.

Formats acceptés par tous les navigateurs : MP3. Pour alléger le
chargement sur mobile, viser **moins de 3 Mo** (un MP3 à 128 kb/s suffit
largement pour une musique d'ambiance).

## Pourquoi le fichier n'est pas dans le dépôt

`.gitignore` exclut volontairement `audio/*.mp3`.

Ce dépôt est **public**, et le site est destiné à être publié sur GitHub
Pages. Y placer l'enregistrement d'un artiste reviendrait à le
redistribuer publiquement sans autorisation — ce qui est interdit, quelle
que soit la façon dont le fichier a été obtenu.

Selon ton usage :

- **Site public** : utilise une musique libre de droits ou sous licence
  (Pixabay Music, Uppbeat, Epidemic Sound…), ou une piste que tu as
  composée. Dans ce cas tu peux retirer la ligne du `.gitignore`.
- **Usage strictement personnel**, site ouvert depuis ton ordinateur sans
  le publier : tu fais ce que tu veux de ta copie, elle ne quitte pas ta
  machine.

## Pourquoi la musique ne part pas toute seule au chargement

Ce n'est pas un réglage manquant : **aucun navigateur** (Chrome, Safari,
Firefox, Edge) n'autorise un son à démarrer avant une action de
l'utilisateur. C'est une protection du navigateur, impossible à
contourner depuis une page web.

Le bouton « Entrer dans le corps » sert donc de déclencheur : c'est ce
geste qui débloque l'audio. En pratique, la musique démarre dès l'entrée
sur le site.
