// AcadVet USAM — Cloud Functions (notificaciones push)
exports.onTareaAsignada   = require('./src/triggers/onTareaAsignada').onTareaAsignada;
exports.onParcialWritten  = require('./src/triggers/onParcialWritten').onParcialWritten;
exports.onReminderCreated = require('./src/triggers/onReminderCreated').onReminderCreated;
exports.sendBroadcast     = require('./src/broadcast').sendBroadcast;
