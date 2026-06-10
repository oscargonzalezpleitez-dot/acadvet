// =============================================================================
// AcadVet USAM — Módulo 4: Banco de Preguntas para Quiz de Práctica
// =============================================================================

export const CATEGORIES = [
  { id: 'bacteriologia', label: 'Bacteriología',         icon: '🔬', desc: 'Tinción, medios de cultivo, identificación bacteriana' },
  { id: 'micologia',     label: 'Micología',              icon: '🍄', desc: 'Hongos, dermatofitos, levaduras y dimorfismo' },
  { id: 'lab_clinico',   label: 'Lab Clínico',            icon: '🩸', desc: 'Urianálisis, bioquímica y pruebas especiales' },
  { id: 'hemograma',     label: 'Hemograma y Valores',    icon: '📊', desc: 'Eritrocitos, leucocitos, plaquetas y valores normales' },
];

// q: pregunta | opts: opciones | c: índice correcto (0-3) | exp: explicación
export const QUESTIONS = [

  // ── Bacteriología ────────────────────────────────────────────────────────
  { id:'b01', cat:'bacteriologia',
    q:'¿Cuál es el colorante primario de la tinción de Gram?',
    opts:['Safranina','Cristal violeta','Lugol','Fucsina'],
    c:1, exp:'El cristal violeta tiñe todas las células inicialmente; las Gram+ lo retienen tras la decoloración.' },

  { id:'b02', cat:'bacteriologia',
    q:'¿Qué función cumple el Lugol en la tinción de Gram?',
    opts:['Colorante de contraste','Decolorante','Mordiente que fija el cristal violeta','Endurecedor del frotis'],
    c:2, exp:'El Lugol actúa como mordiente formando un complejo insoluble con el cristal violeta en la pared Gram+.' },

  { id:'b03', cat:'bacteriologia',
    q:'Las bacterias Gram-positivas retienen el cristal violeta gracias a…',
    opts:['Cápsula de polisacáridos gruesa','Pared de peptidoglicano gruesa','Membrana externa lipopolisacárida','Esporas que absorben el colorante'],
    c:1, exp:'La pared gruesa de peptidoglicano (20-80 nm) de las Gram+ atrapa el complejo cristal violeta-Lugol durante la decoloración.' },

  { id:'b04', cat:'bacteriologia',
    q:'El agar MacConkey es un medio…',
    opts:['General y enriquecido','Selectivo y diferencial','Selectivo solo para anaerobios','Solo para hongos'],
    c:1, exp:'MacConkey inhibe Gram+ (sales biliares) y diferencia fermentadores de lactosa (rosados) de no fermentadores (incoloros).' },

  { id:'b05', cat:'bacteriologia',
    q:'La prueba de catalasa distingue principalmente…',
    opts:['Gram+ de Gram-','Aerobios de anaerobios','Staphylococcus (positivo) de Streptococcus (negativo)','Esporas de células vegetativas'],
    c:2, exp:'Staphylococcus es catalasa-positiva (burbujea con H₂O₂); Streptococcus es catalasa-negativa.' },

  { id:'b06', cat:'bacteriologia',
    q:'¿A qué temperatura se incuban bacterias patógenas de interés veterinario?',
    opts:['25 °C','30 °C','37 °C','42 °C'],
    c:2, exp:'37 °C simula la temperatura corporal de los mamíferos domésticos, óptima para la mayoría de patógenos.' },

  { id:'b07', cat:'bacteriologia',
    q:'El colorante de contraste en la tinción de Gram es…',
    opts:['Cristal violeta','Lugol','Alcohol-acetona','Safranina'],
    c:3, exp:'La safranina tiñe de rojo/rosa las bacterias Gram-negativas que perdieron el cristal violeta en la decoloración.' },

  { id:'b08', cat:'bacteriologia',
    q:'¿Cuáles son las condiciones estándar de autoclave para esterilización?',
    opts:['100 °C por 30 min','121 °C por 15-20 min','160 °C por 2 h','80 °C por 1 h'],
    c:1, exp:'121 °C a 15 psi de presión por 15-20 min destruye esporas bacterianas y todos los microorganismos.' },

  { id:'b09', cat:'bacteriologia',
    q:'Staphylococcus aureus es coagulasa…',
    opts:['Negativa','Positiva','Variable según el medio','No reacciona a la prueba'],
    c:1, exp:'La coagulasa positiva diferencia S. aureus de los estafilococos coagulasa-negativos como S. epidermidis.' },

  { id:'b10', cat:'bacteriologia',
    q:'La prueba de CAMP identifica presuntivamente a…',
    opts:['Escherichia coli','Streptococcus agalactiae','Staphylococcus aureus','Bacillus anthracis'],
    c:1, exp:'El factor CAMP de S. agalactiae potencia la hemólisis de S. aureus, creando una zona de hemólisis en flecha.' },

  // ── Micología ────────────────────────────────────────────────────────────
  { id:'m01', cat:'micologia',
    q:'El KOH al 10% en preparaciones fúngicas tiene la función de…',
    opts:['Teñir las hifas de azul','Digerir tejido del hospedador y resaltar estructuras fúngicas','Matar el hongo por seguridad','Fijar el preparado al portaobjetos'],
    c:1, exp:'El KOH disuelve queratina y células del hospedador, dejando visibles solo las estructuras fúngicas.' },

  { id:'m02', cat:'micologia',
    q:'El agar Sabouraud inhibe bacterias gracias a…',
    opts:['Alta temperatura de incubación','pH ácido y antibióticos','Ausencia de agua','Colorantes bacteriostáticos'],
    c:1, exp:'El pH bajo (~5.6) y cloranfenicol inhiben bacterias; el dextrosa favorece el crecimiento de hongos.' },

  { id:'m03', cat:'micologia',
    q:'¿Cuál es la temperatura de incubación habitual para hongos en laboratorio?',
    opts:['37 °C','25-28 °C','42 °C','4 °C'],
    c:1, exp:'La mayoría de hongos ambientales y dermatofitos crecen mejor a 25-28 °C, aunque los dimórficos también se incuban a 37 °C.' },

  { id:'m04', cat:'micologia',
    q:'Las hifas con tabiques transversales se denominan…',
    opts:['Cenocíticas','Sifonadas','Septadas','Rizoides'],
    c:2, exp:'Las hifas septadas tienen paredes transversales (septos) a intervalos regulares; las aseptadas se llaman cenocíticas o sifonadas.' },

  { id:'m05', cat:'micologia',
    q:'Microsporum canis es agente causal de…',
    opts:['Aspergilosis pulmonar','Dermatofitosis (tiña)','Histoplasmosis sistémica','Candidiasis oral'],
    c:1, exp:'M. canis es el dermatofito más frecuente en perros y gatos, causando tiña capitis y corporis con pérdida de pelo.' },

  { id:'m06', cat:'micologia',
    q:'Candida albicans a 37 °C en suero forma…',
    opts:['Clamidosporas únicamente','Tubos germinativos o seudohifas','Esporas sexuales','Pigmento negro'],
    c:1, exp:'La formación de tubo germinativo en suero a 37 °C es la prueba de identificación presuntiva de C. albicans.' },

  { id:'m07', cat:'micologia',
    q:'¿Qué coloración resalta la cápsula de Cryptococcus neoformans?',
    opts:['Gram','Ziehl-Neelsen','Tinta china (contraste negativo)','PAS'],
    c:2, exp:'La tinta china no penetra la cápsula polisacárida, creando un halo claro alrededor del hongo sobre fondo oscuro.' },

  { id:'m08', cat:'micologia',
    q:'El dimorfismo fúngico significa que el hongo crece como…',
    opts:['Bacteria o virus según el huésped','Levadura (37 °C) o micelio (25 °C)','Aerobio o anaerobio según el pH','Gram+ o Gram- según el medio'],
    c:1, exp:'Hongos dimórficos como Histoplasma y Blastomyces existen como levaduras a temperatura corporal y como micelios en el ambiente.' },

  { id:'m09', cat:'micologia',
    q:'La lámpara de Wood emite luz UV para detectar…',
    opts:['Candida en mucosas','Aspergillus en esputo','Dermatofitos con fluorescencia en el pelaje','Criptococosis meníngea'],
    c:2, exp:'Algunos dermatofitos (especialmente Microsporum) emiten fluorescencia verde-amarilla bajo luz de Wood.' },

  { id:'m10', cat:'micologia',
    q:'El Aspergillus fumigatus se caracteriza en cultivo por sus…',
    opts:['Blastoconidias en cadena','Conidióforos con vesícula y esterigmas','Cuerpos esféricos con endosporas','Hifas no septadas con esporas gigantes'],
    c:1, exp:'Aspergillus presenta conidióforos con vesícula apical rodeada de esterigmas que producen cadenas de conidias.' },

  // ── Lab Clínico ──────────────────────────────────────────────────────────
  { id:'l01', cat:'lab_clinico',
    q:'¿Qué anticoagulante se usa de rutina para hemograma completo?',
    opts:['Heparina','Citrato de sodio','EDTA','Oxalato de potasio'],
    c:2, exp:'El EDTA preserva la morfología celular y es el estándar universal para hemograma; quelata el calcio de forma irreversible.' },

  { id:'l02', cat:'lab_clinico',
    q:'¿Qué indica la presencia de cilindros granulosos en el sedimento urinario?',
    opts:['Infección del tracto urinario bajo','Daño tubular renal','Diabetes mellitus','Hematuria de origen vesical'],
    c:1, exp:'Los cilindros granulosos se forman por degeneración de cilindros celulares en los túbulos renales, indicando lesión tubular activa.' },

  { id:'l03', cat:'lab_clinico',
    q:'La ALT (alanina aminotransferasa) es el marcador hepatocelular más específico en…',
    opts:['Bovinos','Aves','Caninos','Equinos'],
    c:2, exp:'En perros la ALT es altamente específica del hígado; en gatos, bovinos y aves otras enzimas (AST, GGT) son más informativas.' },

  { id:'l04', cat:'lab_clinico',
    q:'Un BUN elevado puede indicar…',
    opts:['Hepatitis aguda','Anemia hemolítica','Enfermedad renal o deshidratación','Deficiencia de hierro'],
    c:2, exp:'El BUN aumenta cuando los riñones no filtran adecuadamente (azotemia renal) o hay deshidratación severa (azotemia prerenal).' },

  { id:'l05', cat:'lab_clinico',
    q:'¿Cuál es el rango normal de hematocrito (VGA) en el perro?',
    opts:['15-30 %','37-55 %','60-70 %','25-35 %'],
    c:1, exp:'Hematocrito normal en perros: 37-55 %. Menor = anemia; mayor = policitemia.' },

  { id:'l06', cat:'lab_clinico',
    q:'La isostenuria urinaria (densidad 1.008-1.012) en el gato sugiere…',
    opts:['Orina muy concentrada, normal','Pérdida de capacidad de concentración renal','Presencia de glucosuria','Hematuria renal'],
    c:1, exp:'La isostenuria (densidad igual al filtrado glomerular) indica que los túbulos renales perdieron capacidad de concentrar.' },

  { id:'l07', cat:'lab_clinico',
    q:'Los neutrófilos en banda en el hemograma indican…',
    opts:['Anemia crónica por enfermedad','Infección viral aguda','Desviación a la izquierda: inflamación/infección activa','Trombocitopenia severa'],
    c:2, exp:'Los neutrófilos en banda son formas inmaduras liberadas ante alta demanda; su aumento indica respuesta inflamatoria aguda.' },

  { id:'l08', cat:'lab_clinico',
    q:'¿Para qué sirve la prueba de Coombs directo?',
    opts:['Identificar bacterias en orina','Detectar anticuerpos anti-eritrocitarios','Evaluar función hepática','Medir glucosa sérica'],
    c:1, exp:'El Coombs directo detecta anticuerpos o complemento unidos a la superficie del eritrocito, diagnóstico de anemia hemolítica inmune.' },

  { id:'l09', cat:'lab_clinico',
    q:'El anticoagulante de elección para pruebas de coagulación (TP, TTP) es…',
    opts:['EDTA','Heparina','Citrato de sodio al 3.2 %','Oxalato de potasio'],
    c:2, exp:'El citrato quelata el calcio de forma reversible; al añadir CaCl₂ en la prueba se reactiva la cascada de coagulación.' },

  { id:'l10', cat:'lab_clinico',
    q:'La creatinina sérica evalúa principalmente la función de…',
    opts:['Hígado','Páncreas exocrino','Riñón','Tiroides'],
    c:2, exp:'La creatinina se filtra libremente por el glomérulo y no se reabsorbe, siendo marcador sensible de tasa de filtración glomerular.' },

  // ── Hemograma y Valores ──────────────────────────────────────────────────
  { id:'h01', cat:'hemograma',
    q:'¿Qué tipo de anemia se asocia a reticulocitosis?',
    opts:['Anemia por enfermedad crónica','Anemia aplásica','Anemia regenerativa','Anemia ferropénica crónica'],
    c:2, exp:'La reticulocitosis indica médula ósea activa; típico de anemias hemolíticas o por hemorragia aguda (respuesta regenerativa).' },

  { id:'h02', cat:'hemograma',
    q:'¿Cuánto dura aproximadamente un eritrocito canino?',
    opts:['30-40 días','60-70 días','110-120 días','200 días'],
    c:2, exp:'Eritrocitos caninos: 110-120 días; felinos: 70-80 días; bovinos: ~160 días.' },

  { id:'h03', cat:'hemograma',
    q:'¿Qué leucocito tiene gránulos grandes azul-oscuro con heparina e histamina?',
    opts:['Neutrófilo','Eosinófilo','Basófilo','Linfocito'],
    c:2, exp:'Los basófilos tienen gránulos grandes azul-oscuro con heparina e histamina; son la célula circulante menos frecuente.' },

  { id:'h04', cat:'hemograma',
    q:'El VCM (volumen corpuscular medio) evalúa…',
    opts:['El porcentaje de eritrocitos en sangre','El tamaño promedio de los eritrocitos','El contenido de Hb en plasma','La velocidad de eritrosedimentación'],
    c:1, exp:'VCM = (Hematocrito × 10) / Conteo eritrocitario. Normal en perros: 60-77 fL. VCM alto = macrocitosis; bajo = microcitosis.' },

  { id:'h05', cat:'hemograma',
    q:'Una trombocitopenia severa (<30 000/μL) puede producir…',
    opts:['Eritrocitosis secundaria','Sangrado espontáneo y petequias','Leucocitosis neutrofílica','Hemoglobinuria'],
    c:1, exp:'Plaquetas <30 000/μL comprenden la hemostasia primaria, aumentando el riesgo de hemorragia espontánea y petequias.' },

  { id:'h06', cat:'hemograma',
    q:'¿Cuál es el rango normal de plaquetas en el perro?',
    opts:['10 000-50 000/μL','200 000-500 000/μL','1 000 000-2 000 000/μL','50 000-100 000/μL'],
    c:1, exp:'Plaquetas normales en perros: 200 000-500 000/μL; en gatos: 300 000-800 000/μL.' },

  { id:'h07', cat:'hemograma',
    q:'La eosinofilia se asocia principalmente a…',
    opts:['Infecciones bacterianas agudas','Infecciones virales','Alergias y parasitosis','Estrés agudo (glucocorticoides)'],
    c:2, exp:'Los eosinófilos aumentan en reacciones de hipersensibilidad (alergias) y parasitosis, especialmente helmintos tisulares.' },

  { id:'h08', cat:'hemograma',
    q:'Una CHCM (concentración de Hb corpuscular media) baja indica…',
    opts:['Macrocitosis','Hipocromia: eritrocitos con poca hemoglobina','Hemólisis intravascular','Policitemia'],
    c:1, exp:'CHCM baja = eritrocitos hipocrómicos, típicos de anemia ferropénica (déficit de hierro para sintetizar hemoglobina).' },

  { id:'h09', cat:'hemograma',
    q:'El fibrinógeno pertenece al grupo de…',
    opts:['Enzimas hepáticas de lisis','Factores de coagulación y proteínas de fase aguda','Anticuerpos séricos','Hormonas glucocorticoides'],
    c:1, exp:'El fibrinógeno es Factor I de la coagulación y también proteína de fase aguda que aumenta en inflamación.' },

  { id:'h10', cat:'hemograma',
    q:'Leucocitosis con neutrofilia y desviación a la izquierda sugiere…',
    opts:['Infección viral aguda','Alergia severa','Infección bacteriana activa','Anemia hemolítica inmune'],
    c:2, exp:'La neutrofilia con bandas (formas inmaduras) es la respuesta inflamatoria clásica ante infección bacteriana activa.' },
];

// Devuelve n preguntas aleatorias de la categoría indicada
export function getQuestions(categoryId, count = 10) {
  const pool = QUESTIONS.filter(q => q.cat === categoryId);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export function checkAnswer(question, selectedIdx) {
  return {
    correct:    selectedIdx === question.c,
    correctIdx: question.c,
  };
}
