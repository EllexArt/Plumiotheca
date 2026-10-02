---
name: revue-tech-lead
description: Lance une revue « tech lead » de Plumiotheca (sécurité, bonnes pratiques, logique fonctionnelle et technique) sur une ou plusieurs PR, une branche ou tout le dépôt, et enregistre le rapport dans docs/revues/. À utiliser avant de fusionner une PR ou à la fin d'un jalon. Arguments : numéros de PR (ex. « 76 98 »), un nom de branche, ou « tout ».
---

# Revue tech lead

1. **Déterminer la cible** à partir des arguments :
   - des numéros → ces PR (`gh pr view <n>`, `gh pr diff <n>`) ;
   - un nom de branche → `git diff main...<branche>` ;
   - « tout » ou rien → l'état actuel de `main` dans son ensemble.
2. **Lancer l'agent `tech-lead`** (outil Agent, `subagent_type: "tech-lead"`) avec une consigne qui précise la cible, rappelle qu'il ne doit rien modifier, et demande le rapport complet au format de son fichier d'agent. Si ce type d'agent n'est pas disponible dans la session, utiliser l'agent généraliste en lui donnant le contenu de `.claude/agents/tech-lead.md` comme consigne.
3. **Enregistrer le rapport** dans `docs/revues/AAAA-MM-JJ-<objet>.md` (sans le committer : la personne décide).
4. **Présenter à l'utilisatrice** : le verdict par PR, les constats Critique et Élevé, les questions qui lui reviennent, puis proposer de corriger ce qui est bloquant **avant** toute fusion.

Ne jamais fusionner, corriger ou commenter une PR sur la seule base du rapport sans l'accord de l'utilisatrice.
