<template>
  <div class="login-page" data-testid="login-page">

    <!-- Fondo ilustrado veterinario -->
    <svg class="vet-bg" viewBox="0 0 1440 900" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <defs>
        <!-- Paleta principal -->
        <linearGradient id="dogBody"  x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#2CBFA0"/><stop offset="100%" stop-color="#1A8870"/></linearGradient>
        <linearGradient id="catBody"  x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#34C9A8"/><stop offset="100%" stop-color="#1A9E7F"/></linearGradient>
        <linearGradient id="rabbitBd" x1="0%" y1="0%" x2="0%"   y2="100%"><stop offset="0%" stop-color="#7DE8CF"/><stop offset="100%" stop-color="#4DCFB0"/></linearGradient>
        <linearGradient id="birdBd"   x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FFD166"/><stop offset="100%" stop-color="#FFB703"/></linearGradient>
        <linearGradient id="fishBd"   x1="0%" y1="0%" x2="100%" y2="0%"  ><stop offset="0%" stop-color="#90D5F0"/><stop offset="100%" stop-color="#4BB8E0"/></linearGradient>
        <linearGradient id="stetho"   x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#1A9E7F"/><stop offset="100%" stop-color="#0F7A60"/></linearGradient>
        <linearGradient id="syringeG" x1="0%" y1="0%" x2="0%"   y2="100%"><stop offset="0%" stop-color="#06D6A0"/><stop offset="100%" stop-color="#04A880"/></linearGradient>
        <linearGradient id="boneG"    x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FFD580"/><stop offset="100%" stop-color="#FFB703"/></linearGradient>
        <radialGradient id="eyeShine" cx="30%" cy="30%"><stop offset="0%" stop-color="#fff" stop-opacity="0.9"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></radialGradient>
      </defs>

      <!-- ══════════════════════════════════════════
           PERRO (golden retriever sentado) — derecha
      ══════════════════════════════════════════ -->
      <g transform="translate(1180,480) scale(1.5)" opacity="0.40">
        <!-- cola -->
        <path d="M-50 0 Q-85 -45 -65 -80 Q-50 -105 -30 -90" stroke="#1A8870" stroke-width="12" stroke-linecap="round" fill="none"/>
        <!-- cuerpo -->
        <path d="M-40 10 Q-55 -60 -30 -90 Q-5 -115 25 -95 Q55 -75 50 -20 Q45 30 10 45 Q-20 55 -40 10Z" fill="url(#dogBody)"/>
        <!-- panza más clara -->
        <ellipse cx="10" cy="-20" rx="22" ry="35" fill="#3DD4B2" opacity="0.4"/>
        <!-- patas traseras -->
        <path d="M-35 10 Q-45 30 -40 55 Q-38 70 -28 72 Q-18 74 -18 55 Q-15 35 -5 25" fill="#1A8870"/>
        <path d="M10 40 Q8 62 14 75 Q18 82 28 80 Q38 78 36 62 Q34 48 25 42" fill="#1A8870"/>
        <!-- patas delanteras -->
        <path d="M-30 -80 Q-42 -55 -44 -25 Q-44 -5 -36 2 Q-26 8 -20 -8 Q-16 -28 -10 -50" fill="#1A9E7F"/>
        <path d="M28 -88 Q40 -64 42 -32 Q42 -12 32 -4 Q22 2 16 -14 Q12 -34 18 -58" fill="#1A9E7F"/>
        <!-- dedos pata -->
        <ellipse cx="-38" cy="72" rx="8" ry="4"  fill="#0F7A60"/>
        <ellipse cx="-26" cy="74" rx="8" ry="4"  fill="#0F7A60"/>
        <ellipse cx="20"  cy="80" rx="8" ry="4"  fill="#0F7A60"/>
        <ellipse cx="32"  cy="78" rx="8" ry="4"  fill="#0F7A60"/>
        <!-- cuello -->
        <path d="M-15 -85 Q-5 -105 15 -100 Q30 -95 28 -82 Q15 -70 -5 -72 Z" fill="#2CBFA0"/>
        <!-- cabeza -->
        <ellipse cx="6" cy="-125" rx="38" ry="34" fill="url(#dogBody)"/>
        <!-- orejas largas y caídas -->
        <path d="M-28 -148 Q-52 -145 -55 -115 Q-56 -90 -38 -92 Q-20 -94 -18 -118 Z" fill="#1A8870"/>
        <path d="M-24 -146 Q-46 -143 -48 -116 Q-48 -96 -34 -98" fill="#157A62" opacity="0.5"/>
        <path d="M38 -148 Q62 -145 65 -115 Q66 -90 48 -92 Q30 -94 28 -118 Z" fill="#1A8870"/>
        <path d="M34 -146 Q56 -143 58 -116 Q58 -96 44 -98" fill="#157A62" opacity="0.5"/>
        <!-- hocico -->
        <ellipse cx="12" cy="-108" rx="20" ry="14" fill="#2CBFA0"/>
        <ellipse cx="12" cy="-108" rx="14" ry="9"  fill="#3DD4B2" opacity="0.5"/>
        <!-- nariz -->
        <path d="M5 -116 Q12 -122 19 -116 Q22 -112 12 -108 Q3 -112 5 -116Z" fill="#0A5C48"/>
        <!-- fosas nasales -->
        <ellipse cx="8"  cy="-114" rx="3" ry="2" fill="#073D30" opacity="0.7"/>
        <ellipse cx="17" cy="-114" rx="3" ry="2" fill="#073D30" opacity="0.7"/>
        <!-- boca -->
        <path d="M5 -106 Q12 -100 19 -106" stroke="#0A5C48" stroke-width="2" fill="none" stroke-linecap="round"/>
        <!-- lengua -->
        <path d="M8 -105 Q12 -96 16 -105" fill="#EF8080" opacity="0.85"/>
        <!-- ojo izquierdo -->
        <ellipse cx="-12" cy="-130" rx="10" ry="10" fill="#073D30"/>
        <ellipse cx="-12" cy="-130" rx="8"  ry="8"  fill="#1A5C48"/>
        <circle  cx="-12" cy="-130" r="5"         fill="#0A3028"/>
        <ellipse cx="-12" cy="-130" rx="8" ry="8"  fill="url(#eyeShine)" opacity="0.4"/>
        <circle  cx="-9"  cy="-134" r="2.5"        fill="white" opacity="0.9"/>
        <!-- ojo derecho -->
        <ellipse cx="26"  cy="-130" rx="10" ry="10" fill="#073D30"/>
        <ellipse cx="26"  cy="-130" rx="8"  ry="8"  fill="#1A5C48"/>
        <circle  cx="26"  cy="-130" r="5"           fill="#0A3028"/>
        <circle  cx="29"  cy="-134" r="2.5"          fill="white" opacity="0.9"/>
        <!-- collar -->
        <path d="M-18 -100 Q6 -93 30 -100" stroke="#FFB703" stroke-width="5" stroke-linecap="round" fill="none"/>
        <circle cx="6" cy="-92" r="5" fill="#FFD580"/>
      </g>

      <!-- ══════════════════════════════════════════
           GATO (sentado, elegante) — izquierda
      ══════════════════════════════════════════ -->
      <g transform="translate(130,500) scale(1.4)" opacity="0.40">
        <!-- cola enroscada -->
        <path d="M20 60 Q65 45 60 0 Q56 -30 35 -25 Q20 -22 22 -5" stroke="#157A62" stroke-width="11" stroke-linecap="round" fill="none"/>
        <path d="M20 60 Q65 45 60 0 Q56 -30 35 -25 Q20 -22 22 -5" stroke="#1A9E7F" stroke-width="7" stroke-linecap="round" fill="none"/>
        <!-- cuerpo -->
        <path d="M-30 55 Q-45 -5 -30 -50 Q-15 -85 10 -80 Q40 -78 48 -40 Q58 0 42 50 Q30 75 0 78 Q-20 78 -30 55Z" fill="url(#catBody)"/>
        <!-- panza -->
        <ellipse cx="10" cy="0" rx="20" ry="38" fill="#4DCFB0" opacity="0.35"/>
        <!-- patas delanteras -->
        <path d="M-22 30 Q-28 55 -26 75 Q-24 84 -14 84 Q-4 84 -4 72 Q-4 58 2 42" fill="#1A8870"/>
        <path d="M18 35 Q22 60 20 76 Q18 85 28 85 Q38 85 38 73 Q37 59 30 44" fill="#1A8870"/>
        <!-- dedos -->
        <ellipse cx="-18" cy="85" rx="7" ry="3.5" fill="#0F7A60"/>
        <ellipse cx="-8"  cy="85" rx="7" ry="3.5" fill="#0F7A60"/>
        <ellipse cx="24"  cy="86" rx="7" ry="3.5" fill="#0F7A60"/>
        <ellipse cx="34"  cy="86" rx="7" ry="3.5" fill="#0F7A60"/>
        <!-- cabeza -->
        <circle cx="5" cy="-105" r="40" fill="url(#catBody)"/>
        <!-- mejillas mullidas -->
        <ellipse cx="-28" cy="-95" rx="14" ry="12" fill="#2CBFA0" opacity="0.6"/>
        <ellipse cx="38"  cy="-95" rx="14" ry="12" fill="#2CBFA0" opacity="0.6"/>
        <!-- orejas izq -->
        <polygon points="-30,-140 -48,-180 -8,-148" fill="#1A9E7F"/>
        <polygon points="-28,-142 -44,-172 -12,-150" fill="#4DCFB0" opacity="0.5"/>
        <!-- orejas der -->
        <polygon points="40,-140 58,-180 18,-148"  fill="#1A9E7F"/>
        <polygon points="38,-142 54,-172 22,-150"  fill="#4DCFB0" opacity="0.5"/>
        <!-- frente rayitas -->
        <path d="M-5 -140 Q5 -150 15 -140" stroke="#157A62" stroke-width="2" fill="none" opacity="0.5"/>
        <path d="M-8 -132 Q5 -140 18 -132" stroke="#157A62" stroke-width="1.5" fill="none" opacity="0.4"/>
        <!-- ojo izquierdo (almendra) -->
        <path d="M-20 -110 Q-12 -122 -4 -110 Q-12 -100 -20 -110Z" fill="#073D30"/>
        <path d="M-18 -110 Q-12 -120 -6  -110 Q-12 -102 -18 -110Z" fill="#1A4A3A"/>
        <ellipse cx="-12" cy="-111" rx="4" ry="6" fill="#061A14"/>
        <circle  cx="-10" cy="-115" r="2.5" fill="white" opacity="0.95"/>
        <!-- ojo derecho -->
        <path d="M14 -110 Q22 -122 30 -110 Q22 -100 14 -110Z" fill="#073D30"/>
        <path d="M16 -110 Q22 -120 28 -110 Q22 -102 16 -110Z" fill="#1A4A3A"/>
        <ellipse cx="22" cy="-111" rx="4" ry="6" fill="#061A14"/>
        <circle  cx="24" cy="-115" r="2.5" fill="white" opacity="0.95"/>
        <!-- nariz -->
        <path d="M1 -97 Q5 -102 9 -97 Q5 -93 1 -97Z" fill="#0A5C48"/>
        <!-- boca -->
        <path d="M2 -93 Q5 -89 8 -93" stroke="#0A5C48" stroke-width="1.5" fill="none"/>
        <path d="M5 -93 Q5 -88 2 -86" stroke="#0A5C48" stroke-width="1.5" fill="none"/>
        <path d="M5 -93 Q5 -88 8 -86" stroke="#0A5C48" stroke-width="1.5" fill="none"/>
        <!-- bigotes der -->
        <line x1="10"  y1="-98" x2="50"  y2="-95" stroke="#0F7A60" stroke-width="1.5" opacity="0.7"/>
        <line x1="10"  y1="-96" x2="50"  y2="-100" stroke="#0F7A60" stroke-width="1.5" opacity="0.7"/>
        <line x1="10"  y1="-94" x2="50"  y2="-105" stroke="#0F7A60" stroke-width="1.5" opacity="0.7"/>
        <!-- bigotes izq -->
        <line x1="0"  y1="-98" x2="-40" y2="-95" stroke="#0F7A60" stroke-width="1.5" opacity="0.7"/>
        <line x1="0"  y1="-96" x2="-40" y2="-100" stroke="#0F7A60" stroke-width="1.5" opacity="0.7"/>
        <line x1="0"  y1="-94" x2="-40" y2="-105" stroke="#0F7A60" stroke-width="1.5" opacity="0.7"/>
        <!-- collar con cascabel -->
        <path d="M-28 -75 Q5 -67 38 -75" stroke="#FFB703" stroke-width="5" stroke-linecap="round" fill="none"/>
        <circle cx="5" cy="-66" r="6" fill="#FFD580"/>
        <line x1="5" y1="-66" x2="5" y2="-60" stroke="#FFB703" stroke-width="1.5"/>
      </g>

      <!-- ══════════════════════════════════════════
           CONEJO — arriba derecha
      ══════════════════════════════════════════ -->
      <g transform="translate(1330,80) scale(1.15)" opacity="0.38">
        <!-- cuerpo -->
        <ellipse cx="0" cy="40" rx="32" ry="40" fill="url(#rabbitBd)"/>
        <!-- panza -->
        <ellipse cx="0" cy="45" rx="18" ry="25" fill="#A8F0E0" opacity="0.5"/>
        <!-- orejas largas -->
        <ellipse cx="-14" cy="-55" rx="11" ry="45" fill="#7DE8CF" transform="rotate(-8 -14 -55)"/>
        <ellipse cx="-14" cy="-55" rx="6"  ry="38" fill="#B8F5E8" opacity="0.6" transform="rotate(-8 -14 -55)"/>
        <ellipse cx="14"  cy="-55" rx="11" ry="45" fill="#7DE8CF" transform="rotate(8 14 -55)"/>
        <ellipse cx="14"  cy="-55" rx="6"  ry="38" fill="#B8F5E8" opacity="0.6" transform="rotate(8 14 -55)"/>
        <!-- cabeza -->
        <circle cx="0" cy="-5" r="30" fill="url(#rabbitBd)"/>
        <!-- mejillas -->
        <ellipse cx="-18" cy="5" rx="10" ry="8" fill="#9EE8D4" opacity="0.5"/>
        <ellipse cx="18"  cy="5" rx="10" ry="8" fill="#9EE8D4" opacity="0.5"/>
        <!-- ojos -->
        <circle cx="-12" cy="-10" r="8" fill="#1A3D30"/>
        <circle cx="-12" cy="-10" r="5" fill="#0A2820"/>
        <circle cx="-10" cy="-13" r="2.5" fill="white"/>
        <circle cx="12"  cy="-10" r="8" fill="#1A3D30"/>
        <circle cx="12"  cy="-10" r="5" fill="#0A2820"/>
        <circle cx="14"  cy="-13" r="2.5" fill="white"/>
        <!-- nariz -->
        <path d="M-3 2 Q0 -1 3 2 Q0 5 -3 2Z" fill="#4DCFB0"/>
        <!-- boca -->
        <path d="M-4 5 Q0 9 4 5"  stroke="#3ABFA0" stroke-width="1.5" fill="none"/>
        <path d="M0 5 Q0 10 -3 12" stroke="#3ABFA0" stroke-width="1.5" fill="none"/>
        <path d="M0 5 Q0 10 3 12"  stroke="#3ABFA0" stroke-width="1.5" fill="none"/>
        <!-- patitas -->
        <ellipse cx="-20" cy="75" rx="14" ry="8"  fill="#5DD4B8"/>
        <ellipse cx="20"  cy="75" rx="14" ry="8"  fill="#5DD4B8"/>
        <!-- cola esponjosa -->
        <circle cx="30" cy="50" r="10" fill="#B8F5E8" opacity="0.8"/>
        <circle cx="32" cy="48" r="7"  fill="white" opacity="0.6"/>
      </g>

      <!-- ══════════════════════════════════════════
           PÁJARO (loro pequeño) — arriba centro-izq
      ══════════════════════════════════════════ -->
      <g transform="translate(310,90) scale(1.1)" opacity="0.38">
        <!-- rama -->
        <path d="M-50 60 Q0 50 50 60" stroke="#1A8870" stroke-width="6" stroke-linecap="round" fill="none"/>
        <!-- cola -->
        <path d="M-5 35 Q-20 60 -15 80 Q-10 90 0 85 Q5 80 0 65 Q2 50 8 40" fill="#1A8870"/>
        <path d="M5  38 Q15 60 18 78 Q20 88 12 86 Q6 82 8 68 Q6 52 2 40" fill="#157A62"/>
        <!-- cuerpo -->
        <path d="M-20 0 Q-25 25 -10 40 Q5 50 20 38 Q35 25 28 0 Q20 -22 5 -24 Q-10 -24 -20 0Z" fill="url(#birdBd)"/>
        <!-- ala izquierda -->
        <path d="M-20 5 Q-45 0 -50 20 Q-48 38 -28 32 Q-15 28 -10 18Z" fill="#FFB703"/>
        <path d="M-20 5 Q-42 2 -46 18 Q-44 32 -28 28" fill="#FFD166" opacity="0.5"/>
        <!-- ala derecha -->
        <path d="M28 5 Q50 0 52 20 Q50 38 30 32 Q16 28 12 18Z" fill="#FFB703"/>
        <path d="M28 5 Q48 2 50 18 Q48 32 30 28" fill="#FFD166" opacity="0.5"/>
        <!-- cuello -->
        <ellipse cx="4" cy="-20" rx="16" ry="12" fill="#FFD166"/>
        <!-- cabeza -->
        <circle cx="4" cy="-42" r="22" fill="#06D6A0"/>
        <!-- cresta -->
        <path d="M-2 -62 Q0 -80 5 -76 Q8 -70 10 -76 Q14 -85 16 -64" fill="#FFB703"/>
        <!-- pico -->
        <path d="M18 -42 Q30 -38 28 -30 Q20 -28 14 -35Z" fill="#FF8B6A"/>
        <path d="M18 -42 Q30 -40 28 -34" stroke="#E06040" stroke-width="1" fill="none"/>
        <!-- ojo -->
        <circle cx="-2" cy="-46" r="9" fill="#073D30"/>
        <circle cx="-2" cy="-46" r="6" fill="#0A2820"/>
        <circle cx="0"  cy="-49" r="2.5" fill="white"/>
        <!-- anillo ojo -->
        <circle cx="-2" cy="-46" r="9" fill="none" stroke="#FFD166" stroke-width="2"/>
        <!-- garras -->
        <path d="M-12 56 Q-18 68 -22 72" stroke="#1A8870" stroke-width="3" stroke-linecap="round" fill="none"/>
        <path d="M-10 57 Q-10 70 -10 76" stroke="#1A8870" stroke-width="3" stroke-linecap="round" fill="none"/>
        <path d="M-8  56 Q-2  68  2  72" stroke="#1A8870" stroke-width="3" stroke-linecap="round" fill="none"/>
        <path d="M8   56 Q14  68 18  72" stroke="#1A8870" stroke-width="3" stroke-linecap="round" fill="none"/>
        <path d="M10  57 Q10  70 10  76" stroke="#1A8870" stroke-width="3" stroke-linecap="round" fill="none"/>
        <path d="M12  56 Q18  68 22  72" stroke="#1A8870" stroke-width="3" stroke-linecap="round" fill="none"/>
      </g>

      <!-- ══════════════════════════════════════════
           PEZ — abajo centro
      ══════════════════════════════════════════ -->
      <g transform="translate(720,840) scale(1.3)" opacity="0.35">
        <!-- cola -->
        <path d="M-50 0 Q-70 -22 -65 0 Q-70 22 -50 0Z" fill="#4BB8E0"/>
        <path d="M-50 0 Q-66 -18 -62 0 Q-66 18 -50 0Z" fill="#90D5F0" opacity="0.6"/>
        <!-- cuerpo -->
        <path d="M-45 0 Q-30 -28 0 -28 Q35 -28 50 0 Q35 28 0 28 Q-30 28 -45 0Z" fill="url(#fishBd)"/>
        <!-- escamas (arcos) -->
        <path d="M-10 -22 Q5 -30 20 -22"   stroke="white" stroke-width="1.5" fill="none" opacity="0.4"/>
        <path d="M-25 -14 Q-8 -24 10 -14"  stroke="white" stroke-width="1.5" fill="none" opacity="0.4"/>
        <path d="M-30  0  Q-10 -12 12  0"  stroke="white" stroke-width="1.5" fill="none" opacity="0.4"/>
        <path d="M-25 14  Q-8  24 10  14"  stroke="white" stroke-width="1.5" fill="none" opacity="0.4"/>
        <path d="M-10 22  Q5  30 20  22"   stroke="white" stroke-width="1.5" fill="none" opacity="0.4"/>
        <!-- aleta dorsal -->
        <path d="M-10 -28 Q0 -50 20 -28" fill="#4BB8E0" opacity="0.8"/>
        <!-- aleta pectoral -->
        <path d="M10 5 Q25 18 20 28" fill="#4BB8E0" opacity="0.7"/>
        <!-- aleta ventral -->
        <path d="M0 22 Q10 36 0 40 Q-8 36 0 22Z" fill="#4BB8E0" opacity="0.7"/>
        <!-- ojo -->
        <circle cx="28" cy="-6" r="10" fill="white"/>
        <circle cx="28" cy="-6" r="7"  fill="#1A3D60"/>
        <circle cx="28" cy="-6" r="4"  fill="#0A1A30"/>
        <circle cx="30" cy="-9" r="2.5" fill="white"/>
        <!-- boca -->
        <path d="M50 0 Q54 4 52 8" stroke="#2A90C0" stroke-width="2" fill="none" stroke-linecap="round"/>
        <!-- burbujas -->
        <circle cx="65"  cy="-20" r="5"  fill="none" stroke="#90D5F0" stroke-width="2" opacity="0.7"/>
        <circle cx="74"  cy="-38" r="3.5" fill="none" stroke="#90D5F0" stroke-width="2" opacity="0.6"/>
        <circle cx="80"  cy="-52" r="2.5" fill="none" stroke="#90D5F0" stroke-width="2" opacity="0.5"/>
      </g>

      <!-- ══════════════════════════════════════════
           ESTETOSCOPIO — arriba izquierda
      ══════════════════════════════════════════ -->
      <g transform="translate(68,100) scale(1.8)" opacity="0.42">
        <!-- tubo izquierdo -->
        <path d="M0 0 Q-8 18 -4 38 Q0 55 15 65 Q30 75 30 95" stroke="url(#stetho)" stroke-width="7" stroke-linecap="round" fill="none"/>
        <!-- tubo derecho -->
        <path d="M50 0 Q58 18 54 38 Q50 55 35 65 Q20 75 30 95" stroke="url(#stetho)" stroke-width="7" stroke-linecap="round" fill="none"/>
        <!-- auricular izquierdo -->
        <circle cx="0"  cy="0" r="9" fill="url(#stetho)"/>
        <circle cx="0"  cy="0" r="5" fill="#3DD4B2"/>
        <!-- auricular derecho -->
        <circle cx="50" cy="0" r="9" fill="url(#stetho)"/>
        <circle cx="50" cy="0" r="5" fill="#3DD4B2"/>
        <!-- puente -->
        <path d="M9 -3 Q25 -18 41 -3" stroke="url(#stetho)" stroke-width="6" stroke-linecap="round" fill="none"/>
        <!-- membrana (chest piece) -->
        <circle cx="30" cy="100" r="20" fill="url(#stetho)"/>
        <circle cx="30" cy="100" r="15" fill="#2CBFA0"/>
        <circle cx="30" cy="100" r="9"  fill="#1A9E7F"/>
        <circle cx="30" cy="100" r="5"  fill="#3DD4B2"/>
        <!-- tornillo membrana -->
        <line x1="26" y1="100" x2="34" y2="100" stroke="#0F7A60" stroke-width="2"/>
        <line x1="30" y1="96"  x2="30" y2="104" stroke="#0F7A60" stroke-width="2"/>
        <!-- cruz médica en membrana -->
        <rect x="27" y="97" width="6" height="6" rx="1" fill="none" stroke="#7DE8CF" stroke-width="1.5" opacity="0.7"/>
      </g>

      <!-- ══════════════════════════════════════════
           JERINGA — abajo derecha
      ══════════════════════════════════════════ -->
      <g transform="translate(1360,740) rotate(-45) scale(2.0)" opacity="0.40">
        <!-- aguja -->
        <rect x="-2" y="50" width="4" height="30" rx="2" fill="#0F7A60"/>
        <!-- cono -->
        <path d="M-5 38 Q0 50 5 38Z" fill="#1A8870"/>
        <!-- cuerpo de la jeringa -->
        <rect x="-10" y="-40" width="20" height="80" rx="6" fill="url(#syringeG)"/>
        <!-- líquido interior -->
        <rect x="-7" y="-15" width="14" height="50" rx="4" fill="#B8F5E8" opacity="0.7"/>
        <!-- marcas de medición -->
        <line x1="-10" y1="-10" x2="-5" y2="-10" stroke="#0F7A60" stroke-width="2"/>
        <line x1="-10" y1="0"   x2="-5" y2="0"   stroke="#0F7A60" stroke-width="2"/>
        <line x1="-10" y1="10"  x2="-5" y2="10"  stroke="#0F7A60" stroke-width="2"/>
        <line x1="-10" y1="20"  x2="-5" y2="20"  stroke="#0F7A60" stroke-width="2"/>
        <line x1="-10" y1="30"  x2="-5" y2="30"  stroke="#0F7A60" stroke-width="2"/>
        <!-- números -->
        <text x="-4" y="-7"  font-size="6" fill="#0F7A60" opacity="0.8">5</text>
        <text x="-4" y="3"   font-size="6" fill="#0F7A60" opacity="0.8">4</text>
        <text x="-4" y="13"  font-size="6" fill="#0F7A60" opacity="0.8">3</text>
        <text x="-4" y="23"  font-size="6" fill="#0F7A60" opacity="0.8">2</text>
        <text x="-4" y="33"  font-size="6" fill="#0F7A60" opacity="0.8">1</text>
        <!-- alas -->
        <rect x="-22" y="20" width="12" height="8" rx="4" fill="#04A880"/>
        <rect x="10"  y="20" width="12" height="8" rx="4" fill="#04A880"/>
        <!-- émbolo (tapa) -->
        <rect x="-10" y="-55" width="20" height="18" rx="4" fill="#04A880"/>
        <rect x="-14" y="-42" width="28" height="6"  rx="3" fill="#04A880"/>
      </g>

      <!-- ══════════════════════════════════════════
           HUESOS — esquinas
      ══════════════════════════════════════════ -->
      <!-- hueso grande arr der -->
      <g transform="translate(1310,190) rotate(38) scale(1.6)" opacity="0.35">
        <rect x="-35" y="-9" width="70" height="18" rx="9" fill="url(#boneG)"/>
        <circle cx="-35" cy="-17" r="13" fill="url(#boneG)"/>
        <circle cx="-35" cy="17"  r="13" fill="url(#boneG)"/>
        <circle cx="35"  cy="-17" r="13" fill="url(#boneG)"/>
        <circle cx="35"  cy="17"  r="13" fill="url(#boneG)"/>
        <circle cx="-35" cy="-17" r="8"  fill="#FFE0A0" opacity="0.5"/>
        <circle cx="35"  cy="17"  r="8"  fill="#FFE0A0" opacity="0.5"/>
      </g>
      <!-- hueso pequeño abajo izq -->
      <g transform="translate(90,770) rotate(-22) scale(1.3)" opacity="0.32">
        <rect x="-28" y="-7" width="56" height="14" rx="7" fill="url(#boneG)"/>
        <circle cx="-28" cy="-13" r="10" fill="url(#boneG)"/>
        <circle cx="-28" cy="13"  r="10" fill="url(#boneG)"/>
        <circle cx="28"  cy="-13" r="10" fill="url(#boneG)"/>
        <circle cx="28"  cy="13"  r="10" fill="url(#boneG)"/>
      </g>

      <!-- ══════════════════════════════════════════
           CORAZONES
      ══════════════════════════════════════════ -->
      <g transform="translate(68,400) scale(4.5)" opacity="0.32">
        <path d="M0 6 C-1 4,-6 0,-6-3 C-6-8,0-10,0-5 C0-10,6-8,6-3 C6 0,1 4,0 6Z" fill="#EF5350"/>
        <path d="M-2 3 C-4 1,-5-1,-5-3" stroke="#FF8A80" stroke-width="0.8" fill="none" opacity="0.5"/>
      </g>
      <g transform="translate(1398,420) scale(3.8)" opacity="0.28">
        <path d="M0 6 C-1 4,-6 0,-6-3 C-6-8,0-10,0-5 C0-10,6-8,6-3 C6 0,1 4,0 6Z" fill="#EF5350"/>
      </g>
      <g transform="translate(740,50) scale(2.5)" opacity="0.25">
        <path d="M0 6 C-1 4,-6 0,-6-3 C-6-8,0-10,0-5 C0-10,6-8,6-3 C6 0,1 4,0 6Z" fill="#EF5350"/>
      </g>

      <!-- ══════════════════════════════════════════
           PATAS dispersas (más detalladas)
      ══════════════════════════════════════════ -->
      <!-- pata 1 arr izq -->
      <g transform="translate(460,55) rotate(-15) scale(1.2)" opacity="0.38">
        <ellipse cx="0" cy="0" rx="20" ry="17" fill="#1A9E7F"/>
        <ellipse cx="-17" cy="-19" rx="8" ry="10" fill="#1A9E7F" transform="rotate(-15 -17 -19)"/>
        <ellipse cx="-6"  cy="-24" rx="8" ry="10" fill="#1A9E7F" transform="rotate(-5 -6 -24)"/>
        <ellipse cx="6"   cy="-24" rx="8" ry="10" fill="#1A9E7F" transform="rotate(5 6 -24)"/>
        <ellipse cx="17"  cy="-19" rx="8" ry="10" fill="#1A9E7F" transform="rotate(15 17 -19)"/>
        <ellipse cx="0"   cy="2"   rx="10" ry="8" fill="#157A62" opacity="0.4"/>
      </g>
      <!-- pata 2 arr der -->
      <g transform="translate(1000,30) rotate(12) scale(1.0)" opacity="0.32">
        <ellipse cx="0" cy="0" rx="18" ry="15" fill="#06D6A0"/>
        <ellipse cx="-15" cy="-17" rx="7" ry="9" fill="#06D6A0" transform="rotate(-15 -15 -17)"/>
        <ellipse cx="-5"  cy="-22" rx="7" ry="9" fill="#06D6A0"/>
        <ellipse cx="5"   cy="-22" rx="7" ry="9" fill="#06D6A0"/>
        <ellipse cx="15"  cy="-17" rx="7" ry="9" fill="#06D6A0" transform="rotate(15 15 -17)"/>
      </g>
      <!-- pata 3 abajo centro -->
      <g transform="translate(560,870) rotate(-8) scale(1.1)" opacity="0.35">
        <ellipse cx="0" cy="0" rx="19" ry="16" fill="#1A9E7F"/>
        <ellipse cx="-16" cy="-18" rx="7" ry="9" fill="#1A9E7F" transform="rotate(-15 -16 -18)"/>
        <ellipse cx="-5"  cy="-23" rx="7" ry="9" fill="#1A9E7F"/>
        <ellipse cx="6"   cy="-23" rx="7" ry="9" fill="#1A9E7F"/>
        <ellipse cx="16"  cy="-18" rx="7" ry="9" fill="#1A9E7F" transform="rotate(15 16 -18)"/>
      </g>
      <!-- pata 4 der abajo -->
      <g transform="translate(900,870) rotate(8) scale(0.95)" opacity="0.30">
        <ellipse cx="0" cy="0" rx="16" ry="14" fill="#06D6A0"/>
        <ellipse cx="-13" cy="-15" rx="6" ry="8" fill="#06D6A0" transform="rotate(-15 -13 -15)"/>
        <ellipse cx="-4"  cy="-20" rx="6" ry="8" fill="#06D6A0"/>
        <ellipse cx="5"   cy="-20" rx="6" ry="8" fill="#06D6A0"/>
        <ellipse cx="14"  cy="-15" rx="6" ry="8" fill="#06D6A0" transform="rotate(15 14 -15)"/>
      </g>
      <!-- pata 5 izq medio -->
      <g transform="translate(48,230) rotate(20) scale(0.85)" opacity="0.30">
        <ellipse cx="0" cy="0" rx="15" ry="12" fill="#06D6A0"/>
        <ellipse cx="-12" cy="-14" rx="6" ry="7" fill="#06D6A0" transform="rotate(-15 -12 -14)"/>
        <ellipse cx="-4"  cy="-18" rx="6" ry="7" fill="#06D6A0"/>
        <ellipse cx="4"   cy="-18" rx="6" ry="7" fill="#06D6A0"/>
        <ellipse cx="12"  cy="-14" rx="6" ry="7" fill="#06D6A0" transform="rotate(15 12 -14)"/>
      </g>
      <!-- pata 6 der arriba -->
      <g transform="translate(1430,660) rotate(-18) scale(0.9)" opacity="0.28">
        <ellipse cx="0" cy="0" rx="16" ry="13" fill="#1A9E7F"/>
        <ellipse cx="-13" cy="-15" rx="6" ry="8" fill="#1A9E7F" transform="rotate(-15 -13 -15)"/>
        <ellipse cx="-4"  cy="-19" rx="6" ry="8" fill="#1A9E7F"/>
        <ellipse cx="5"   cy="-19" rx="6" ry="8" fill="#1A9E7F"/>
        <ellipse cx="13"  cy="-15" rx="6" ry="8" fill="#1A9E7F" transform="rotate(15 13 -15)"/>
      </g>

      <!-- ══════════════════════════════════════════
           CRUZ MÉDICA VETERINARIA
      ══════════════════════════════════════════ -->
      <g transform="translate(1415,300) scale(1.4)" opacity="0.28">
        <rect x="-10" y="-32" width="20" height="64" rx="10" fill="#1A9E7F"/>
        <rect x="-32" y="-10" width="64" height="20" rx="10" fill="#1A9E7F"/>
        <rect x="-7"  y="-29" width="14" height="58" rx="7"  fill="#2CBFA0" opacity="0.4"/>
        <rect x="-29" y="-7"  width="58" height="14" rx="7"  fill="#2CBFA0" opacity="0.4"/>
      </g>

      <!-- ══════════════════════════════════════════
           PASTILLA / CÁPSULA — abajo izq
      ══════════════════════════════════════════ -->
      <g transform="translate(330,840) rotate(-30) scale(1.4)" opacity="0.32">
        <path d="M-30 0 A18 18 0 0 1 0 -18 L0 18 A18 18 0 0 1 -30 0Z" fill="#FFB703"/>
        <path d="M0 -18 A18 18 0 0 1 30 0 A18 18 0 0 1 0 18 L0 -18Z"  fill="#06D6A0"/>
        <line x1="0" y1="-18" x2="0" y2="18" stroke="white" stroke-width="2" opacity="0.6"/>
      </g>

      <!-- ══════════════════════════════════════════
           TERMÓMETRO — arriba centro der
      ══════════════════════════════════════════ -->
      <g transform="translate(1050,55) rotate(15) scale(1.3)" opacity="0.35">
        <!-- tubo -->
        <rect x="-6" y="-45" width="12" height="70" rx="6" fill="#7DE8CF"/>
        <rect x="-3" y="-42" width="6"  height="55" rx="3" fill="#B8F5E8" opacity="0.7"/>
        <!-- mercurio -->
        <rect x="-3" y="5" width="6" height="18" rx="3" fill="#EF5350" opacity="0.8"/>
        <!-- bulbo -->
        <circle cx="0" cy="32" r="10" fill="#EF5350"/>
        <circle cx="0" cy="32" r="7"  fill="#FF6B6B" opacity="0.6"/>
        <!-- marcas -->
        <line x1="-6" y1="-30" x2="-2" y2="-30" stroke="#1A9E7F" stroke-width="1.5"/>
        <line x1="-6" y1="-18" x2="-2" y2="-18" stroke="#1A9E7F" stroke-width="1.5"/>
        <line x1="-6" y1="-6"  x2="-2" y2="-6"  stroke="#1A9E7F" stroke-width="1.5"/>
        <line x1="-6" y1="6"   x2="-2" y2="6"   stroke="#1A9E7F" stroke-width="1.5"/>
      </g>

      <!-- ══ PATAS dispersas ══ -->
      <!-- pata grande arriba izq -->
      <g transform="translate(60,60) rotate(-20)" opacity="0.42">
        <ellipse cx="0" cy="0" rx="22" ry="18" fill="#1A9E7F"/>
        <ellipse cx="-18" cy="-20" rx="9" ry="11" fill="#1A9E7F" transform="rotate(-15 -18 -20)"/>
        <ellipse cx="-6"  cy="-26" rx="9" ry="11" fill="#1A9E7F" transform="rotate(-5 -6 -26)"/>
        <ellipse cx="7"   cy="-26" rx="9" ry="11" fill="#1A9E7F" transform="rotate(5 7 -26)"/>
        <ellipse cx="19"  cy="-20" rx="9" ry="11" fill="#1A9E7F" transform="rotate(15 19 -20)"/>
      </g>
      <!-- pata pequeña arr der -->
      <g transform="translate(1350,80) rotate(15)" opacity="0.38">
        <ellipse cx="0" cy="0" rx="15" ry="12" fill="#06D6A0"/>
        <ellipse cx="-12" cy="-14" rx="6" ry="8" fill="#06D6A0" transform="rotate(-15 -12 -14)"/>
        <ellipse cx="-4"  cy="-18" rx="6" ry="8" fill="#06D6A0" transform="rotate(-5 -4 -18)"/>
        <ellipse cx="5"   cy="-18" rx="6" ry="8" fill="#06D6A0" transform="rotate(5 5 -18)"/>
        <ellipse cx="13"  cy="-14" rx="6" ry="8" fill="#06D6A0" transform="rotate(15 13 -14)"/>
      </g>
      <!-- pata mediana centro abajo izq -->
      <g transform="translate(120,780) rotate(10)" opacity="0.40">
        <ellipse cx="0" cy="0" rx="18" ry="15" fill="#1A9E7F"/>
        <ellipse cx="-15" cy="-17" rx="7" ry="9" fill="#1A9E7F" transform="rotate(-15 -15 -17)"/>
        <ellipse cx="-5"  cy="-22" rx="7" ry="9" fill="#1A9E7F" transform="rotate(-5 -5 -22)"/>
        <ellipse cx="6"   cy="-22" rx="7" ry="9" fill="#1A9E7F" transform="rotate(5 6 -22)"/>
        <ellipse cx="16"  cy="-17" rx="7" ry="9" fill="#1A9E7F" transform="rotate(15 16 -17)"/>
      </g>
      <!-- pata pequeña der abajo -->
      <g transform="translate(1380,820) rotate(-10)" opacity="0.35">
        <ellipse cx="0" cy="0" rx="14" ry="11" fill="#06D6A0"/>
        <ellipse cx="-11" cy="-13" rx="5.5" ry="7" fill="#06D6A0" transform="rotate(-15 -11 -13)"/>
        <ellipse cx="-3.5" cy="-17" rx="5.5" ry="7" fill="#06D6A0" transform="rotate(-5 -3.5 -17)"/>
        <ellipse cx="5"   cy="-17" rx="5.5" ry="7" fill="#06D6A0" transform="rotate(5 5 -17)"/>
        <ellipse cx="12"  cy="-13" rx="5.5" ry="7" fill="#06D6A0" transform="rotate(15 12 -13)"/>
      </g>
      <!-- pata mediana arr centro -->
      <g transform="translate(720,30) rotate(5)" opacity="0.30">
        <ellipse cx="0" cy="0" rx="16" ry="13" fill="#1A9E7F"/>
        <ellipse cx="-13" cy="-15" rx="6" ry="8" fill="#1A9E7F" transform="rotate(-15 -13 -15)"/>
        <ellipse cx="-4"  cy="-19" rx="6" ry="8" fill="#1A9E7F"/>
        <ellipse cx="5"   cy="-19" rx="6" ry="8" fill="#1A9E7F"/>
        <ellipse cx="14"  cy="-15" rx="6" ry="8" fill="#1A9E7F" transform="rotate(15 14 -15)"/>
      </g>

      <!-- ══ HUESO arr der ══ -->
      <g transform="translate(1300,170) rotate(35) scale(1.5)" opacity="0.35">
        <rect x="-30" y="-8" width="60" height="16" rx="8" fill="#FFB703"/>
        <circle cx="-30" cy="-14" r="10" fill="#FFB703"/>
        <circle cx="-30" cy="14"  r="10" fill="#FFB703"/>
        <circle cx="30"  cy="-14" r="10" fill="#FFB703"/>
        <circle cx="30"  cy="14"  r="10" fill="#FFB703"/>
      </g>

      <!-- ══ HUESO abajo izq ══ -->
      <g transform="translate(100,720) rotate(-25) scale(1.5)" opacity="0.30">
        <rect x="-25" y="-7" width="50" height="14" rx="7" fill="#FFB703"/>
        <circle cx="-25" cy="-12" r="9" fill="#FFB703"/>
        <circle cx="-25" cy="12"  r="9" fill="#FFB703"/>
        <circle cx="25"  cy="-12" r="9" fill="#FFB703"/>
        <circle cx="25"  cy="12"  r="9" fill="#FFB703"/>
      </g>

      <!-- ══ CORAZÓN centro izq ══ -->
      <g transform="translate(70,400) scale(3.5)" opacity="0.32">
        <path d="M0 8 C-2 5,-8 0,-8-5 C-8-12,0-14,0-8 C0-14,8-12,8-5 C8 0,2 5,0 8Z" fill="#EF5350"/>
      </g>

      <!-- ══ CORAZÓN der centro ══ -->
      <g transform="translate(1385,430) scale(2.8)" opacity="0.28">
        <path d="M0 8 C-2 5,-8 0,-8-5 C-8-12,0-14,0-8 C0-14,8-12,8-5 C8 0,2 5,0 8Z" fill="#EF5350"/>
      </g>

      <!-- ══ ESTETOSCOPIO arr izq ══ -->
      <g transform="translate(160,120) rotate(-15) scale(1.6)" opacity="0.38">
        <!-- tubo -->
        <path d="M0 0 Q40 20 40 60 Q40 90 10 90" stroke="#1A9E7F" stroke-width="7" fill="none" stroke-linecap="round"/>
        <!-- auricular izq -->
        <circle cx="0"  cy="0"  r="8"  fill="#1A9E7F"/>
        <!-- auricular der -->
        <circle cx="40" cy="0"  r="8"  fill="#1A9E7F"/>
        <!-- tubo der -->
        <path d="M40 0 Q0 20 0 60 Q0 90 30 90" stroke="#1A9E7F" stroke-width="7" fill="none" stroke-linecap="round"/>
        <!-- membrana -->
        <circle cx="20" cy="92" r="14" fill="none" stroke="#1A9E7F" stroke-width="6"/>
        <circle cx="20" cy="92" r="7"  fill="#1A9E7F" opacity="0.5"/>
      </g>

      <!-- ══ JERINGA / VACUNA der abajo ══ -->
      <g transform="translate(1320,680) rotate(-40) scale(1.8)" opacity="0.35">
        <!-- cuerpo -->
        <rect x="-5" y="-40" width="10" height="70" rx="5" fill="#06D6A0"/>
        <!-- émbolo -->
        <rect x="-3" y="-36" width="6" height="30" rx="3" fill="#E4F5EE"/>
        <!-- punta -->
        <rect x="-2" y="30" width="4" height="20" rx="2" fill="#1A9E7F"/>
        <!-- alas -->
        <rect x="-16" y="14" width="10" height="7" rx="3" fill="#06D6A0"/>
        <rect x="6"   y="14" width="10" height="7" rx="3" fill="#06D6A0"/>
        <!-- marcas de dosis -->
        <line x1="-5" y1="-10" x2="5" y2="-10" stroke="#1A9E7F" stroke-width="2"/>
        <line x1="-5" y1="0"   x2="5" y2="0"   stroke="#1A9E7F" stroke-width="2"/>
        <line x1="-5" y1="10"  x2="5" y2="10"  stroke="#1A9E7F" stroke-width="2"/>
      </g>

      <!-- ══ SILUETA PERRO arr der (simple) ══ -->
      <g transform="translate(1120,40) scale(1.7)" opacity="0.35">
        <!-- cuerpo -->
        <ellipse cx="0" cy="30" rx="30" ry="20" fill="#1A9E7F"/>
        <!-- cabeza -->
        <circle cx="30" cy="14" r="16" fill="#1A9E7F"/>
        <!-- oreja izq -->
        <ellipse cx="22" cy="2" rx="7" ry="11" fill="#1A9E7F" transform="rotate(-15 22 2)"/>
        <!-- oreja der -->
        <ellipse cx="40" cy="0" rx="7" ry="11" fill="#1A9E7F" transform="rotate(20 40 0)"/>
        <!-- hocico -->
        <ellipse cx="42" cy="20" rx="9" ry="7" fill="#1A9E7F"/>
        <!-- ojo -->
        <circle cx="35" cy="10" r="3" fill="#E4F5EE"/>
        <!-- cola -->
        <path d="M-30 20 Q-55 5 -45 -10" stroke="#1A9E7F" stroke-width="7" fill="none" stroke-linecap="round"/>
        <!-- patas -->
        <rect x="-20" y="46" width="10" height="20" rx="5" fill="#1A9E7F"/>
        <rect x="-5"  y="46" width="10" height="20" rx="5" fill="#1A9E7F"/>
        <rect x="10"  y="46" width="10" height="20" rx="5" fill="#1A9E7F"/>
        <rect x="22"  y="44" width="10" height="18" rx="5" fill="#1A9E7F"/>
      </g>

      <!-- ══ SILUETA GATO abajo izq ══ -->
      <g transform="translate(180,720) scale(1.5)" opacity="0.35">
        <!-- cuerpo -->
        <ellipse cx="0" cy="30" rx="22" ry="18" fill="#06D6A0"/>
        <!-- cabeza -->
        <circle cx="0" cy="5" r="18" fill="#06D6A0"/>
        <!-- orejas puntiagudas -->
        <polygon points="-14,-8 -20,-32 -4,-12" fill="#06D6A0"/>
        <polygon points="14,-8 20,-32 4,-12"   fill="#06D6A0"/>
        <!-- ojos -->
        <ellipse cx="-7" cy="3" rx="4" ry="5" fill="#E4F5EE"/>
        <ellipse cx="7"  cy="3" rx="4" ry="5" fill="#E4F5EE"/>
        <!-- nariz -->
        <polygon points="0,10 -3,14 3,14" fill="#E4F5EE"/>
        <!-- cola -->
        <path d="M22 35 Q50 20 45 0 Q42 -15 35 -5" stroke="#06D6A0" stroke-width="6" fill="none" stroke-linecap="round"/>
        <!-- patas -->
        <rect x="-18" y="44" width="9" height="16" rx="4" fill="#06D6A0"/>
        <rect x="-6"  y="44" width="9" height="16" rx="4" fill="#06D6A0"/>
        <rect x="6"   y="44" width="9" height="16" rx="4" fill="#06D6A0"/>
        <rect x="16"  y="44" width="9" height="16" rx="4" fill="#06D6A0"/>
      </g>

      <!-- ══ CRUZ médica veterinaria centro der ══ -->
      <g transform="translate(1400,300)" opacity="0.28">
        <rect x="-8"  y="-28" width="16" height="56" rx="8" fill="#1A9E7F"/>
        <rect x="-28" y="-8"  width="56" height="16" rx="8" fill="#1A9E7F"/>
      </g>

      <!-- ══ CRUZ médica abajo centro ══ -->
      <g transform="translate(700,870)" opacity="0.25">
        <rect x="-6"  y="-20" width="12" height="40" rx="6" fill="#1A9E7F"/>
        <rect x="-20" y="-6"  width="40" height="12" rx="6" fill="#1A9E7F"/>
      </g>

      <!-- ══ BOLITAS / HUELLAS pequeñas dispersas ══ -->
      <circle cx="400"  cy="50"  r="5" fill="#06D6A0" opacity="0.40"/>
      <circle cx="600"  cy="870" r="4" fill="#1A9E7F" opacity="0.35"/>
      <circle cx="900"  cy="40"  r="6" fill="#FFB703" opacity="0.35"/>
      <circle cx="1100" cy="860" r="5" fill="#06D6A0" opacity="0.35"/>
      <circle cx="50"   cy="500" r="4" fill="#FFB703" opacity="0.30"/>
      <circle cx="1430" cy="540" r="5" fill="#1A9E7F" opacity="0.30"/>

    </svg>

    <!-- Tarjeta de login -->
    <div class="login-card">

      <!-- Logo -->
      <div class="login-card__logo">
        <AppLogo size="lg" />
        <p class="login-card__subtitle">Sistema de Gestión Veterinaria</p>
      </div>

      <!-- PASO 1: Email + Contraseña -->
      <form v-if="step === 'credentials'" @submit.prevent="handleLogin" novalidate>
        <div class="field">
          <label for="email">Correo electrónico</label>
          <input
            id="email"
            data-testid="login-email"
            v-model.trim="form.email"
            type="email"
            placeholder="usuario@veterinaria.com"
            autocomplete="email"
            :disabled="loading"
            required
          />
        </div>

        <div class="field">
          <label for="password">Contraseña</label>
          <div class="field__pwd">
            <input
              id="password"
              data-testid="login-password"
              v-model="form.password"
              :type="showPwd ? 'text' : 'password'"
              placeholder="••••••••••"
              autocomplete="current-password"
              :disabled="loading"
              required
            />
            <button type="button" class="field__eye" @click="showPwd = !showPwd" :aria-label="showPwd ? 'Ocultar' : 'Mostrar'">
              {{ showPwd ? '🙈' : '👁️' }}
            </button>
          </div>
        </div>

        <div v-if="error" class="alert alert--error">{{ error }}</div>

        <button type="submit" class="btn-primary" data-testid="login-submit" :disabled="loading">
          <span v-if="loading" class="spinner"/>
          <span v-else>Ingresar</span>
        </button>

        <div class="login-card__links">
          <a href="#" @click.prevent="step = 'forgot'">¿Olvidaste tu contraseña?</a>
        </div>
      </form>

      <!-- PASO 2: Código 2FA -->
      <form v-else-if="step === 'twofa'" @submit.prevent="handleTwoFa" novalidate>
        <div class="twofa-header">
          <span class="twofa-icon">🔐</span>
          <h3>Verificación en dos pasos</h3>
          <p>Ingresá el código de tu app autenticadora</p>
        </div>

        <div class="field">
          <label for="code">Código de 6 dígitos</label>
          <input
            id="code"
            v-model.trim="form.code"
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            maxlength="6"
            placeholder="000000"
            autocomplete="one-time-code"
            :disabled="loading"
            class="code-input"
            required
          />
        </div>

        <div v-if="error" class="alert alert--error">{{ error }}</div>

        <button type="submit" class="btn-primary" :disabled="loading || form.code.length < 6">
          <span v-if="loading" class="spinner"/>
          <span v-else>Verificar</span>
        </button>

        <button type="button" class="btn-ghost" @click="step = 'credentials'; error = ''">
          ← Volver
        </button>
      </form>

      <!-- PASO 3: Recuperar contraseña -->
      <form v-else-if="step === 'forgot'" @submit.prevent="handleForgot" novalidate>
        <div class="twofa-header">
          <span class="twofa-icon">✉️</span>
          <h3>Recuperar contraseña</h3>
          <p>Te enviamos un enlace a tu correo</p>
        </div>

        <div class="field">
          <label for="reset-email">Correo electrónico</label>
          <input
            id="reset-email"
            v-model.trim="form.email"
            type="email"
            placeholder="usuario@veterinaria.com"
            :disabled="loading"
            required
          />
        </div>

        <div v-if="error"   class="alert alert--error">{{ error }}</div>
        <div v-if="success" class="alert alert--success">{{ success }}</div>

        <button type="submit" class="btn-primary" :disabled="loading">
          <span v-if="loading" class="spinner"/>
          <span v-else>Enviar enlace</span>
        </button>

        <button type="button" class="btn-ghost" @click="step = 'credentials'; error = ''; success = ''">
          ← Volver al login
        </button>
      </form>

    </div>

    <p class="login-page__copy">© {{ year }} Sistema Andromeda</p>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { authApi } from '../api/auth'
import AppLogo from '../components/AppLogo.vue'

const router = useRouter()
const auth   = useAuthStore()

const step    = ref('credentials')
const loading = ref(false)
const error   = ref('')
const success = ref('')
const showPwd = ref(false)
const pendingToken = ref(null)
const year = new Date().getFullYear()

const form = reactive({ email: '', password: '', code: '' })

async function handleLogin() {
  error.value = ''
  if (!form.email || !form.password) { error.value = 'Completá todos los campos'; return }
  loading.value = true
  try {
    const result = await auth.login({ email: form.email, password: form.password })
    if (result.requiresTwoFactor) {
      pendingToken.value = result.pendingToken
      step.value = 'twofa'
    } else {
      router.push('/')
    }
  } catch (e) {
    const msg = e.response?.data?.message || e.response?.data?.error
    if (e.response?.status === 401) error.value = 'Credenciales incorrectas'
    else if (e.response?.status === 429) error.value = 'Demasiados intentos. Esperá unos minutos.'
    else error.value = msg || 'Error al iniciar sesión'
  } finally {
    loading.value = false
  }
}

async function handleTwoFa() {
  error.value = ''
  loading.value = true
  try {
    await auth.twoFaChallenge(pendingToken.value, form.code)
    router.push('/')
  } catch (e) {
    const msg = e.response?.data?.message || e.response?.data?.error
    error.value = msg || 'Código incorrecto'
  } finally {
    loading.value = false
  }
}

async function handleForgot() {
  error.value = ''
  success.value = ''
  if (!form.email) { error.value = 'Ingresá tu correo'; return }
  loading.value = true
  try {
    await authApi.resetRequest(form.email)
    success.value = 'Si el correo existe, recibirás el enlace en minutos.'
  } catch {
    error.value = 'No se pudo enviar el correo. Intentá más tarde.'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
/* ── Página ───────────────────────────────────── */
.login-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(ellipse at 20% 80%, rgba(6, 214, 160, 0.12) 0%, transparent 55%),
    radial-gradient(ellipse at 80% 20%, rgba(26, 158, 127, 0.14) 0%, transparent 55%),
    radial-gradient(ellipse at 60% 70%, rgba(255, 183, 3, 0.07) 0%, transparent 50%),
    linear-gradient(160deg, #E2F5EE 0%, #EEF8F4 40%, #F0FAF7 100%);
  position: relative;
  overflow: hidden;
  padding: 24px;
}

/* ── Fondo SVG veterinario ─────────────────────── */
.vet-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

/* ── Tarjeta ───────────────────────────────────── */
.login-card {
  background: var(--white);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  padding: 44px 40px 36px;
  width: 100%;
  max-width: 420px;
  position: relative;
  z-index: 1;
}

.login-card__logo {
  text-align: center;
  margin-bottom: 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.login-card__subtitle {
  font-size: 0.82rem;
  color: var(--text-3);
  letter-spacing: 0.04em;
}

/* ── Campos ─────────────────────────────────────── */
.field { margin-bottom: 18px; }
.field label {
  display: block;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-2);
  margin-bottom: 6px;
  letter-spacing: 0.02em;
}
.field input {
  width: 100%;
  padding: 11px 14px;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  font-size: 0.95rem;
  color: var(--text);
  background: var(--surface);
  transition: border-color var(--transition), box-shadow var(--transition);
  outline: none;
}
.field input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-xlight);
}
.field input:disabled { opacity: 0.6; cursor: not-allowed; }

.field__pwd { position: relative; }
.field__pwd input { padding-right: 42px; }
.field__eye {
  position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
  background: none; border: none; cursor: pointer; font-size: 1rem; padding: 4px;
}

.code-input {
  text-align: center;
  font-size: 1.8rem !important;
  letter-spacing: 0.5em;
  font-weight: 700;
}

/* ── Botones ────────────────────────────────────── */
.btn-primary {
  width: 100%;
  padding: 13px;
  background: linear-gradient(135deg, var(--primary) 0%, var(--accent-mint) 100%);
  color: var(--white);
  border: none;
  border-radius: var(--radius);
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity var(--transition), transform var(--transition);
  display: flex; align-items: center; justify-content: center; gap: 8px;
  margin-top: 8px;
}
.btn-primary:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

.btn-ghost {
  width: 100%; margin-top: 10px;
  padding: 10px;
  background: none;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-2);
  font-size: 0.9rem; font-weight: 500;
  cursor: pointer;
  transition: background var(--transition);
}
.btn-ghost:hover { background: var(--surface-2); }

/* ── Alertas ────────────────────────────────────── */
.alert {
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  font-size: 0.875rem;
  margin-bottom: 12px;
}
.alert--error   { background: var(--danger-light); color: #c0392b; border-left: 3px solid var(--danger); }
.alert--success { background: #eafaf3; color: #1e8449; border-left: 3px solid var(--success); }

/* ── Links ──────────────────────────────────────── */
.login-card__links {
  text-align: center;
  margin-top: 16px;
  font-size: 0.84rem;
}

/* ── 2FA header ─────────────────────────────────── */
.twofa-header {
  text-align: center;
  margin-bottom: 24px;
}
.twofa-icon { font-size: 2.5rem; display: block; margin-bottom: 8px; }
.twofa-header h3 { font-size: 1.15rem; color: var(--text); margin-bottom: 4px; }
.twofa-header p  { font-size: 0.85rem; color: var(--text-2); }

/* ── Spinner ────────────────────────────────────── */
.spinner {
  width: 18px; height: 18px;
  border: 2px solid rgba(255,255,255,0.35);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  display: inline-block;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Copyright ──────────────────────────────────── */
.login-page__copy {
  margin-top: 24px;
  font-size: 0.75rem;
  color: var(--text-3);
  z-index: 1;
}

/* ── Responsive ─────────────────────────────────── */
@media (max-width: 480px) {
  .login-card { padding: 32px 24px 28px; }
}
</style>
