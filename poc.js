/* La démonstration qui se joue — Dictadroit
 *
 * Ce fichier ne SAIT rien du produit. Il rejoue `poc.json`, qui est produit par la chaîne
 * elle-même (labo/exporter_demo.py). Aucun texte de démonstration n'est écrit ici : si le
 * moteur régresse, la page le montre au lieu de le cacher. C'est la seule façon qu'une
 * démonstration reste vraie plus de trois semaines.
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

  // Le navigateur sait-il lire ce fichier ? Si non, on ne propose rien : un bouton qui
  // échoue coûte plus cher en confiance qu'un bouton absent.
  var sonde = document.createElement("audio");
  if (!sonde.canPlayType || !sonde.canPlayType("audio/mpeg")) return;

  var LIBELLE = { repos: "Écouter une dictée réelle", joue: "Interrompre",
                  rejoue: "Revoir la démonstration" };
  var DELAI_PASSE = 2300;        // ms entre deux passes de correction
  var doux = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var donnees = null, audio = null, trame = 0, minuteries = [], enCours = false, fini = false;
  var libelle = bouton.querySelector(".demo-libelle");
  var passe = document.createElement("p");
  passe.className = "demo-passe";
  var bilan = document.createElement("p");
  bilan.className = "demo-bilan";
  bilan.hidden = true;
  feuille.insertAdjacentElement("afterend", passe);
  passe.insertAdjacentElement("afterend", bilan);

  barre.hidden = false;

  /* ⚠️ `innerHTML` est utilisé plus bas, et c'est délibéré : il faut poser des <mark> au
   * milieu d'un texte, à des positions données en caractères. La règle tenue partout dans
   * ce fichier : **tout ce qui vient de poc.json passe par `echapper`**, ou est un nombre
   * passé par `toFixed`. Le seul balisage non échappé est celui écrit ici en clair. Les
   * intitulés d'étape, eux, passent par `textContent`. */
  function echapper(s) {
    return s.replace(/[&<>]/g, function (c) {
      return c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;";
    });
  }

  /* Le texte d'une étape, avec ses corrections entourées de <mark>.
   * Les bornes viennent de la chaîne et sont exprimées en caractères DE CETTE étape —
   * elles sont donc posées telles quelles, sans recherche ni devinette. */
  function baliser_ligne(ligne, editions, decalage) {
    var bouts = [], curseur = 0;
    editions.forEach(function (e) {
      var a = e.debut - decalage, b = e.fin - decalage;
      if (a < curseur || b > ligne.length) return;             // chevauchement : on saute
      bouts.push(echapper(ligne.slice(curseur, a)));
      bouts.push("<mark>" + echapper(ligne.slice(a, b)) + "</mark>");
      curseur = b;
    });
    bouts.push(echapper(ligne.slice(curseur)));
    return bouts.join("");
  }

  /* Le texte d'une étape rendu en ALINÉAS, et pas en bloc continu.
   * L'acte de la page est composé en alinéas justifiés et indentés : une démonstration
   * qui rendrait le même texte d'un seul tenant montrerait un autre objet que celui que
   * la page promet. Les bornes des corrections sont exprimées sur le texte entier, elles
   * sont donc reportées dans l'alinéa qui les contient, décalage compris. */
  function baliser(texte, editions) {
    var tri = (editions || []).slice().sort(function (a, b) { return a.debut - b.debut; });
    var lignes = texte.split("\n");
    var decalage = 0, html = [];
    lignes.forEach(function (ligne) {
      var debut = decalage, fin = decalage + ligne.length;
      if (ligne.trim()) {
        var miennes = tri.filter(function (e) { return e.debut >= debut && e.fin <= fin; });
        html.push('<p class="acte-alinea">' +
                  baliser_ligne(ligne, miennes, debut) + "</p>");
      }
      decalage = fin + 1;                                      // +1 pour le « \n » retiré
    });
    return html.join("");
  }

  function annoncer(message) { if (etat) etat.textContent = message; }

  function nettoyer() {
    minuteries.forEach(clearTimeout);
    minuteries = [];
    if (trame) { cancelAnimationFrame(trame); trame = 0; }
  }

  function plus_tard(fn, delai) { minuteries.push(setTimeout(fn, delai)); }

  /* ── phase 1 : les mots arrivent au rythme de la voix ──────────────────────────── */

  function preparer_parole() {
    var html = [];
    donnees.enonces.forEach(function (en, rang) {
      if (rang) html.push(" ");
      en.mots.forEach(function (m, i) {
        if (i) html.push(" ");
        html.push('<span class="mot' + (doux ? " vu" : "") +
                  '" data-t="' + m.t + '">' + echapper(m.m) + "</span>");
      });
    });
    parole.innerHTML = html.join("");
  }

  function suivre() {
    if (!audio || audio.paused) return;
    var t = audio.currentTime;
    var mots = parole.querySelectorAll(".mot:not(.vu)");
    for (var i = 0; i < mots.length; i++) {
      if (parseFloat(mots[i].dataset.t) <= t) mots[i].classList.add("vu");
      else break;
    }
    trame = requestAnimationFrame(suivre);
  }

  /* ── phase 2 : les couches de correction ───────────────────────────────────────── */

  function corriger() {
    var etapes = donnees.etapes;
    // L'acte part de ce que la machine a entendu : c'est le même texte que le panneau du
    // dessus, et c'est ce qui rend les corrections lisibles — on voit d'où elles partent.
    acte.innerHTML = baliser(etapes[0].texte, []);
    passe.textContent = "";
    passe.classList.remove("vu");

    etapes.slice(1).forEach(function (etape, rang) {
      plus_tard(function () {
        acte.innerHTML = baliser(etape.texte, etape.editions);
        passe.textContent = etape.titre + (etape.editions.length
          ? "  ·  " + etape.editions.length +
            (etape.editions.length > 1 ? " corrections" : " correction")
          : "");
        passe.classList.add("vu");
        annoncer(etape.titre);
      }, DELAI_PASSE * rang + 500);
    });

    plus_tard(function () {
      var m = donnees.mesure;
      acte.innerHTML = baliser(etapes[etapes.length - 1].texte, []);
      passe.classList.remove("vu");
      // Décimales à la française : la virgule. Un « 4.5 % » sur une page destinée à des
      // juristes français signale une page traduite, ou pas relue.
      var fr = function (x, n) { return x.toFixed(n).replace(".", ","); };
      bilan.innerHTML =
        "Taux d’erreur sur les mots&#8239;: <b>" + fr(m.wer_avant, 1) +
        "&#8239;%</b> à la sortie du moteur, <b>" + fr(m.wer_apres, 1) +
        "&#8239;%</b> après les trois passes. Sur le vocabulaire juridique, <b>" +
        fr(m.tej_avant, 0) + "&#8239;%</b> puis <b>" + fr(m.tej_apres, 0) +
        "&#8239;%</b>. Le texte se fige <b>" + fr(m.latence_s, 2) +
        "&#8239;s</b> après chaque phrase, sur processeur seul, avec le dictionnaire " +
        "livré et aucun mot ajouté par un cabinet.";
      bilan.hidden = false;
      terminer();
    }, DELAI_PASSE * (etapes.length - 1) + 900);
  }

  /* ── conduite ─────────────────────────────────────────────────────────────────── */

  function terminer() {
    enCours = false; fini = true;
    bouton.removeAttribute("data-joue");
    libelle.textContent = LIBELLE.rejoue;
    annoncer("Démonstration terminée.");
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
    passe.textContent = "";
    passe.classList.remove("vu");
    acte.innerHTML = "";
    preparer_parole();

    if (!audio) {
      // Posé DANS le document, et pas construit à la volée : le navigateur rattache alors
      // la lecture au cycle de vie de la page (arrêt à la navigation, gestion média du
      // système), et l'élément reste inspectable.
      audio = document.createElement("audio");
      audio.src = donnees.audio;
      audio.hidden = true;
      audio.preload = "auto";
      barre.appendChild(audio);
      audio.addEventListener("ended", function () {
        enCours = false;
        bouton.removeAttribute("data-joue");
        libelle.textContent = LIBELLE.rejoue;
        corriger();
      });
      audio.addEventListener("error", function () {
        // Le son ne vient pas : on montre quand même le travail, en texte.
        annoncer("Le son n’a pas pu être chargé. La démonstration s’affiche sans lui.");
        parole.querySelectorAll(".mot").forEach(function (m) { m.classList.add("vu"); });
        corriger();
      });
    }
    audio.currentTime = 0;

    var promesse = audio.play();
    if (promesse && promesse.catch) {
      promesse.catch(function () {
        annoncer("La lecture automatique a été refusée. La démonstration s’affiche sans son.");
        parole.querySelectorAll(".mot").forEach(function (m) { m.classList.add("vu"); });
        corriger();
      });
    }
    enCours = true;
    bouton.setAttribute("data-joue", "");
    libelle.textContent = LIBELLE.joue;
    annoncer("Lecture de la dictée.");
    if (!doux) trame = requestAnimationFrame(suivre);
  }

  bouton.addEventListener("click", function () {
    if (enCours) { arreter(); return; }
    if (donnees) { demarrer(); return; }

    libelle.textContent = "Chargement…";
    bouton.disabled = true;
    fetch("poc.json?v=9d9b1c19")
      .then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      })
      .then(function (d) {
        donnees = d;
        bouton.disabled = false;
        demarrer();
      })
      .catch(function () {
        bouton.disabled = false;
        libelle.textContent = LIBELLE.repos;
        annoncer("La démonstration n’a pas pu être chargée.");
      });
  });
})();
