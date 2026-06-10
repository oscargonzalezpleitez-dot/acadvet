// =============================================================================
// AcadVet USAM — Módulo 5: Tabla de Referencia de Laboratorio Clínico
// =============================================================================

export const SPECIES = ['Perro', 'Gato', 'Bovino', 'Equino', 'Aviar'];

export const REFERENCE_DATA = {
  Hemograma: [
    {
      name: 'RBC (Eritrocitos)',
      unit: 'millones/µL',
      values: {
        Perro:  { min: 5.5,  max: 8.5,  normal: 6.8 },
        Gato:   { min: 5.0,  max: 10.0, normal: 7.5 },
        Bovino: { min: 5.0,  max: 10.0, normal: 7.0 },
        Equino: { min: 6.5,  max: 12.5, normal: 9.0 },
        Aviar:  { min: 2.5,  max: 4.5,  normal: 3.5 },
      },
    },
    {
      name: 'Hemoglobina',
      unit: 'g/dL',
      values: {
        Perro:  { min: 12.0, max: 18.0, normal: 15.0 },
        Gato:   { min: 8.0,  max: 15.0, normal: 12.0 },
        Bovino: { min: 8.0,  max: 15.0, normal: 11.0 },
        Equino: { min: 11.0, max: 19.0, normal: 14.5 },
        Aviar:  { min: 7.0,  max: 13.0, normal: 10.0 },
      },
    },
    {
      name: 'Hematocrito (PCV)',
      unit: '%',
      values: {
        Perro:  { min: 37, max: 55, normal: 45 },
        Gato:   { min: 24, max: 45, normal: 35 },
        Bovino: { min: 24, max: 46, normal: 35 },
        Equino: { min: 32, max: 52, normal: 40 },
        Aviar:  { min: 22, max: 35, normal: 28 },
      },
    },
    {
      name: 'WBC (Leucocitos)',
      unit: 'mil/µL',
      values: {
        Perro:  { min: 6.0,  max: 17.0, normal: 10.0 },
        Gato:   { min: 5.5,  max: 19.5, normal: 11.0 },
        Bovino: { min: 5.0,  max: 10.0, normal: 7.5  },
        Equino: { min: 5.5,  max: 12.5, normal: 8.0  },
        Aviar:  { min: 16.0, max: 40.0, normal: 25.0 },
      },
    },
    {
      name: 'Neutrófilos',
      unit: '%',
      values: {
        Perro:  { min: 60, max: 77, normal: 68 },
        Gato:   { min: 35, max: 75, normal: 55 },
        Bovino: { min: 15, max: 45, normal: 30 },
        Equino: { min: 50, max: 75, normal: 60 },
        Aviar:  { min: 20, max: 50, normal: 35 },
      },
    },
    {
      name: 'Linfocitos',
      unit: '%',
      values: {
        Perro:  { min: 12, max: 30, normal: 20 },
        Gato:   { min: 20, max: 55, normal: 35 },
        Bovino: { min: 45, max: 75, normal: 60 },
        Equino: { min: 25, max: 50, normal: 35 },
        Aviar:  { min: 40, max: 70, normal: 55 },
      },
    },
    {
      name: 'Monocitos',
      unit: '%',
      values: {
        Perro:  { min: 3,  max: 10, normal: 5  },
        Gato:   { min: 1,  max: 4,  normal: 2  },
        Bovino: { min: 2,  max: 7,  normal: 4  },
        Equino: { min: 0,  max: 6,  normal: 3  },
        Aviar:  { min: 0,  max: 3,  normal: 1  },
      },
    },
    {
      name: 'Plaquetas',
      unit: 'mil/µL',
      values: {
        Perro:  { min: 200, max: 900, normal: 400 },
        Gato:   { min: 100, max: 650, normal: 300 },
        Bovino: { min: 100, max: 800, normal: 350 },
        Equino: { min: 100, max: 350, normal: 200 },
        Aviar:  { min: 20,  max: 30,  normal: 25  },
      },
    },
    {
      name: 'VCM (Vol. Corpuscular Medio)',
      unit: 'fL',
      values: {
        Perro:  { min: 60, max: 77, normal: 70 },
        Gato:   { min: 39, max: 55, normal: 45 },
        Bovino: { min: 40, max: 60, normal: 52 },
        Equino: { min: 37, max: 58, normal: 45 },
        Aviar:  { min: 90, max: 140, normal: 120 },
      },
    },
    {
      name: 'CHCM (Conc. Hb Corpuscular)',
      unit: 'g/dL',
      values: {
        Perro:  { min: 31, max: 36, normal: 34 },
        Gato:   { min: 30, max: 36, normal: 33 },
        Bovino: { min: 30, max: 36, normal: 33 },
        Equino: { min: 31, max: 37, normal: 34 },
        Aviar:  { min: 27, max: 33, normal: 30 },
      },
    },
  ],

  Bioquímica: [
    {
      name: 'Glucosa',
      unit: 'mg/dL',
      values: {
        Perro:  { min: 70,  max: 110, normal: 90  },
        Gato:   { min: 70,  max: 150, normal: 100 },
        Bovino: { min: 45,  max: 75,  normal: 60  },
        Equino: { min: 60,  max: 100, normal: 80  },
        Aviar:  { min: 200, max: 400, normal: 280 },
      },
    },
    {
      name: 'Creatinina',
      unit: 'mg/dL',
      values: {
        Perro:  { min: 0.5, max: 1.6, normal: 1.0 },
        Gato:   { min: 0.8, max: 2.4, normal: 1.4 },
        Bovino: { min: 1.0, max: 2.0, normal: 1.5 },
        Equino: { min: 1.2, max: 1.9, normal: 1.5 },
        Aviar:  { min: 0.1, max: 0.4, normal: 0.2 },
      },
    },
    {
      name: 'BUN (Urea)',
      unit: 'mg/dL',
      values: {
        Perro:  { min: 10, max: 26, normal: 18 },
        Gato:   { min: 18, max: 33, normal: 25 },
        Bovino: { min: 10, max: 25, normal: 18 },
        Equino: { min: 11, max: 26, normal: 18 },
        Aviar:  { min: 0,  max: 10, normal: 5  },
      },
    },
    {
      name: 'AST (TGO)',
      unit: 'U/L',
      values: {
        Perro:  { min: 10, max: 40,  normal: 25 },
        Gato:   { min: 10, max: 50,  normal: 30 },
        Bovino: { min: 50, max: 130, normal: 90 },
        Equino: { min: 90, max: 340, normal: 200 },
        Aviar:  { min: 10, max: 60,  normal: 30 },
      },
    },
    {
      name: 'ALT (TGP)',
      unit: 'U/L',
      values: {
        Perro:  { min: 7,  max: 52, normal: 30 },
        Gato:   { min: 10, max: 48, normal: 28 },
        Bovino: { min: 0,  max: 40, normal: 20 },
        Equino: { min: 0,  max: 15, normal: 7  },
        Aviar:  { min: 10, max: 55, normal: 30 },
      },
    },
    {
      name: 'Fosfatasa Alcalina (FA)',
      unit: 'U/L',
      values: {
        Perro:  { min: 10,  max: 150, normal: 60  },
        Gato:   { min: 0,   max: 62,  normal: 25  },
        Bovino: { min: 18,  max: 153, normal: 80  },
        Equino: { min: 70,  max: 340, normal: 180 },
        Aviar:  { min: 10,  max: 90,  normal: 40  },
      },
    },
    {
      name: 'Bilirrubina Total',
      unit: 'mg/dL',
      values: {
        Perro:  { min: 0.0, max: 0.4, normal: 0.2 },
        Gato:   { min: 0.0, max: 0.4, normal: 0.1 },
        Bovino: { min: 0.0, max: 0.4, normal: 0.1 },
        Equino: { min: 0.2, max: 3.0, normal: 1.0 },
        Aviar:  { min: 0.0, max: 0.5, normal: 0.1 },
      },
    },
    {
      name: 'Proteínas Totales',
      unit: 'g/dL',
      values: {
        Perro:  { min: 5.4, max: 7.7, normal: 6.5 },
        Gato:   { min: 5.2, max: 8.8, normal: 7.0 },
        Bovino: { min: 5.7, max: 8.1, normal: 7.0 },
        Equino: { min: 5.2, max: 7.9, normal: 6.5 },
        Aviar:  { min: 2.5, max: 4.5, normal: 3.5 },
      },
    },
    {
      name: 'Albúmina',
      unit: 'g/dL',
      values: {
        Perro:  { min: 2.7, max: 4.4, normal: 3.5 },
        Gato:   { min: 2.5, max: 4.0, normal: 3.0 },
        Bovino: { min: 2.1, max: 3.6, normal: 2.8 },
        Equino: { min: 2.6, max: 3.7, normal: 3.0 },
        Aviar:  { min: 1.3, max: 2.8, normal: 2.0 },
      },
    },
    {
      name: 'Calcio',
      unit: 'mg/dL',
      values: {
        Perro:  { min: 9.0,  max: 11.5, normal: 10.0 },
        Gato:   { min: 8.2,  max: 10.8, normal: 9.5  },
        Bovino: { min: 8.0,  max: 10.5, normal: 9.5  },
        Equino: { min: 11.0, max: 13.5, normal: 12.0 },
        Aviar:  { min: 8.0,  max: 12.0, normal: 10.0 },
      },
    },
    {
      name: 'Fósforo',
      unit: 'mg/dL',
      values: {
        Perro:  { min: 2.5, max: 6.0, normal: 4.0 },
        Gato:   { min: 2.5, max: 6.0, normal: 4.0 },
        Bovino: { min: 5.0, max: 7.0, normal: 6.0 },
        Equino: { min: 1.9, max: 6.0, normal: 3.5 },
        Aviar:  { min: 3.0, max: 6.0, normal: 4.5 },
      },
    },
  ],

  Urianálisis: [
    {
      name: 'Gravedad Específica',
      unit: 'adimensional',
      values: {
        Perro:  { min: 1.015, max: 1.045, normal: 1.025 },
        Gato:   { min: 1.015, max: 1.060, normal: 1.035 },
        Bovino: { min: 1.020, max: 1.040, normal: 1.030 },
        Equino: { min: 1.020, max: 1.050, normal: 1.035 },
        Aviar:  { min: 1.005, max: 1.020, normal: 1.012 },
      },
    },
    {
      name: 'pH',
      unit: 'unidades',
      values: {
        Perro:  { min: 5.5, max: 7.5, normal: 6.5 },
        Gato:   { min: 5.5, max: 7.5, normal: 6.3 },
        Bovino: { min: 7.5, max: 8.5, normal: 8.0 },
        Equino: { min: 7.0, max: 8.5, normal: 7.5 },
        Aviar:  { min: 6.0, max: 8.0, normal: 7.0 },
      },
    },
    {
      name: 'Proteína',
      unit: 'mg/dL',
      values: {
        Perro:  { min: 0, max: 30,  normal: 10 },
        Gato:   { min: 0, max: 30,  normal: 10 },
        Bovino: { min: 0, max: 20,  normal: 0  },
        Equino: { min: 0, max: 30,  normal: 0  },
        Aviar:  { min: 0, max: 15,  normal: 0  },
      },
    },
    {
      name: 'Glucosa (urinaria)',
      unit: 'mg/dL',
      values: {
        Perro:  { min: 0, max: 0, normal: 0 },
        Gato:   { min: 0, max: 0, normal: 0 },
        Bovino: { min: 0, max: 0, normal: 0 },
        Equino: { min: 0, max: 0, normal: 0 },
        Aviar:  { min: 0, max: 0, normal: 0 },
      },
      note: 'Valor normal: negativa',
    },
    {
      name: 'Cetonas',
      unit: 'mg/dL',
      values: {
        Perro:  { min: 0, max: 0, normal: 0 },
        Gato:   { min: 0, max: 0, normal: 0 },
        Bovino: { min: 0, max: 0, normal: 0 },
        Equino: { min: 0, max: 0, normal: 0 },
        Aviar:  { min: 0, max: 0, normal: 0 },
      },
      note: 'Valor normal: negativas',
    },
    {
      name: 'Sedimento — Células epiteliales',
      unit: 'por campo',
      values: {
        Perro:  { min: 0, max: 5, normal: 1 },
        Gato:   { min: 0, max: 5, normal: 1 },
        Bovino: { min: 0, max: 5, normal: 1 },
        Equino: { min: 0, max: 5, normal: 1 },
        Aviar:  { min: 0, max: 3, normal: 0 },
      },
    },
    {
      name: 'Sedimento — Leucocitos',
      unit: 'por campo 40×',
      values: {
        Perro:  { min: 0, max: 5, normal: 1 },
        Gato:   { min: 0, max: 5, normal: 1 },
        Bovino: { min: 0, max: 5, normal: 1 },
        Equino: { min: 0, max: 5, normal: 1 },
        Aviar:  { min: 0, max: 3, normal: 0 },
      },
    },
    {
      name: 'Sedimento — Eritrocitos',
      unit: 'por campo 40×',
      values: {
        Perro:  { min: 0, max: 5, normal: 0 },
        Gato:   { min: 0, max: 5, normal: 0 },
        Bovino: { min: 0, max: 3, normal: 0 },
        Equino: { min: 0, max: 3, normal: 0 },
        Aviar:  { min: 0, max: 2, normal: 0 },
      },
    },
  ],

  Citología: [
    {
      name: 'Diferencial — Neutrófilos maduros',
      unit: '%',
      values: {
        Perro:  { min: 60, max: 77, normal: 70 },
        Gato:   { min: 35, max: 75, normal: 55 },
        Bovino: { min: 15, max: 45, normal: 28 },
        Equino: { min: 50, max: 75, normal: 60 },
        Aviar:  { min: 20, max: 50, normal: 35 },
      },
    },
    {
      name: 'Diferencial — Neutrófilos en banda',
      unit: '%',
      values: {
        Perro:  { min: 0, max: 3, normal: 0 },
        Gato:   { min: 0, max: 3, normal: 0 },
        Bovino: { min: 0, max: 2, normal: 0 },
        Equino: { min: 0, max: 2, normal: 0 },
        Aviar:  { min: 0, max: 1, normal: 0 },
      },
    },
    {
      name: 'Diferencial — Eosinófilos',
      unit: '%',
      values: {
        Perro:  { min: 2, max: 10, normal: 4 },
        Gato:   { min: 2, max: 12, normal: 5 },
        Bovino: { min: 2, max: 20, normal: 8 },
        Equino: { min: 0, max: 10, normal: 4 },
        Aviar:  { min: 0, max: 5,  normal: 1 },
      },
    },
    {
      name: 'Diferencial — Basófilos',
      unit: '%',
      values: {
        Perro:  { min: 0, max: 1, normal: 0 },
        Gato:   { min: 0, max: 1, normal: 0 },
        Bovino: { min: 0, max: 2, normal: 0 },
        Equino: { min: 0, max: 3, normal: 0 },
        Aviar:  { min: 0, max: 1, normal: 0 },
      },
    },
  ],
};

// ── Funciones ─────────────────────────────────────────────────────────────────

export function getCategories() {
  return Object.keys(REFERENCE_DATA);
}

export function getTable(category) {
  return REFERENCE_DATA[category] ?? [];
}

export function validateValue(value, param, species) {
  if (value === '' || value === null || value === undefined) return 'unknown';
  const n = parseFloat(value);
  if (isNaN(n)) return 'unknown';
  const sv = param.values?.[species];
  if (!sv) return 'unknown';
  if (sv.min === 0 && sv.max === 0) return n === 0 ? 'normal' : 'high';
  if (n < sv.min) return 'low';
  if (n > sv.max) return 'high';
  return 'normal';
}

export function searchParameters(query, category) {
  const q = query.toLowerCase().trim();
  if (!q) return REFERENCE_DATA[category] ?? [];
  return (REFERENCE_DATA[category] ?? []).filter(p =>
    p.name.toLowerCase().includes(q) || p.unit.toLowerCase().includes(q)
  );
}

export function getCategoryColor(category) {
  const map = {
    Hemograma:   '#FF6B6B',
    Bioquímica:  '#4ECDC4',
    Urianálisis: '#FFD93D',
    Citología:   '#A8E6CF',
  };
  return map[category] ?? '#A29BFE';
}
