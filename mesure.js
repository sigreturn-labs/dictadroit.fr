/* ══════════════════════════════════════════════════════════════════════════
   Dictadroit : mesure de fréquentation et d'événements.

   PRINCIPE : ce fichier est une AMÉLIORATION. La page fonctionne sans lui.
   Le formulaire est un <form method="POST"> natif, encodé en
   application/x-www-form-urlencoded : si ce script meurt, ne se charge pas
   ou est bloqué, la conversion part quand même : Web3Forms répond en 303 et
   le navigateur arrive sur merci.html. NE JAMAIS déplacer la soumission ici.

   La mesure d'événements, elle, n'a pas encore de destination : tant que
   URL_EVENEMENTS est vide, RIEN n'est envoyé nulle part. C'est le bon défaut
   pour une page qui promet précisément de ne parler à personne.
     Noms d'événements, à la lettre : pageview · email_laisse ·
     demo_demandee · boitier_interesse · offre_abonnement · offre_perpetuelle
   ══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════════════════
     ⚙ LES DEUX SEULES CONSTANTES DE DÉPLOIEMENT
     ══════════════════════════════════════════════════════════════════════
     URL_COLLECTE doit être IDENTIQUE à l'attribut action du <form> dans
     index.html (repère @@URL-COLLECTE@@) : c'est cet attribut-là qui sert
     quand le JavaScript est absent. S'ils divergent, ce script le signale
     dans la console et aligne le formulaire pour les visiteurs qui ont du JS.

     URL_EVENEMENTS n'a pas encore de destination : la chaîne vide DÉSACTIVE
     l'envoi, et aucune requête ne part. Le jour où un point de collecte
     existe, une seule ligne à changer, le reste du fichier est prêt.
     ══════════════════════════════════════════════════════════════════════ */
  var URL_COLLECTE   = 'https://api.web3forms.com/submit';
  var URL_EVENEMENTS = '';

  /* ------------------------------------------------------------------ */

  var CLES_UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term'];

  function parametres() {
    try {
      return new URLSearchParams(window.location.search);
    } catch (e) {
      return null;
    }
  }

  /* Les paramètres de campagne, repris de l'URL d'arrivée.
     `gclid` est le plus important des cinq : sans lui, aucune conversion ne
     peut être rattachée à un clic Google Ads, et le sprint perd sa mesure.
     Repli quand le JavaScript est coupé : le champ caché part vide, mais la
     soumission porte l'en-tête Referer, qui contient l'URL complète de la
     page d'arrivée, donc le gclid. Il faut alors le relire dans les données
     du prestataire, et non dans le champ. */
  function campagne() {
    var p = parametres();
    var valeurs = {};
    if (!p) { return valeurs; }
    CLES_UTM.concat(['gclid']).forEach(function (cle) {
      var valeur = p.get(cle);
      if (valeur) { valeurs[cle] = valeur.slice(0, 200); }
    });
    return valeurs;
  }

  var CAMPAGNE = campagne();

  function utmSeuls() {
    var utm = {};
    CLES_UTM.forEach(function (cle) {
      if (CAMPAGNE[cle]) { utm[cle] = CAMPAGNE[cle]; }
    });
    if (CAMPAGNE.gclid) { utm.gclid = CAMPAGNE.gclid; }
    return utm;
  }

  var UTM = utmSeuls();

  function envoyer(nom) {
    if (!URL_EVENEMENTS) { return; }   /* aucune destination : on n'appelle personne */
    var charge = JSON.stringify({
      evt: nom,
      path: window.location.pathname,
      ref: document.referrer || '',
      utm: UTM,
      ts: Date.now()
    });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(URL_EVENEMENTS, new Blob([charge], { type: 'application/json' }));
        return;
      }
      if (window.fetch) {
        window.fetch(URL_EVENEMENTS, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: charge,
          keepalive: true
        })['catch'](function () { /* la mesure ne doit jamais gêner la page */ });
      }
    } catch (e) { /* idem */ }
  }

  /* --- vue de page ------------------------------------------------------ */
  envoyer('pageview');

  /* --- report des paramètres de campagne dans les champs cachés --------- */
  CLES_UTM.concat(['gclid']).forEach(function (cle) {
    var champ = document.getElementById('champ-' + cle);
    if (champ && CAMPAGNE[cle]) { champ.value = CAMPAGNE[cle]; }
  });

  /* --- le formulaire ---------------------------------------------------- */
  var formulaire = document.querySelector('form.formulaire');

  if (formulaire) {
    /* Garde-fou : l'attribut action et la constante ci-dessus doivent dire
       la même chose. Sinon, les visiteurs sans JavaScript posteraient
       ailleurs que les autres : une fuite silencieuse de conversions. */
    var actionEcrite = formulaire.getAttribute('action') || '';
    if (actionEcrite !== URL_COLLECTE) {
      if (window.console && console.warn) {
        console.warn('Dictadroit : action du formulaire (' + actionEcrite +
          ') ≠ URL_COLLECTE (' + URL_COLLECTE + '). mesure.js aligne le ' +
          'formulaire, mais le chemin sans JavaScript garde l\'attribut.');
      }
      formulaire.setAttribute('action', URL_COLLECTE);
    }

    /* Aucun preventDefault : la navigation native reste maîtresse.
       sendBeacon est conçu pour survivre au déchargement de la page. */
    formulaire.addEventListener('submit', function () {
      var piege = formulaire.querySelector('[name="botcheck"]');
      if (piege && piege.checked) { return; }   /* robot : on ne compte rien */
      envoyer('email_laisse');
      var caseDemo = document.getElementById('demo');
      if (caseDemo && caseDemo.checked) { envoyer('demo_demandee'); }

      /* État d'envoi : sur une liaison lente, un bouton qui ne change pas
         d'état se fait cliquer deux fois. Différé d'un tour de boucle pour ne
         rien changer à la soumission native déjà engagée. */
      var envoi = formulaire.querySelector('button[type="submit"]');
      if (envoi) {
        window.setTimeout(function () {
          envoi.disabled = true;
          envoi.textContent = 'Envoi…';
        }, 0);
      }
    });

    /* Retour en arrière depuis merci.html : le navigateur restitue la page
       telle quelle, bouton désactivé compris. On le rend au visiteur. */
    window.addEventListener('pageshow', function (e) {
      if (!e.persisted) { return; }
      var envoi = formulaire.querySelector('button[type="submit"]');
      if (envoi && envoi.disabled) {
        envoi.disabled = false;
        envoi.textContent = 'Envoyer';
      }
    });
  }

  /* La formule est une VRAIE question du formulaire, visible et répondue par
     le visiteur : ici on ne fait que cocher d'avance la case qui correspond au
     bouton d'offre cliqué. Sans JavaScript, rien de tout ceci n'existe et la
     question est simplement posée à l'écran. */
  function noterOffre(nom) {
    var choix = document.getElementById('offre-' + nom);
    if (choix) { choix.checked = true; }
  }

  function allerAuFormulaire(focaliser) {
    var cible = document.getElementById('contact');
    if (cible && cible.scrollIntoView) { cible.scrollIntoView({ block: 'start' }); }
    if (focaliser) {
      var email = document.getElementById('email');
      if (email && email.focus) { email.focus({ preventScroll: true }); }
    }
  }

  /* --- boutons d'offre --------------------------------------------------- */
  var boutonsOffre = document.querySelectorAll('.js-offre');
  Array.prototype.forEach.call(boutonsOffre, function (bouton) {
    bouton.addEventListener('click', function () {
      envoyer(bouton.getAttribute('data-evt'));
      noterOffre(bouton.getAttribute('data-offre'));
      allerAuFormulaire(true);
    });
  });

  /* La porte du boîtier passe désormais par .js-offre ci-dessus : c'est une
     ancre vers le formulaire, elle mène quelque part sans JavaScript, et la
     marque d'intérêt est comptée par la case « Le boîtier » du formulaire,
     donc par un envoi réel, pas par un clic deviné. */

  /* --- bouton « démonstration » de l'accroche : coche la case ------------ */
  /* Le lien pointe sur la case elle-même (href="#demo") : le navigateur y
     amène le visiteur et le focus, avec ou sans JavaScript. Ici, on ne fait
     que la cocher d'avance : on ne déplace rien, la navigation native suffit
     et les deux chemins arrivent au même endroit. L'événement, lui, est
     compté à l'ENVOI, quand la demande existe vraiment. */
  var boutonDemo = document.getElementById('js-demo');
  if (boutonDemo) {
    boutonDemo.addEventListener('click', function () {
      var caseDemo = document.getElementById('demo');
      if (caseDemo) { caseDemo.checked = true; }
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
     BOUTON DE THEME : un seul, rotatif — automatique · clair · sombre
     ══════════════════════════════════════════════════════════════════════
     Construit ICI, et non ecrit dans le HTML : sans JavaScript, un bouton
     inerte serait pire que pas de bouton, et le mode automatique — qui suit
     deja le reglage du systeme par prefers-color-scheme — est exactement ce
     qu'il faut servir dans ce cas.

     UN bouton et non trois : a trois, l'en-tete passait a deux lignes sur
     telephone et repoussait l'appel a l'action sous la marque. Un seul tient
     dans 34 px, montre l'etat courant, et se contente d'exister.

     Le <head> pose l'attribut avant le premier rendu ; ici on ne fait que
     construire le bouton et le tenir a jour. Le choix est garde dans
     localStorage : c'est une preference d'affichage demandee par le visiteur,
     exemptee de consentement par l'article 82 de la loi Informatique et
     Libertes, et elle est nommee dans les mentions legales.        */

  var CLE_THEME = 'dictadroit-theme';
  var CYCLE = ['auto', 'clair', 'sombre'];

  var ICONES = {
    clair:
      '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4' +
      'M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    sombre:
      '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
    auto:
      '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 0 0 17z" ' +
      'fill="currentColor" stroke="none"/>'
  };
  var NOMS = { auto: 'automatique', clair: 'clair', sombre: 'sombre' };

  function themeActif() {
    try {
      var t = localStorage.getItem(CLE_THEME);
      return (t === 'clair' || t === 'sombre') ? t : 'auto';
    } catch (e) { return 'auto'; }
  }

  function appliquer(choix) {
    if (choix === 'auto') {
      delete document.documentElement.dataset.theme;
      try { localStorage.removeItem(CLE_THEME); } catch (e) {}
    } else {
      document.documentElement.dataset.theme = choix;
      try { localStorage.setItem(CLE_THEME, choix); } catch (e) {}
    }
  }

  function construireBoutonTheme() {
    var hote = document.querySelector('.entete-rang');
    if (!hote) { return; }

    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'theme-bouton';

    /* Le changement d'etat doit s'ENTENDRE : le nom accessible du bouton suffit
       rarement a etre reannonce apres un clic, d'ou la region discrete. */
    var dit = document.createElement('span');
    dit.className = 'hors-ecran';
    dit.setAttribute('aria-live', 'polite');

    function peindre(choix) {
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" ' +
        'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" ' +
        'stroke-linejoin="round">' + ICONES[choix] + '</svg>';
      var suivant = CYCLE[(CYCLE.indexOf(choix) + 1) % CYCLE.length];
      b.setAttribute('aria-label', 'Thème ' + NOMS[choix] + '. Passer au thème ' + NOMS[suivant] + '.');
      b.setAttribute('title', 'Thème ' + NOMS[choix]);
    }

    peindre(themeActif());

    b.addEventListener('click', function () {
      var suivant = CYCLE[(CYCLE.indexOf(themeActif()) + 1) % CYCLE.length];
      appliquer(suivant);
      peindre(suivant);
      dit.textContent = 'Thème ' + NOMS[suivant];
    });

    var nav = hote.querySelector('.entete-nav');
    if (nav) { hote.insertBefore(b, nav); } else { hote.appendChild(b); }
    hote.appendChild(dit);
  }

  construireBoutonTheme();

}());
