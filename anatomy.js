/* =======================================================================
   MYOFORGE — Atlas musculaire 3D
   Moteur de scène : corps sculpté procéduralement, sélection des muscles,
   caméra orbitale, interface.

   Repère anatomique : Y vers le haut, +Z vers l'avant (face du modèle).
   1 unité ≈ 10 cm. Sol à y = 0, sommet du crâne à y ≈ 17.6.
   ======================================================================= */
(function () {
  'use strict';

  var THREE = window.THREE;

  /* ====================== ÉCRAN DE CHARGEMENT ====================== */
  var el = function (id) { return document.getElementById(id); };
  var loader = el('loader');
  var loaderPct = el('loader-pct');
  var loaderStep = el('loader-step');
  var ringFg = document.querySelector('.ring-fg');

  function setProgress(p, label) {
    loaderPct.textContent = Math.round(p);
    ringFg.style.strokeDashoffset = String(264 - 264 * (p / 100));
    if (label) loaderStep.textContent = label;
  }

  if (!THREE || !(function () {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) { return false; }
  })()) {
    loader.classList.add('done');
    el('hero').classList.add('gone');
    el('webgl-error').classList.add('show');
    return;
  }

  /* ====================== REPÈRES ANATOMIQUES ====================== */
  var A = {
    cheville: 1.00,
    genou: 4.95,
    hanche: 9.00,
    taille: 11.10,   // le point le plus étroit
    poitrine: 13.40,
    epaule: 14.10,
    nuque: 15.25,
    menton: 16.15,
    tete: 17.05
  };
  var EPAULE_X = 1.58;   // articulation gléno-humérale (et non le bord du deltoïde)
  var HANCHE_X = 0.95;   // tête fémorale
  var BRAS_L = 3.55;     // humérus
  var AVBRAS_L = 3.35;   // radius / ulna
  var CUISSE_L = 4.05;   // fémur
  var JAMBE_L = 3.95;    // tibia

  /* ====================== OUTILS GÉOMÉTRIQUES ====================== */
  var UP = new THREE.Vector3(0, 1, 0);
  var _q = new THREE.Quaternion();
  var _v = new THREE.Vector3();

  function num(v, t, d) {
    if (typeof v === 'function') return v(t);
    return v === undefined ? d : v;
  }

  /**
   * Fuseau de révolution le long de +Y, de y=0 à y=len.
   * Le rayon (et le décalage latéral) varient le long de l'axe : c'est ce qui
   * donne aux muscles leur ventre renflé et leurs extrémités tendineuses.
   */
  function spindleGeom(o) {
    var len = o.len;
    var L = o.seg || 20;          // segments longitudinaux
    var R = o.rad || 22;          // segments radiaux
    var n = o.square || 1;        // < 1 = section plus carrée
    var pos = [], idx = [];

    for (var i = 0; i <= L; i++) {
      var t = i / L;
      var rx = num(o.rx, t, 1);
      var rz = num(o.rz, t, rx);
      var ox = num(o.ox, t, 0);
      var oz = num(o.oz, t, 0);
      for (var j = 0; j <= R; j++) {
        var a = j / R * Math.PI * 2;
        var ca = Math.cos(a), sa = Math.sin(a);
        if (n !== 1) {
          ca = Math.sign(ca) * Math.pow(Math.abs(ca), n);
          sa = Math.sign(sa) * Math.pow(Math.abs(sa), n);
        }
        pos.push(ox + ca * rx, t * len, oz + sa * rz);
      }
    }
    for (var ii = 0; ii < L; ii++) {
      for (var jj = 0; jj < R; jj++) {
        var v0 = ii * (R + 1) + jj, v1 = v0 + 1;
        var v2 = v0 + (R + 1), v3 = v2 + 1;
        idx.push(v0, v2, v1, v1, v2, v3);
      }
    }
    // opercules
    var cb = pos.length / 3;
    pos.push(num(o.ox, 0, 0), 0, num(o.oz, 0, 0));
    for (var b = 0; b < R; b++) idx.push(cb, b + 1, b);
    var ct = pos.length / 3;
    pos.push(num(o.ox, 1, 0), len, num(o.oz, 1, 0));
    var top = L * (R + 1);
    for (var tt = 0; tt < R; tt++) idx.push(ct, top + tt, top + tt + 1);

    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /* Interpolation Catmull-Rom sur un scalaire */
  function crm(p0, p1, p2, p3, t) {
    var t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }

  /**
   * Tronc : empilement de sections elliptiques lissées en Catmull-Rom.
   * sections = [{ y, rx, rz, oz }]
   */
  function trunkGeom(sections, o) {
    o = o || {};
    var steps = o.steps || 64, R = o.rad || 34, n = o.square || 0.82;
    var pos = [], idx = [];
    var last = sections.length - 1;

    for (var i = 0; i <= steps; i++) {
      var u = i / steps * last;
      var k = Math.min(Math.floor(u), last - 1);
      var f = u - k;
      var p0 = sections[Math.max(0, k - 1)], p1 = sections[k];
      var p2 = sections[Math.min(last, k + 1)], p3 = sections[Math.min(last, k + 2)];
      var y = crm(p0.y, p1.y, p2.y, p3.y, f);
      var rx = crm(p0.rx, p1.rx, p2.rx, p3.rx, f);
      var rz = crm(p0.rz, p1.rz, p2.rz, p3.rz, f);
      var oz = crm(p0.oz || 0, p1.oz || 0, p2.oz || 0, p3.oz || 0, f);
      for (var j = 0; j <= R; j++) {
        var a = j / R * Math.PI * 2;
        var ca = Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), n);
        var sa = Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), n);
        pos.push(ca * rx, y, oz + sa * rz);
      }
    }
    for (var ii = 0; ii < steps; ii++) {
      for (var jj = 0; jj < R; jj++) {
        var v0 = ii * (R + 1) + jj, v1 = v0 + 1, v2 = v0 + (R + 1), v3 = v2 + 1;
        idx.push(v0, v2, v1, v1, v2, v3);
      }
    }
    var cb = pos.length / 3;
    pos.push(0, sections[0].y, sections[0].oz || 0);
    for (var b = 0; b < R; b++) idx.push(cb, b + 1, b);
    var ct = pos.length / 3;
    pos.push(0, sections[last].y, sections[last].oz || 0);
    var topRow = steps * (R + 1);
    for (var tt = 0; tt < R; tt++) idx.push(ct, topRow + tt, topRow + tt + 1);

    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /* Oriente un fuseau (construit le long de +Y) de a vers b */
  function orient(mesh, a, b) {
    _v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    mesh.quaternion.setFromUnitVectors(UP, _v);
    mesh.position.set(a[0], a[1], a[2]);
    return mesh;
  }
  function dist3(a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /* Profil de ventre musculaire : fin aux tendons, renflé au milieu */
  function belly(rmax, peak, endMin) {
    peak = peak === undefined ? 0.5 : peak;
    endMin = endMin === undefined ? 0.34 : endMin;
    return function (t) {
      var u = t < peak ? (t / peak) * 0.5 : 0.5 + (t - peak) / (1 - peak) * 0.5;
      var s = Math.sin(Math.PI * u);
      return rmax * (endMin + (1 - endMin) * Math.pow(s, 0.72));
    };
  }

  var sphereGeo = new THREE.SphereGeometry(1, 26, 20);

  function blob(mat, x, y, z, sx, sy, sz) {
    var m = new THREE.Mesh(sphereGeo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz);
    return m;
  }

  /* ====================== MATÉRIAUX ====================== */
  var COL_BASE = new THREE.Color('#9aa6b6');   // tissu profond
  var COL_MUSC = new THREE.Color('#b0bbca');   // muscle au repos
  var COL_DIM = new THREE.Color('#2b313b');    // muscle estompé
  var COL_HOT = new THREE.Color('#ffffff');    // muscle actif

  /**
   * Injecte un liseré de Fresnel dans le terme émissif : les bords tournés
   * vers l'extérieur s'illuminent, ce qui donne l'aspect « scan holographique »
   * plutôt qu'un plastique mat.
   */
  function holo(mat, rim, power, strength) {
    var c = new THREE.Color(rim);
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.uRimC = { value: c };
      sh.uniforms.uRimP = { value: power };
      sh.uniforms.uRimS = { value: strength };
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>',
          '#include <common>\nuniform vec3 uRimC;\nuniform float uRimP;\nuniform float uRimS;')
        .replace('#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n\tfloat _fr = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), uRimP);\n\ttotalEmissiveRadiance += uRimC * _fr * uRimS;');
    };
    mat.customProgramCacheKey = function () { return 'holo_' + rim + '_' + power + '_' + strength; };
    return mat;
  }

  var baseMat = holo(new THREE.MeshStandardMaterial({
    color: COL_BASE.clone(), roughness: 0.46, metalness: 0.2,
    emissive: new THREE.Color('#0d1a26'), emissiveIntensity: 0.5
  }), '#9fd8ff', 2.7, 0.42);
  baseMat.userData.rest = COL_BASE.clone();

  /* tendons, aponévroses et saillies articulaires : légèrement plus clairs */
  var boneMat = holo(new THREE.MeshStandardMaterial({
    color: new THREE.Color('#bcc6d3'), roughness: 0.44, metalness: 0.18,
    emissive: new THREE.Color('#16283a'), emissiveIntensity: 0.55
  }), '#cfeaff', 2.4, 0.5);

  /* Un matériau par groupe musculaire, partagé par les deux côtés.
     Au repos tout le corps reste monochrome : seule la surbrillance colore. */
  var muscleMat = {};
  var muscleState = {};
  MUSCLES.forEach(function (m) {
    var accent = new THREE.Color(m.color);
    var rest = COL_MUSC.clone();
    var mat = holo(new THREE.MeshStandardMaterial({
      color: rest.clone(), roughness: 0.38, metalness: 0.2,
      emissive: new THREE.Color('#8fd0ff'), emissiveIntensity: 0.06
    }), '#bfe8ff', 2.5, 0.55);
    mat.userData = { rest: rest, hot: COL_HOT.clone().lerp(accent, 0.18), accent: accent };
    muscleMat[m.id] = mat;
    muscleState[m.id] = { glow: 0.06, tint: 0, hover: false, sel: false, meshes: [], anchor: new THREE.Vector3() };
  });

  /* ====================== SCÈNE ====================== */
  var canvas = el('scene');

  /* Un téléphone n'a ni survol ni budget GPU d'ordinateur : on adapte le
     coût du rendu plutôt que d'imposer les mêmes réglages partout. */
  var isTouch = window.matchMedia('(pointer: coarse)').matches;
  var isSmall = window.matchMedia('(max-width: 900px)').matches;
  var light = isTouch || isSmall;

  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, light ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.shadowMap.enabled = !light;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  var scene = new THREE.Scene();
  scene.background = new THREE.Color('#07080b');
  scene.fog = new THREE.Fog('#07080b', 30, 76);

  var camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);

  setProgress(14, 'Génération du squelette…');

  /* ---------- lumières : éclairage de studio ---------- */
  scene.add(new THREE.AmbientLight('#4a5570', 0.42));
  var hemi = new THREE.HemisphereLight('#7d8ab0', '#0b0a0e', 0.5);
  scene.add(hemi);

  var key = new THREE.DirectionalLight('#fff4e8', 2.05);
  key.position.set(7, 19, 13);
  key.castShadow = !light;
  key.shadow.mapSize.set(light ? 1024 : 2048, light ? 1024 : 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 64;
  key.shadow.camera.left = -13;
  key.shadow.camera.right = 13;
  key.shadow.camera.top = 20;
  key.shadow.camera.bottom = -4;
  key.shadow.bias = -0.0012;
  key.shadow.normalBias = 0.03;
  scene.add(key);

  var fill = new THREE.DirectionalLight('#9dc0ff', 0.5);
  fill.position.set(-9, 8, 11);
  scene.add(fill);

  var rimL = new THREE.PointLight('#00d9ff', 190, 44, 2);
  rimL.position.set(-10.5, 13, -7.5);
  scene.add(rimL);

  var rimR = new THREE.PointLight('#ff2e63', 165, 44, 2);
  rimR.position.set(10.5, 11, -8);
  scene.add(rimR);

  var topSpot = new THREE.SpotLight('#ffffff', 330, 42, 0.78, 0.9, 2);
  topSpot.position.set(0, 29, 6);
  topSpot.target.position.set(0, 10, 0);
  scene.add(topSpot, topSpot.target);

  /* ---------- sol + socle holographique ---------- */
  var floor = new THREE.Mesh(
    new THREE.CircleGeometry(34, 80),
    new THREE.MeshStandardMaterial({ color: '#080a0d', roughness: 0.3, metalness: 0.85 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  /* anneaux concentriques : le « socle de scan » sur lequel le sujet se tient */
  var rings = [];
  [[2.85, 0.055, 0.5], [3.35, 0.02, 0.26], [4.25, 0.018, 0.15], [5.6, 0.014, 0.09]]
    .forEach(function (r, i) {
      var ring = new THREE.Mesh(
        new THREE.RingGeometry(r[0], r[0] + r[1] * 8, 96),
        new THREE.MeshBasicMaterial({
          color: '#d8f0ff', transparent: true, opacity: r[2],
          side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02 + i * 0.004;
      ring.userData.spin = (i % 2 ? -1 : 1) * (0.06 + i * 0.03);
      rings.push(ring);
      scene.add(ring);
    });

  /* halo diffus au sol */
  var podium = new THREE.Mesh(
    new THREE.CircleGeometry(6.5, 72),
    new THREE.MeshBasicMaterial({
      color: '#6fc8ff', transparent: true, opacity: 0.07,
      blending: THREE.AdditiveBlending, depthWrite: false
    })
  );
  podium.rotation.x = -Math.PI / 2;
  podium.position.y = 0.015;
  scene.add(podium);

  /* ligne de scan qui remonte le long du corps */
  var scan = new THREE.Mesh(
    new THREE.RingGeometry(0.1, 3.1, 72),
    new THREE.MeshBasicMaterial({
      color: '#eaf8ff', transparent: true, opacity: 0.14,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
    })
  );
  scan.rotation.x = -Math.PI / 2;
  scene.add(scan);

  /* ---------- poussière lumineuse ---------- */
  (function dust() {
    var n = light ? 170 : 420, p = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      var r = 6 + Math.random() * 20, a = Math.random() * Math.PI * 2;
      p[i * 3] = Math.cos(a) * r;
      p[i * 3 + 1] = Math.random() * 24;
      p[i * 3 + 2] = Math.sin(a) * r;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({
      color: '#a8dcff', size: 0.06, transparent: true, opacity: 0.4,
      sizeAttenuation: true, depthWrite: false
    })));
  })();

  /* ====================== CONSTRUCTION DU CORPS ====================== */
  setProgress(32, 'Sculpture des muscles…');

  var body = new THREE.Group();
  scene.add(body);
  var pickables = [];

  /* Enregistre un mesh comme partie interactive d'un groupe musculaire */
  function muscle(id, mesh, bulk) {
    mesh.material = muscleMat[id];
    mesh.userData.mid = id;
    mesh.userData.bulk = bulk === undefined ? 1 : bulk;
    mesh.userData.baseScale = mesh.scale.clone();
    mesh.castShadow = true;
    muscleState[id].meshes.push(mesh);
    pickables.push(mesh);
    return mesh;
  }
  function flesh(mesh) {
    mesh.material = mesh.material || baseMat;
    mesh.castShadow = true;
    return mesh;
  }

  /* ---------- TRONC ----------
     Sections elliptiques empilées : thorax large (rx 1.66), taille creusée
     à 1.18, bassin rouvert. rz ≈ 0.66·rx, la proportion d'une cage réelle. */
  var trunk = new THREE.Mesh(trunkGeom([
    { y: 8.05, rx: 1.26, rz: 0.92 },
    { y: 9.00, rx: 1.27, rz: 0.93 },
    { y: 9.90, rx: 1.10, rz: 0.85, oz: -0.02 },
    { y: 10.60, rx: 0.99, rz: 0.79 },
    { y: 11.10, rx: 0.97, rz: 0.78 },        // taille
    { y: 11.90, rx: 1.24, rz: 0.93, oz: 0.02 },
    { y: 12.70, rx: 1.50, rz: 1.05, oz: 0.03 },
    { y: 13.40, rx: 1.64, rz: 1.11 },        // poitrine
    { y: 14.05, rx: 1.52, rz: 1.03, oz: -0.04 },
    { y: 14.60, rx: 1.20, rz: 0.88, oz: -0.08 },
    { y: 15.20, rx: 0.88, rz: 0.74, oz: -0.08 }
  ], { square: 0.93 }), baseMat);
  flesh(trunk);
  body.add(trunk);

  /* bassin : referme le tronc entre les cuisses */
  body.add(flesh(blob(baseMat, 0, 8.60, -0.02, 1.17, 1.00, 0.90)));

  /* cou */
  var neck = flesh(new THREE.Mesh(spindleGeom({
    len: 1.62, rx: function (t) { return 0.58 - 0.10 * t; }, seg: 12
  }), baseMat));
  neck.position.set(0, 14.72, -0.07);
  body.add(neck);
  /* sterno-cléido-mastoïdiens : les deux cordes du cou */
  [-1, 1].forEach(function (s) {
    var scm = flesh(new THREE.Mesh(spindleGeom({
      len: 1.35, rx: belly(0.17, 0.5, 0.6), seg: 10
    }), baseMat));
    orient(scm, [s * 0.14, 15.00, 0.34], [s * 0.42, 16.30, -0.05]);
    body.add(scm);
  });

  body.add(flesh(blob(baseMat, 0, A.tete, 0.00, 0.82, 1.06, 0.94)));     // crâne
  body.add(flesh(blob(baseMat, 0, 16.30, 0.20, 0.58, 0.46, 0.50)));      // mâchoire
  body.add(flesh(blob(baseMat, 0, 17.26, 0.54, 0.58, 0.24, 0.34)));      // arcade sourcilière
  body.add(flesh(blob(baseMat, 0, 15.52, -0.44, 0.50, 0.38, 0.34)));     // nuque
  body.add(flesh(blob(baseMat, 0, 17.50, -0.14, 0.74, 0.66, 0.78)));     // occiput

  /* ---------- PECTORAUX ----------
     Deux dalles bombées qui affleurent la paroi thoracique : elles ne
     dépassent que de 0.05 unité, le pectoral fait partie du volume du torse
     et non d'une boule posée dessus. */
  [-1, 1].forEach(function (s) {
    var pec = blob(null, s * 0.72, 13.20, 0.68, 1.00, 0.70, 0.46);
    pec.rotation.z = -s * 0.20;
    pec.rotation.y = -s * 0.14;
    muscle('pectoraux', pec, 0.95);
    body.add(pec);
    var clav = blob(null, s * 0.60, 13.86, 0.64, 0.82, 0.30, 0.38);   // faisceau claviculaire
    clav.rotation.z = -s * 0.46;
    muscle('pectoraux', clav, 0.85);
    body.add(clav);
  });

  /* ---------- CLAVICULES ---------- */
  [-1, 1].forEach(function (s) {
    var cl = flesh(new THREE.Mesh(spindleGeom({
      len: 1.28, rx: belly(0.115, 0.5, 0.72), seg: 8
    }), boneMat));
    orient(cl, [s * 0.10, 14.34, 0.46], [s * 1.32, 14.22, 0.10]);
    body.add(cl);
  });

  /* ---------- ABDOMINAUX : quatre rangées + arcade basse ---------- */
  [12.28, 11.72, 11.16, 10.60].forEach(function (y, row) {
    [-1, 1].forEach(function (s) {
      var ab = blob(null, s * 0.30, y, 0.76 - row * 0.014,
                    0.32 - row * 0.012, 0.25, 0.20);
      muscle('abdominaux', ab, 0.7);
      body.add(ab);
    });
  });
  [-1, 1].forEach(function (s) {
    var lo = blob(null, s * 0.27, 10.06, 0.72, 0.27, 0.25, 0.19);
    muscle('abdominaux', lo, 0.65);
    body.add(lo);
  });

  /* ---------- OBLIQUES + DENTELÉ ANTÉRIEUR ----------
     Les digitations du dentelé, en escalier sous le pectoral, sont la
     signature d'un torse sec. */
  [-1, 1].forEach(function (s) {
    var ob = new THREE.Mesh(spindleGeom({
      len: 2.15, rx: belly(0.28, 0.55, 0.44), rz: belly(0.42, 0.55, 0.46), seg: 16
    }), null);
    ob.position.set(s * 0.76, 10.15, 0.12);
    ob.rotation.z = s * 0.20;
    muscle('obliques', ob, 0.75);
    body.add(ob);

    for (var i = 0; i < 3; i++) {
      var sl = blob(null, s * (1.00 - i * 0.03), 12.42 - i * 0.40, 0.36 - i * 0.03,
                    0.26, 0.115, 0.30);
      sl.rotation.z = s * 0.42;
      muscle('obliques', sl, 0.6);
      body.add(sl);
    }
  });

  /* ---------- GRANDS DORSAUX ----------
     Aile plaquée contre la cage (rz faible), la plus large juste sous
     l'aisselle : c'est elle qui ouvre le dos. */
  [-1, 1].forEach(function (s) {
    var a = [s * 0.50, 10.10, -0.56], b = [s * 1.52, 13.72, -0.32];
    var lat = new THREE.Mesh(spindleGeom({
      len: dist3(a, b),
      rx: belly(0.88, 0.78, 0.22),
      rz: belly(0.31, 0.74, 0.44),
      seg: 20
    }), null);
    orient(lat, a, b);
    lat.rotateY(-s * 0.30);
    muscle('dorsaux', lat, 1.25);
    body.add(lat);
    var tm = blob(null, s * 1.30, 13.55, -0.48, 0.48, 0.40, 0.34);   // grand rond
    muscle('dorsaux', tm, 1.0);
    body.add(tm);
  });

  /* ---------- TRAPÈZES ---------- */
  [-1, 1].forEach(function (s) {
    var a = [s * 0.15, 15.22, -0.20], b = [s * 1.42, 14.48, -0.28];
    var tr = new THREE.Mesh(spindleGeom({
      len: dist3(a, b), rx: belly(0.48, 0.45, 0.56), rz: belly(0.38, 0.45, 0.58), seg: 16
    }), null);
    orient(tr, a, b);
    muscle('trapezes', tr, 1.05);
    body.add(tr);
    var mid = blob(null, s * 0.48, 13.55, -0.84, 0.44, 0.64, 0.22);   // rhomboïdes
    mid.rotation.z = s * 0.28;
    muscle('trapezes', mid, 0.85);
    body.add(mid);
  });

  /* ---------- LOMBAIRES ---------- */
  [-1, 1].forEach(function (s) {
    var a = [s * 0.30, 9.25, -0.62], b = [s * 0.34, 12.35, -0.74];
    var lb = new THREE.Mesh(spindleGeom({
      len: dist3(a, b), rx: belly(0.27, 0.35, 0.62), seg: 16
    }), null);
    orient(lb, a, b);
    muscle('lombaires', lb, 0.8);
    body.add(lb);
  });

  /* ---------- FESSIERS ---------- */
  [-1, 1].forEach(function (s) {
    var gl = blob(null, s * 0.56, 8.72, -0.62, 0.72, 0.74, 0.60);
    gl.rotation.z = s * 0.10;
    muscle('fessiers', gl, 1.0);
    body.add(gl);
    var med = blob(null, s * 1.06, 9.42, -0.12, 0.40, 0.50, 0.44);   // moyen fessier
    muscle('fessiers', med, 0.9);
    body.add(med);
  });

  setProgress(52, 'Sculpture des muscles…');

  /* ---------- BRAS ---------- */
  var arms = [];
  [-1, 1].forEach(function (s) {
    var arm = new THREE.Group();
    arm.position.set(s * EPAULE_X, A.epaule, 0);
    arm.rotation.z = -s * 0.135;      // léger écart, bras le long du corps
    arm.rotation.x = 0.05;
    arm.userData = { side: s, baseX: s * EPAULE_X, baseRotZ: -s * 0.135 };
    body.add(arm);
    arms.push(arm);

    var elbow = -BRAS_L;
    var wrist = -(BRAS_L + AVBRAS_L);

    /* humérus : comble l'espace entre biceps et triceps */
    var hum = flesh(new THREE.Mesh(spindleGeom({
      len: BRAS_L, rx: belly(0.25, 0.5, 0.86), seg: 12
    }), boneMat));
    orient(hum, [0, 0, 0], [0, elbow, 0]);
    arm.add(hum);

    /* DELTOÏDE — trois faisceaux distincts, c'est ce qui donne
       l'épaule « en boulet de canon » vue de face comme de dos. */
    var delt = blob(null, s * 0.22, 0.04, -0.02, 0.88, 0.88, 0.82);
    delt.rotation.z = -s * 0.16;
    muscle('deltoides', delt, 1.15);
    arm.add(delt);
    var deltA = blob(null, s * 0.02, -0.06, 0.32, 0.50, 0.50, 0.46);   // antérieur
    muscle('deltoides', deltA, 1.05);
    arm.add(deltA);
    var deltP = blob(null, s * 0.02, -0.10, -0.36, 0.50, 0.46, 0.44);  // postérieur
    muscle('deltoides', deltP, 1.05);
    arm.add(deltP);

    /* BICEPS */
    var bi = new THREE.Mesh(spindleGeom({
      len: 2.58, rx: belly(0.56, 0.46, 0.30), rz: belly(0.52, 0.46, 0.34), seg: 18
    }), null);
    orient(bi, [0, -0.54, 0.16], [0, -3.12, 0.08]);
    muscle('biceps', bi, 1.35);
    arm.add(bi);
    var peak = blob(null, 0, -1.48, 0.26, 0.33, 0.50, 0.27);   // pic du long chef
    muscle('biceps', peak, 1.45);
    arm.add(peak);

    /* TRICEPS */
    var tri = new THREE.Mesh(spindleGeom({
      len: 2.98, rx: belly(0.60, 0.40, 0.32), rz: belly(0.54, 0.40, 0.34), seg: 18
    }), null);
    orient(tri, [0, -0.32, -0.20], [0, -3.30, -0.06]);
    muscle('triceps', tri, 1.3);
    arm.add(tri);
    var triLat = blob(null, s * 0.28, -1.15, -0.24, 0.26, 0.56, 0.27);   // chef latéral
    triLat.rotation.z = -s * 0.12;
    muscle('triceps', triLat, 1.2);
    arm.add(triLat);

    /* coude */
    arm.add(flesh(blob(boneMat, 0, elbow, -0.04, 0.30, 0.28, 0.30)));

    /* AVANT-BRAS : épais sous le coude, effilé au poignet */
    var fa = new THREE.Mesh(spindleGeom({
      len: AVBRAS_L,
      rx: function (t) { return 0.58 - 0.28 * Math.pow(t, 0.82) + 0.10 * Math.sin(Math.PI * Math.min(1, t * 2.4)); },
      seg: 18
    }), null);
    orient(fa, [0, elbow - 0.06, 0.02], [0, wrist, -0.05]);
    muscle('avantbras', fa, 1.1);
    arm.add(fa);
    var brach = blob(null, s * 0.27, elbow - 0.58, 0.18, 0.22, 0.46, 0.24);   // long supinateur
    muscle('avantbras', brach, 1.0);
    arm.add(brach);

    /* poignet + main */
    arm.add(flesh(blob(boneMat, 0, wrist, 0, 0.23, 0.18, 0.20)));
    arm.add(flesh(blob(baseMat, 0, wrist - 0.46, -0.03, 0.29, 0.46, 0.17)));
  });

  /* ---------- JAMBES ---------- */
  var legs = [];
  [-1, 1].forEach(function (s) {
    var leg = new THREE.Group();
    leg.position.set(s * HANCHE_X, A.hanche, 0);
    leg.rotation.z = s * 0.03;
    leg.userData = { side: s, baseX: s * HANCHE_X };
    body.add(leg);
    legs.push(leg);

    var knee = -CUISSE_L;
    var ankle = -(CUISSE_L + JAMBE_L);

    /* fémur */
    var fem = flesh(new THREE.Mesh(spindleGeom({
      len: CUISSE_L, rx: belly(0.40, 0.5, 0.86), seg: 12
    }), boneMat));
    orient(fem, [0, 0, 0], [0, knee, 0]);
    leg.add(fem);

    /* QUADRICEPS : corps principal + vaste latéral + vaste médial */
    var q = new THREE.Mesh(spindleGeom({
      len: 3.66, rx: belly(0.90, 0.44, 0.42), rz: belly(0.80, 0.44, 0.46), seg: 20
    }), null);
    orient(q, [0, -0.28, 0.16], [0, -3.94, 0.04]);
    muscle('quadriceps', q, 1.15);
    leg.add(q);
    var vl = blob(null, s * 0.48, -1.70, 0.06, 0.32, 0.92, 0.48);
    vl.rotation.z = -s * 0.06;
    muscle('quadriceps', vl, 1.1);
    leg.add(vl);
    var vm = blob(null, -s * 0.36, -3.35, 0.22, 0.28, 0.54, 0.36);
    muscle('quadriceps', vm, 1.05);
    leg.add(vm);

    /* ISCHIO-JAMBIERS */
    var h = new THREE.Mesh(spindleGeom({
      len: 3.56, rx: belly(0.74, 0.42, 0.40), rz: belly(0.60, 0.42, 0.44), seg: 18
    }), null);
    orient(h, [0, -0.24, -0.26], [0, -3.80, -0.14]);
    muscle('ischios', h, 1.1);
    leg.add(h);

    /* genou */
    leg.add(flesh(blob(boneMat, 0, knee, 0.06, 0.44, 0.40, 0.46)));

    /* tibia */
    var tib = flesh(new THREE.Mesh(spindleGeom({
      len: JAMBE_L, rx: function (t) { return 0.30 - 0.09 * t; }, seg: 12
    }), boneMat));
    orient(tib, [0, knee, 0.04], [0, ankle, -0.02]);
    leg.add(tib);

    /* MOLLETS — deux chefs du gastrocnémien, renflés haut, + soléaire */
    [-1, 1].forEach(function (k) {
      var a = [k * 0.20, knee - 0.30, -0.22], b = [k * 0.08, knee - 3.05, -0.06];
      var ca = new THREE.Mesh(spindleGeom({
        len: dist3(a, b), rx: belly(0.40, 0.25, 0.26), rz: belly(0.35, 0.25, 0.30), seg: 18
      }), null);
      orient(ca, a, b);
      muscle('mollets', ca, 1.3);
      leg.add(ca);
    });
    var sol = new THREE.Mesh(spindleGeom({
      len: 2.30, rx: belly(0.44, 0.30, 0.44), rz: belly(0.33, 0.30, 0.46), seg: 14
    }), null);
    orient(sol, [0, knee - 0.72, -0.12], [0, knee - 3.02, -0.02]);
    muscle('mollets', sol, 1.15);
    leg.add(sol);

    /* jambier antérieur : habille la crête du tibia vue de face */
    var ta = flesh(new THREE.Mesh(spindleGeom({
      len: 2.60, rx: belly(0.30, 0.32, 0.36), rz: belly(0.26, 0.32, 0.40), seg: 14
    }), baseMat));
    orient(ta, [s * 0.14, knee - 0.45, 0.22], [s * 0.05, knee - 3.05, 0.12]);
    leg.add(ta);

    /* tendon d'Achille, cheville, pied posé au sol */
    var ach = flesh(new THREE.Mesh(spindleGeom({
      len: 1.05, rx: belly(0.12, 0.5, 0.8), seg: 8
    }), boneMat));
    orient(ach, [0, ankle + 1.05, -0.20], [0, ankle + 0.05, -0.16]);
    leg.add(ach);
    leg.add(flesh(blob(boneMat, 0, ankle, -0.02, 0.28, 0.29, 0.29)));
    var foot = flesh(new THREE.Mesh(spindleGeom({ len: 1.78, rx: function (t) { return 0.34 - 0.12 * t * t; }, rz: function (t) { return 0.30 - 0.14 * t; }, seg: 10 }), baseMat));
    foot.rotation.x = Math.PI / 2;
    foot.position.set(0, ankle - 0.62, -0.34);
    leg.add(foot);
  });

  setProgress(70, 'Étalonnage des lumières…');

  /* ---------- ancres d'étiquettes et cadrage caméra ----------
     Le cadrage est déduit de la géométrie : aucune distance n'est écrite en
     dur, la caméra reste donc juste même si la sculpture change. */
  var _c = new THREE.Vector3();

  function computeFrames() {
    MUSCLES.forEach(function (m) {
      var st = muscleState[m.id];
      var minX = Infinity, minY = Infinity, minZ = Infinity;
      var maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      var acc = new THREE.Vector3();

      st.meshes.forEach(function (msh) {
        msh.updateWorldMatrix(true, false);
        if (!msh.geometry.boundingSphere) msh.geometry.computeBoundingSphere();
        var bs = msh.geometry.boundingSphere;
        _c.copy(bs.center).applyMatrix4(msh.matrixWorld);
        var sc = Math.max(Math.abs(msh.scale.x), Math.abs(msh.scale.y), Math.abs(msh.scale.z));
        var r = bs.radius * sc;
        acc.add(_c);
        if (_c.x - r < minX) minX = _c.x - r;
        if (_c.y - r < minY) minY = _c.y - r;
        if (_c.z - r < minZ) minZ = _c.z - r;
        if (_c.x + r > maxX) maxX = _c.x + r;
        if (_c.y + r > maxY) maxY = _c.y + r;
        if (_c.z + r > maxZ) maxZ = _c.z + r;
      });

      st.anchor.copy(acc.divideScalar(Math.max(1, st.meshes.length)));

      // normale sortante approximée depuis l'axe rachidien
      st.normal = new THREE.Vector3(st.anchor.x, 0, st.anchor.z);
      if (st.normal.lengthSq() < 0.01) st.normal.set(0, 0, m.region === 'dos' ? -1 : 1);
      st.normal.normalize();

      // sphère englobante du groupe -> cible et rayon de cadrage
      st.frame = {
        center: new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2),
        radius: 0.5 * Math.max(maxX - minX, maxY - minY, maxZ - minZ)
      };
    });
  }
  computeFrames();

  /* ====================== CAMÉRA ORBITALE ====================== */
  var VUES = {
    face: { az: 0, pol: 1.47, dist: 32, target: [0, 9.6, 0] },
    dos: { az: Math.PI, pol: 1.47, dist: 32, target: [0, 9.6, 0] },
    cote: { az: Math.PI * 0.5, pol: 1.47, dist: 32, target: [0, 9.6, 0] }
  };

  var cam = { az: 0.65, pol: 1.22, dist: 60 };
  var camT = { az: 0, pol: 1.47, dist: 32 };
  var camTarget = new THREE.Vector3(0, 9.6, 0);
  var camTargetT = new THREE.Vector3(0, 9.6, 0);

  var lastView = null;

  /* Décalage vertical : sous 1080px de large, les panneaux deviennent des
     feuilles qui masquent le bas du canvas. On vise plus bas que le sujet
     pour qu'il remonte dans la moitié haute, restée visible. */
  function viewBias(dist) {
    if (window.innerWidth > 1080) return 0;
    return -dist * Math.tan(camera.fov * Math.PI / 360) * 0.26;
  }

  function applyView(v) {
    lastView = v;
    var d = window.innerWidth <= 1080 ? v.dist * 1.1 : v.dist;
    camT.az = v.az; camT.pol = v.pol; camT.dist = d;
    camTargetT.set(v.target[0], v.target[1] + viewBias(d), v.target[2]);
  }

  function shortAngle(from, to) {
    var d = (to - from) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function updateCamera(k) {
    cam.az += shortAngle(cam.az, camT.az) * k;
    cam.pol += (camT.pol - cam.pol) * k;
    cam.dist += (camT.dist - cam.dist) * k;
    camTarget.lerp(camTargetT, k);
    var sp = Math.sin(cam.pol) * cam.dist;
    camera.position.set(
      sp * Math.sin(cam.az),
      Math.cos(cam.pol) * cam.dist + camTarget.y,
      sp * Math.cos(cam.az)
    );
    camera.position.x += camTarget.x;
    camera.position.z += camTarget.z;
    camera.lookAt(camTarget);
  }

  /* ---------- interaction pointeur ---------- */
  var drag = false, dragMoved = 0, lastX = 0, lastY = 0, pinch = 0;
  var idleAt = performance.now();
  var pointerNDC = new THREE.Vector2(-2, -2);
  var pointerPx = { x: 0, y: 0 };
  var hasPointer = false;

  function markActive() { idleAt = performance.now(); }

  canvas.addEventListener('pointerdown', function (e) {
    drag = true; dragMoved = 0;
    lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    markActive();
  });

  canvas.addEventListener('pointermove', function (e) {
    var r = canvas.getBoundingClientRect();
    pointerPx.x = e.clientX - r.left;
    pointerPx.y = e.clientY - r.top;
    pointerNDC.x = (pointerPx.x / r.width) * 2 - 1;
    pointerNDC.y = -(pointerPx.y / r.height) * 2 + 1;
    hasPointer = true;

    if (drag) {
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      dragMoved += Math.abs(dx) + Math.abs(dy);
      camT.az -= dx * 0.0062;
      camT.pol = Math.max(0.32, Math.min(2.48, camT.pol - dy * 0.0052));
      lastX = e.clientX; lastY = e.clientY;
      markActive();
    }
  });

  canvas.addEventListener('pointerup', function (e) {
    if (drag && dragMoved < 7) handlePick();
    drag = false;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    markActive();
  });
  canvas.addEventListener('pointercancel', function () { drag = false; });
  canvas.addEventListener('pointerleave', function () { hasPointer = false; pointerNDC.set(-2, -2); });

  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    camT.dist = Math.max(4.5, Math.min(44, camT.dist + e.deltaY * 0.014));
    markActive();
  }, { passive: false });

  canvas.addEventListener('touchstart', function (e) {
    if (e.touches.length === 2) {
      pinch = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      drag = false;
    }
  }, { passive: true });

  canvas.addEventListener('touchmove', function (e) {
    if (e.touches.length === 2 && pinch) {
      var d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      camT.dist = Math.max(4.5, Math.min(44, camT.dist * (pinch / d)));
      pinch = d;
      markActive();
    }
  }, { passive: true });
  canvas.addEventListener('touchend', function () { pinch = 0; });

  /* ====================== SÉLECTION / SURVOL ====================== */
  var ray = new THREE.Raycaster();
  var hoverId = null, selectedId = null;
  var tooltip = el('tooltip');

  function raycastId() {
    if (!hasPointer) return null;
    ray.setFromCamera(pointerNDC, camera);
    var hits = ray.intersectObjects(pickables, false);
    return hits.length ? hits[0].object.userData.mid : null;
  }

  function setHover(id) {
    if (id === hoverId) return;
    hoverId = id;
    canvas.style.cursor = id ? 'pointer' : 'grab';
    if (id) {
      var m = MUSCLE_BY_ID[id];
      tooltip.querySelector('b').textContent = m.name;
      tooltip.querySelector('i').textContent = id === selectedId ? 'muscle ouvert' : 'cliquer pour entrer';
      tooltip.classList.add('show');
    } else {
      tooltip.classList.remove('show');
    }
  }

  function handlePick() {
    var id = raycastId();
    if (id) select(id);
    else if (selectedId) deselect();
  }

  /* ====================== INTERFACE ====================== */
  var detail = el('detail');
  var overview = el('overview');
  var sessionView = el('session-view');
  var list = el('muscle-list');
  var currentRegion = 'face';
  var currentFilter = 'tous';
  var searchTerm = '';
  var activeTab = 'atlas';

  var FAMILLES = {
    haut: ['pectoraux', 'deltoides', 'biceps', 'triceps', 'avantbras', 'trapezes', 'dorsaux'],
    bas: ['quadriceps', 'ischios', 'mollets', 'fessiers'],
    core: ['abdominaux', 'obliques', 'lombaires']
  };

  /* Nombre de séries d'un exercice : « 4 × 8-10 » -> 4 */
  function setsOf(ex) {
    var m = /^\s*(\d+)/.exec(ex.sets);
    return m ? parseInt(m[1], 10) : 3;
  }

  /* ---------- notification brève ---------- */
  var toastEl = el('toast'), toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }

  /* ====================== MA SÉANCE ====================== */
  var SKEY = 'myoforge.seance.v1';
  var session = [];
  try {
    var raw = localStorage.getItem(SKEY);
    if (raw) session = JSON.parse(raw) || [];
  } catch (e) { session = []; }

  function saveSession() {
    try { localStorage.setItem(SKEY, JSON.stringify(session)); } catch (e) { /* mode privé */ }
  }
  function inSession(mid, name) {
    return session.some(function (s) { return s.mid === mid && s.name === name; });
  }
  function addExercise(mid, ex, silent) {
    if (inSession(mid, ex.name)) return false;
    session.push({ mid: mid, name: ex.name, sets: ex.sets, level: ex.level, gear: ex.gear });
    saveSession(); renderSession();
    if (!silent) toast('« ' + ex.name + ' » ajouté à ta séance');
    return true;
  }
  function removeExercise(mid, name) {
    session = session.filter(function (s) { return !(s.mid === mid && s.name === name); });
    saveSession(); renderSession();
  }

  function renderSession() {
    var totalSets = session.reduce(function (n, s) { return n + setsOf(s); }, 0);
    var groups = {};
    session.forEach(function (s) { groups[s.mid] = 1; });
    var nGroups = Object.keys(groups).length;

    el('session-sets').textContent = totalSets;
    el('session-count').textContent = session.length;
    el('session-groups').textContent = nGroups;

    var badge = el('dock-badge');
    badge.textContent = session.length;
    badge.hidden = session.length === 0;

    var ul = el('session-list');
    ul.textContent = '';
    if (!session.length) {
      var li = document.createElement('li');
      li.className = 'session-empty';
      li.textContent = 'Ta séance est vide. Ouvre un muscle et ajoute des exercices, ou utilise le générateur.';
      ul.appendChild(li);
    } else {
      // regroupe par muscle, dans l'ordre de l'atlas
      MUSCLES.forEach(function (m) {
        session.filter(function (s) { return s.mid === m.id; }).forEach(function (s) {
          var li = document.createElement('li');

          var main = document.createElement('div');
          var nm = document.createElement('span');
          nm.className = 'sr-name';
          nm.textContent = s.name;
          var sub = document.createElement('span');
          sub.className = 'sr-sub';
          sub.textContent = m.name + ' · ' + s.level;
          main.appendChild(nm); main.appendChild(sub);

          var st = document.createElement('span');
          st.className = 'sr-sets';
          st.textContent = s.sets;

          var del = document.createElement('button');
          del.type = 'button';
          del.className = 'sr-del';
          del.setAttribute('aria-label', 'Retirer ' + s.name);
          del.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
          del.addEventListener('click', function () { removeExercise(s.mid, s.name); });

          li.appendChild(main); li.appendChild(st); li.appendChild(del);
          ul.appendChild(li);
        });
      });
    }
    syncAddButtons();
  }

  function syncAddButtons() {
    Array.prototype.forEach.call(document.querySelectorAll('.ex-add'), function (b) {
      var on = inSession(b.dataset.mid, b.dataset.name);
      b.classList.toggle('in', on);
      b.textContent = on ? '✓' : '+';
      b.setAttribute('aria-label', (on ? 'Retirer ' : 'Ajouter ') + b.dataset.name);
    });
  }

  el('btn-clear').addEventListener('click', function () {
    if (!session.length) return;
    session = []; saveSession(); renderSession();
    toast('Séance vidée');
  });

  el('btn-copy').addEventListener('click', function () {
    if (!session.length) { toast('Ajoute d’abord des exercices'); return; }
    var lines = ['SÉANCE MYOFORGE', ''];
    MUSCLES.forEach(function (m) {
      var items = session.filter(function (s) { return s.mid === m.id; });
      if (!items.length) return;
      lines.push(m.name.toUpperCase());
      items.forEach(function (s) { lines.push('  - ' + s.name + ' — ' + s.sets + ' (' + s.gear + ')'); });
      lines.push('');
    });
    lines.push('Total : ' + session.length + ' exercices, ' +
      session.reduce(function (n, s) { return n + setsOf(s); }, 0) + ' séries.');
    var txt = lines.join('\n');

    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = txt;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toast('Séance copiée'); }
      catch (e) { toast('Copie impossible sur ce navigateur'); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(function () { toast('Séance copiée'); }, fallback);
    } else { fallback(); }
  });

  /* ---------- générateur de séance ---------- */
  var PROGRAMMES = {
    push: ['pectoraux', 'deltoides', 'triceps'],
    pull: ['dorsaux', 'trapezes', 'biceps'],
    legs: ['quadriceps', 'ischios', 'fessiers', 'mollets'],
    full: ['pectoraux', 'dorsaux', 'quadriceps', 'deltoides', 'ischios', 'abdominaux']
  };
  Array.prototype.forEach.call(document.querySelectorAll('#gen-grid button'), function (b) {
    b.addEventListener('click', function () {
      var ids = PROGRAMMES[b.dataset.prog];
      var perMuscle = ids.length > 4 ? 1 : 2;
      session = [];
      ids.forEach(function (id) {
        var m = MUSCLE_BY_ID[id];
        m.exercises.slice(0, perMuscle).forEach(function (ex) { addExercise(id, ex, true); });
      });
      saveSession(); renderSession();
      showTab('session');
      var lab = (b.childNodes[0] && b.childNodes[0].nodeValue || b.dataset.prog).trim();
      toast('Séance « ' + lab + ' » générée');
    });
  });

  /* ====================== FICHE MUSCLE ====================== */
  function renderDetail(m) {
    el('d-region').textContent = m.region === 'face' ? 'Face avant' : 'Face arrière';
    el('d-name').textContent = m.name;
    el('d-latin').textContent = m.latin;
    el('d-role').textContent = m.role;
    el('d-volume').textContent = m.volume;
    el('d-count').textContent = m.exercises.length + ' mouvements';
    el('d-anatomy').textContent = m.anatomy;

    var maxSets = m.exercises.reduce(function (n, e) { return Math.max(n, setsOf(e)); }, 1);
    var ol = el('d-exercises');
    ol.textContent = '';

    m.exercises.forEach(function (ex, i) {
      var li = document.createElement('li');
      li.style.animationDelay = (0.04 + i * 0.055) + 's';

      var idx = document.createElement('span');
      idx.className = 'ex-idx';
      idx.textContent = (i + 1 < 10 ? '0' : '') + (i + 1);

      var main = document.createElement('div');
      main.className = 'ex-main';

      var nm = document.createElement('p');
      nm.className = 'ex-name';
      nm.textContent = ex.name;

      var meta = document.createElement('div');
      meta.className = 'ex-meta';
      var track = document.createElement('span');
      track.className = 'ex-track';
      var fillEl = document.createElement('span');
      fillEl.className = 'ex-fill';
      fillEl.style.width = Math.round(setsOf(ex) / maxSets * 100) + '%';
      track.appendChild(fillEl);
      var sets = document.createElement('span');
      sets.className = 'ex-sets';
      sets.textContent = ex.sets;
      meta.appendChild(track); meta.appendChild(sets);

      var tags = document.createElement('div');
      tags.className = 'ex-tags';
      [['lvl-' + ex.level, ex.level], ['', ex.gear]].forEach(function (t) {
        var sp = document.createElement('span');
        if (t[0]) sp.className = t[0];
        sp.textContent = t[1];
        tags.appendChild(sp);
      });

      var cue = document.createElement('p');
      cue.className = 'ex-cue';
      cue.textContent = ex.cue;

      main.appendChild(nm); main.appendChild(meta); main.appendChild(tags); main.appendChild(cue);

      var add = document.createElement('button');
      add.type = 'button';
      add.className = 'ex-add';
      add.dataset.mid = m.id;
      add.dataset.name = ex.name;
      add.textContent = '+';
      add.addEventListener('click', function () {
        if (inSession(m.id, ex.name)) removeExercise(m.id, ex.name);
        else addExercise(m.id, ex);
      });

      li.appendChild(idx); li.appendChild(main); li.appendChild(add);
      ol.appendChild(li);
    });
    syncAddButtons();
  }

  el('btn-add-all').addEventListener('click', function () {
    if (!selectedId) return;
    var m = MUSCLE_BY_ID[selectedId], n = 0;
    m.exercises.forEach(function (ex) { if (addExercise(m.id, ex, true)) n++; });
    toast(n ? n + ' exercice' + (n > 1 ? 's' : '') + ' ajouté' + (n > 1 ? 's' : '') : 'Déjà dans ta séance');
  });

  function select(id, keepTab) {
    var m = MUSCLE_BY_ID[id];
    if (!m) return;
    selectedId = id;
    Object.keys(muscleState).forEach(function (k) { muscleState[k].sel = (k === id); });
    var fr = muscleState[id].frame;
    var vfov = camera.fov * Math.PI / 180;
    var d = fr.radius / Math.tan(vfov / 2) * 2.8;
    applyView({
      az: m.focus.az, pol: m.focus.pol,
      dist: Math.max(13, Math.min(27, d)),
      target: [fr.center.x, fr.center.y, fr.center.z]
    });
    renderDetail(m);
    if (!keepTab) showTab('muscle');
    syncList();
    markActive();
  }

  function deselect() {
    selectedId = null;
    Object.keys(muscleState).forEach(function (k) { muscleState[k].sel = false; });
    applyView(VUES[activeView]);
    showTab('atlas');
    syncList();
  }

  /* navigation d'un muscle au suivant */
  function step(dir) {
    var i = MUSCLES.findIndex(function (m) { return m.id === selectedId; });
    if (i < 0) i = 0;
    var j = (i + dir + MUSCLES.length) % MUSCLES.length;
    select(MUSCLES[j].id, true);
  }
  el('nav-prev').addEventListener('click', function () { step(-1); });
  el('nav-next').addEventListener('click', function () { step(1); });

  /* ====================== ONGLETS ====================== */
  function showTab(tab) {
    activeTab = tab;
    overview.classList.toggle('off', tab !== 'atlas');
    detail.classList.toggle('on', tab === 'muscle');
    sessionView.classList.toggle('on', tab === 'session');
    document.body.classList.remove('tab-atlas', 'tab-muscle', 'tab-session');
    document.body.classList.add('tab-' + tab);
    Array.prototype.forEach.call(document.querySelectorAll('#dock button[data-nav]'), function (b) {
      if (!b.classList.contains('dock-action')) b.classList.toggle('active', b.dataset.nav === tab);
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll('#dock button[data-nav]'), function (b) {
    b.addEventListener('click', function () {
      var t = b.dataset.nav;
      if (t === 'muscle' && !selectedId) { select(MUSCLES[0].id); return; }
      if (t === 'atlas' && selectedId) { deselect(); return; }
      showTab(t);
    });
  });

  el('btn-menu').addEventListener('click', function () {
    document.body.classList.toggle('panels-off');
  });

  /* ====================== INDEX LATÉRAL ====================== */
  function matches(m) {
    if (!searchTerm) return true;
    var q = searchTerm;
    if (m.name.toLowerCase().indexOf(q) >= 0) return true;
    if (m.latin.toLowerCase().indexOf(q) >= 0) return true;
    return m.exercises.some(function (e) { return e.name.toLowerCase().indexOf(q) >= 0; });
  }

  function visibleMuscles() {
    return MUSCLES.filter(function (m) {
      if (!matches(m)) return false;
      if (searchTerm) return true;
      if (currentFilter !== 'tous') return FAMILLES[currentFilter].indexOf(m.id) >= 0;
      return m.region === currentRegion;
    });
  }

  function buildList() {
    list.textContent = '';
    var items = visibleMuscles();

    if (!items.length) {
      var empty = document.createElement('li');
      empty.className = 'mi-empty';
      empty.textContent = 'Aucun muscle ni exercice ne correspond.';
      list.appendChild(empty);
      return;
    }

    items.forEach(function (m, i) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.mid = m.id;

      var idx = document.createElement('span');
      idx.className = 'mi-idx';
      idx.textContent = (i + 1 < 10 ? '0' : '') + (i + 1);

      var txt = document.createElement('span');
      txt.className = 'mi-text';
      var n = document.createElement('span');
      n.className = 'mi-name';
      n.textContent = m.name;
      var sub = document.createElement('span');
      sub.className = 'mi-sub';
      sub.textContent = m.latin;
      txt.appendChild(n); txt.appendChild(sub);

      var cnt = document.createElement('span');
      cnt.className = 'mi-count';
      cnt.textContent = m.exercises.length;

      b.appendChild(idx); b.appendChild(txt); b.appendChild(cnt);
      b.addEventListener('click', function () { select(m.id); });
      b.addEventListener('mouseenter', function () { muscleState[m.id].hover = true; });
      b.addEventListener('mouseleave', function () { muscleState[m.id].hover = false; });
      li.appendChild(b);
      list.appendChild(li);
    });
    syncList();
  }

  function syncList() {
    Array.prototype.forEach.call(list.querySelectorAll('button'), function (b) {
      b.classList.toggle('active', b.dataset.mid === selectedId);
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll('.region-tabs button'), function (b) {
    b.addEventListener('click', function () {
      Array.prototype.forEach.call(document.querySelectorAll('.region-tabs button'),
        function (o) { o.classList.remove('active'); });
      b.classList.add('active');
      currentRegion = b.dataset.region;
      currentFilter = 'tous';
      syncChips();
      if (!selectedId) {
        activeView = currentRegion === 'dos' ? 'dos' : 'face';
        syncViewButtons();
        applyView(VUES[activeView]);
      }
      buildList();
    });
  });

  function syncChips() {
    Array.prototype.forEach.call(document.querySelectorAll('#chip-row .chip'), function (c) {
      c.classList.toggle('active', c.dataset.filter === currentFilter);
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll('#chip-row .chip'), function (c) {
    // l'effectif affiché est calculé, jamais écrit en dur
    var f = c.dataset.filter;
    var n = f === 'tous' ? MUSCLES.length : FAMILLES[f].length;
    c.querySelector('span').textContent = n + ' groupes';
    c.addEventListener('click', function () {
      currentFilter = f;
      syncChips();
      buildList();
    });
  });

  el('muscle-search').addEventListener('input', function (e) {
    searchTerm = e.target.value.trim().toLowerCase();
    buildList();
  });

  /* ====================== VUE D'ENSEMBLE ====================== */
  function renderOverview() {
    var totalEx = MUSCLES.reduce(function (n, m) { return n + m.exercises.length; }, 0);
    var totalSets = MUSCLES.reduce(function (n, m) {
      return n + m.exercises.reduce(function (k, e) { return k + setsOf(e); }, 0);
    }, 0);
    var face = MUSCLES.filter(function (m) { return m.region === 'face'; }).length;

    el('stat-ex').textContent = totalEx;
    el('stat-groups').textContent = MUSCLES.length;

    var rows = [
      ['M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', 'Groupes musculaires', MUSCLES.length],
      ['M4 7h3v10H4zM17 7h3v10h-3zM7 12h10', 'Exercices indexés', totalEx],
      ['M12 3v18M3 12h18', 'Face avant / arrière', face + ' / ' + (MUSCLES.length - face)],
      ['M5 20V9M10 20V4M15 20v-8M20 20v-5', 'Séries cumulées', totalSets],
      ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2', 'Exercices / groupe', (totalEx / MUSCLES.length).toFixed(1)]
    ];
    var ul = el('ov-rows');
    ul.textContent = '';
    rows.forEach(function (r) {
      var li = document.createElement('li');
      li.innerHTML = '<svg viewBox="0 0 24 24"><path d="' + r[0] + '"/></svg>';
      var k = document.createElement('span');
      k.className = 'dr-key';
      k.textContent = r[1];
      var v = document.createElement('span');
      v.className = 'dr-val';
      v.textContent = r[2];
      li.appendChild(k); li.appendChild(v);
      ul.appendChild(li);
    });

    var niveaux = { 'Débutant': 0, 'Intermédiaire': 0, 'Avancé': 0 };
    MUSCLES.forEach(function (m) {
      m.exercises.forEach(function (e) {
        if (niveaux[e.level] !== undefined) niveaux[e.level]++;
      });
    });
    var bars = el('lvl-bars');
    bars.textContent = '';
    Object.keys(niveaux).forEach(function (lvl) {
      var pct = Math.round(niveaux[lvl] / totalEx * 100);
      var li = document.createElement('li');
      var nm = document.createElement('span');
      nm.className = 'zb-name';
      nm.textContent = lvl;
      var tr = document.createElement('span');
      tr.className = 'zb-track';
      var fl = document.createElement('span');
      fl.className = 'zb-fill';
      fl.style.width = pct + '%';
      tr.appendChild(fl);
      var vl = document.createElement('span');
      vl.className = 'zb-val';
      vl.textContent = niveaux[lvl] + ' · ' + pct + '%';
      li.appendChild(nm); li.appendChild(tr); li.appendChild(vl);
      bars.appendChild(li);
    });
  }

  /* salutation selon l'heure */
  (function () {
    var h = new Date().getHours();
    el('greeting-time').textContent = h < 6 ? 'Bonne nuit' : h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
  })();

  /* ====================== BOUTONS DE VUE ====================== */
  var activeView = 'face';
  function syncViewButtons() {
    Array.prototype.forEach.call(document.querySelectorAll('.view-switch button'), function (b) {
      b.classList.toggle('active', b.dataset.view === activeView);
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll('.view-switch button'), function (b) {
    b.addEventListener('click', function () {
      activeView = b.dataset.view;
      syncViewButtons();
      if (selectedId) deselect(); else applyView(VUES[activeView]);
      markActive();
    });
  });

  el('btn-reset').addEventListener('click', function () {
    activeView = 'face';
    syncViewButtons();
    if (selectedId) deselect();
    applyView(VUES.face);
    markActive();
  });

  el('detail-close').addEventListener('click', deselect);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && selectedId) deselect();
    else if (e.key === 'ArrowRight' && selectedId) step(1);
    else if (e.key === 'ArrowLeft' && selectedId) step(-1);
  });

  /* ====================== ÉTIQUETTES PROJETÉES ====================== */
  var labelsOn = false;
  var labelEls = {};
  var labelsLayer = el('labels-layer');
  MUSCLES.forEach(function (m) {
    var d = document.createElement('div');
    d.className = 'mlabel';
    var dot = document.createElement('i');
    var sp = document.createElement('span');
    sp.textContent = m.name;
    d.appendChild(dot); d.appendChild(sp);
    labelsLayer.appendChild(d);
    labelEls[m.id] = d;
  });

  el('btn-labels').addEventListener('click', function () {
    labelsOn = !labelsOn;
    this.classList.toggle('on', labelsOn);
    if (!labelsOn) MUSCLES.forEach(function (m) { labelEls[m.id].classList.remove('vis'); });
  });

  var _proj = new THREE.Vector3();
  function updateLabels() {
    if (!labelsOn) return;
    var w = canvas.clientWidth, h = canvas.clientHeight;
    MUSCLES.forEach(function (m) {
      var st = muscleState[m.id];
      var d = labelEls[m.id];
      _v.copy(camera.position).sub(st.anchor).normalize();
      if (_v.dot(st.normal) < 0.12) { d.classList.remove('vis'); return; }
      _proj.copy(st.anchor).project(camera);
      if (_proj.z > 1) { d.classList.remove('vis'); return; }
      d.style.left = ((_proj.x * 0.5 + 0.5) * w).toFixed(1) + 'px';
      d.style.top = ((-_proj.y * 0.5 + 0.5) * h).toFixed(1) + 'px';
      d.classList.add('vis');
    });
  }

  /* ====================== MORPHOLOGIE ====================== */
  var bulkK = 1;
  var PALIERS = [
    [0.16, 'Naturel'], [0.34, 'Athlétique'], [0.56, 'Musclé'],
    [0.78, 'Bodybuilder'], [1.01, 'Surdéveloppé']
  ];
  function applyBulk(t) {
    bulkK = 1 + (t - 0.4) * 0.78;
    pickables.forEach(function (m) {
      var f = 1 + (bulkK - 1) * m.userData.bulk;
      m.scale.copy(m.userData.baseScale).multiplyScalar(f);
    });
    var spread = bulkK - 1;
    arms.forEach(function (a) {
      a.position.x = a.userData.baseX * (1 + spread * 0.34);
      a.rotation.z = a.userData.baseRotZ - a.userData.side * spread * 0.20;
    });
    legs.forEach(function (l) { l.position.x = l.userData.baseX * (1 + spread * 0.22); });

    for (var i = 0; i < PALIERS.length; i++) {
      if (t < PALIERS[i][0]) { el('bulk-label').textContent = PALIERS[i][1]; break; }
    }
    computeFrames();
  }
  var bulkSlider = el('bulk-slider');
  bulkSlider.addEventListener('input', function () { applyBulk(+this.value / 100); });

  /* ====================== BOUCLE DE RENDU ====================== */
  function resize() {
    var w = canvas.clientWidth || window.innerWidth;
    var h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < 620 ? 48 : 38;
    camera.updateProjectionMatrix();
    if (lastView) applyView(lastView);
  }
  window.addEventListener('resize', resize);

  var clock = new THREE.Clock();
  var started = false;

  function frame() {
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, clock.getDelta());
    var k = 1 - Math.pow(0.0001, dt);   // lissage indépendant du framerate

    // rotation automatique après inactivité
    if (started && !drag && !selectedId && performance.now() - idleAt > 5200) {
      camT.az += dt * 0.13;
    }

    updateCamera(k);

    if (!isTouch && !drag && started) setHover(raycastId());
    if (hoverId) {
      tooltip.style.left = pointerPx.x + 'px';
      tooltip.style.top = pointerPx.y + 'px';
    }

    // ---- animation des matériaux (monochrome au repos, blanc à l'activation)
    var dimmed = !!selectedId;
    MUSCLES.forEach(function (m) {
      var st = muscleState[m.id];
      var mat = muscleMat[m.id];
      var active = st.sel || st.hover || hoverId === m.id;
      var glowT = st.sel ? 0.95 : (active ? 0.55 : (dimmed ? 0.012 : 0.06));
      var tintT = st.sel ? 1 : (active ? 0.78 : 0);
      st.glow += (glowT - st.glow) * k * 0.55;
      st.tint += (tintT - st.tint) * k * 0.55;
      mat.emissiveIntensity = st.glow;
      if (dimmed && !active) {
        mat.color.lerp(COL_DIM, k * 0.42);
      } else {
        mat.color.copy(mat.userData.rest).lerp(mat.userData.hot, st.tint);
      }
    });
    baseMat.color.lerp(dimmed ? COL_DIM : baseMat.userData.rest, k * 0.42);

    // ---- socle : anneaux qui tournent, halo qui respire
    var t = clock.elapsedTime;
    for (var ri = 0; ri < rings.length; ri++) rings[ri].rotation.z += dt * rings[ri].userData.spin;
    podium.material.opacity = 0.055 + 0.025 * Math.sin(t * 1.4);

    // ---- ligne de scan : remonte le sujet en boucle
    var sc = (t * 0.16) % 1.35;
    scan.position.y = sc * 18.6;
    scan.material.opacity = sc < 1 ? 0.13 * Math.sin(Math.PI * sc) : 0;
    scan.scale.setScalar(0.55 + 0.5 * Math.sin(Math.PI * Math.min(1, sc)));

    // ---- respiration du thorax
    var br = 1 + 0.009 * Math.sin(t * 0.9);
    trunk.scale.set(br, 1, br * 1.004);

    updateLabels();
    renderer.render(scene, camera);
  }

  /* ====================== DÉMARRAGE ====================== */
  resize();
  buildList();
  renderOverview();
  renderSession();
  showTab('atlas');
  syncChips();
  syncViewButtons();
  applyBulk(+bulkSlider.value / 100);
  applyView(VUES.face);
  updateCamera(1);
  renderer.render(scene, camera);   // compile les shaders avant l'apparition
  frame();

  setProgress(88, 'Indexation des exercices…');

  setTimeout(function () {
    setProgress(100, 'Prêt');
    setTimeout(function () { loader.classList.add('done'); }, 360);
  }, 320);

  /* le mode d'emploi doit parler la langue de l'appareil */
  if (isTouch) {
    var hint = document.querySelector('.hero-hint');
    if (hint) hint.textContent = 'Glisse pour tourner · Pince pour zoomer · Touche un muscle';
  }

  el('hero-enter').addEventListener('click', function () {
    el('hero').classList.add('gone');
    started = true;
    markActive();
    camT.dist = 32;
    camT.az = 0;
    camT.pol = 1.47;
  });
})();
