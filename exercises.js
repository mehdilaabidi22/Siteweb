/* =======================================================================
   MYOFORGE — Atlas musculaire 3D
   Base de données : groupes musculaires + exercices
   -----------------------------------------------------------------------
   Chaque groupe expose :
     id        identifiant interne (lie le mesh 3D à la fiche)
     name      nom courant (FR)
     latin     nom anatomique
     region    'face' | 'dos'  -> onglet de l'index
     color     teinte d'accent (surbrillance 3D + UI)
     role      fonction biomécanique en une ligne
     anatomy   description anatomique
     volume    volume hebdomadaire recommandé
     focus     angle de prise de vue { az, pol }
               az : azimut en radians (0 = face, PI = dos)
               pol: angle polaire (PI/2 = horizontale)
               La cible et la distance sont calculées depuis la géométrie
               du muscle (voir computeFrames dans anatomy.js) : les champs
               target/dist ci-dessous ne servent plus qu'à documenter
               l'intention de cadrage d'origine.
     exercises [{ name, sets, level, gear, cue }]
   ======================================================================= */

const MUSCLES = [
  /* ------------------------------------------------------------------ */
  {
    id: 'pectoraux',
    name: 'Pectoraux',
    latin: 'Pectoralis major & minor',
    region: 'face',
    color: '#ff4d6d',
    role: 'Adduction et flexion horizontale du bras',
    anatomy:
      "Éventail musculaire tendu du sternum à l'humérus, divisé en trois faisceaux : " +
      'claviculaire (haut), sternal (milieu) et abdominal (bas). Le faisceau haut ne se ' +
      "développe qu'en inclinaison positive, le faisceau bas en déclin ou aux dips.",
    volume: '12 à 20 séries / semaine',
    focus: { target: [0, 12.4, 0], az: 0.0, pol: 1.5, dist: 11 },
    exercises: [
      {
        name: 'Développé couché barre',
        sets: '4 × 6-8',
        level: 'Intermédiaire',
        gear: 'Barre + banc',
        cue: 'Omoplates serrées et basses, cage ouverte. Barre au niveau des mamelons, coudes à 45° du buste — jamais écartés à 90°.'
      },
      {
        name: 'Développé incliné haltères 30°',
        sets: '4 × 8-10',
        level: 'Intermédiaire',
        gear: 'Haltères + banc inclinable',
        cue: "Au-delà de 30° le deltoïde antérieur prend le relais. Descends jusqu'à l'étirement, rapproche les haltères sans les cogner."
      },
      {
        name: 'Dips lestés buste penché',
        sets: '3 × 8-12',
        level: 'Avancé',
        gear: 'Barres parallèles + ceinture',
        cue: 'Penche le buste à 30° vers l\'avant et laisse les coudes s\'évaser : buste droit = triceps, buste penché = pectoral bas.'
      },
      {
        name: 'Écarté poulie vis-à-vis',
        sets: '3 × 12-15',
        level: 'Débutant',
        gear: 'Poulies hautes',
        cue: 'Tension continue, le point fort est en fin de course : croise légèrement les mains devant le sternum et tiens 1 seconde.'
      },
      {
        name: 'Pompes lestées prise large',
        sets: '3 × échec',
        level: 'Débutant',
        gear: 'Poids du corps + gilet',
        cue: "Corps gainé en planche, descente lente 3 secondes. Finisher parfait en fin de séance pour saturer le muscle."
      }
    ]
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'deltoides',
    name: 'Deltoïdes',
    latin: 'Deltoideus',
    region: 'face',
    color: '#ffb703',
    role: 'Abduction et rotation de l\'épaule',
    anatomy:
      'Trois faisceaux distincts qui exigent trois angles de travail : antérieur (développés), ' +
      "latéral (élévations) et postérieur (tirages horizontaux). C'est le faisceau latéral qui " +
      'donne la largeur d\'épaule — la fameuse silhouette en V.',
    volume: '16 à 24 séries / semaine',
    focus: { target: [0, 13.7, 0], az: 0.35, pol: 1.42, dist: 11.5 },
    exercises: [
      {
        name: 'Développé militaire debout',
        sets: '4 × 5-8',
        level: 'Avancé',
        gear: 'Barre',
        cue: 'Fessiers et abdos verrouillés pour protéger les lombaires. Passe la tête sous la barre en fin de poussée.'
      },
      {
        name: 'Élévations latérales haltères',
        sets: '4 × 12-15',
        level: 'Débutant',
        gear: 'Haltères légers',
        cue: "Coudes légèrement fléchis, mène le mouvement par les coudes et non par les mains. Stoppe à l'horizontale."
      },
      {
        name: 'Élévations latérales à la poulie',
        sets: '3 × 15-20',
        level: 'Intermédiaire',
        gear: 'Poulie basse',
        cue: 'La poulie maintient la tension dès le premier degré, là où les haltères sont inefficaces. Bras opposé à la poulie.'
      },
      {
        name: 'Oiseau buste penché',
        sets: '4 × 12-15',
        level: 'Intermédiaire',
        gear: 'Haltères ou poulies',
        cue: 'Deltoïde postérieur, le plus négligé. Buste à 90°, pouces vers le sol, aucune impulsion du dos.'
      },
      {
        name: 'Développé Arnold assis',
        sets: '3 × 10-12',
        level: 'Intermédiaire',
        gear: 'Haltères + banc dossier',
        cue: 'La rotation externe pendant la poussée recrute les trois faisceaux dans une seule répétition.'
      }
    ]
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'biceps',
    name: 'Biceps',
    latin: 'Biceps brachii',
    region: 'face',
    color: '#00d9ff',
    role: 'Flexion du coude et supination',
    anatomy:
      'Deux chefs : le court (interne, donne l\'épaisseur) et le long (externe, donne le pic). ' +
      "Le long chef ne s'étire complètement que lorsque le bras part en arrière du corps — " +
      "d'où le curl incliné. Sous le biceps, le brachial pousse le muscle vers le haut.",
    volume: '10 à 16 séries / semaine',
    focus: { target: [3.3, 11.9, 0], az: 0.25, pol: 1.5, dist: 7.5 },
    exercises: [
      {
        name: 'Curl barre EZ debout',
        sets: '4 × 8-10',
        level: 'Débutant',
        gear: 'Barre EZ',
        cue: 'Coudes collés au buste, zéro balancier lombaire. Contrôle la descente sur 3 secondes, c\'est là que le muscle se construit.'
      },
      {
        name: 'Curl incliné haltères',
        sets: '3 × 10-12',
        level: 'Intermédiaire',
        gear: 'Haltères + banc 45°',
        cue: 'Bras pendants derrière le buste : étirement maximal du long chef, le meilleur exercice pour le pic.'
      },
      {
        name: 'Curl pupitre (Larry Scott)',
        sets: '3 × 10-12',
        level: 'Intermédiaire',
        gear: 'Pupitre + barre EZ',
        cue: "Bras verrouillés sur le pupitre, toute triche est impossible. Ne verrouille jamais complètement en bas."
      },
      {
        name: 'Curl marteau',
        sets: '3 × 12',
        level: 'Débutant',
        gear: 'Haltères',
        cue: 'Prise neutre : cible le brachial et le long supinateur, qui poussent le biceps vers le haut et élargissent le bras.'
      },
      {
        name: 'Traction supination',
        sets: '3 × 8-10',
        level: 'Avancé',
        gear: 'Barre de traction',
        cue: 'Le seul exercice de biceps réellement lourd. Mains serrées en supination, mène le menton au-dessus de la barre.'
      }
    ]
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'triceps',
    name: 'Triceps',
    latin: 'Triceps brachii',
    region: 'dos',
    color: '#7b61ff',
    role: 'Extension du coude',
    anatomy:
      "Deux tiers du volume du bras. Trois chefs : long (le plus gros, s'insère sur l'omoplate " +
      'et ne travaille pleinement que bras au-dessus de la tête), latéral (le fer à cheval visible) ' +
      'et médial (profond, sollicité en fin de course).',
    volume: '12 à 18 séries / semaine',
    focus: { target: [3.4, 11.9, 0], az: Math.PI - 0.3, pol: 1.5, dist: 7.5 },
    exercises: [
      {
        name: 'Développé couché prise serrée',
        sets: '4 × 6-8',
        level: 'Intermédiaire',
        gear: 'Barre + banc',
        cue: 'Mains à largeur d\'épaules — pas plus serré, cela détruit les poignets. Coudes rasant le buste.'
      },
      {
        name: 'Extension à la poulie haute (barre)',
        sets: '4 × 10-12',
        level: 'Débutant',
        gear: 'Poulie haute',
        cue: 'Coudes immobiles et collés, seuls les avant-bras bougent. Verrouille en bas 1 seconde.'
      },
      {
        name: 'Extension nuque à la poulie basse',
        sets: '3 × 12-15',
        level: 'Intermédiaire',
        gear: 'Poulie basse + corde',
        cue: 'Bras au-dessus de la tête : seule position qui étire le long chef, le plus volumineux des trois.'
      },
      {
        name: 'Barre au front',
        sets: '3 × 10-12',
        level: 'Intermédiaire',
        gear: 'Barre EZ + banc',
        cue: 'Descends la barre derrière le crâne plutôt que sur le front pour garder la tension sur le long chef.'
      },
      {
        name: 'Dips buste droit',
        sets: '3 × 8-12',
        level: 'Avancé',
        gear: 'Barres parallèles',
        cue: 'Buste parfaitement vertical, coudes serrés le long du corps : le transfert de charge va au triceps, plus au pectoral.'
      }
    ]
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'avantbras',
    name: 'Avant-bras',
    latin: 'Flexores & extensores carpi',
    region: 'face',
    color: '#4ade80',
    role: 'Flexion du poignet et force de préhension',
    anatomy:
      'Faisceau dense de fléchisseurs (face interne) et extenseurs (face externe). La force de grip ' +
      'est le maillon faible de tous les tirages lourds : un avant-bras faible plafonne le dos et le biceps.',
    volume: '6 à 10 séries / semaine',
    focus: { target: [4.2, 8.9, 0], az: 0.2, pol: 1.5, dist: 6.5 },
    exercises: [
      {
        name: 'Curl poignets barre',
        sets: '4 × 15-20',
        level: 'Débutant',
        gear: 'Barre + banc',
        cue: 'Avant-bras posés sur les cuisses, laisse la barre rouler jusqu\'au bout des doigts puis re-enroule.'
      },
      {
        name: 'Curl poignets inversé',
        sets: '3 × 15',
        level: 'Débutant',
        gear: 'Barre légère',
        cue: 'Cible les extenseurs. Charge très légère : ce sont de petits muscles, l\'ego n\'a pas sa place ici.'
      },
      {
        name: 'Farmer\'s walk',
        sets: '4 × 40 m',
        level: 'Intermédiaire',
        gear: 'Haltères lourds',
        cue: 'Marche gainée, épaules basses. Développe le grip, les trapèzes et tout le gainage en même temps.'
      },
      {
        name: 'Suspension à la barre',
        sets: '4 × max',
        level: 'Débutant',
        gear: 'Barre de traction',
        cue: 'Simple et brutal : tiens le plus longtemps possible. Décompresse aussi la colonne après les squats.'
      },
      {
        name: 'Rouleau à poignets',
        sets: '3 × 3 montées',
        level: 'Intermédiaire',
        gear: 'Roue à poignet',
        cue: 'Bras tendus à l\'horizontale, enroule puis déroule lentement. La brûlure arrive vite.'
      }
    ]
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'abdominaux',
    name: 'Abdominaux',
    latin: 'Rectus abdominis',
    region: 'face',
    color: '#f472b6',
    role: 'Flexion du tronc et stabilisation',
    anatomy:
      'Une seule sangle continue, cloisonnée par des intersections tendineuses qui dessinent les ' +
      '« tablettes » — leur nombre est génétique, jamais entraînable. Sous le grand droit, le ' +
      'transverse agit comme une ceinture interne et creuse la taille.',
    volume: '10 à 16 séries / semaine',
    focus: { target: [0, 10.4, 0], az: 0, pol: 1.52, dist: 9.5 },
    exercises: [
      {
        name: 'Crunch à la poulie haute',
        sets: '4 × 12-15',
        level: 'Intermédiaire',
        gear: 'Poulie haute + corde',
        cue: 'Enroule la colonne vertèbre par vertèbre, bassin fixe. Les abdos sont un muscle : charge-les progressivement.'
      },
      {
        name: 'Relevé de jambes suspendu',
        sets: '4 × 10-15',
        level: 'Avancé',
        gear: 'Barre de traction',
        cue: 'Bascule le bassin en arrière en fin de course, sinon ce sont les psoas qui travaillent, pas les abdos.'
      },
      {
        name: 'Roulette abdominale (ab wheel)',
        sets: '3 × 8-12',
        level: 'Avancé',
        gear: 'Ab wheel',
        cue: 'Dos légèrement arrondi, ne laisse jamais les lombaires se creuser. Progresse en amplitude, pas en vitesse.'
      },
      {
        name: 'Planche lestée',
        sets: '4 × 45-60 s',
        level: 'Débutant',
        gear: 'Poids du corps + disque',
        cue: 'Corps en ligne, fessiers contractés, respiration continue. Travail isométrique du transverse.'
      },
      {
        name: 'Crunch inversé au banc',
        sets: '3 × 15',
        level: 'Débutant',
        gear: 'Banc déclinable',
        cue: 'Cible la partie basse du grand droit. Décolle le bassin, ne tire jamais sur la nuque.'
      }
    ]
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'obliques',
    name: 'Obliques',
    latin: 'Obliquus externus & internus',
    region: 'face',
    color: '#fb923c',
    role: 'Rotation et inclinaison latérale du tronc',
    anatomy:
      'Deux couches croisées sur les flancs. Attention au volume : trop de travail lourd en latéral ' +
      'épaissit la taille et casse la silhouette en V. Privilégie l\'anti-rotation à la charge.',
    volume: '6 à 10 séries / semaine',
    focus: { target: [1.4, 10.2, 0], az: 0.6, pol: 1.52, dist: 8.5 },
    exercises: [
      {
        name: 'Pallof press',
        sets: '3 × 12 / côté',
        level: 'Débutant',
        gear: 'Poulie moyenne',
        cue: 'Exercice d\'anti-rotation : résiste à la traction sans tourner le buste. Renforce sans épaissir.'
      },
      {
        name: 'Russian twist lesté',
        sets: '3 × 20',
        level: 'Intermédiaire',
        gear: 'Disque ou médecine ball',
        cue: 'Rotation venant du tronc, pas des bras. Buste incliné à 45° en arrière, talons décollés.'
      },
      {
        name: 'Side plank + levée de hanche',
        sets: '3 × 15 / côté',
        level: 'Débutant',
        gear: 'Poids du corps',
        cue: 'Corps aligné vu de face, ne laisse pas la hanche tomber. Ajoute une pause en haut.'
      },
      {
        name: 'Woodchopper à la poulie',
        sets: '3 × 12 / côté',
        level: 'Intermédiaire',
        gear: 'Poulie haute',
        cue: 'Mouvement diagonal haut-bas, pivote sur le pied arrière. Très transférable aux sports de rotation.'
      },
      {
        name: 'Windshield wipers suspendu',
        sets: '3 × 8 / côté',
        level: 'Avancé',
        gear: 'Barre de traction',
        cue: 'Jambes tendues, balaye de gauche à droite sous contrôle absolu. Réservé aux gainages déjà solides.'
      }
    ]
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'trapezes',
    name: 'Trapèzes',
    latin: 'Trapezius',
    region: 'dos',
    color: '#38bdf8',
    role: 'Élévation et rétraction des omoplates',
    anatomy:
      'Grand losange couvrant la nuque et le haut du dos. Faisceau supérieur (haussements), moyen ' +
      '(rétraction) et inférieur (abaissement). Les faisceaux moyen et inférieur, souvent oubliés, ' +
      'corrigent la posture voûtée des gros bencheurs.',
    volume: '8 à 14 séries / semaine',
    focus: { target: [0, 14.0, 0], az: Math.PI, pol: 1.35, dist: 10 },
    exercises: [
      {
        name: 'Haussements d\'épaules barre',
        sets: '4 × 12-15',
        level: 'Débutant',
        gear: 'Barre lourde',
        cue: 'Monte droit vers les oreilles, aucune rotation d\'épaule. Pause 1 seconde en haut, c\'est tout l\'exercice.'
      },
      {
        name: 'Shrug haltères prise neutre',
        sets: '3 × 15',
        level: 'Débutant',
        gear: 'Haltères',
        cue: 'Amplitude plus grande qu\'à la barre car les bras sont libres le long du corps.'
      },
      {
        name: 'Rowing barre à la Yates',
        sets: '4 × 8-10',
        level: 'Intermédiaire',
        gear: 'Barre',
        cue: 'Buste à 30-45°, tire vers le nombril et serre les omoplates : trapèze moyen et rhomboïdes.'
      },
      {
        name: 'Face pull à la corde',
        sets: '4 × 15-20',
        level: 'Débutant',
        gear: 'Poulie haute + corde',
        cue: 'Le meilleur exercice postural qui existe. Tire vers le front, coudes hauts, rotation externe en fin de course.'
      },
      {
        name: 'Rack pull',
        sets: '4 × 5-6',
        level: 'Avancé',
        gear: 'Barre + rack',
        cue: 'Soulevé de terre partiel depuis les genoux : charges énormes, épaississement massif du haut du dos.'
      }
    ]
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'dorsaux',
    name: 'Grands dorsaux',
    latin: 'Latissimus dorsi',
    region: 'dos',
    color: '#22d3ee',
    role: 'Adduction et extension du bras',
    anatomy:
      'Le plus large muscle du corps : du bassin jusqu\'à l\'humérus, en éventail. C\'est lui qui crée ' +
      'la largeur du dos et le V. Les tirages verticaux construisent la largeur, les tirages ' +
      'horizontaux l\'épaisseur — il faut les deux.',
    volume: '14 à 22 séries / semaine',
    focus: { target: [0, 12.2, 0], az: Math.PI, pol: 1.48, dist: 12 },
    exercises: [
      {
        name: 'Traction pronation lestée',
        sets: '4 × 6-10',
        level: 'Avancé',
        gear: 'Barre + ceinture lestée',
        cue: 'Initie par une dépression scapulaire (épaules basses) avant de tirer, sinon les bras font tout le travail.'
      },
      {
        name: 'Tirage vertical poulie prise large',
        sets: '4 × 10-12',
        level: 'Débutant',
        gear: 'Poulie haute',
        cue: 'Barre vers le haut du sternum, buste très légèrement en arrière. Ne tire jamais derrière la nuque.'
      },
      {
        name: 'Rowing haltère unilatéral',
        sets: '4 × 10 / bras',
        level: 'Intermédiaire',
        gear: 'Haltère + banc',
        cue: 'Tire vers la hanche, pas vers l\'épaule. L\'unilatéral corrige les asymétries et allonge l\'amplitude.'
      },
      {
        name: 'Tirage horizontal poulie basse',
        sets: '3 × 12',
        level: 'Débutant',
        gear: 'Poulie basse',
        cue: 'Dos droit, aucun balancement du buste. Serre les omoplates 1 seconde à chaque répétition.'
      },
      {
        name: 'Pull-over à la poulie haute',
        sets: '3 × 12-15',
        level: 'Intermédiaire',
        gear: 'Poulie haute + barre droite',
        cue: 'Bras quasi tendus, mouvement d\'arc : isole le dorsal sans que le biceps intervienne.'
      }
    ]
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'lombaires',
    name: 'Lombaires',
    latin: 'Erector spinae',
    region: 'dos',
    color: '#facc15',
    role: 'Extension et maintien du rachis',
    anatomy:
      'Colonnes musculaires longeant la colonne vertébrale. Elles ne « gonflent » pas : elles ' +
      'protègent. Des lombaires solides sont la condition d\'un squat et d\'un soulevé de terre lourds ' +
      'sans blessure.',
    volume: '4 à 8 séries directes / semaine',
    focus: { target: [0, 10.0, 0], az: Math.PI, pol: 1.55, dist: 9 },
    exercises: [
      {
        name: 'Soulevé de terre conventionnel',
        sets: '4 × 5',
        level: 'Avancé',
        gear: 'Barre + disques',
        cue: 'Dos neutre du début à la fin, barre collée aux tibias. Pousse le sol, ne tire pas la barre.'
      },
      {
        name: 'Extension au banc à lombaires',
        sets: '3 × 12-15',
        level: 'Débutant',
        gear: 'Banc à lombaires',
        cue: 'Monte jusqu\'à l\'alignement du corps, jamais en hyperextension. Lent et contrôlé.'
      },
      {
        name: 'Good morning barre',
        sets: '3 × 10',
        level: 'Intermédiaire',
        gear: 'Barre légère',
        cue: 'Charge modeste obligatoire. Charnière de hanche, genoux à peine fléchis, dos verrouillé plat.'
      },
      {
        name: 'Bird dog',
        sets: '3 × 10 / côté',
        level: 'Débutant',
        gear: 'Poids du corps',
        cue: 'Bras et jambe opposés tendus, bassin stable. Rééducation et prévention, à faire en échauffement.'
      },
      {
        name: 'Reverse hyperextension',
        sets: '3 × 15',
        level: 'Intermédiaire',
        gear: 'Banc incliné',
        cue: 'Buste fixe, ce sont les jambes qui montent : décompresse la colonne au lieu de la charger.'
      }
    ]
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'fessiers',
    name: 'Fessiers',
    latin: 'Gluteus maximus, medius & minimus',
    region: 'dos',
    color: '#a78bfa',
    role: 'Extension de hanche et stabilisation du bassin',
    anatomy:
      'Le muscle le plus puissant du corps humain. Le grand fessier assure l\'extension de hanche, ' +
      'le moyen et le petit stabilisent le bassin en unipodal. Des fessiers endormis = lombaires ' +
      'et genoux qui compensent.',
    volume: '10 à 18 séries / semaine',
    focus: { target: [0, 8.2, 0], az: Math.PI, pol: 1.6, dist: 9 },
    exercises: [
      {
        name: 'Hip thrust barre',
        sets: '4 × 8-12',
        level: 'Intermédiaire',
        gear: 'Barre + banc',
        cue: 'L\'exercice roi du fessier. Menton rentré, côtes basses, verrouille 2 secondes en haut.'
      },
      {
        name: 'Soulevé de terre roumain',
        sets: '4 × 8-10',
        level: 'Intermédiaire',
        gear: 'Barre ou haltères',
        cue: 'Recule les hanches, jambes quasi tendues. Descends jusqu\'à l\'étirement, pas plus bas.'
      },
      {
        name: 'Fentes bulgares',
        sets: '3 × 10 / jambe',
        level: 'Intermédiaire',
        gear: 'Haltères + banc',
        cue: 'Buste légèrement penché pour cibler le fessier plutôt que le quadriceps. Pied avant loin du banc.'
      },
      {
        name: 'Abduction hanche à la poulie',
        sets: '3 × 15 / côté',
        level: 'Débutant',
        gear: 'Poulie basse + sangle',
        cue: 'Cible le moyen fessier, responsable de la largeur de hanche et de la stabilité du genou.'
      },
      {
        name: 'Step-up sur banc haut',
        sets: '3 × 10 / jambe',
        level: 'Débutant',
        gear: 'Banc + haltères',
        cue: 'Monte sans pousser avec la jambe restée au sol. Descente lente et contrôlée.'
      }
    ]
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'quadriceps',
    name: 'Quadriceps',
    latin: 'Quadriceps femoris',
    region: 'face',
    color: '#34d399',
    role: 'Extension du genou',
    anatomy:
      'Quatre chefs : droit fémoral (central, croise la hanche), vaste latéral (extérieur), vaste ' +
      'médial (la « goutte d\'eau » au-dessus du genou) et vaste intermédiaire (profond). La ' +
      'profondeur de squat détermine le recrutement du vaste médial.',
    volume: '12 à 20 séries / semaine',
    focus: { target: [0, 6.4, 0], az: 0, pol: 1.55, dist: 10.5 },
    exercises: [
      {
        name: 'Squat barre dos',
        sets: '5 × 5',
        level: 'Avancé',
        gear: 'Barre + rack',
        cue: 'Descends sous la parallèle, genoux dans l\'axe des pieds. Le buste reste aussi vertical que ta mobilité le permet.'
      },
      {
        name: 'Presse à cuisses',
        sets: '4 × 10-12',
        level: 'Débutant',
        gear: 'Presse inclinée',
        cue: 'Ne verrouille jamais les genoux en haut. Pieds bas sur le plateau pour accentuer le quadriceps.'
      },
      {
        name: 'Squat bulgare haltères',
        sets: '3 × 10 / jambe',
        level: 'Intermédiaire',
        gear: 'Haltères + banc',
        cue: 'Buste vertical ici (contrairement à la version fessier) : le genou avance, le quadriceps encaisse.'
      },
      {
        name: 'Leg extension',
        sets: '3 × 12-15',
        level: 'Débutant',
        gear: 'Machine',
        cue: 'Isolation pure, idéale en pré-fatigue ou en finisher. Pause 1 seconde jambes tendues.'
      },
      {
        name: 'Hack squat',
        sets: '4 × 8-10',
        level: 'Intermédiaire',
        gear: 'Machine hack',
        cue: 'Dos soutenu, amplitude complète : toute la charge part dans les cuisses, rien dans les lombaires.'
      }
    ]
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'ischios',
    name: 'Ischio-jambiers',
    latin: 'Biceps femoris, semitendinosus',
    region: 'dos',
    color: '#f87171',
    role: 'Flexion du genou et extension de hanche',
    anatomy:
      'Trois muscles à l\'arrière de la cuisse, bi-articulaires : ils fléchissent le genou ET étendent ' +
      'la hanche. Il faut donc les deux familles d\'exercices — flexions (leg curl) et charnières ' +
      '(roumain). Le groupe le plus souvent blessé en sprint.',
    volume: '10 à 16 séries / semaine',
    focus: { target: [0, 6.4, 0], az: Math.PI, pol: 1.55, dist: 10.5 },
    exercises: [
      {
        name: 'Soulevé de terre jambes tendues',
        sets: '4 × 8-10',
        level: 'Intermédiaire',
        gear: 'Barre',
        cue: 'Charnière de hanche pure, dos plat. Tu dois sentir l\'étirement à l\'arrière de la cuisse, pas dans le bas du dos.'
      },
      {
        name: 'Leg curl allongé',
        sets: '4 × 10-12',
        level: 'Débutant',
        gear: 'Machine',
        cue: 'Bassin collé au banc. Pointe les orteils vers les tibias pour augmenter le recrutement.'
      },
      {
        name: 'Leg curl assis',
        sets: '3 × 12-15',
        level: 'Débutant',
        gear: 'Machine',
        cue: 'Hanche fléchie = ischios pré-étirés : cette variante est supérieure pour l\'hypertrophie du long chef.'
      },
      {
        name: 'Nordic hamstring curl',
        sets: '3 × 6-8',
        level: 'Avancé',
        gear: 'Partenaire ou sangle',
        cue: 'Excentrique brutal, la meilleure prévention des claquages. Descends aussi lentement que possible.'
      },
      {
        name: 'Good morning',
        sets: '3 × 10-12',
        level: 'Intermédiaire',
        gear: 'Barre légère',
        cue: 'Travaille ischios et lombaires ensemble. Reste léger et privilégie la technique à la charge.'
      }
    ]
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'mollets',
    name: 'Mollets',
    latin: 'Gastrocnemius & soleus',
    region: 'dos',
    color: '#c084fc',
    role: 'Extension de la cheville',
    anatomy:
      'Deux muscles superposés : le gastrocnémien (les deux « bosses » visibles, travaille jambe ' +
      'tendue) et le soléaire en dessous (travaille jambe fléchie, assise). Fibres très endurantes : ' +
      'il faut du volume, de l\'amplitude et des temps sous tension longs.',
    volume: '10 à 16 séries / semaine',
    focus: { target: [0, 2.6, 0], az: Math.PI, pol: 1.6, dist: 8 },
    exercises: [
      {
        name: 'Extension mollets debout',
        sets: '4 × 12-15',
        level: 'Débutant',
        gear: 'Machine ou marche',
        cue: 'Amplitude totale : talon le plus bas possible, pause 2 secondes en bas, montée explosive sur la pointe.'
      },
      {
        name: 'Extension mollets assis',
        sets: '4 × 15-20',
        level: 'Débutant',
        gear: 'Machine assise',
        cue: 'Genou fléchi : cible le soléaire, qui pousse le gastrocnémien vers l\'extérieur et élargit le mollet.'
      },
      {
        name: 'Mollets à la presse',
        sets: '3 × 15',
        level: 'Intermédiaire',
        gear: 'Presse à cuisses',
        cue: 'Pointes des pieds sur le bas du plateau, genoux quasi tendus. Permet des charges très lourdes.'
      },
      {
        name: 'Donkey calf raise',
        sets: '3 × 15',
        level: 'Intermédiaire',
        gear: 'Machine ou partenaire',
        cue: 'Buste penché : le gastrocnémien est pré-étiré, c\'était l\'exercice fétiche d\'Arnold.'
      },
      {
        name: 'Marche sur pointes lestée',
        sets: '3 × 40 m',
        level: 'Débutant',
        gear: 'Haltères',
        cue: 'Finisher métabolique. Reste haut sur la pointe, ne laisse jamais le talon toucher le sol.'
      }
    ]
  }
];

/* Index rapide id -> objet muscle */
const MUSCLE_BY_ID = MUSCLES.reduce(function (acc, m) {
  acc[m.id] = m;
  return acc;
}, {});
