# Drayton Wiser Heating

Pilotez votre chauffage Drayton Wiser depuis Gladys : pièces, eau chaude,
prises connectées, têtes thermostatiques et thermostats d'ambiance.
L'intégration dialogue **directement avec votre HeatHub Wiser sur votre réseau
local** : pas de compte cloud Wiser, rien ne sort vers internet, et elle
continue de fonctionner quand votre connexion internet est coupée.

## Ce que vous obtenez

Après la configuration, l'onglet **Découverte** liste :

- **Wiser HeatHub** — mode absence, mode éco, et si la chaudière chauffe.
- **Un appareil par pièce** — température, humidité (si un thermostat
  d'ambiance dessert la pièce), consigne, mode (**Arrêt**, **Manuel**,
  **Programme**), état de chauffe, **Boost** et fenêtre (si une tête
  thermostatique la détecte).
- **Eau chaude** (si le hub pilote un ballon) — mode (**Arrêt**, **Marche**,
  **Programme**), état de chauffe et **Boost**.
- **Prises connectées** — marche/arrêt, puissance (W) et énergie (kWh).
- **Têtes thermostatiques** et **thermostats d'ambiance** — piles, signal
  radio et, pour une tête, la température près du radiateur.

Le comportement des commandes, comme dans l'application Wiser :

- une **consigne** réglée pendant que la pièce suit son programme dure
  jusqu'au prochain créneau du programme ; en mode Manuel, elle reste ;
- le **Boost** ajoute quelques degrés (2 °C par défaut) à la température
  actuelle pendant un temps (1 heure par défaut) ;
- le **mode absence** fait passer toutes les pièces à la température
  d'absence réglée dans l'application Wiser.

## Avant de commencer

Cette intégration nécessite **Gladys 5.3.0 ou plus récent** : le store ne la
propose pas à une instance plus ancienne.

Il vous faut deux choses : l'**adresse** du hub et son **secret**.

### 1. L'adresse du hub

Trouvez le HeatHub dans votre box (son nom commence par `WiserHeat`) et notez
son adresse IP. Donnez-lui une **adresse fixe** (réservation DHCP) pour qu'elle
ne change pas.

### 2. Le secret du hub

Le secret est une longue clé que le hub n'affiche qu'en mode configuration.
Cela n'arrête pas le hub : votre chauffage continue de fonctionner pendant ces
étapes.

1. Appuyez une fois sur le **bouton de configuration** du hub (à l'arrière ou
   sur le côté selon le modèle). Son voyant se met à clignoter.
2. Avec un téléphone ou un ordinateur, connectez-vous au réseau Wi-Fi nommé
   **WiserHeatXXXXXX** que le hub ouvre.
3. Ouvrez <http://192.168.8.1/secret> dans un navigateur : copiez le long texte
   affiché (il se termine souvent par `==`).
4. Appuyez de nouveau sur le bouton de configuration (ou attendez quelques
   minutes) pour que le hub quitte le mode configuration, et reconnectez votre
   appareil à votre Wi-Fi.

Le secret ne change plus ensuite ; il ne faut le relire que si vous
réinitialisez le hub.

## Configuration

1. Ouvrez l'onglet **Configuration** de l'intégration.
2. Renseignez **Adresse du HeatHub** et **Secret du HeatHub**.
3. Laissez **Connexion** sur **Automatique** : les hubs récents de 2e
   génération ne répondent qu'en HTTPS, l'intégration le détecte seule.
4. Modifiez si besoin l'**intervalle de rafraîchissement** (60 secondes par
   défaut : une lecture couvre toutes les pièces et tous les appareils), le
   **boost** (degrés et durée) et la durée du **boost de l'eau chaude**.
5. Enregistrez, puis cliquez sur **Tester la connexion** : la réponse indique
   le firmware du hub, le nombre de pièces et d'appareils.
6. Ouvrez l'onglet **Découverte** et ajoutez les appareils voulus.

## Actions

- **Tester la connexion** — lit le hub immédiatement et indique ce qu'il sert,
  ou ce qu'il faut corriger (mauvaise adresse, secret refusé…).
- **Identifier un appareil** — choisissez un appareil : ses voyants
  clignotent. Choisissez une pièce et toutes ses têtes et son thermostat
  clignotent.

## Scènes

L'intégration ajoute ses propres cartes à l'éditeur de scènes (Gladys 5.1 ou
plus récent), dans la catégorie **Intégrations**.

Déclencheurs :

- **Fenêtre ouverte ou fermée** — une tête thermostatique a détecté une
  fenêtre ouverte (chute brutale de température) ou sa fermeture. Variables :
  `room`, `state` (`open` / `closed`).
- **Mode absence modifié** — le mode absence a été activé ou désactivé **hors
  de Gladys** (application Wiser, bouton du hub). Variable : `state` (`on` /
  `off`).
- **Piles faibles** — une tête ou un thermostat aura bientôt besoin de piles
  neuves. Variables : `device_name`, `room`, `level`, `battery` (%).
- **Connexion au HeatHub perdue ou rétablie** — le hub ne répond plus (coupure
  de courant, Wi-Fi, mauvais secret) ou répond de nouveau. Variables : `state`
  (`lost` / `restored`), `reason`.

Actions (chacune renvoie un résultat que les actions suivantes peuvent
tester) :

- **Booster une pièce** — degrés et durée ; laissez la pièce vide pour booster
  toutes les pièces.
- **Régler la température d'une pièce** — une durée de 0 dure jusqu'au
  prochain créneau du programme.
- **Revenir au programme** — annule les boosts et consignes temporaires d'une
  pièce, ou de toutes les pièces.
- **Régler le mode absence** — activé ou désactivé.
- **Booster l'eau chaude** — pendant un nombre de minutes.

## Tableau de bord

- **Chauffage Wiser** — toutes les pièces d'un coup d'œil (température,
  consigne, mode, et un badge : chauffe, boost, fenêtre ouverte, arrêt), la
  connexion au hub, les modes absence et éco, la chaudière, l'eau chaude et les
  piles. Boutons : mode absence, retour au programme, boost de l'eau chaude.
- **Pièce Wiser** — choisissez une pièce dans les réglages du widget :
  température, consigne et humidité en direct, mode, chauffe, boost et
  fenêtre. Boutons : **Boost** (demande les degrés et la durée), **Annuler
  dérogation**, **Suivre programme**.

## Dépannage

- **« Le HeatHub a refusé le secret »** — relisez le secret (voir plus haut) ;
  il change quand le hub est réinitialisé.
- **« Le HeatHub ne répond pas »** — vérifiez l'adresse (elle a pu changer sans
  réservation DHCP) et que le hub est alimenté. L'intégration déclare le hub
  perdu après deux lectures ratées de suite, pas à la première réponse lente.
- **Pas d'humidité ou de fenêtre** — elles n'existent que si la pièce a un
  thermostat d'ambiance (humidité) ou des têtes thermostatiques (fenêtre).
- Les actionneurs de chauffage, contrôleurs de plancher chauffant, éclairages
  et volets de la gamme Wiser ne sont pas encore pris en charge.
- Logs détaillés : consultez les logs de l'intégration depuis Gladys (ou
  `docker logs` sur l'hôte).
