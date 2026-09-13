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

  /* ====================== MATÉRIAU DU CORPS ======================
     Un seul matériau pour tout le corps. Trois greffes dans le shader :
       - un liseré de Fresnel, pour l'aspect « scan holographique » ;
       - la surbrillance du muscle survolé ou ouvert, choisie par sommet
         grâce à l'attribut aGroupe (aucun découpage en sous-objets) ;
       - le gonflement musculaire, appliqué le long de la normale, qui
         donne le curseur « naturel -> surdéveloppé ». */
  var COL_PEAU = new THREE.Color('#aab5c4');

  var uCorps = {
    uRimC:  { value: new THREE.Color('#bfe8ff') },
    uRimS:  { value: 0.5 },
    uSel:   { value: -1 },
    uHover: { value: -1 },
    uDim:   { value: 0 },
    uSelAmt: { value: 0 },
    uHovAmt: { value: 0 },
    uActive: { value: new THREE.Color('#ffffff') },
    uBulk:  { value: 0 },
    uPulse: { value: 0 }
  };

  var bodyMat = new THREE.MeshStandardMaterial({
    color: COL_PEAU.clone(), roughness: 0.42, metalness: 0.16,
    emissive: new THREE.Color('#7fc4ff'), emissiveIntensity: 0.05
  });

  bodyMat.onBeforeCompile = function (sh) {
    Object.keys(uCorps).forEach(function (k) { sh.uniforms[k] = uCorps[k]; });

    sh.vertexShader = sh.vertexShader
      .replace('#include <common>',
        '#include <common>\n' +
        'attribute float aGroupe;\n' +
        'attribute float aGonfle;\n' +
        'varying float vSelW;\n' +
        'varying float vHovW;\n' +
        'uniform float uBulk;\n' +
        'uniform float uPulse;\n' +
        'uniform float uSel;\n' +
        'uniform float uHover;')
      .replace('#include <begin_vertex>',
        '#include <begin_vertex>\n' +
        '\tvSelW = 1.0 - step(0.5, abs(aGroupe - uSel));\n' +
        '\tvHovW = 1.0 - step(0.5, abs(aGroupe - uHover));\n' +
        '\ttransformed += objectNormal * aGonfle * (uBulk + vSelW * uPulse);');

    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>',
        '#include <common>\n' +
        'varying float vSelW;\n' +
        'varying float vHovW;\n' +
        'uniform vec3 uRimC;\n' +
        'uniform float uRimS;\n' +
        'uniform float uDim;\n' +
        'uniform float uSelAmt;\n' +
        'uniform float uHovAmt;\n' +
        'uniform vec3 uActive;')
      .replace('#include <map_fragment>',
        '#include <map_fragment>\n' +
        '\tfloat _sel = vSelW * uSelAmt;\n' +
        '\tfloat _hov = vHovW * uHovAmt;\n' +
        '\tfloat _act = max(_sel, _hov * 0.7);\n' +
        '\tdiffuseColor.rgb *= mix(1.0, 0.22, uDim * (1.0 - _act));\n' +
        '\tdiffuseColor.rgb = mix(diffuseColor.rgb, uActive, _act * 0.82);')
      .replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n' +
        '\tfloat _fr = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 2.5);\n' +
        '\tfloat _s2 = vSelW * uSelAmt;\n' +
        '\tfloat _h2 = vHovW * uHovAmt;\n' +
        '\tfloat _a2 = max(_s2, _h2 * 0.7);\n' +
        '\ttotalEmissiveRadiance += uRimC * _fr * uRimS * mix(1.0, 0.25, uDim * (1.0 - _a2));\n' +
        '\ttotalEmissiveRadiance += uActive * _a2 * 0.42;');
  };
  bodyMat.customProgramCacheKey = function () { return 'myo_corps'; };

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

  /* ====================== CONSTRUCTION DU CORPS ======================
     Le corps n'est plus assemblé de primitives : c'est un maillage humain
     unique (13 380 sommets) chargé depuis mesh.js. Chaque sommet porte
     l'indice de son groupe musculaire et son amplitude de gonflement, ce
     qui permet de tout gérer en un seul objet et une seule passe de rendu. */
  setProgress(34, 'Décodage du maillage…');

  var MESH = window.MYO_MESH;
  if (!MESH) {
    loader.classList.add('done');
    el('hero').classList.add('gone');
    el('webgl-error').classList.add('show');
    el('webgl-error').querySelector('h2').textContent = 'Maillage introuvable';
    el('webgl-error').querySelector('p').textContent =
      'Le fichier mesh.js n\'a pas pu être chargé. Vérifie qu\'il se trouve bien à côté de index.html.';
    return;
  }

  var GROUPES = MESH.groups;              // indice numérique -> identifiant de muscle
  var IDX_GROUPE = {};
  GROUPES.forEach(function (g, i) { IDX_GROUPE[g] = i; });

  var body = new THREE.Group();
  scene.add(body);

  var bodyGeom, bodyMesh, groupeParSommet, positionsBrutes;

  (function construireCorps() {
    var bin = atob(MESH.data);
    var oct = new Uint8Array(bin.length);
    for (var b = 0; b < bin.length; b++) oct[b] = bin.charCodeAt(b);

    var nv = MESH.verts, nt = MESH.tris;
    var oPos = 0, oIdx = nv * 6, oGrp = oIdx + nt * 6, oSwl = oGrp + nv;

    var quant = new Uint16Array(oct.buffer, oPos, nv * 3);
    var indices = new Uint16Array(oct.buffer, oIdx, nt * 3);
    groupeParSommet = new Uint8Array(oct.buffer, oGrp, nv);
    var gonfle = new Uint8Array(oct.buffer, oSwl, nv);

    // déquantification : les positions sont stockées sur 16 bits par axe
    var pos = new Float32Array(nv * 3);
    var mn = MESH.min, sc = MESH.scale;
    for (var i = 0; i < nv; i++) {
      pos[i * 3]     = mn[0] + quant[i * 3]     * sc[0];
      pos[i * 3 + 1] = mn[1] + quant[i * 3 + 1] * sc[1];
      pos[i * 3 + 2] = mn[2] + quant[i * 3 + 2] * sc[2];
    }
    positionsBrutes = pos;

    // attributs propres à l'atlas : groupe et amplitude de gonflement
    var aGroupe = new Float32Array(nv);
    var aGonfle = new Float32Array(nv);
    for (var j = 0; j < nv; j++) {
      aGroupe[j] = groupeParSommet[j];
      aGonfle[j] = gonfle[j] / 255 * MESH.swell;
    }

    bodyGeom = new THREE.BufferGeometry();
    bodyGeom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    bodyGeom.setAttribute('aGroupe', new THREE.BufferAttribute(aGroupe, 1));
    bodyGeom.setAttribute('aGonfle', new THREE.BufferAttribute(aGonfle, 1));
    bodyGeom.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
    bodyGeom.computeVertexNormals();
    bodyGeom.computeBoundingSphere();

    bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
    bodyMesh.castShadow = !light;
    bodyMesh.receiveShadow = !light;
    body.add(bodyMesh);
  })();

  /* Un seul objet : la sélection se résout donc par sommet, pas par mesh. */
  var pickables = [bodyMesh];

  setProgress(58, 'Indexation des muscles…');

  /* ---------- ancres d'étiquettes et cadrage caméra ----------
     Chaque groupe est décrit par la boîte englobante de ses propres sommets :
     aucune distance n'est écrite en dur, le cadrage suit la géométrie. */
  var muscleState = {};
  MUSCLES.forEach(function (m) {
    muscleState[m.id] = {
      hover: false, sel: false,
      anchor: new THREE.Vector3(),
      normal: new THREE.Vector3(0, 0, 1),
      frame: { center: new THREE.Vector3(), radius: 1 }
    };
  });

  function computeFrames() {
    var nv = MESH.verts;
    var acc = {};
    GROUPES.forEach(function (g) {
      acc[g] = { n: 0, sx: 0, sy: 0, sz: 0,
                 x0: Infinity, y0: Infinity, z0: Infinity,
                 x1: -Infinity, y1: -Infinity, z1: -Infinity };
    });

    var p = bodyGeom.attributes.position.array;
    for (var i = 0; i < nv; i++) {
      var gi = groupeParSommet[i];
      if (gi === 255) continue;
      var a = acc[GROUPES[gi]];
      if (!a) continue;
      var x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
      a.n++; a.sx += x; a.sy += y; a.sz += z;
      if (x < a.x0) a.x0 = x; if (x > a.x1) a.x1 = x;
      if (y < a.y0) a.y0 = y; if (y > a.y1) a.y1 = y;
      if (z < a.z0) a.z0 = z; if (z > a.z1) a.z1 = z;
    }

    MUSCLES.forEach(function (m) {
      var a = acc[m.id], st = muscleState[m.id];
      if (!a || !a.n) return;
      st.anchor.set(a.sx / a.n, a.sy / a.n, a.sz / a.n);
      st.frame.center.set((a.x0 + a.x1) / 2, (a.y0 + a.y1) / 2, (a.z0 + a.z1) / 2);
      st.frame.radius = 0.5 * Math.max(a.x1 - a.x0, a.y1 - a.y0, a.z1 - a.z0);
      // normale sortante approximée depuis l'axe rachidien
      st.normal.set(st.anchor.x, 0, st.anchor.z);
      if (st.normal.lengthSq() < 0.01) st.normal.set(0, 0, m.region === 'dos' ? -1 : 1);
      st.normal.normalize();
    });
  }
  computeFrames();

  setProgress(72, 'Étalonnage des lumières…');

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
  var demoActif = false;
  var ray = new THREE.Raycaster();
  var hoverId = null, selectedId = null;
  var tooltip = el('tooltip');

  function raycastId() {
    if (!hasPointer) return null;
    ray.setFromCamera(pointerNDC, camera);
    var hits = ray.intersectObjects(pickables, false);
    if (!hits.length || !hits[0].face) return null;
    var gi = groupeParSommet[hits[0].face.a];
    return gi === 255 ? null : GROUPES[gi];
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

      var demoBtn = document.createElement('button');
      demoBtn.type = 'button';
      demoBtn.className = 'ex-demo';
      demoBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg> Démo';
      demoBtn.addEventListener('click', function () { ouvrirDemo(m, ex); });
      main.appendChild(demoBtn);

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

  /* ====================== BANDE-SON ======================
     Les navigateurs refusent le son sans geste de l'utilisateur : la lecture
     démarre donc sur le clic « Entrer dans le corps », qui en est un. Le
     lecteur YouTube reste visible — ses conditions interdisent de le masquer
     pour n'en conserver que l'audio. */
  var MUSIQUE_ID = 'M7xx0WejDV4';
  var MKEY = 'myoforge.musique';
  var musique = el('music');
  var musiqueActive = true;
  try {
    if (localStorage.getItem(MKEY) === 'off') musiqueActive = false;
  } catch (e) { /* mode privé */ }

  function memoriserMusique(v) {
    try { localStorage.setItem(MKEY, v ? 'on' : 'off'); } catch (e) {}
  }

  function demarrerMusique() {
    if (!musiqueActive) return;
    var cadre = el('music-frame');
    if (cadre.querySelector('iframe')) return;

    var f = document.createElement('iframe');
    f.title = 'Bande-son';
    f.allow = 'autoplay; encrypted-media; picture-in-picture';
    f.setAttribute('allowfullscreen', '');
    f.src = 'https://www.youtube-nocookie.com/embed/' + MUSIQUE_ID +
      '?autoplay=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1' +
      '&loop=1&playlist=' + MUSIQUE_ID;

    var charge = false;
    f.addEventListener('load', function () { charge = true; });
    cadre.textContent = '';
    cadre.appendChild(f);
    musique.hidden = false;
    musique.classList.add('playing');
    document.body.classList.add('music-on');

    // si le lecteur est bloqué (politique de sécurité de l'hébergeur),
    // on propose au moins le lien direct plutôt qu'un cadre noir
    setTimeout(function () {
      if (charge || !musiqueActive) return;
      cadre.textContent = '';
      var d = document.createElement('div');
      d.className = 'music-fallback';
      var a = document.createElement('a');
      a.href = 'https://youtu.be/' + MUSIQUE_ID;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'Ouvrir sur YouTube';
      d.appendChild(document.createTextNode('Lecteur bloqué ici. '));
      d.appendChild(a);
      cadre.appendChild(d);
      musique.classList.remove('playing');
    }, 4000);
  }

  function arreterMusique() {
    el('music-frame').textContent = '';      // détruire l'iframe coupe le son
    musique.hidden = true;
    musique.classList.remove('playing');
    document.body.classList.remove('music-on');
  }

  function basculerMusique(actif) {
    musiqueActive = actif;
    memoriserMusique(actif);
    el('btn-music').classList.toggle('on', actif);
    el('btn-music').setAttribute('aria-pressed', actif ? 'true' : 'false');
    if (actif) demarrerMusique(); else arreterMusique();
  }

  el('btn-music').addEventListener('click', function () { basculerMusique(!musiqueActive); });
  el('music-off').addEventListener('click', function () { basculerMusique(false); });
  el('music-fold').addEventListener('click', function () {
    var replie = musique.classList.toggle('fold');
    document.body.classList.toggle('music-fold', replie);
  });
  el('btn-music').classList.toggle('on', musiqueActive);

  /* ====================== DÉMONSTRATION VIDÉO ======================
     Aucun identifiant de vidéo n'est écrit en dur : tant qu'un exercice n'en
     porte pas, le bouton ouvre une recherche YouTube sur son nom. Un lien de
     recherche qui aboutit vaut mieux qu'un lecteur vide. */
  var demo = el('demo');
  var demoExo = null, demoMuscle = null;

  function rechercheYouTube(nom) {
    return 'https://www.youtube.com/results?search_query=' +
      encodeURIComponent(nom + ' technique musculation');
  }

  function ouvrirDemo(m, ex) {
    demoExo = ex; demoMuscle = m;
    el('demo-muscle').textContent = m.name;
    el('demo-name').textContent = ex.name;
    el('demo-cue').textContent = ex.cue;
    el('demo-yt').href = rechercheYouTube(ex.name);

    var chips = el('demo-chips');
    chips.textContent = '';
    [ex.sets, ex.level, ex.gear].forEach(function (t) {
      var sp = document.createElement('span');
      sp.textContent = t;
      chips.appendChild(sp);
    });

    var stage = el('demo-stage');
    stage.textContent = '';
    if (ex.video) {
      var f = document.createElement('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + ex.video + '?rel=0';
      f.allow = 'accelerometer; encrypted-media; gyroscope; picture-in-picture';
      f.allowFullscreen = true;
      f.title = 'Démonstration : ' + ex.name;
      stage.appendChild(f);
    } else {
      var d = document.createElement('div');
      d.className = 'demo-hint';
      d.innerHTML = '<b>Démonstration</b>Aucune vidéo n\'est encore rattachée à cet ' +
        'exercice. Le bouton ci-dessous ouvre une recherche YouTube sur son nom.';
      stage.appendChild(d);
    }

    el('demo-add').textContent = inSession(m.id, ex.name)
      ? 'Retirer de ma séance' : 'Ajouter à ma séance';

    demo.hidden = false;
    demoActif = true;
    el('demo-close').focus();
  }

  function fermerDemo() {
    demo.hidden = true;
    demoActif = false;
    el('demo-stage').textContent = '';   // coupe le lecteur
    demoExo = null;
  }

  el('demo-close').addEventListener('click', fermerDemo);
  el('demo-back').addEventListener('click', fermerDemo);
  el('demo-add').addEventListener('click', function () {
    if (!demoExo || !demoMuscle) return;
    if (inSession(demoMuscle.id, demoExo.name)) {
      removeExercise(demoMuscle.id, demoExo.name);
      this.textContent = 'Ajouter à ma séance';
    } else {
      addExercise(demoMuscle.id, demoExo);
      this.textContent = 'Retirer de ma séance';
    }
  });

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
    if (e.key === 'Escape' && demoActif) fermerDemo();
    else if (e.key === 'Escape' && selectedId) deselect();
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
    // le maillage est cuit au niveau « athletique » : le curseur retire ou
    // ajoute du volume par rapport a cet etat de reference
    uCorps.uBulk.value = (t - 0.4) * 2.2;

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

    // ---- surbrillance : deux indices de groupe et trois intensites suffisent
    var dimmed = !!selectedId;
    var idxSel = selectedId ? IDX_GROUPE[selectedId] : -1;
    var survol = hoverId || null;
    Object.keys(muscleState).forEach(function (id) {
      if (muscleState[id].hover) survol = id;
    });
    var idxHov = survol ? IDX_GROUPE[survol] : -1;

    if (idxSel >= 0) uCorps.uSel.value = idxSel;
    if (idxHov >= 0) uCorps.uHover.value = idxHov;

    var kk = k * 0.55;
    uCorps.uSelAmt.value += ((idxSel >= 0 ? 1 : 0) - uCorps.uSelAmt.value) * kk;
    uCorps.uHovAmt.value += ((idxHov >= 0 ? 1 : 0) - uCorps.uHovAmt.value) * kk;
    uCorps.uDim.value += ((dimmed ? 1 : 0) - uCorps.uDim.value) * kk;

    // pendant la demonstration, le muscle travaille : il se contracte
    var pulseT = demoActif ? 0.55 + 0.45 * Math.sin(clock.elapsedTime * 2.4) : 0;
    uCorps.uPulse.value += (pulseT * 0.5 - uCorps.uPulse.value) * k * 0.4;
    if (uCorps.uSelAmt.value < 0.01 && idxSel < 0) uCorps.uSel.value = -1;
    if (uCorps.uHovAmt.value < 0.01 && idxHov < 0) uCorps.uHover.value = -1;

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
    var br = 1 + 0.0045 * Math.sin(t * 0.9);
    body.scale.set(br, 1, br);

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
    demarrerMusique();   // ce clic est le geste qui autorise le son
    markActive();
    camT.dist = 32;
    camT.az = 0;
    camT.pol = 1.47;
  });
})();
