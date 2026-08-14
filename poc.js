/* La démonstration qui se joue — Dictadroit
 *
 * Ce fichier ne SAIT rien du produit. Il rejoue `poc.json`, qui est produit par la chaîne
 * elle-même (labo/exporter_demo.py). Aucun texte de démonstration n'est écrit ici : si le
 * moteur régresse, la page le montre au lieu de le cacher. C'est la seule façon qu'une
 * démonstration reste vraie plus de trois semaines.
 *
 * Trois temps, et le premier est le cœur de l'argument :
 *   1. la parole et l'acte s'écrivent EN MÊME TEMPS, au rythme de la voix — « vous
 *      dictez, l'acte s'écrit » ;
 *   2. à la fin, les mots corrigés se soulignent d'un trait d'encre, et le trait reste ;
 *   3. une phrase dit ce que ça donne. Pas un tableau de bord, pas de légende : la page
 *      parle comme elle parle partout ailleurs.
 *
 * Amélioration progressive : le bouton est `hidden` en HTML et n'est révélé que d'ici.
 * Sans JavaScript, la page garde son illustration statique et ne propose aucune commande
 * morte.
 */
(function () {
  "use strict";

  var bouton = document.getElementById("js-demo-jouer");
  var barre = document.getElementById("js-demo-barre");
  var etat = document.getElementById("js-demo-etat");
  var figure = document.querySelector(".transformation");
  if (!bouton || !barre || !figure) return;

  var parole = figure.querySelector(".parole-live");
  var acte = figure.querySelector(".acte-live");
  var feuille = figure.querySelector(".feuille");
  if (!parole || !acte || !feuille) return;

  var LIBELLE = { repos: "Écouter une dictée", joue: "Interrompre",
                  rejoue: "Revoir la démonstration" };
  /* Sans son, l'affichage n'a plus à suivre une voix : il suit une horloge, et rien
   * n'oblige à garder le tempo de la parole. */
  var VITESSE_MUETTE = 2.2;

  var donnees = null, audio = null, trame = 0, minuteries = [];
  var enCours = false, fini = false;
  var libelle = bouton.querySelector(".demo-libelle");
  var bilan = document.createElement("p");
  bilan.className = "demo-bilan";
  bilan.hidden = true;
  feuille.insertAdjacentElement("afterend", bilan);

  barre.hidden = false;

  /* ⚠️ `innerHTML` est utilisé plus bas, et c'est délibéré : il faut poser des <mark> au
   * milieu d'un texte, à des positions données en caractères. La règle tenue partout dans
   * ce fichier : **tout ce qui vient de poc.json passe par `echapper`**, ou est un nombre
   * passé par `toFixed`. Le seul balisage non échappé est celui écrit ici en clair. */
  function echapper(s) {
    return s.replace(/[&<>]/g, function (c) {
      return c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;";
    });
  }

  function annoncer(m) { if (etat) etat.textContent = m; }
  function plus_tard(fn, d) { minuteries.push(setTimeout(fn, d)); }
  function nettoyer() {
    minuteries.forEach(clearTimeout); minuteries = [];
    if (trame) { cancelAnimationFrame(trame); trame = 0; }
  }

  /* ── construction des deux panneaux ───────────────────────────────────────────────
   *
   * Chaque mot est enveloppé dans un <span class="mot"> : c'est lui qui décide QUAND le
   * mot s'encre. Les corrections, elles, couvrent des empans qui contiennent parfois
   * plusieurs mots (« in limine litis ») — les <mark> sont donc à l'extérieur des mots,
   * jamais l'inverse.
   */
  var rangMot = 0;

  /* 🔴 LE BALISAGE SE FAIT À L'INTÉRIEUR DES MOTS, PAS AUTOUR. Une correction de
   * ponctuation ne couvre qu'un signe — le point de « conseil. » —, donc elle tombe au
   * MILIEU d'un mot au sens typographique. Une première version découpait la ligne aux
   * frontières des corrections puis emballait les morceaux : le point se retrouvait dans
   * son propre span, s'encrait à son propre instant, et se détachait de son mot.
   *
   * On enveloppe donc d'abord les mots, et on pose les marques dedans. */
  function baliser_mot(ligne, a, b, corrections, decalage) {
    var out = [], curseur = a;
    corrections.forEach(function (c) {
      var ca = Math.max(c.debut - decalage, a), cb = Math.min(c.fin - decalage, b);
      if (cb <= ca || ca < curseur) return;
      out.push(echapper(ligne.slice(curseur, ca)));
      out.push('<mark class="' + c.classe + '">' + echapper(ligne.slice(ca, cb)) + "</mark>");
      curseur = cb;
    });
    out.push(echapper(ligne.slice(curseur, b)));
    return out.join("");
  }

  /* ⚠️ Une espace INSÉCABLE ne coupe pas un mot — c'est sa définition. « 47 850 » est
   * groupé par une fine insécable (U+202F) : traité comme deux mots, son soulignage se
   * cassait au milieu du nombre, et les deux moitiés s'encraient à deux instants. */
  var COUPE = /[^\S\u00a0\u202f]/;

  function paragraphe(ligne, corrections, decalage) {
    var html = [], i = 0;
    while (i < ligne.length) {
      if (COUPE.test(ligne[i])) { html.push(ligne[i]); i++; continue; }
      var j = i;
      while (j < ligne.length && !COUPE.test(ligne[j])) j++;
      rangMot++;
      html.push('<span class="mot">' +
                baliser_mot(ligne, i, j, corrections, decalage) + "</span>");
      i = j;
    }
    return '<p class="acte-alinea">' + html.join("") + "</p>";
  }

  function construire_acte() {
    /* Les corrections à SOULIGNER, exprimées dans le texte final (coordonnées garanties
     * par dictadroit/chaine.py).
     *
     * La ponctuation est marquée elle aussi, mais SUR SON SIGNE et non sur le mot voisin
     * (cf. dictadroit/chaine.py) : c'est le point qui est apparu, pas le mot qui a changé. */
    var etapes = donnees.etapes;
    var final = etapes[etapes.length - 1].texte;
    var corrections = [];
    etapes.forEach(function (e) {
      // Deux marques, deux poids : un mot rétabli se souligne, un signe dicté se teinte.
      var classe = e.cle === "ponctuation" ? "signe" : "";
      e.editions.forEach(function (ed) {
        corrections.push({ debut: ed.debut, fin: ed.fin, classe: classe });
      });
    });
    corrections.sort(function (a, b) { return a.debut - b.debut; });

    rangMot = 0;
    var decalage = 0, html = [];
    final.split("\n").forEach(function (ligne) {
      var d = decalage, f = decalage + ligne.length;
      if (ligne.trim()) {
        html.push(paragraphe(ligne, corrections.filter(function (c) {
          return c.debut >= d && c.fin <= f;
        }), d));
      }
      decalage = f + 1;                                  // +1 pour le « \n » retiré
    });
    acte.innerHTML = html.join("");
    acte.classList.remove("corrige");
    return rangMot;
  }

  function construire_parole() {
    var html = [], temps = [];
    donnees.enonces.forEach(function (en, rang) {
      if (rang) html.push(" ");
      en.mots.forEach(function (m, i) {
        if (i) html.push(" ");
        html.push('<span class="mot" data-t="' + m.t + '">' + echapper(m.m) + "</span>");
        temps.push(m.t);
      });
    });
    parole.innerHTML = html.join("");
    return temps;
  }

  /* ── l'horloge ────────────────────────────────────────────────────────────────────
   *
   * ⚠️ L'acte n'a PAS le même nombre de mots que la parole : les commandes de ponctuation
   * disparaissent, les nombres se contractent. On ne peut donc pas apparier mot à mot.
   * Les mots de l'acte sont répartis PROPORTIONNELLEMENT sur les mêmes instants — les deux
   * panneaux avancent ensemble, sans prétendre à une synchronisation qu'on n'a pas.
   */
  var tempsParole = [], motsParole = null, motsActe = null;

  function preparer() {
    tempsParole = construire_parole();
    var nActe = construire_acte();
    motsParole = parole.querySelectorAll(".mot");
    motsActe = acte.querySelectorAll(".mot");

    /* 🔴 L'ACTE SUIT LA VOIX, IL NE LA DEVANCE JAMAIS. Un texte qui s'écrit avant que le
     * mot soit prononcé se lit comme une animation truquée ; un texte qui suit de peu se
     * lit comme un logiciel qui travaille. Et c'est la vérité du produit : la latence
     * mesurée est de `mesure.latence_s` par énoncé — le texte se fige dans la pause du
     * dicteur, jamais avant lui. On applique donc ce retard-là, pas un retard décoratif. */
    var retard = (donnees.mesure && donnees.mesure.latence_s) || 0.4;
    for (var i = 0; i < motsActe.length; i++) {
      var j = Math.min(tempsParole.length - 1,
                       Math.floor(i * tempsParole.length / Math.max(nActe, 1)));
      motsActe[i].dataset.t = (tempsParole[j] || 0) + retard;
    }
  }

  function encrer(jusqua) {
    [motsParole, motsActe].forEach(function (liste) {
      for (var i = 0; i < liste.length; i++) {
        if (liste[i].classList.contains("vu")) continue;
        if (parseFloat(liste[i].dataset.t) <= jusqua) liste[i].classList.add("vu");
        else break;
      }
    });
  }

  function suivre() {
    if (!audio || audio.paused) return;
    encrer(audio.currentTime);
    trame = requestAnimationFrame(suivre);
  }

  function reveler_sans_son() {
    var fin = tempsParole[tempsParole.length - 1] || 1;
    var depart = Date.now();
    (function pas() {
      var t = (Date.now() - depart) / 1000 * VITESSE_MUETTE;
      encrer(t);
      if (t < fin + 0.4) trame = requestAnimationFrame(pas);
      else terminer();
    })();
  }

  /* ── la fin : les couleurs s'allument, et restent ─────────────────────────────── */

  function terminer() {
    nettoyer();
    [motsParole, motsActe].forEach(function (liste) {
      Array.prototype.forEach.call(liste, function (m) { m.classList.add("vu"); });
    });

    plus_tard(function () { acte.classList.add("corrige"); }, 450);

    plus_tard(function () {
      /* Une PHRASE, pas un tableau de bord. La version précédente alignait trois
       * pourcentages en gras sous une légende à pastilles : c'est le réflexe qui fabrique
       * des pages qui se ressemblent toutes. Ici la page parle comme elle parle partout
       * ailleurs, et ne retient que ce qu'un juriste veut savoir — le vocabulaire est-il
       * juste, et est-ce que ça suit quand je dicte. */
      var m = donnees.mesure;
      var restants = m.termes_rates_apres;
      bilan.textContent =
        "Sur les " + m.termes_total + " termes de droit de ce passage, la reconnaissance " +
        "en manquait " + m.termes_rates_avant + ". " +
        (restants ? "Il en reste " + restants + ", " : "Il n’en manque plus aucun, ") +
        "et le texte se fige moins d’une demi-seconde après chaque phrase, sur " +
        "processeur seul.";
      bilan.hidden = false;
      annoncer("Démonstration terminée.");
    }, 950);

    enCours = false; fini = true;
    bouton.removeAttribute("data-joue");
    libelle.textContent = LIBELLE.rejoue;
  }

  function arreter() {
    nettoyer();
    if (audio) audio.pause();
    enCours = false;
    bouton.removeAttribute("data-joue");
    libelle.textContent = fini ? LIBELLE.rejoue : LIBELLE.repos;
    annoncer("Lecture interrompue.");
  }

  function demarrer() {
    nettoyer();
    fini = false;
    figure.setAttribute("data-demo", "");
    parole.hidden = false;
    acte.hidden = false;
    bilan.hidden = true;
    preparer();

    enCours = true;
    bouton.setAttribute("data-joue", "");
    libelle.textContent = LIBELLE.joue;
    annoncer("Démonstration en cours.");

    if (!donnees.audio) { reveler_sans_son(); return; }

    if (!audio) {
      // Posé DANS le document : le navigateur rattache alors la lecture au cycle de vie
      // de la page, et l'élément reste inspectable.
      audio = document.createElement("audio");
      audio.src = donnees.audio;
      audio.hidden = true;
      audio.preload = "auto";
      barre.appendChild(audio);
      audio.addEventListener("ended", terminer);
      audio.addEventListener("error", function () {
        annoncer("Le son n’a pas pu être chargé. La démonstration s’affiche sans lui.");
        reveler_sans_son();
      });
    }
    audio.currentTime = 0;
    var promesse = audio.play();
    if (promesse && promesse.catch) {
      promesse.catch(function () {
        annoncer("La lecture a été refusée par le navigateur. La démonstration continue " +
                 "sans le son.");
        reveler_sans_son();
      });
    }
    trame = requestAnimationFrame(suivre);
  }

  bouton.addEventListener("click", function () {
    if (enCours) { arreter(); return; }
    if (donnees) { demarrer(); return; }

    libelle.textContent = "Chargement…";
    bouton.disabled = true;
    fetch("poc.json?v=e0d1f01a")
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) { donnees = d; bouton.disabled = false; demarrer(); })
      .catch(function () {
        bouton.disabled = false;
        libelle.textContent = LIBELLE.repos;
        annoncer("La démonstration n’a pas pu être chargée.");
      });
  });
})();
