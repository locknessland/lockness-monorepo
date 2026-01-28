# Lockness Events System (Symfony-inspired)

## 🎯 Objectif

Implémenter un système d'événements centralisé et extensible pour le framework
Lockness, permettant aux développeurs et aux packages tiers de se brancher sur
le cycle de vie de l'application (Lifecycle Events) et de définir des événements
métiers personnalisés.

L'inspiration majeure est le **EventDispatcher** de Symfony, adapté à la
modernité et à l'asynchronisme de Deno.

## 🏗 Architecture proposée

### 1. Composants Clés

- **EventDispatcher** : Le moteur central qui gère l'enregistrement des
  listeners et la distribution des événements.
- **Events as Classes** : Les événements ne sont pas de simples chaînes de
  caractères mais des classes transportant des données typées (ex:
  `RequestEvent`, `UserRegisteredEvent`).
- **Subscribers & Listeners** :
  - `@Listener(EventClass, options)` : Décorateur pour abonner une méthode d'un
    service à un événement.
  - `@Subscriber()` : Décorateur pour une classe regroupant plusieurs écouteurs
    (en option).
- **Container Integration** : Les listeners doivent être des services gérés par
  le container DI (`@lockness/container`), permettant l'injection de dépendances
  au sein des hooks.

### 2. Lifecycle Events (Core)

Le framework doit émettre des événements aux points critiques de son exécution :

| Événement                 | Moment du déclenchement                        | Usage typique                                   |
| :------------------------ | :--------------------------------------------- | :---------------------------------------------- |
| `KernelEvents.REQUEST`    | Au début de chaque requête HTTP.               | Authentification personnalisée, log system.     |
| `KernelEvents.CONTROLLER` | Juste avant l'appel de l'action du contrôleur. | Modification des arguments, guards spécifiques. |
| `KernelEvents.RESPONSE`   | Après le contrôleur, avant l'envoi au client.  | Ajout de headers, compression, post-processing. |
| `KernelEvents.EXCEPTION`  | En cas d'erreur non gérée.                     | Formatage d'erreurs, alertes.                   |
| `KernelEvents.TERMINATE`  | Après l'envoi de la réponse.                   | Tâches de fond lourdes (stats, emails).         |
| `KernelEvents.BOOT`       | Une fois l'application initialisée.            | Init de plugins, warming de cache.              |

### 3. Workflow de Boot (Kernel)

Pour garantir les performances, l'enregistrement doit être statique au démarrage
:

1. Le `Kernel` scanne les dossiers (`app/listener`, `app/subscriber`).
2. Le `Dispatcher` identifie les méthodes décorées `@Listener`.
3. Le `Dispatcher` enregistre les fonctions de rappel en les liant aux instances
   du container DI.

## 💻 Vision DX (Developer Experience)

```typescript
@Service()
export class AnalyticsSubscriber {
    /**
     * Enregistre chaque requête dans un système externe
     * Priorité élevée pour être exécuté tôt
     */
    @Listener(RequestEvent, { priority: 100 })
    async onKernelRequest(event: RequestEvent) {
        const { req } = event.context
        await this.statsService.track(req.path, req.method)
    }

    /**
     * Hook métier personnalisé
     */
    @Listener(UserRegisteredEvent)
    onUserRegistered(event: UserRegisteredEvent) {
        console.log(`Bienvenue à ${event.user.name} !`)
    }
}
```

## ✅ Bénéfices attendus

- **Découplage total** : Les packages (Auth, Mail, Queue) peuvent réagir au
  framework sans que le Framework ne les connaisse.
- **Extensibilité** : Facilite la création d'un écosystème de plugins pour
  Lockness.
- **Type-safety** : Utilisation du package `@lockness/events` existant pour une
  inférence parfaite des données d'événements.
- **Maintainabilité** : Sépare la logique métier des controllers.

## 🛠 Plan d'implémentation (Draft)

1. [ ] Faire évoluer `@lockness/events` pour supporter le dispatching par
       classe.
2. [ ] Créer les décorateurs `@Listener` dans `@lockness/events` ou
       `@lockness/container`.
3. [ ] Introduire les `KernelEvents` dans `@lockness/core/app.ts` via un
       middleware de cycle de vie.
4. [ ] Mettre à jour `createApp()` (Kernel Loader) pour auto-découvrir et
       enregistrer les listeners.
5. [ ] Documenter le système dans le `GEMINI.md` et les docs officiels.
