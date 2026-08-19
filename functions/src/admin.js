// AcadVet USAM — inicialización única del Admin SDK.
const admin = require('firebase-admin');

admin.initializeApp();

module.exports = {
  db:        admin.database(),
  messaging: admin.messaging(),
  bucket:    admin.storage().bucket(),
};
