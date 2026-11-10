// Estado durable de un intento. No contiene claves de respuestas correctas.
export function remainingSeconds(deadline, now = Date.now()) {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function readAttempt(storage, key, quizId, carnet) {
  try {
    const value = JSON.parse(storage.getItem(key));
    if (value?.version !== 1 || value.quizId !== quizId ||
        value.studentData?.carnet !== carnet || !value.attemptId ||
        !Number.isFinite(value.deadline) || !Array.isArray(value.quiz?.preguntas) ||
        !value.quiz.preguntas.length || !value.userAnswers || !value.optionOrders ||
        !Number.isInteger(value.currentPos) || value.currentPos < 0 ||
        value.currentPos >= value.quiz.preguntas.length ||
        !Number.isInteger(value.blurCount) || !Array.isArray(value.blurSnapshots) ||
        !Array.isArray(value.questionOrder) ||
        value.questionOrder.length !== value.quiz.preguntas.length ||
        new Set(value.questionOrder).size !== value.questionOrder.length ||
        value.questionOrder.some(i => !Number.isInteger(i) || i < 0 || i >= value.quiz.preguntas.length)) return null;
    return value;
  } catch { return null; }
}

export function writeAttempt(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch { return false; }
}
