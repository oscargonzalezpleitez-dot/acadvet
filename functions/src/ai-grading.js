// =============================================================================
// AcadVet USAM — Calificación asistida por IA de parciales físicos
// Llama a la API de Gemini (REST directo, sin SDK) con las fotos del examen
// + la rúbrica del docente, y pide una nota sugerida en JSON estructurado.
// La nota es SIEMPRE una sugerencia: el docente aprueba desde
// parciales-ia.html antes de que se escriba en el expediente del alumno.
// =============================================================================

// Modelo de Gemini a usar. Si Google retira este modelo, cambiarlo acá
// (revisar modelos vigentes en https://ai.google.dev/gemini-api/docs/models).
const MODEL = 'gemini-2.5-flash';

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    notaSugerida: { type: 'NUMBER', description: 'Nota final sobre 100' },
    confianza:    { type: 'STRING', enum: ['alta', 'media', 'baja'] },
    desglose: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          pregunta:   { type: 'STRING' },
          puntos:     { type: 'NUMBER' },
          de:         { type: 'NUMBER' },
          comentario: { type: 'STRING' },
        },
        required: ['pregunta', 'puntos', 'de'],
      },
    },
    avisos: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: 'Problemas detectados: letra ilegible, respuesta ambigua, pregunta sin responder, etc.',
    },
  },
  required: ['notaSugerida', 'confianza', 'desglose'],
};

function buildPrompt(rubricaTexto) {
  return `Sos un asistente que ayuda a un docente universitario a calificar exámenes
físicos escritos a mano, a partir de fotos. Tu calificación es SOLO una
sugerencia — el docente siempre la revisa antes de publicarla, así que
priorizá la honestidad sobre "quedar bien": si la letra es ilegible o una
respuesta es ambigua, decilo en "avisos" y bajá la "confianza" en vez de
inventar o adivinar una respuesta que no está clara en la foto.

RÚBRICA / CLAVE DE RESPUESTAS DE ESTE PARCIAL:
"""
${rubricaTexto}
"""

Instrucciones:
- Leé las fotos del examen del alumno (si hay varias, están en orden de página).
- Calificá cada pregunta según la rúbrica, sumando los puntos obtenidos.
- La nota final va sobre 100 (si la rúbrica usa otra escala, convertila).
- En "desglose" poné una fila por pregunta: puntos obtenidos, máximo posible,
  y un comentario breve (una línea) explicando por qué.
- En "avisos" listá cualquier problema real que hayas encontrado: letra
  ilegible, respuesta ambigua, pregunta sin responder, hoja incompleta, etc.
  Si no hay problemas, dejalo vacío.
- "confianza": "alta" si pudiste leer y calificar todo con seguridad, "media"
  si hubo alguna duda menor, "baja" si hay partes importantes ilegibles.`;
}

/**
 * @param {object} args
 * @param {string} args.apiKey
 * @param {string} args.rubricaTexto
 * @param {string[]} args.imagenesBase64 - fotos del examen, en base64, sin el prefijo data:
 * @returns {Promise<{notaSugerida:number, confianza:string, desglose:Array, avisos:string[]}>}
 */
async function gradeExam({ apiKey, rubricaTexto, imagenesBase64 }) {
  if (!imagenesBase64?.length) throw new Error('No hay fotos para calificar');

  const parts = [
    { text: buildPrompt(rubricaTexto) },
    ...imagenesBase64.map((data) => ({ inlineData: { mimeType: 'image/jpeg', data } })),
  ];

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.2,
        },
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Gemini API error ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini no devolvió resultado (posible bloqueo de contenido)');

  const parsed = JSON.parse(text);
  return {
    notaSugerida: Math.max(0, Math.min(100, Number(parsed.notaSugerida) || 0)),
    confianza:    ['alta', 'media', 'baja'].includes(parsed.confianza) ? parsed.confianza : 'baja',
    desglose:     Array.isArray(parsed.desglose) ? parsed.desglose : [],
    avisos:       Array.isArray(parsed.avisos) ? parsed.avisos : [],
  };
}

module.exports = { gradeExam, MODEL };
